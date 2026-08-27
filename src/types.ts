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

/**
 * One row of a recipe listing.
 *
 * The rating comes from the structured payload the page carries, which states
 * it to a tenth. The page also draws it as a number of stars, rounded to the
 * nearest whole one, and the two disagree by design: 3.8 is drawn as 4. Only
 * the first is published here, because a caller comparing two recipes needs
 * the figure the site computed rather than the one it drew.
 */
export interface RecipeRow {
  /** Pass this back to read the recipe. */
  id: string;
  title: string;
  /** The public page. Show this when citing the recipe. */
  url: string;
  image_url: string | null;
  /** 1 to 5, as the site states it. Null when it states none. */
  rating: number | null;
  /** How many readers rated it. Null when the site published no figure. */
  rating_count: number | null;
  /** How many wrote a review. Null when the site published no figure. */
  review_count: number | null;
  /** The site's own wording, such as "Plat". Null when the row states none. */
  category: string | null;
  /** The site's own wording, such as "facile". Null when the row states none. */
  difficulty: string | null;
  /** Minutes the row states for the whole recipe. Null when it states none. */
  total_minutes: number | null;
  /** Calories per serving, as the row states them. Null when it states none. */
  calories: number | null;
  /** The opening of the ingredient list, as the row prints it. */
  ingredients_preview: string | null;
}

/** How a listing came to be, which decides what its total counts. */
export type ListingKind =
  /** A search the site answered from a topic page of its own. */
  | "topic"
  /** A search the site answered on its own terms, without a topic page. */
  | "free_text"
  /** A category or topic page opened directly. */
  | "category"
  /** One of the site's own standing listings. */
  | "standing"
  /** Recipes found from a list of ingredients. */
  | "fridge";

/** What a listing establishes, and what it refuses to overstate about it. */
export interface ListingReport {
  /** What was asked for: a search, a category slug, or a list of ingredients. */
  asked: string;
  kind: ListingKind;
  /**
   * The topic page the site answered a search with, when it answered with one.
   *
   * The site reads a search and sends the reader to a page of its own choosing:
   * "puree de patate douce" is answered by "Purée de patates douces". Naming
   * that page is what keeps its total from reading as a count of what matched
   * the words that were typed.
   */
  topic_slug: string | null;
  /** The site's own heading for the listing. Null when the page carries none. */
  title: string | null;
  results: RecipeRow[];
  /** Rows rendered, after whatever could not be read was set aside. */
  result_count: number;
  /** Rows the site served on this page, before anything was set aside. */
  rows_seen: number;
  /** Recipes the site says this listing holds. Null when it published none. */
  total_available: number | null;
  /** The page that was read. */
  page: number;
  /** True when the site serves this listing on one page and offers no more. */
  single_page: boolean;
  /** The address the listing was read from. */
  url: string;
}
