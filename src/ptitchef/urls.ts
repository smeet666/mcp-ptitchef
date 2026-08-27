/**
 * Every address this server asks for, built in one place.
 *
 * A slug reaches a path through encodeURIComponent, so a value carrying a
 * slash or a question mark cannot walk out of the route it was meant for.
 */

export const SITE_ORIGIN = "https://www.ptitchef.com";

/** The root of the category tree, which lists the families of ingredients. */
const CATEGORY_ROOT_PATH = "/recettes";
/** The page of one family, which lists the categories it holds. */
const CATEGORY_FAMILY_PREFIX = "/recettes/cat/";

/**
 * The shape a slug takes on this site: lowercase letters, digits and hyphens.
 *
 * Checking it here means an argument the site would answer with a 404 is
 * refused before a request is spent, and refused as bad input rather than
 * reported back as an absence the site never stated.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The page number a listing address carries after its slug. */
const PAGE_SUFFIX = /^(.*)-page-(\d+)$/;
/** The shape the site writes a recipe's address in. */
const RECIPE_ID = /^\/recettes\/[^/]+\/[^/]+-fid-\d+$/;
const LEADING_SLASH = /^\/+/;

export const isSlug = (value: string): boolean => SLUG.test(value);

/** The address of one level of the tree. The root has no family. */
export function categoryUrl(family: string | null): string {
  if (family === null) {
    return new URL(CATEGORY_ROOT_PATH, SITE_ORIGIN).toString();
  }
  return new URL(`${CATEGORY_FAMILY_PREFIX}${encodeURIComponent(family)}`, SITE_ORIGIN).toString();
}

/** Turn a link the site printed into an address a caller can open. */
export const absolute = (href: string): string => new URL(href, SITE_ORIGIN).toString();

/**
 * The slug a caller passes back, read off a link the site printed.
 *
 * Both levels yield a bare slug. Which level it belongs to is carried beside
 * it by `is_family`, read from the link itself, so a caller never has to read
 * the shape of a path to know what a slug opens.
 */
export function slugFromHref(href: string): string | null {
  const path = new URL(href, SITE_ORIGIN).pathname;
  if (path.startsWith(CATEGORY_FAMILY_PREFIX)) {
    return path.slice(CATEGORY_FAMILY_PREFIX.length) || null;
  }
  if (path.startsWith(`${CATEGORY_ROOT_PATH}/`)) {
    return path.slice(CATEGORY_ROOT_PATH.length + 1) || null;
  }
  return null;
}

/** True when a link the site printed leads to a family rather than to recipes. */
export const isFamilyHref = (href: string): boolean =>
  new URL(href, SITE_ORIGIN).pathname.startsWith(CATEGORY_FAMILY_PREFIX);

/** The route the site's own search form posts to. */
const FEED_PATH = "/index.php";
/** The listings the site keeps standing, each on a page of its own. */
const STANDING: Readonly<Record<string, string>> = {
  latest: "/les-dernieres-recettes",
  top_rated: "/les-mieux-notees",
  most_viewed: "/les-plus-consultees",
};

/** The listing names `browse_recipes` accepts, which is what a refusal names back. */
export const STANDING_NAMES: readonly string[] = Object.keys(STANDING);

/** How many ingredients the site's own form offers, which is what it reads. */
export const MAX_FRIDGE_INGREDIENTS = 5;

/** A search, as the site's own form sends it. */
export function searchUrl(query: string): string {
  const url = new URL(FEED_PATH, SITE_ORIGIN);
  url.searchParams.set("obj", "feed");
  url.searchParams.set("action", "list");
  url.searchParams.set("q", query);
  return url.toString();
}

/**
 * Recipes holding a list of ingredients, as the site's own form sends it.
 *
 * The form repeats one parameter per ingredient, so the array notation is the
 * site's own and not a convention chosen here.
 */
export function fridgeUrl(ingredients: readonly string[]): string {
  const url = new URL(FEED_PATH, SITE_ORIGIN);
  url.searchParams.set("obj", "feed");
  url.searchParams.set("action", "list");
  url.searchParams.set("list_type", "fridge_search");
  for (const ingredient of ingredients) {
    url.searchParams.append("ingred[]", ingredient);
  }
  return url.toString();
}

/** One page of a category or topic listing. The first page carries no number. */
export function listingUrl(slug: string, page: number): string {
  const suffix = page > 1 ? `-page-${page}` : "";
  return new URL(
    `${CATEGORY_ROOT_PATH}/${encodeURIComponent(slug)}${suffix}`,
    SITE_ORIGIN,
  ).toString();
}

/** One of the site's standing listings, or nothing when it keeps no such list. */
export function standingUrl(name: string): string | null {
  const path = STANDING[name];
  return path === undefined ? null : new URL(path, SITE_ORIGIN).toString();
}

/**
 * The slug and page a listing address carries, or nothing when it carries none.
 *
 * Read back off the address an answer was served from, since the site answers a
 * page past the last one, and a search it read as a topic, by serving another
 * address than the one that was asked for.
 */
export function listingAt(href: string): { slug: string; page: number } | null {
  const path = new URL(href, SITE_ORIGIN).pathname;
  if (!path.startsWith(`${CATEGORY_ROOT_PATH}/`)) {
    return null;
  }
  const tail = path.slice(CATEGORY_ROOT_PATH.length + 1);
  if (tail === "") {
    return null;
  }
  const numbered = PAGE_SUFFIX.exec(tail);
  if (numbered?.[1] === undefined || numbered[2] === undefined) {
    return { slug: tail, page: 1 };
  }
  return { slug: numbered[1], page: Number(numbered[2]) };
}

/**
 * What a caller passes back to read a recipe.
 *
 * The site serves a recipe from its own written address and from nowhere else:
 * the number at the end of that address, asked for on its own, comes back empty.
 * So the whole path is the identifier, which is what the caller hands back.
 */
export function recipeIdFrom(href: string): string | null {
  const path = new URL(href, SITE_ORIGIN).pathname;
  return RECIPE_ID.test(path) ? path.replace(LEADING_SLASH, "") : null;
}

/** The address of one recipe, from the identifier a listing row carried. */
export function recipeUrl(id: string): string {
  const path = id.replace(LEADING_SLASH, "");
  return new URL(`/${path.split("/").map(encodeURIComponent).join("/")}`, SITE_ORIGIN).toString();
}

/** True when an identifier has the shape the site writes a recipe address in. */
export const isRecipeId = (id: string): boolean =>
  RECIPE_ID.test(`/${id.replace(LEADING_SLASH, "")}`);
