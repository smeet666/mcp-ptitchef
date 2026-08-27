/**
 * The reading layer, publishable on its own.
 *
 * It owns the pacing, the store and the error vocabulary, and it knows nothing
 * about the protocol above it. A program can import it as an ordinary library
 * and get the same care the tools get.
 */

import type { Config, Logger } from "../config.js";
import { invalidInput, notFound } from "../errors.js";
import type { CategoryReport, ListingKind, ListingReport, Read, Recipe } from "../types.js";
import { Cache } from "./cache.js";
import { fetchPage, type Page } from "./http.js";
import { type ListingContext, parseCategoryPage, parseListingPage } from "./parse.js";
import { parseRecipePage } from "./parseRecipe.js";
import { RateLimiter } from "./rateLimiter.js";
import {
  categoryUrl,
  fridgeUrl,
  isCategoryRoot,
  isFamilyHref,
  isRecipeId,
  isSlug,
  listingAt,
  listingUrl,
  MAX_FRIDGE_INGREDIENTS,
  recipeIdFrom,
  recipeNumberOf,
  recipeUrl,
  searchUrl,
  slugFromHref,
  standingUrl,
  STANDING_NAMES,
} from "./urls.js";

/** What one browse asks for: a category of the tree, or a standing listing. */
export interface BrowseOptions {
  category?: string;
  listing?: string;
  page?: number;
}

export interface ClientOptions {
  config: Config;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

/** A read held in the store, kept with what it had to set aside. */
interface StoredCategories {
  report: CategoryReport;
  skipped: string[];
}

interface StoredListing {
  report: ListingReport;
  skipped: string[];
}

export class PtitchefClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly limiter: RateLimiter;
  private readonly categories: Cache<StoredCategories>;
  private readonly listings: Cache<StoredListing>;
  private readonly recipes: Cache<Recipe>;
  /**
   * Reads on their way to the site, so two callers asking one question ask it
   * of the site once.
   *
   * Between a miss in the store and the write that follows it there are several
   * awaits, and a second caller arriving inside that window sees an empty store
   * and sets off again. The site then receives one request per caller for one
   * page, which is the only place this server multiplies its own traffic.
   */
  private readonly inFlight = new Map<string, Promise<Page>>();

  constructor(options: ClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl;
    this.limiter = new RateLimiter({ intervalMs: options.config.minIntervalMs });
    this.categories = new Cache<StoredCategories>(
      options.config.cacheTtlMs,
      options.config.cacheMaxEntries,
    );
    this.listings = new Cache<StoredListing>(
      options.config.cacheTtlMs,
      options.config.cacheMaxEntries,
    );
    this.recipes = new Cache<Recipe>(options.config.cacheTtlMs, options.config.cacheMaxEntries);
  }

  /**
   * One read of one address, shared with whoever asks for it meanwhile.
   *
   * The entry is dropped as the read settles, so a later caller reads the store
   * or starts a read of its own rather than being handed a stale promise.
   */
  private read(url: string): Promise<Page> {
    const already = this.inFlight.get(url);
    if (already) {
      this.logger.debug(`joined a read already under way: ${url}`);
      return already;
    }

    const started = this.limiter
      .schedule(() => fetchPage(this.request(url)))
      .finally(() => this.inFlight.delete(url));
    this.inFlight.set(url, started);
    return started;
  }

  /**
   * Read one level of the category tree.
   *
   * Without a family this reads the root, which lists the families themselves.
   * With one it reads that family's own page, which lists the categories it
   * holds.
   *
   * A family that cannot become an address is refused here rather than sent.
   * The site answers an address it does not hold with a 404, and reporting that
   * as an absence would state something about the tree that a misspelling
   * caused.
   */
  async listCategories(family?: string | null): Promise<Read<CategoryReport>> {
    const named = typeof family === "string" ? family.trim() : null;
    if (named !== null && !isSlug(named)) {
      throw invalidInput(
        `"${named}" is not a family of this site's category tree.`,
        "A family is written in lowercase letters, digits and hyphens. Call this tool without one to read the families the site publishes.",
      );
    }

    const url = categoryUrl(named);

    const stored = this.categories.get(url);
    if (stored) {
      this.logger.debug(`served from the store: ${url}`);
      return withSkipped({ data: stored.report, cached: true }, stored.skipped);
    }

    const page = await this.read(url);

    // The site answers a family it does not hold by sending the reader to the
    // root of the tree, with HTTP 200 and the root's own categories. Rendering
    // that would answer "here is what this family holds" with a level nobody
    // asked for, so the address the answer came from settles which level it is.
    const served = servedLevel(page.url, named);
    if (!served.held) {
      throw notFound(
        named === null
          ? "Ptitchef answered the root of its category tree with another level."
          : `Ptitchef holds no category family named "${named}".`,
        {
          url,
          hint: "Call this tool without a family to list the families the site publishes.",
        },
      );
    }

    // Parsed before it is stored, so a page nobody could read is never served
    // back for the rest of the entry's lifetime.
    const parsed = parseCategoryPage(page.body, served.family, page.url);
    if (parsed.skipped.length > 0) {
      const count = parsed.skipped.length;
      this.logger.warn(`${count} ${count === 1 ? "entry" : "entries"} set aside on ${url}`);
    }
    this.categories.set(url, { report: parsed.report, skipped: parsed.skipped });
    return withSkipped({ data: parsed.report, cached: false }, parsed.skipped);
  }

  /**
   * Search for recipes.
   *
   * The site reads a search and, when it holds a topic page answering it, sends
   * the reader there: "puree de patate douce" is answered by the page
   * "Purée de patates douces". That page is a listing of its own, with its own
   * total and its own pages. When the site holds no such page it answers on its
   * own terms, on one page, and the total it prints is the number of rows it
   * served.
   *
   * Which of the two happened is read off the address the answer came back
   * from, and reported, because the two totals count different things.
   */
  async searchRecipes(query: string): Promise<Read<ListingReport>> {
    const asked = query.trim();
    if (asked === "") {
      throw invalidInput(
        "A search needs a word to search for.",
        "Pass a dish or an ingredient as 'query'.",
      );
    }

    const url = searchUrl(asked);
    const stored = this.listings.get(url);
    if (stored) {
      this.logger.debug(`served from the store: ${url}`);
      return withSkipped({ data: stored.report, cached: true }, stored.skipped);
    }

    const page = await this.read(url);

    // The site answers a search in five ways, and the address it answers from
    // is what tells them apart. Two of them carry no listing at all: it opens a
    // recipe where the words name one, and falls back to its recipes home page
    // where it can make nothing of them. Reading either as an unreadable page
    // would report the site's own answer as a failure.
    const answered = searchAnswer(asked, page.body, page.url);
    this.listings.set(url, answered);
    return withSkipped({ data: answered.report, cached: false }, answered.skipped);
  }

  /**
   * Read one page of a category listing, or one of the site's standing lists.
   *
   * A page past the last one is answered with the first page, so the address
   * the answer came back from settles which page was read. Reporting the page
   * that was asked for would send a caller round the same rows for ever.
   */
  async browseRecipes(options: BrowseOptions): Promise<Read<ListingReport>> {
    const page = options.page ?? 1;
    const target = browseTarget(options, page);

    return await this.readListing(target.url, (servedUrl) => {
      const at = listingAt(servedUrl);
      return {
        asked: target.asked,
        kind: target.kind,
        topicSlug: at?.slug ?? null,
        // A standing list is served from an address carrying no page number,
        // and the site serves the same page whatever number is asked for.
        // Repeating the number asked for would say a page was read that never
        // was.
        page: at?.page ?? 1,
        url: servedUrl,
      };
    });
  }

  /**
   * Read the recipes the site finds from a list of ingredients.
   *
   * The site's own form offers five boxes and reads five, so a longer list is
   * refused here rather than sent and silently cut.
   */
  async searchByIngredients(ingredients: readonly string[]): Promise<Read<ListingReport>> {
    const named = ingredients.map((one) => one.trim()).filter((one) => one !== "");
    if (named.length === 0) {
      throw invalidInput(
        "A fridge search needs at least one ingredient.",
        "Pass what you have as 'ingredients'.",
      );
    }
    if (named.length > MAX_FRIDGE_INGREDIENTS) {
      throw invalidInput(
        `The site's own form reads ${MAX_FRIDGE_INGREDIENTS} ingredients, and ${named.length} were given.`,
        `Ask again with ${MAX_FRIDGE_INGREDIENTS} or fewer.`,
      );
    }

    const url = fridgeUrl(named);
    return await this.readListing(url, (servedUrl) => ({
      asked: named.join(", "),
      kind: "fridge" as ListingKind,
      topicSlug: null,
      page: 1,
      url: servedUrl,
    }));
  }

  /**
   * Read one recipe.
   *
   * The identifier is the page path a listing row carried, because the site
   * serves a recipe from its own written address and from nowhere else. An
   * identifier of another shape is refused here rather than sent, and a page the
   * site answered from another address is reported as an absence rather than
   * rendered as the recipe that was asked for.
   */
  async getRecipe(id: string): Promise<Read<Recipe>> {
    const named = id.trim();
    if (!isRecipeId(named)) {
      throw invalidInput(
        `"${named}" is not the identifier of a Ptitchef recipe.`,
        "Take it from the 'id' of a row returned by search_recipes, browse_recipes or search_by_ingredients.",
      );
    }

    const url = recipeUrl(named);
    // Keyed by the number the site identifies a recipe with, because the words
    // of an address are decorative: two identifiers of one recipe would
    // otherwise hold two entries and cost the site two reads for one page.
    /* v8 ignore next 2 -- The identifier passed the shape check above, which
       requires the number this reads; the fallback narrows the type. */
    const key = recipeNumberOf(named) ?? url;
    const stored = this.recipes.get(key);
    if (stored) {
      this.logger.debug(`served from the store: ${url}`);
      return { data: stored, cached: true };
    }

    const page = await this.read(url);
    // The words of a recipe's address are decorative and its number is not: the
    // site answers wrong words by serving the recipe the number names, and a
    // number it does not hold by serving another recipe altogether. Comparing
    // the numbers is what keeps the second from being rendered as the first.
    if (recipeNumberOf(page.url) !== recipeNumberOf(named)) {
      throw notFound(`Ptitchef holds no recipe numbered in "${named}".`, {
        url,
        hint: "Take the identifier from a row of a search or a listing: the site answers a number it does not hold by serving another recipe.",
      });
    }

    const recipe = parseRecipePage(page.body, page.url);
    this.recipes.set(key, recipe);
    return { data: recipe, cached: false };
  }

  /** One listing read, stored under the address that produced it. */
  private async readListing(
    url: string,
    describe: (servedUrl: string) => ListingContext,
  ): Promise<Read<ListingReport>> {
    const stored = this.listings.get(url);
    if (stored) {
      this.logger.debug(`served from the store: ${url}`);
      return withSkipped({ data: stored.report, cached: true }, stored.skipped);
    }

    const page = await this.read(url);
    const parsed = parseListingPage(page.body, describe(page.url));
    if (parsed.skipped.length > 0) {
      const count = parsed.skipped.length;
      this.logger.warn(`${count} ${count === 1 ? "row" : "rows"} set aside on ${page.url}`);
    }
    this.listings.set(url, { report: parsed.report, skipped: parsed.skipped });
    return withSkipped({ data: parsed.report, cached: false }, parsed.skipped);
  }

  /** What every read of this client asks the transport for. */
  private request(url: string) {
    return {
      url,
      userAgent: this.config.userAgent,
      timeoutMs: this.config.timeoutMs,
      maxBodyBytes: this.config.maxBodyBytes,
      budgetMs: this.config.budgetMs,
      maxRetries: this.config.maxRetries,
      limiter: this.limiter,
      logger: this.logger,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    };
  }

  /** The spacing in force, reported rather than guessed. */
  get currentIntervalMs(): number {
    return this.limiter.currentIntervalMs;
  }
}

/** Whether the site answered the level that was asked for, and which one it is. */
type ServedLevel = { held: true; family: string | null } | { held: false };

/** What one browse resolves to, refused here when it cannot be built. */
function browseTarget(
  options: BrowseOptions,
  page: number,
): { url: string; asked: string; kind: ListingKind } {
  if (options.category !== undefined) {
    const slug = options.category.trim();
    if (!isSlug(slug)) {
      throw invalidInput(
        `"${slug}" is not a category of this site.`,
        "A category is written in lowercase letters, digits and hyphens. Call list_categories to read the ones the site publishes.",
      );
    }
    return { url: listingUrl(slug, page), asked: slug, kind: "category" };
  }

  const named = options.listing?.trim() ?? "";
  const standing = standingUrl(named);
  if (standing === null) {
    throw invalidInput(
      `"${named}" is not a listing this site keeps.`,
      `The listings it keeps are: ${STANDING_NAMES.join(", ")}.`,
    );
  }
  return { url: standing, asked: named, kind: "standing" };
}

/**
 * The level a page belongs to, read from the address it was served from.
 *
 * The root is asked for by an address carrying no family, and a family by one
 * that does, so each can only be answered from its own kind of address. A page
 * of the other kind is one the site put in place of what was asked for.
 */
function servedLevel(servedUrl: string, asked: string | null): ServedLevel {
  const fromFamily = isFamilyHref(servedUrl);
  if (asked === null) {
    return fromFamily ? { held: false } : { held: true, family: null };
  }
  const slug = fromFamily ? slugFromHref(servedUrl) : null;
  return slug === null ? { held: false } : { held: true, family: slug };
}

/**
 * Attach what was set aside, and only when something was.
 *
 * An empty list beside every answer would read as a field the caller has to
 * check, where its absence says plainly that nothing was dropped.
 */
function withSkipped<T>(read: Read<T>, skipped: string[]): Read<T> {
  return skipped.length > 0 ? { ...read, skipped } : read;
}

/** What a search came back as, read from the address it came back from. */
function searchAnswer(asked: string, body: string, servedUrl: string): StoredListing {
  const asRecipe = recipeIdFrom(servedUrl);
  if (asRecipe !== null) {
    return { report: oneRecipeListing(asked, parseRecipePage(body, servedUrl)), skipped: [] };
  }
  if (isCategoryRoot(servedUrl)) {
    return { report: unmatchedListing(asked, servedUrl), skipped: [] };
  }

  const at = listingAt(servedUrl);
  return parseListingPage(body, {
    asked,
    kind: at === null ? "free_text" : "topic",
    topicSlug: at?.slug ?? null,
    page: at?.page ?? 1,
    url: servedUrl,
  });
}

/**
 * The one recipe the site opened in place of a listing.
 *
 * It judges some searches precise enough to name a recipe and serves that page.
 * Rendering it as a listing of one says what the site answered; the row carries
 * only what a recipe page states about itself, since there is no listing row to
 * read the rest from.
 */
function oneRecipeListing(asked: string, recipe: Recipe): ListingReport {
  return {
    asked,
    kind: "recipe",
    topic_slug: null,
    title: recipe.title,
    results: [
      {
        id: recipe.id,
        title: recipe.title,
        url: recipe.url,
        image_url: recipe.image_url,
        rating: recipe.rating,
        rating_count: recipe.rating_count,
        review_count: recipe.review_count,
        category: recipe.category,
        difficulty: recipe.difficulty,
        total_minutes: recipe.total_minutes,
        calories: recipe.nutrition?.calories ?? null,
        ingredients_preview: null,
      },
    ],
    result_count: 1,
    rows_seen: 1,
    folded: 0,
    total_available: 1,
    page: 1,
    single_page: true,
    url: recipe.url,
  };
}

/**
 * The recipes home page, which the site serves for words it made nothing of.
 *
 * It lists no result for them and states no count, so the answer carries no
 * total: a zero here would say the site searched and found none, where it never
 * searched at all.
 */
function unmatchedListing(asked: string, url: string): ListingReport {
  return {
    asked,
    kind: "unmatched",
    topic_slug: null,
    title: null,
    results: [],
    result_count: 0,
    rows_seen: 0,
    folded: 0,
    total_available: null,
    page: 1,
    single_page: true,
    url,
  };
}
