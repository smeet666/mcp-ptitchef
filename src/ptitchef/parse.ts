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
import type { Category, CategoryLink, CategoryReport } from "../types.js";
import { absolute, isFamilyHref, slugFromHref } from "./urls.js";

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
