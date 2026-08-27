/**
 * Reading the category tree out of the page the site serves.
 *
 * The tree lives in one container, and every page of the site carries a
 * navigation whose links have exactly the shape the entries have. Reading the
 * whole document would publish that navigation as categories of the level that
 * was asked for, so the container is found first and nothing outside it is
 * read.
 */

import { parseFailure } from "../errors.js";
import type {
  Category,
  CategoryLink,
  CategoryReport,
  ListingKind,
  ListingReport,
  RecipeRow,
} from "../types.js";
import { absolute, isFamilyHref, recipeIdFrom, slugFromHref } from "./urls.js";

/** The container the tree lives in, and the boundary of the page's own body. */
const CONTAINER = /<div[^>]*class="[^"]*\brecipe-cat-list\b[^"]*"[^>]*>/;
const BODY_END = "</main>";

/** One entry of the level, opened. The split keeps whatever follows each one. */
const ENTRY = /<div[^>]*\bclass="[^"]*\bitem\b[^"]*"[^>]*>/;
/** The heading of an entry, which is the only place its address is published. */
const ENTRY_TITLE = /<h2[^>]*class="[^"]*\bi-title\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/;
const ANCHOR = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
/** The blurb the site writes under an entry. */
const BLURB = /<p[^>]*>([\s\S]*?)<\/p>/;
/** The entries the site shows beside a family, which it marks as an excerpt. */
const SAMPLE_LIST = /<ul[^>]*>([\s\S]*?)<\/ul>/;
const SAMPLE_ITEM = /<li[^>]*>/;
/** The heading the page gives the level it serves. */
const HEADING = /<h1[^>]*>([\s\S]*?)<\/h1>/;

const TAG = /<[^>]*>/g;
const WHITESPACE = /\s+/g;
const NAMED_ENTITY = /&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);/g;

const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Resolve the entities the site writes, so a title reads as it was published. */
function decode(value: string): string {
  return value.replace(NAMED_ENTITY, (whole, name: string) => {
    const named = NAMED[name];
    if (named !== undefined) {
      return named;
    }
    const code = name.startsWith("#x")
      ? Number.parseInt(name.slice(2), 16)
      : Number.parseInt(name.slice(1), 10);
    // Past the last code point Unicode defines there is no character to write,
    // so the entity stays as the site published it.
    return code > 0x10ffff ? whole : String.fromCodePoint(code);
  });
}

/**
 * The words inside a fragment of markup.
 *
 * Tags go before entities are resolved, so a title carrying `&lt;` cannot turn
 * into markup this then strips.
 */
function textOf(markup: string): string {
  return decode(markup.replace(TAG, " ")).replace(WHITESPACE, " ").trim();
}

/**
 * The category a fragment links to, or nothing when it links elsewhere.
 *
 * A link out of the tree carries no slug to pass back, so it is nothing this
 * can publish as a category: an article, an empty address and a level's own
 * root all leave here the same way.
 */
function linkIn(markup: string): CategoryLink | null {
  const anchor = ANCHOR.exec(markup);
  const href = anchor?.[1];
  const label = anchor?.[2];
  if (href === undefined || label === undefined || href === "") {
    return null;
  }
  const slug = slugFromHref(href);
  if (slug === null) {
    return null;
  }
  return { slug, title: textOf(label), url: absolute(href) };
}

/** The entries the site shows beside a family, as the excerpt it marks them to be. */
function samplesIn(markup: string): CategoryLink[] {
  const list = SAMPLE_LIST.exec(markup)?.[1];
  if (list === undefined) {
    return [];
  }

  const children: CategoryLink[] = [];
  // The first piece is whatever sits between the list and its first entry.
  for (const item of list.split(SAMPLE_ITEM).slice(1)) {
    const link = linkIn(item);
    if (link !== null) {
      children.push(link);
    }
  }
  return children;
}

/** One entry of the level, or the reason it could not be rendered. */
function entryIn(markup: string): Category | string {
  const heading = ENTRY_TITLE.exec(markup)?.[1];
  if (heading === undefined) {
    return "an entry carries no heading, so there is nothing to name it by";
  }
  const link = linkIn(heading);
  if (link === null) {
    return `"${textOf(heading)}" carries no link, so there is no address to pass back for it`;
  }

  const blurb = BLURB.exec(markup)?.[1];
  const description = blurb === undefined ? null : textOf(blurb);

  return {
    ...link,
    // An empty blurb is a blurb the page did not write, and rendering it as an
    // empty string would offer a description that was never published.
    description: description === null || description === "" ? null : description,
    sample_children: samplesIn(markup),
    is_family: isFamilyHref(link.url),
  };
}

export interface ParsedCategoryPage {
  report: CategoryReport;
  /** Entries the page held that could not be rendered, and why. */
  skipped: string[];
}

/**
 * Read one level of the tree.
 *
 * A page served without the container is a page this cannot read, which is a
 * different statement from a level holding nothing: the first is reported as a
 * failure, and only the second is rendered as an absence.
 */
export function parseCategoryPage(
  html: string,
  family: string | null,
  url: string,
): ParsedCategoryPage {
  const container = CONTAINER.exec(html);
  if (container === null) {
    throw parseFailure("Ptitchef served a page without the container its categories live in.", {
      url,
    });
  }

  const after = html.slice(container.index + container[0].length);
  const end = after.indexOf(BODY_END);
  const region = end === -1 ? after : after.slice(0, end);

  const categories: Category[] = [];
  const skipped: string[] = [];
  // The first piece is whatever sits between the container and its first entry.
  for (const chunk of region.split(ENTRY).slice(1)) {
    const entry = entryIn(chunk);
    if (typeof entry === "string") {
      skipped.push(entry);
    } else {
      categories.push(entry);
    }
  }

  const heading = HEADING.exec(html)?.[1];
  const title = heading === undefined ? "" : textOf(heading);

  return {
    report: {
      family,
      family_title: title === "" ? null : title,
      categories,
      // Counted here, so the field always states the length of the list beside it.
      category_count: categories.length,
      url,
    },
    skipped,
  };
}

/** The listing itself, and one row of it. */
const LISTING = /<section[^>]*class="[^"]*\bline-list\b[^"]*"[^>]*>/;
const ROW = /<article[^>]*class="[^"]*\bitem\b[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
/** The heading of a row, which is the only place its address is published. */
const ROW_TITLE = /<h2[^>]*class="[^"]*\bi-title\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/;
const ROW_IMAGE = /<img[^>]*class="[^"]*\bi-photo\b[^"]*"[^>]*\ssrc="([^"]*)"/;
/** What a row states about itself, each behind the site's own wording. */
const ROW_PROPERTY = /<span[^>]*title="([^"]*)"/g;
const ROW_INGREDIENTS = /<div[^>]*class="[^"]*\bi-text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
/** Recipes the site says a listing holds, printed in the page's own title. */
const LISTING_TOTAL = /-\s*(\d[\d\u00a0\u202f ]*)\s*recettes?\s+sur\s/i;
const PAGE_TITLE = /<title[^>]*>([\s\S]*?)<\/title>/;
/** The site's own heading for a listing. */
const LISTING_HEADING = /<h1[^>]*>([\s\S]*?)<\/h1>/;
/** A link to a further page of the same listing. */
const NEXT_PAGE = /href="[^"]*-page-\d+"/;

/** How a row states a duration: whole hours, whole minutes, or both. */
const HOURS = /(\d+)\s*h/i;
const MINUTES = /(?:\d+\s*h\s*)?(\d+)\s*(?:m|min)\b/i;
const FIRST_NUMBER = /(\d+(?:[.,]\d+)?)/;

/** The wording a row opens each of its properties with. */
const PROPERTY_LABELS = {
  category: "Type de recette:",
  difficulty: "Difficulté:",
  totalTime: "Prêt en:",
  calories: "Calories:",
} as const;

/**
 * Minutes a row's own wording states, or nothing when it states none.
 *
 * "2 h 20 m" and "30 min" are both written here, so the hours and the minutes
 * are read separately and added: reading the first number alone would call two
 * hours and twenty minutes two minutes.
 */
export function readMinutes(text: string): number | null {
  const hours = HOURS.exec(text)?.[1];
  const minutes = MINUTES.exec(text)?.[1];
  if (hours === undefined && minutes === undefined) {
    return null;
  }
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

/** The first number a fragment states, or nothing when it states none. */
function readNumber(text: string): number | null {
  const found = FIRST_NUMBER.exec(text)?.[1];
  return found === undefined ? null : Number(found.replace(",", "."));
}

/**
 * Digits the site printed, with the spaces it groups thousands by removed.
 *
 * Only ever called on a fragment that already matched a digit, so there is
 * always one left to read.
 */
const readCount = (text: string): number => Number(text.replace(GROUPING, ""));

const GROUPING = /[^\d]/g;

/** What one row states about itself, keyed by the wording it opens with. */
function propertiesOf(markup: string): Map<string, string> {
  const stated = new Map<string, string>();
  for (const found of markup.matchAll(ROW_PROPERTY)) {
    /* v8 ignore next 2 -- The pattern writes the group it reads, so a match
       always carries it; the fallback is what narrows the type. */
    const title = found[1] ?? "";
    const at = title.indexOf(":");
    if (at > 0) {
      stated.set(title.slice(0, at + 1), title.slice(at + 1).trim());
    }
  }
  return stated;
}

/**
 * What a row's structured payload states about its rating.
 *
 * The page also draws the rating as a number of stars, rounded to the nearest
 * whole one, and the two disagree by design. The drawn figure is left alone.
 */
interface RatingByRow {
  rating: number | null;
  rating_count: number | null;
  review_count: number | null;
}

/** One row of the listing, or the reason it could not be rendered. */
function rowIn(markup: string, ratings: Map<string, RatingByRow>): RecipeRow | string {
  const heading = ROW_TITLE.exec(markup)?.[1];
  if (heading === undefined) {
    return "a row carries no heading, so there is nothing to name it by";
  }
  const href = ANCHOR.exec(heading)?.[1];
  const id = href === undefined || href === "" ? null : recipeIdFrom(href);
  if (id === null || href === undefined) {
    return `"${textOf(heading)}" carries no recipe address, so there is nothing to pass back for it`;
  }

  const stated = propertiesOf(markup);
  const time = stated.get(PROPERTY_LABELS.totalTime);
  const calories = stated.get(PROPERTY_LABELS.calories);
  const image = ROW_IMAGE.exec(markup)?.[1];
  const preview = ROW_INGREDIENTS.exec(markup)?.[1];
  const rated = ratings.get(id) ?? { rating: null, rating_count: null, review_count: null };

  return {
    id,
    title: textOf(heading),
    url: absolute(href),
    image_url: image === undefined || image === "" ? null : absolute(image),
    ...rated,
    category: stated.get(PROPERTY_LABELS.category) ?? null,
    difficulty: stated.get(PROPERTY_LABELS.difficulty) ?? null,
    total_minutes: time === undefined ? null : readMinutes(time),
    calories: calories === undefined ? null : readNumber(calories),
    ingredients_preview: preview === undefined ? null : textOf(preview) || null,
  };
}

/** What the page's structured payload states about each row it carries. */
function ratingsIn(html: string): Map<string, RatingByRow> {
  const ratings = new Map<string, RatingByRow>();
  for (const block of html.matchAll(LD_BLOCK)) {
    let parsed: unknown;
    try {
      /* v8 ignore next -- The pattern writes the group it reads, so a match always
         carries it; the fallback is what narrows the type and no state reaches it. */
      parsed = JSON.parse(block[1] ?? "");
    } catch {
      // A page carries several of these and only one is the listing. One that
      // cannot be read says nothing about the others.
      continue;
    }
    collectRatings(parsed, ratings);
  }
  return ratings;
}

const LD_BLOCK = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

interface LdItem {
  url?: unknown;
  aggregateRating?: { ratingValue?: unknown; ratingCount?: unknown; reviewCount?: unknown };
}

/** A number the payload states as a string or as a number, or nothing. */
function ldNumber(value: unknown): number | null {
  // A payload is JSON, and JSON writes no infinity and no NaN, so a value that
  // arrived as a number is one.
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const read = Number(value);
  return Number.isFinite(read) ? read : null;
}

function collectRatings(payload: unknown, into: Map<string, RatingByRow>): void {
  if (!isRecord(payload)) {
    return;
  }
  const elements = payload.itemListElement;
  if (!Array.isArray(elements)) {
    return;
  }
  for (const element of elements) {
    if (!isRecord(element)) {
      continue;
    }
    const item = element.item as LdItem | undefined;
    const url = item?.url;
    const id = typeof url === "string" ? recipeIdFrom(url) : null;
    if (id === null) {
      continue;
    }
    into.set(id, {
      rating: ldNumber(item?.aggregateRating?.ratingValue),
      rating_count: ldNumber(item?.aggregateRating?.ratingCount),
      review_count: ldNumber(item?.aggregateRating?.reviewCount),
    });
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export interface ParsedListingPage {
  report: ListingReport;
  /** Rows the page held that could not be rendered, and why. */
  skipped: string[];
}

export interface ListingContext {
  asked: string;
  kind: ListingKind;
  topicSlug: string | null;
  page: number;
  url: string;
}

/**
 * Read one page of a listing.
 *
 * A page carrying no listing at all is how the site answers a search that
 * matched nothing, so it is rendered as the absence it is. The total it prints
 * settles that: a page that states none is a page this could not read.
 */
export function parseListingPage(html: string, context: ListingContext): ParsedListingPage {
  /* v8 ignore next 2 -- A title that matched carries its only group; the
     fallback narrows the type for a page carrying no title at all. */
  const total = LISTING_TOTAL.exec(textOf(PAGE_TITLE.exec(html)?.[1] ?? ""))?.[1];
  const stated = total === undefined ? null : readCount(total);

  const section = LISTING.exec(html);
  if (section === null && stated === null) {
    throw parseFailure("Ptitchef served a page that carries neither a listing nor a count.", {
      url: context.url,
    });
  }

  const headingText = textOf(LISTING_HEADING.exec(html)?.[1] ?? "");

  const results: RecipeRow[] = [];
  const skipped: string[] = [];
  let seen = 0;

  if (section !== null) {
    const after = html.slice(section.index + section[0].length);
    const end = after.indexOf(LISTING_END);
    const region = end === -1 ? after : after.slice(0, end);
    const ratings = ratingsIn(html);

    for (const found of region.matchAll(ROW)) {
      seen += 1;
      /* v8 ignore next -- The pattern writes the group it reads, so a match always
         carries it; the fallback is what narrows the type and no state reaches it. */
      const row = rowIn(found[1] ?? "", ratings);
      if (typeof row === "string") {
        skipped.push(row);
      } else {
        results.push(row);
      }
    }
  }

  return {
    report: {
      asked: context.asked,
      kind: context.kind,
      topic_slug: context.topicSlug,
      title: headingText === "" ? null : headingText,
      results,
      result_count: results.length,
      rows_seen: seen,
      total_available: stated,
      page: context.page,
      // The site offers a further page by linking one. A listing it serves whole
      // links none, and saying so keeps a caller from paging into a repeat of
      // what they already hold.
      single_page: !NEXT_PAGE.test(html),
      url: context.url,
    },
    skipped,
  };
}

const LISTING_END = "</section>";
