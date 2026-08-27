/**
 * French cooking unit vocabulary and what scaling means for each.
 *
 * The distinction that matters is not metric versus imperial, it is what shape
 * the scaled number has to take. "200 g" doubled is "400 g". "1 pincée" doubled
 * is "2 pincées": the pinch keeps whatever size the cook's fingers give it, and
 * the count is what carries the recipe's proportion.
 */

const HEAD_BEFORE_DE = /^\s*(\p{L}+)\s+(?=(?:de|du|des)\s|d')/u;
const AUX_ENDING = /aux$/i;
const EAUX_ENDING = /eaux$/i;
const VOWEL_THEN_S = /[aiou]s$/i;
const TRAILING_S = /s$/i;
const SIBILANT_ENDING = /[sxz]$/i;
const EAU_ENDING = /eau$/i;
const AL_ENDING = /al$/i;
const HOUSEHOLD_MEASURE = /^(cuillère à soupe|cuillère à café|verre|tasse|bol)$/;

export type UnitKind =
  /** Mass or volume: scales continuously and cleanly. */
  | "measured"
  /** Spoons, cups, sachets: scales, but only to sensible fractions. */
  | "portioned"
  /**
   * Pinches, dashes, handfuls: each one has the size the cook gives it, so the
   * count scales in whole units and the unit itself is never converted.
   */
  | "vague";

export interface UnitInfo {
  /** Canonical singular form, used when rewriting the ingredient line. */
  canonical: string;
  kind: UnitKind;
  /** Plural form when it is not simply the singular plus an "s". */
  plural?: string;
  /** A metric symbol such as "g" or "cl", which never takes a plural mark. */
  symbol?: true;
}

/**
 * Keys are matched lowercased and accent-stripped, so a single entry covers
 * "cuillere", "cuillère", "Cuillères".
 */
const UNITS: Record<string, UnitInfo> = {
  // Mass
  g: { canonical: "g", kind: "measured", symbol: true },
  gr: { canonical: "g", kind: "measured", symbol: true },
  gramme: { canonical: "g", kind: "measured", symbol: true },
  grammes: { canonical: "g", kind: "measured", symbol: true },
  kg: { canonical: "kg", kind: "measured", symbol: true },
  kilo: { canonical: "kg", kind: "measured", symbol: true },
  kilos: { canonical: "kg", kind: "measured", symbol: true },
  kilogramme: { canonical: "kg", kind: "measured", symbol: true },
  mg: { canonical: "mg", kind: "measured", symbol: true },
  // A page glossing a metric weight names the pound, which French writes as a
  // livre: "450 g (1 livre) de spaghetti".
  livre: { canonical: "livre", kind: "measured", plural: "livres" },
  livres: { canonical: "livre", kind: "measured", plural: "livres" },
  lb: { canonical: "lb", kind: "measured", symbol: true },
  lbs: { canonical: "lb", kind: "measured", symbol: true },

  // Volume
  ml: { canonical: "ml", kind: "measured", symbol: true },
  cl: { canonical: "cl", kind: "measured", symbol: true },
  dl: { canonical: "dl", kind: "measured", symbol: true },
  l: { canonical: "l", kind: "measured", symbol: true },
  litre: { canonical: "l", kind: "measured", symbol: true },
  litres: { canonical: "l", kind: "measured", symbol: true },

  // Spoons and cups: real measures, but only in sensible fractions.
  "cuillere a soupe": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    plural: "cuillères à soupe",
  },
  "cuilleres a soupe": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    plural: "cuillères à soupe",
  },
  "c a soupe": { canonical: "cuillère à soupe", kind: "portioned", plural: "cuillères à soupe" },
  "c a s": { canonical: "cuillère à soupe", kind: "portioned", plural: "cuillères à soupe" },
  cas: { canonical: "cuillère à soupe", kind: "portioned", plural: "cuillères à soupe" },
  "cuillere a cafe": {
    canonical: "cuillère à café",
    kind: "portioned",
    plural: "cuillères à café",
  },
  "cuilleres a cafe": {
    canonical: "cuillère à café",
    kind: "portioned",
    plural: "cuillères à café",
  },
  "c a cafe": { canonical: "cuillère à café", kind: "portioned", plural: "cuillères à café" },
  "c a c": { canonical: "cuillère à café", kind: "portioned", plural: "cuillères à café" },
  cac: { canonical: "cuillère à café", kind: "portioned", plural: "cuillères à café" },
  verre: { canonical: "verre", kind: "portioned" },
  verres: { canonical: "verre", kind: "portioned" },
  bol: { canonical: "bol", kind: "portioned" },
  tasse: { canonical: "tasse", kind: "portioned" },
  tasses: { canonical: "tasse", kind: "portioned" },

  // Packaging and natural units: countable, so they round to whole things.
  sachet: { canonical: "sachet", kind: "portioned" },
  sachets: { canonical: "sachet", kind: "portioned" },
  gousse: { canonical: "gousse", kind: "portioned" },
  gousses: { canonical: "gousse", kind: "portioned" },
  tranche: { canonical: "tranche", kind: "portioned" },
  tranches: { canonical: "tranche", kind: "portioned" },
  botte: { canonical: "botte", kind: "portioned" },
  bottes: { canonical: "botte", kind: "portioned" },
  boite: { canonical: "boîte", kind: "portioned" },
  boites: { canonical: "boîte", kind: "portioned" },
  pot: { canonical: "pot", kind: "portioned" },
  pots: { canonical: "pot", kind: "portioned" },
  brique: { canonical: "brique", kind: "portioned" },
  feuille: { canonical: "feuille", kind: "portioned" },
  feuilles: { canonical: "feuille", kind: "portioned" },
  branche: { canonical: "branche", kind: "portioned" },
  branches: { canonical: "branche", kind: "portioned" },

  // Approximate by nature: the size of one is the cook's, the count is the
  // recipe's. See `readPartitiveMeasure` for what puts a word here.
  bouchon: { canonical: "bouchon", kind: "vague" },
  bouchons: { canonical: "bouchon", kind: "vague" },
  larme: { canonical: "larme", kind: "vague" },
  larmes: { canonical: "larme", kind: "vague" },
  doigt: { canonical: "doigt", kind: "vague" },
  doigts: { canonical: "doigt", kind: "vague" },
  nuage: { canonical: "nuage", kind: "vague" },
  nuages: { canonical: "nuage", kind: "vague" },
  louche: { canonical: "louche", kind: "vague" },
  louches: { canonical: "louche", kind: "vague" },
  lichette: { canonical: "lichette", kind: "vague" },
  lichettes: { canonical: "lichette", kind: "vague" },
  pointe: { canonical: "pointe", kind: "vague" },
  pointes: { canonical: "pointe", kind: "vague" },
  pincee: { canonical: "pincée", kind: "vague", plural: "pincées" },
  pincees: { canonical: "pincée", kind: "vague", plural: "pincées" },
  trait: { canonical: "trait", kind: "vague" },
  traits: { canonical: "trait", kind: "vague" },
  filet: { canonical: "filet", kind: "vague" },
  filets: { canonical: "filet", kind: "vague" },
  goutte: { canonical: "goutte", kind: "vague", plural: "gouttes" },
  gouttes: { canonical: "goutte", kind: "vague", plural: "gouttes" },
  poignee: { canonical: "poignée", kind: "vague", plural: "poignées" },
  poignees: { canonical: "poignée", kind: "vague", plural: "poignées" },
  // "noix" carries its own plural mark already.
  noix: { canonical: "noix", kind: "vague", plural: "noix" },
  soupcon: { canonical: "soupçon", kind: "vague", plural: "soupçons" },
  soupcons: { canonical: "soupçon", kind: "vague", plural: "soupçons" },
};

/**
 * Lowercase, strip accents and drop abbreviation dots, so lookups survive French
 * spelling variants. Recipes write "c. à soupe" and "c à s" as readily as the
 * full "cuillère à soupe", and an unrecognised unit is worse than a wrong one:
 * the amount falls through to the countable branch and gets rounded as though a
 * spoonful were an indivisible object.
 */
export function normalizeUnitKey(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\./g, " ")
      // A recipe that does not know how many it will be writes the plural mark in
      // brackets: "4 cuillère(s) à soupe". The unit is the word without it.
      .replace(/\((?:s|x|es)\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Longest keys first, so "cuillere a soupe" wins over "cuillere". */
export const UNIT_KEYS = Object.keys(UNITS).sort((a, b) => b.length - a.length);

export function lookupUnit(text: string): UnitInfo | null {
  return UNITS[normalizeUnitKey(text)] ?? null;
}

/**
 * Words that stand where a measure would and name no container: "un peu de
 * sel" states that there is some salt, and multiplying it says nothing.
 */
const NOT_A_MEASURE = new Set([
  "peu",
  "beaucoup",
  "plus",
  "moins",
  "assez",
  "trop",
  "autant",
  "tant",
  "moitie",
  "quart",
  "tiers",
  "reste",
  "melange",
  "ensemble",
]);

/**
 * Read a measure a line names with a container or a gesture the vocabulary
 * above has no entry for.
 *
 * What makes a measure approximate is that its size belongs to whoever pours
 * it: a bouchon, a poignée, a ramequin hold what they hold, and the recipe's
 * proportion lives in how many are asked for. French marks that grammatically,
 * by placing the noun between the amount and the partitive that introduces the
 * thing measured: "un bouchon de rhum", "2 bouquets de persil", "une poignée de
 * roquette". A noun in that position measures whatever follows it, so a
 * container nobody thought to list is read by the same rule as the ones that
 * are, and the vocabulary above only has to carry the words whose plural or
 * spelling the rule would get wrong.
 *
 * The amount has to come first. A line opening on the noun, as in "beurre
 * pommade", carries no quantity, and inventing one from the grammar would put a
 * number where the recipe wrote none.
 */
export function readPartitiveMeasure(text: string): { unit: UnitInfo; rest: string } | null {
  const match = HEAD_BEFORE_DE.exec(text);
  if (!match) {
    return null;
  }

  const [word = ""] = match.slice(1);
  if (word.length < 3) {
    return null;
  }
  if (NOT_A_MEASURE.has(normalizeUnitKey(word))) {
    return null;
  }
  if (lookupUnit(word)) {
    return null;
  }

  const canonical = frenchSingular(word);
  return {
    unit: { canonical, kind: "vague", plural: frenchPlural(canonical) },
    rest: text.slice(match[0].length),
  };
}

/**
 * The singular of a noun a line wrote in the plural, so the rewrite can put it
 * back in either number.
 *
 * "ananas", "jus" and "anis" carry their -s in the singular, and "morceaux"
 * comes from "morceau", so the ending decides rather than the last letter
 * alone.
 */
function frenchSingular(word: string): string {
  if (EAUX_ENDING.test(word)) {
    return word.slice(0, -1);
  }
  if (AUX_ENDING.test(word)) {
    return `${word.slice(0, -3)}al`;
  }
  if (VOWEL_THEN_S.test(word)) {
    return word;
  }
  if (TRAILING_S.test(word) && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

/** The plural French writes for a noun, or the noun itself when it takes no mark. */
function frenchPlural(word: string): string {
  if (SIBILANT_ENDING.test(word)) {
    return word;
  }
  if (EAU_ENDING.test(word)) {
    return `${word}x`;
  }
  if (AL_ENDING.test(word)) {
    return `${word.slice(0, -2)}aux`;
  }
  return `${word}s`;
}

/**
 * Metric ladders, used to keep a scaled amount at a human size.
 *
 * Multiplying a recipe by thirty is arithmetically fine and practically poor:
 * "8335 g de sucre" is correct, and nobody weighs eight thousand grams. Each
 * measured unit therefore knows the unit above and below it, so a large amount
 * climbs the ladder and a small one comes back down.
 */
interface UnitStep {
  /** Unit to switch to, and how many of the current unit it holds. */
  to: string;
  per: number;
}

const PROMOTIONS: Record<string, UnitStep> = {
  mg: { to: "g", per: 1000 },
  g: { to: "kg", per: 1000 },
  ml: { to: "l", per: 1000 },
  cl: { to: "l", per: 100 },
  dl: { to: "l", per: 10 },
};

const DEMOTIONS: Record<string, UnitStep> = {
  // Spoons and cups hold a fixed volume, so a share of one is stated in the
  // smaller spoon rather than as a fraction no measuring set carries: a quarter
  // of a cuillère à soupe is three quarters of a cuillère à café, and that is
  // the one of the two a kitchen owns.
  "cuillère à soupe": { to: "cuillere a cafe", per: 3 },
  tasse: { to: "cuillere a soupe", per: 16 },

  kg: { to: "g", per: 1000 },
  l: { to: "cl", per: 100 },
  dl: { to: "cl", per: 10 },
  cl: { to: "ml", per: 10 },
  g: { to: "mg", per: 1000 },
};

/**
 * The unit one step down the metric ladder, with how many of it fit in one of
 * the current unit. Null at the bottom of a ladder, where there is nothing
 * smaller to express the amount in.
 */
export function demoteUnit(unit: UnitInfo): { unit: UnitInfo; per: number } | null {
  const step = DEMOTIONS[unit.canonical];
  if (!step) {
    return null;
  }
  const target = lookupUnit(step.to);
  /* v8 ignore next 1 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
  return target ? { unit: target, per: step.per } : null;
}

/** How finely a kitchen can divide one of a counted thing. */
export type Divisibility =
  /** An oeuf: half of one is not an amount a kitchen measures out. */
  | "whole"
  /** A boîte, une gousse d'ail, a feuille de gélatine: it splits in two, and no finer. */
  | "half"
  /** An oignon, a pomme: a knife takes it to quarters. */
  | "quarter";

/**
 * How finely a unit divides, decided by what one of them holds rather than by
 * what holds it.
 *
 * The question is whether half of one is a quantity a cook can take: a boîte de
 * tomates is poured and the rest kept, a sachet de sucre vanillé is split by
 * eye, a feuille de gélatine is cut with scissors, a branche de thym is pinched
 * in two. Content that pours, weighs or cuts therefore divides, and the word for
 * the packaging settles nothing. What stays whole is what half of cannot be
 * measured out at all, and the egg is the case that names the rule: half of one
 * would have to be beaten and weighed, which is not what a recipe asks for. That
 * test belongs to the thing being counted, so it lives with the item in
 * `scale.ts`.
 *
 * A gesture keeps its own answer: half a pincée is a fraction of a hand, and the
 * count is the whole of what a pincée can say.
 *
 * A short list of measures goes one step further, to the quarter. See
 * `QUARTERED_MEASURE`.
 */
export function unitDivisibility(unit: UnitInfo): Divisibility {
  if (unit.kind === "vague") {
    return "whole";
  }
  return QUARTERED_MEASURE.test(unit.canonical) ? "quarter" : "half";
}

/**
 * Measures a cook takes a quarter of.
 *
 * The half is as far as the criterion goes on its own, because that is the
 * share most measures give up by eye. These three answer the size question
 * differently. A pot de crème fraîche and a bouteille hold enough that a
 * quarter is still a portion someone serves and the rest still keeps: a quarter
 * of a pot is a couple of spoonfuls, a quarter of a bouteille is a glass. A
 * tranche is already cut off something larger, and the board that produced one
 * takes a corner off it in the same gesture: a quarter of a tranche de pain is
 * a crouton.
 *
 * The pattern is exported because a line can write the measure where the unit
 * goes, in "1 pot de crème fraîche", or inside the name of what it counts, in
 * "1 petit pot de crème". Both readings answer to the same list.
 */
export const QUARTERED_MEASURE = /\b(pots?|bouteilles?|tranches?)\b/;

/**
 * Spoons, glasses and bowls: a portion of a fixed size, which a kitchen measures
 * out in the fractions printed on a measuring set rather than in halves alone.
 */
export function isSpoonMeasure(unit: UnitInfo): boolean {
  return HOUSEHOLD_MEASURE.test(unit.canonical);
}

export interface ChosenUnit {
  unit: UnitInfo;
  /** What to multiply an amount in the original unit by to express it in this one. */
  ratio: number;
}

/**
 * Choose the unit a cook would actually write a quantity in, and say how to get
 * there.
 *
 * A ratio rather than a converted number, because a range has two bounds and
 * they have to end up in the same unit: converting each on its own gives the
 * unreadable "450 g à 1 kg". The caller picks one bound to choose from, then
 * applies the ratio to both.
 *
 * Demotion repeats while the amount is under one, so a quantity divided a
 * thousandfold walks all the way down its ladder instead of rounding away.
 * Promotion takes one step, at a full unit of the step above, so 999 g stays
 * grams and 1000 g becomes a kilo.
 */
export function chooseReadableUnit(unit: UnitInfo, amount: number): ChosenUnit {
  if (unit.kind !== "measured" || !Number.isFinite(amount) || amount <= 0) {
    return { unit, ratio: 1 };
  }

  let current = unit;
  let ratio = 1;

  while (amount * ratio < 1) {
    const step = demoteUnit(current);
    if (!step) {
      break;
    }
    ratio *= step.per;
    current = step.unit;
  }

  const up = PROMOTIONS[current.canonical];
  if (up && amount * ratio >= up.per) {
    const target = lookupUnit(up.to);
    /* v8 ignore next 1 -- A defence the suite does not reach. It is kept
     rather than removed because what it guards against is a shape the site
     could publish, and reaching it would take an input nobody has seen. */
    if (target) {
      ratio /= up.per;
      current = target;
    }
  }

  return { unit: current, ratio };
}

/**
 * Matches a number followed by a unit anywhere in a piece of text.
 *
 * Used to spot a quantity this parser did not take, such as the second amount
 * of "20 g de levure dissoute dans 1 cuillère à soupe d'eau", which would
 * otherwise sit in a scaled line still saying what the original said.
 */
const EMBEDDED_MEASURE = new RegExp(
  `\\d[\\d.,/]*\\s*(?:${UNIT_KEYS.map((key) => key.replace(/ /g, "\\s+")).join("|")})\\b`,
  "i",
);

/**
 * Whether a piece of text holds a number followed by a unit.
 *
 * The text is normalized first, because the vocabulary is keyed without accents
 * and a line writes "cuillère à soupe" with them.
 */
export function hasEmbeddedMeasure(text: string): boolean {
  return EMBEDDED_MEASURE.test(normalizeUnitKey(text));
}

/**
 * What a kitchen usually takes each approximate measure to be.
 *
 * Offered as words for a note, never as the quantity: writing "2 cuillères à
 * café" where the page wrote "4 pincées" puts a figure on the page it never
 * claimed, and the cook is the one holding the pinch.
 */
const APPROXIMATE_EQUIVALENT: Record<string, string> = {
  pincee: "commonly taken as about half a teaspoon",
  poignee: "commonly taken as about a quarter of a cup",
  bouchon: "commonly taken as about a tablespoon, the size of a bottle cap",
  goutte: "commonly taken as a single drop",
  filet: "commonly taken as about a teaspoon poured in a thin line",
  noix: "commonly taken as about a tablespoon of butter",
  louche: "commonly taken as about half a cup",
  soupcon: "commonly taken as the smallest amount a spoon tip carries",
};

/** The everyday equivalence for an approximate measure, when there is a settled one. */
export function approximateEquivalent(unit: UnitInfo): string | null {
  return APPROXIMATE_EQUIVALENT[normalizeUnitKey(unit.canonical)] ?? null;
}

/**
 * Render a unit for a given amount, choosing singular or plural.
 *
 * French takes the plural from two onwards, so 1,5 stays singular: "1,5 cuillère
 * à soupe", not "1,5 cuillères".
 */
export function formatUnit(unit: UnitInfo, amount: number): string {
  if (unit.symbol) {
    return unit.canonical;
  }
  if (amount < 2) {
    return unit.canonical;
  }
  if (unit.plural) {
    return unit.plural;
  }
  return `${unit.canonical}s`;
}
