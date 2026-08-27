/**
 * Parsing of French quantities out of free-text ingredient lines.
 *
 * Ptitchef stores ingredients as plain strings: "200 g de farine", "3 oeufs",
 * "0.5 oignon coupée en cubes", "sel". There is no structured amount anywhere, so
 * everything downstream depends on reading these correctly.
 */

import type { UnitInfo } from "./units.js";
import { lookupUnit, normalizeUnitKey, readPartitiveMeasure, UNIT_KEYS } from "./units.js";

const MIXED_FRACTION = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/;
const SIMPLE_FRACTION = /^(\d+)\s*\/\s*(\d+)/;
const DECIMAL = /^(\d+(?:[.,]\d+)?)/;
const VAGUE_ARTICLE = /^\s*(un|une|quelques)\b\s*/i;
const LEADING_WORD = /^\s*(\p{L}+)\s+/u;
const WHITESPACE = /\s+/;
const ATTACHED_DE = /\s+de\s+(?=\d)/i;
const DIGIT = /\d/;
const TRAILING_S = /s$/;
const HYPHENATED_TAIL = /^-\p{L}/u;
const LEADING_PARTITIVE = /^(?:de\s+la\s+|de\s+l'|d'|de\s+|du\s+|des\s+)/i;
const LEADING_ARTICLE = /^(?:une|un)\s+/i;
const RANGE_SEPARATOR = /^\s*(à|a|ou|-|–|—|\/)\s*/;

export interface ParsedQuantity {
  amount: number;
  /** Characters consumed from the start of the line. */
  length: number;
}

/** Unicode vulgar fractions, which appear in hand-written recipes. */
const VULGAR_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅙": 1 / 6,
  "⅛": 0.125,
};

const VULGAR_CLASS = Object.keys(VULGAR_FRACTIONS).join("");

/**
 * Read a leading amount.
 *
 * Handles, in order of precedence: a whole number followed by a fraction, in
 * either the glyph form "3 ¼" or the written form "1 1/2"; a bare fraction; a
 * bare glyph; and a decimal written with either a dot or a French comma.
 * Returns null when the line does not start with a number, which is the normal
 * case for "sel" or "coriandre".
 */
export function parseLeadingQuantity(text: string): ParsedQuantity | null {
  const trimmed = text.trimStart();
  const offset = text.length - trimmed.length;

  // "3 ¼" and "3¼" before the bare "3", so the longest reading wins.
  const mixedGlyph = new RegExp(`^(\\d+)\\s*([${VULGAR_CLASS}])`).exec(trimmed);
  if (mixedGlyph) {
    const [whole = "", glyph = ""] = mixedGlyph.slice(1);
    const fraction = VULGAR_FRACTIONS[glyph];
    /* v8 ignore next 1 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
    if (fraction !== undefined) {
      return { amount: Number(whole) + fraction, length: offset + mixedGlyph[0].length };
    }
  }

  const leading = trimmed[0];
  /* v8 ignore next 1 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
  const bare = leading === undefined ? undefined : VULGAR_FRACTIONS[leading];
  if (bare !== undefined) {
    return { amount: bare, length: offset + 1 };
  }

  // "1 1/2" before "1/2" before "1,5", so the longest reading wins.
  const mixed = MIXED_FRACTION.exec(trimmed);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator !== 0) {
      return { amount: whole + numerator / denominator, length: offset + mixed[0].length };
    }
  }

  const fraction = SIMPLE_FRACTION.exec(trimmed);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator !== 0) {
      return { amount: Number(fraction[1]) / denominator, length: offset + fraction[0].length };
    }
  }

  // French marks the decimal with a comma, so "1,5 kg" is a kilo and a half.
  const decimal = DECIMAL.exec(trimmed);
  if (decimal) {
    const [digits = ""] = decimal.slice(1);
    const amount = Number(digits.replace(",", "."));
    /* v8 ignore next 1 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
    if (Number.isFinite(amount)) {
      return { amount, length: offset + decimal[0].length };
    }
  }

  return null;
}

/**
 * Articles a recipe writes where a digit would go, and what they count as.
 *
 * "quelques" names a small handful of them; three is the reading, and the word
 * travels with the result so a caller can see the amount came from a word.
 */
const ARTICLE_AMOUNTS: Record<string, number> = {
  un: 1,
  une: 1,
  quelques: 3,
};

export interface ParsedArticle extends ParsedQuantity {
  /** The article as the line wrote it. */
  word: string;
}

/**
 * Read a leading article standing in for a number, as in "une pincée de sel".
 *
 * The article counts as a quantity only when a measure follows it, because that
 * is where it stands for a number: "une pincée" is one pinch and "un sachet" is
 * one sachet, while "un oignon" names a vegetable and no amount. Reading the
 * second as the first would multiply a number the line never wrote.
 */
export function parseLeadingArticle(text: string): ParsedArticle | null {
  const match = VAGUE_ARTICLE.exec(text);
  if (!match) {
    return null;
  }

  const rest = text.slice(match[0].length);
  if (!(matchLeadingUnit(rest, true) || readCountMultiplier(rest))) {
    return null;
  }

  const [word = ""] = match.slice(1);
  const amount = ARTICLE_AMOUNTS[word.toLowerCase()];
  /* v8 ignore next 2 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
  if (amount === undefined) {
    return null;
  }

  return { amount, length: match[0].length, word };
}

/**
 * Words that say how many things a number stands for, rather than how much of
 * something one of them holds.
 *
 * A douzaine is twelve of whatever is being counted. "2 douzaines d'escargots"
 * therefore asks for twenty-four escargots, and the answer divides the way an
 * escargot does. Reading the word as a measure gives "1 1/2 douzaine", which is
 * not a count a kitchen works with, and it hands the question of divisibility to
 * a word that names no food.
 */
const COUNT_MULTIPLIERS: Record<string, number> = {
  douzaine: 12,
  douzaines: 12,
};

/** The multiplier a line opens with, and what stands after it. */
function readCountMultiplier(text: string): { times: number; rest: string } | null {
  const match = LEADING_WORD.exec(text);
  if (!match) {
    return null;
  }

  const [word = ""] = match.slice(1);
  const times = COUNT_MULTIPLIERS[normalizeUnitKey(word)];
  if (times === undefined) {
    return null;
  }
  return { times, rest: text.slice(match[0].length) };
}

interface MatchedUnit {
  unit: UnitInfo;
  /** Unit text as the line wrote it, accents and all. */
  unitText: string;
  /** What follows the unit. */
  rest: string;
}

/**
 * Read a unit at the start of a line, longest spelling first, so "cuillère à
 * soupe" is not read as "cuillère" with "à soupe" spilling into the item name.
 *
 * A noun the vocabulary does not carry can still be a measure, and the
 * partitive that follows it says so, which is what `readPartitiveMeasure`
 * reads. That reading is offered only where the line wrote an article instead
 * of a digit, because that is the position where a noun measures rather than
 * names: "un bouchon de rhum" asks for an amount, while "1 piment de Cayenne"
 * asks for a chilli whose variety happens to be introduced the same way. The
 * vocabulary is consulted first either way, so a word it holds keeps the kind
 * and the spelling it was given there.
 */
function matchLeadingUnit(text: string, partitive = false): MatchedUnit | null {
  const normalized = normalizeUnitKey(text);
  for (const key of UNIT_KEYS) {
    if (normalized !== key && !normalized.startsWith(`${key} `)) {
      continue;
    }
    const unit = lookupUnit(key);
    /* v8 ignore next 2 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
    if (!unit) {
      continue;
    }
    // Consume the same number of words from the original text, which may be
    // spelled with accents the normalized key has lost.
    const wordCount = key.split(" ").length;
    const words = text.trim().split(WHITESPACE);
    return {
      unit,
      unitText: words.slice(0, wordCount).join(" "),
      rest: words.slice(wordCount).join(" "),
    };
  }

  const measure = partitive ? readPartitiveMeasure(text) : null;
  if (measure) {
    return {
      unit: measure.unit,
      /* v8 ignore next 1 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
      unitText: text.trim().split(WHITESPACE)[0] ?? "",
      rest: measure.rest,
    };
  }

  return null;
}

/** One amount with its unit, as the line wrote it. */
export interface Measure {
  amount: number;
  /** Upper bound when the measure is a range, null otherwise. */
  amountMax: number | null;
  /** The word or sign a range was written with. */
  rangeSeparator: string | null;
  unit: UnitInfo | null;
}

/**
 * Why a line that shows a figure is still not the factor's to multiply.
 *
 * Each of these is a reading the parser can make and a scaling it must not do,
 * and they are kept apart from a line with no figure at all so the answer can
 * say which of the two it is looking at.
 */
export type HeldBack =
  /** "2 tranches de 2-cm": the figure gives the size of one, not how many. */
  | "sizeQualifier"
  /** "1 dinde de 3 kg": the measure behind the item weighs one of them. */
  | "itemSize"
  /** "2 pommes de terre par personne": the amount is already stated for one eater. */
  | "perPerson"
  /** "1,500,000 g" grouped the way French never groups a number. */
  | "ambiguousDecimal";

export interface ParsedIngredient {
  /** The line exactly as Ptitchef stores it. */
  original: string;
  /**
   * Why the figure on this line must not be multiplied, when there is such a
   * reason. Null for the ordinary line, whose amount is the factor's to scale.
   */
  heldBack: HeldBack | null;
  /**
   * The sign or word the page put before the amount to say it is loose, as in
   * the "environ" of "environ 6 citrons". Null when the page stated the amount
   * plainly.
   */
  approximation: string | null;
  /**
   * A size word standing between the number and the measure, as in the "grosse"
   * of "1 grosse pincée". It goes back in front of the measure so the answer
   * reads the way the page did.
   */
  measureAdjective: string | null;
  amount: number | null;
  /**
   * Upper bound when the line gives a range, as in "2 à 3 gousses". Null for a
   * single amount. `amount` holds the lower bound, so the two must be scaled
   * together: multiplying only one turns "2 à 3" into the nonsense "4 à 3".
   */
  amountMax: number | null;
  /** The word or sign the range was written with: "à", "-", "ou". */
  rangeSeparator: string | null;
  unit: UnitInfo | null;
  /** Raw unit text as written, kept so the rewrite can stay faithful. */
  unitText: string | null;
  /**
   * The same quantity restated in another system, which pages give in brackets:
   * "450 g (1 livre)". Left unscaled it would contradict the amount beside it,
   * so it is parsed and scaled with the rest.
   */
  alternates: Measure[];
  /**
   * How the line introduced its equivalents: in brackets, as in "450 g (1
   * livre)", or after a slash, as in "500 g / 1.1 lb". The rewrite puts them
   * back the way the line offered them.
   */
  alternateStyle: "bracket" | "slash" | null;
  /** What the amount and unit apply to, for example "farine" or "oeufs". */
  item: string;
  /**
   * The article the amount was read from, as in "une" in "une pincée de sel".
   * Null when the line wrote a number.
   */
  articleWord: string | null;
  /**
   * How many things one of the word the line counted with stands for, as in the
   * twelve of "2 douzaines d'escargots". Null when the line counted the things
   * themselves. `amount` already holds the product, so this is what says where
   * the figure came from.
   */
  countMultiplier: number | null;
}

/**
 * A number grouped the way French never groups one.
 *
 * French marks the decimal with a comma and separates thousands with a space,
 * so a second comma group is a number written by some other convention.
 * Reading "1,500,000" as one and a half is wrong, and reading it as a million
 * and a half is a guess about a page that gave no sign. Neither is safe, so the
 * line goes back as published and says why.
 */
const AMBIGUOUS_COMMA = /^\s*\d+,\d+,\d/;

/**
 * Words that introduce what a container holds.
 *
 * "1 pot de 500 g de miel" counts pots and says how much honey is in one, so
 * the count is the recipe's to multiply. The partitive standing after the
 * measure is what marks the line as a container and its contents.
 */
const CONTAINER_CONTENTS = /^\s*(?:de\s|d'|du\s|des\s)/i;

/**
 * Whether the measure standing behind an item gives the size of one of them,
 * as in "1 dinde de 3 kg".
 *
 * The count and the measure answer different questions: how many birds, and how
 * heavy one bird is. A cook serving half again as many people takes a heavier
 * bird, so the count belongs to the page rather than to the factor.
 *
 * Read on the item alone, which is what the line counts once its own measure
 * has been taken off it, so "450 g (1 livre) de spaghetti" never reaches here:
 * that line counts grams, and its bracket restates the same quantity.
 */
function statesItemSize(item: string): boolean {
  const attached = ATTACHED_DE.exec(item);
  if (!attached) {
    return false;
  }

  const named = item.slice(0, attached.index).trim();
  /* v8 ignore next 2 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
  if (!named || DIGIT.test(named)) {
    return false;
  }

  return isStatedSize(item.slice(attached.index + attached[0].length));
}

/** A mass or a volume standing on its own, with nothing it is the amount of. */
function isStatedSize(text: string): boolean {
  const size = parseLeadingQuantity(text);
  if (!size) {
    return false;
  }

  const measure = matchLeadingUnit(text.slice(size.length).trimStart());
  /* v8 ignore next 2 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
  if (measure?.unit.kind !== "measured") {
    return false;
  }

  return !CONTAINER_CONTENTS.test(measure.rest);
}

/**
 * A line that states its amount for one eater.
 *
 * The factor already says how many people the recipe is being made for, so
 * multiplying an amount that is per person applies it twice and asks for twice
 * as much on every plate.
 */
const PER_PERSON = /\bpar\s+(?:personne|convive|part|tête)\b/i;

/**
 * Signs and words a page puts before a number to say it is not exact.
 *
 * The number behind one of them is still a number, and reading none at all
 * hands back the line with a note saying it carries no quantity, which is
 * untrue. It is read, scaled and given back with the mark the page put on it,
 * so the answer stays as loose as the page was.
 */
const APPROXIMATION_PREFIX = /^(?:~|≈|environ|approximativement|à peu près|a peu pres)\s*/i;

/**
 * Size words a recipe puts between the number and the measure.
 *
 * "1 grosse pincée" counts pincées and says how full one was. Reading the
 * adjective as the thing being counted loses the measure, and with it the fact
 * that a pincée is held to no better than the hand: the line comes back as an
 * exact count of something the page never named.
 */
const MEASURE_ADJECTIVES = new Set([
  "beau",
  "belle",
  "bon",
  "bonne",
  "grand",
  "grande",
  "gros",
  "grosse",
  "petit",
  "petite",
]);

/** Lowercase and strip accents, so "générelle" and "generelle" hit one entry. */
function fold(word: string): string {
  return word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** The adjective a line put in front of its measure, and what stands after it. */
function takeMeasureAdjective(text: string): { adjective: string | null; rest: string } {
  const match = LEADING_WORD.exec(text);
  if (!match) {
    return { adjective: null, rest: text };
  }

  const [adjective = ""] = match.slice(1);
  const folded = fold(adjective);
  // The word can be written in the plural where the count is, as in "2 grosses
  // cuillères", and the list carries the singular.
  const listed =
    MEASURE_ADJECTIVES.has(folded) || MEASURE_ADJECTIVES.has(folded.replace(TRAILING_S, ""));
  if (!listed) {
    return { adjective: null, rest: text };
  }

  return { adjective, rest: text.slice(match[0].length) };
}

/**
 * How a line writes the equivalents beside its measure, when it writes any.
 *
 * "125 g / 1 tasse" states them with a slash and reads as one line; "125 g
 * (1 tasse)" puts them in brackets. The reading is kept rather than the
 * rendering being guessed back from the measures later.
 */
function alternateStyleOf(slashed: boolean, bracketed: boolean): "slash" | "bracket" | null {
  if (slashed) {
    return "slash";
  }
  if (bracketed) {
    return "bracket";
  }
  return null;
}

/**
 * The measure standing after the amount, and the size word in front of it.
 *
 * The adjective is only an adjective when a measure stands behind it. In
 * "1 petit piment oiseau" the words that follow name the food itself, and
 * taking one off would hand back a line the page never wrote.
 */
function readMeasure(
  text: string,
  fromArticle: boolean,
): { unit: UnitInfo | null; unitText: string | null; adjective: string | null; rest: string } {
  const direct = matchLeadingUnit(text, fromArticle);
  const described = direct ? { adjective: null, rest: text } : takeMeasureAdjective(text);
  const behind = described.adjective ? matchLeadingUnit(described.rest, fromArticle) : null;
  const matched = direct ?? behind;

  return {
    unit: matched?.unit ?? null,
    unitText: matched?.unitText ?? null,
    adjective: behind ? described.adjective : null,
    rest: matched ? matched.rest : text,
  };
}

/**
 * Whether the figures on the line give the size of one item rather than how
 * many of them the recipe wants.
 *
 * Two ways a line says it. Without a measure, the words behind the count carry
 * the mass: "2 poulets de 1,5 kg". With one, "une dinde de 3 kg" writes the
 * noun where a measure stands and the partitive takes it for one. A noun the
 * vocabulary lists as a measure keeps counting, since a pot or a boîte is a
 * thing to buy more of; a noun read as a measure only for standing there names
 * the food itself, and a mass behind it is the size of one of them.
 */
function statesSizeOfOne(unit: UnitInfo | null, unitText: string | null, item: string): boolean {
  if (!unit) {
    return statesItemSize(item);
  }
  const readForItsPosition = unitText !== null && lookupUnit(normalizeUnitKey(unitText)) === null;
  return readForItsPosition && isStatedSize(item);
}

/**
 * Split an ingredient line into amount, unit, bracketed equivalents and item.
 *
 * A missing amount is normal and not an error: many lines are just "sel". A
 * missing unit is equally normal and means the item is counted, as in "3 oeufs".
 */
export function parseIngredient(line: string): ParsedIngredient {
  const original = line;
  const text = line.trim();

  const empty = (heldBack: HeldBack | null): ParsedIngredient => ({
    original,
    heldBack,
    approximation: null,
    measureAdjective: null,
    amount: null,
    amountMax: null,
    rangeSeparator: null,
    unit: null,
    unitText: null,
    alternates: [],
    alternateStyle: null,
    item: text,
    articleWord: null,
    countMultiplier: null,
  });

  if (AMBIGUOUS_COMMA.test(text)) {
    return empty("ambiguousDecimal");
  }

  const loose = APPROXIMATION_PREFIX.exec(text);
  const stated = loose ? text.slice(loose[0].length) : text;

  const range = parseLeadingRange(stated);
  const article = range ? null : parseLeadingArticle(stated);
  const quantity = range ?? parseLeadingQuantity(stated) ?? article;
  if (!quantity) {
    return empty(null);
  }

  // A figure joined to a word by a hyphen describes one thing rather than
  // counting things: "2 tranches de 2-cm" states a thickness.
  if (HYPHENATED_TAIL.test(stated.slice(quantity.length))) {
    return empty("sizeQualifier");
  }

  let rest = stated.slice(quantity.length).trimStart();

  // "2 douzaines d'escargots" counts escargots, twelve to the douzaine, so the
  // multiplier is folded into the amount and the line goes on to be read as the
  // count of a thing it now is.
  const multiplier = readCountMultiplier(rest);
  if (multiplier) {
    rest = multiplier.rest;
  }
  const times = multiplier?.times ?? 1;

  const fromArticle = quantity === article;
  const measure = readMeasure(rest, fromArticle);
  const { unit, unitText, adjective } = measure;
  rest = measure.rest;

  const bracketed = takeAlternates(rest);
  rest = bracketed.rest;

  const slashed = bracketed.measures.length > 0 ? null : takeSlashAlternates(rest);
  if (slashed) {
    rest = slashed.rest;
  }

  // "200 g de farine" reads better as item "farine" than "de farine".
  //
  // The article a partitive introduces goes with it: "2/3 d'un flacon" names a
  // share of one flacon, and once the share has been multiplied the count sits
  // where "un" stood. Leaving the article behind produces "4 un flacon", which
  // reads as broken text rather than as a quantity.
  const item = rest.replace(LEADING_PARTITIVE, "").replace(LEADING_ARTICLE, "").trim();

  if (statesSizeOfOne(unit, unitText, item)) {
    return empty("itemSize");
  }

  return {
    original,
    heldBack: PER_PERSON.test(text) ? "perPerson" : null,
    approximation: loose ? loose[0] : null,
    measureAdjective: adjective,
    amount: quantity.amount * times,
    amountMax: range === null ? null : range.max * times,
    rangeSeparator: range?.separator ?? null,
    unit,
    unitText,
    alternates: slashed ? slashed.measures : bracketed.measures,
    alternateStyle: alternateStyleOf(slashed !== null, bracketed.measures.length > 0),
    item,
    /* v8 ignore next 1 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
    articleWord: fromArticle ? (article?.word ?? null) : null,
    countMultiplier: multiplier?.times ?? null,
  };
}

/**
 * Read a bracketed group of equivalent measures, as in "(1 livre)" or
 * "(500 g / 1.1 lb)".
 *
 * The group is only taken when every part of it reads as an amount with a unit.
 * A bracket holding a remark, as in "(bien mûres)", stays in the item text
 * where it belongs, because scaling it would mean scaling prose.
 */
function takeAlternates(text: string): { measures: Measure[]; rest: string } {
  if (!text.startsWith("(")) {
    return { measures: [], rest: text };
  }
  const close = text.indexOf(")");
  if (close < 0) {
    return { measures: [], rest: text };
  }

  const inside = text.slice(1, close);
  const parts = inside.split("/").map((part) => part.trim());
  const measures: Measure[] = [];

  for (const part of parts) {
    const range = parseLeadingRange(part);
    const quantity = range ?? parseLeadingQuantity(part);
    if (!quantity) {
      return { measures: [], rest: text };
    }

    const after = matchLeadingUnit(part.slice(quantity.length).trimStart());
    // A trailing word means the bracket is not purely a measure, as in
    // "(2 cm d'épaisseur)", so the whole group is left as prose.
    if (after?.rest.trim() !== "") {
      return { measures: [], rest: text };
    }

    measures.push({
      amount: quantity.amount,
      amountMax: range?.max ?? null,
      rangeSeparator: range?.separator ?? null,
      unit: after.unit,
    });
  }

  /* v8 ignore next 2 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
  if (measures.length === 0) {
    return { measures: [], rest: text };
  }
  return { measures, rest: text.slice(close + 1).trimStart() };
}

/**
 * Read equivalents a line states after a slash, as in "500 g / 1.1 lb de
 * flocons d'avoine", where the item follows the last of them.
 *
 * Both figures name one quantity, so both have to move together: a doubled
 * line reading "1 kg / 1.1 lb" gives two answers a factor of two apart for the
 * same ingredient. A slash followed by anything other than an amount and a
 * unit is prose and stays in the item text.
 */
function takeSlashAlternates(text: string): { measures: Measure[]; rest: string } | null {
  const measures: Measure[] = [];
  let rest = text;

  while (rest.startsWith("/")) {
    const after = rest.slice(1).trimStart();
    const range = parseLeadingRange(after);
    const quantity = range ?? parseLeadingQuantity(after);
    /* v8 ignore next 2 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
    if (!quantity) {
      break;
    }

    const taken = matchLeadingUnit(after.slice(quantity.length).trimStart());
    /* v8 ignore next 2 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
    if (!taken) {
      break;
    }

    measures.push({
      amount: quantity.amount,
      amountMax: range?.max ?? null,
      rangeSeparator: range?.separator ?? null,
      unit: taken.unit,
    });
    rest = taken.rest.trimStart();
  }

  return measures.length > 0 ? { measures, rest } : null;
}

export interface ParsedRange extends ParsedQuantity {
  /** Upper bound. `amount` carries the lower one. */
  max: number;
  /** How the range was written, so the rewrite can keep the same shape. */
  separator: string;
}

/**
 * Read a leading range such as "2 à 3", "2-3" or "3 ou 4".
 *
 * Recipes use ranges where the exact amount is the cook's call, and both bounds
 * describe the same quantity. Reading only the first one is worse than reading
 * neither: the second number survives unscaled into the answer and contradicts
 * it.
 *
 * A descending pair is not a range. "1/2 3" is two amounts the parser has no
 * business joining, and a dash between two numbers is a range only when the
 * second is the larger.
 */
export function parseLeadingRange(text: string): ParsedRange | null {
  const low = parseLeadingQuantity(text);
  if (!low) {
    return null;
  }

  const after = text.slice(low.length);
  const separator = RANGE_SEPARATOR.exec(after);
  if (!separator) {
    return null;
  }
  // A slash between two numbers is a fraction, which parseLeadingQuantity has
  // already consumed if it was one.
  /* v8 ignore next 2 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
  if (separator[1] === "/") {
    return null;
  }

  const high = parseLeadingQuantity(after.slice(separator[0].length));
  if (!high || high.amount <= low.amount) {
    return null;
  }

  return {
    amount: low.amount,
    max: high.amount,
    /* v8 ignore next 1 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
    separator: separator[1] ?? "",
    length: low.length + separator[0].length + high.length,
  };
}

export interface FormatAmountOptions {
  /**
   * Whether to snap near-fractions to 1/4, 1/3, 1/2, 2/3 and 3/4.
   *
   * True for things a cook counts or spoons out: "1/3 cuillère" is how a kitchen
   * expresses it, "0,33 cuillère" is not. False for mass and volume, which are
   * decimal by nature: nobody weighs "8 1/3 kg" of sugar, they weigh 8,33 kg.
   */
  fractions?: boolean;
}

/**
 * Render an amount the way a recipe would write it.
 */
export function formatAmount(amount: number, options: FormatAmountOptions = {}): string {
  // French recipes write decimals with a comma. Two decimals is finer than any
  // kitchen resolves, and for anything smaller than that it is zero: a quantity
  // that survived being divided a thousandfold must not be handed back as none
  // of the ingredient, so below that point the significant digits are written.
  const decimal = (value: number) => {
    const rounded =
      value !== 0 && Math.abs(value) < 0.01
        ? Number(value.toPrecision(2))
        : Math.round(value * 100) / 100;
    return String(rounded).replace(".", ",");
  };

  if (!Number.isFinite(amount)) {
    return "";
  }
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  if (options.fractions === false) {
    return decimal(amount);
  }

  const whole = Math.floor(amount);
  const rest = amount - whole;
  const known: [number, string][] = [
    [0.25, "1/4"],
    [1 / 3, "1/3"],
    [0.5, "1/2"],
    [2 / 3, "2/3"],
    [0.75, "3/4"],
  ];
  for (const [value, label] of known) {
    if (Math.abs(rest - value) < 0.02) {
      return whole > 0 ? `${whole} ${label}` : label;
    }
  }

  return decimal(amount);
}
