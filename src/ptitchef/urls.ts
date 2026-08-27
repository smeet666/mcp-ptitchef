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
