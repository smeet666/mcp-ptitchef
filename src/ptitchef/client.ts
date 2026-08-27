/**
 * The reading layer, publishable on its own.
 *
 * It owns the pacing, the store and the error vocabulary, and it knows nothing
 * about the protocol above it. A program can import it as an ordinary library
 * and get the same care the tools get.
 */

import type { Config, Logger } from "../config.js";
import { invalidInput, notFound } from "../errors.js";
import type { CategoryReport, ListingKind, ListingReport, Read } from "../types.js";
import { Cache } from "./cache.js";
import { fetchPage } from "./http.js";
import { type ListingContext, parseCategoryPage, parseListingPage } from "./parse.js";
import { RateLimiter } from "./rateLimiter.js";
import {
  categoryUrl,
  fridgeUrl,
  isFamilyHref,
  isSlug,
  listingAt,
  listingUrl,
  MAX_FRIDGE_INGREDIENTS,
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

    const page = await this.limiter.schedule(() => fetchPage(this.request(url)));

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
    return await this.readListing(url, (servedUrl) => {
      const at = listingAt(servedUrl);
      return {
        asked,
        kind: at === null ? "free_text" : "topic",
        topicSlug: at?.slug ?? null,
        page: at?.page ?? 1,
        url: servedUrl,
      };
    });
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
        // A standing list is served from an address carrying no page number, so
        // there is nothing to read back and the number asked for stands.
        page: at?.page ?? page,
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

    const page = await this.limiter.schedule(() => fetchPage(this.request(url)));
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
