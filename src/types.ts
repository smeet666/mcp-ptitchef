/**
 * The shapes every layer agrees on.
 *
 * A read carries whether it came from the store, so a caller can tell a fresh
 * answer from a repeated one without asking the site again.
 */

/** The envelope every read returns. */
export interface Read<T> {
  data: T;
  cached: boolean;
  /** Rows the server declined to render, and why, when any were dropped. */
  skipped?: string[];
}

/** A category named beside another one, with nothing else established about it. */
export interface CategoryLink {
  /** Pass this back as `family` to open it, or to browse the recipes under it. */
  slug: string;
  /** The site's own wording for it. */
  title: string;
  url: string;
}

/**
 * One entry of the category tree, as the site publishes it.
 *
 * `sample_children` is what the site chose to show beside the entry, which it
 * marks with an ellipsis of its own. It is an excerpt, so it is named as one:
 * a caller reading it as the entry's contents would conclude that a family of
 * ninety ingredients holds three.
 */
export interface Category extends CategoryLink {
  /** The site's own blurb. Null when the page carries none for this entry. */
  description: string | null;
  /** Entries the site shows beside this one, as an excerpt of what it holds. */
  sample_children: CategoryLink[];
  /** True when this entry opens onto further categories rather than recipes. */
  is_family: boolean;
}

/** What `list_categories` establishes about one level of the tree. */
export interface CategoryReport {
  /** The family that was opened, or null for the root of the tree. */
  family: string | null;
  /** The site's own heading for that level. Null when the page carries none. */
  family_title: string | null;
  categories: Category[];
  category_count: number;
  /** The page these categories were read from. */
  url: string;
}
