/**
 * Turning a fragment of a page into the words it holds.
 *
 * Shared by every reader here, because a heading, a body and an attribute all
 * arrive as markup written by strangers. A value read one way and not the other
 * is the one that carries a newline into a line this server writes.
 */

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
export function decode(value: string): string {
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
export function textOf(markup: string): string {
  return decode(markup.replace(TAG, " ")).replace(WHITESPACE, " ").trim();
}
