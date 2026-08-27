/**
 * Scaling ingredient quantities.
 *
 * The guiding rule is that a scaled quantity must be something a cook can act on.
 * Multiplying every number by the factor is arithmetically correct and practically
 * useless: it produces "2,4 oeufs" and "0,67 pincée de sel" with the same
 * confidence as "267 g de farine". Each line is therefore classified by what its
 * unit allows, and the classification travels with the result so the caller can
 * see what was computed and how.
 *
 * Leaving a line alone is a decision of the same weight. A quantity a recipe
 * states loosely still holds a share of the dish, and a leavening agent left at
 * one pincée for twenty-five servings is a recipe that does not rise.
 */

import { formatAmount, parseIngredient } from "./quantity.js";
import type { HeldBack, Measure, ParsedIngredient } from "./quantity.js";
import type { Divisibility, UnitInfo } from "./units.js";
import {
  hasEmbeddedMeasure,
  QUARTERED_MEASURE,
  approximateEquivalent,
  chooseReadableUnit,
  demoteUnit,
  formatUnit,
  isSpoonMeasure,
  unitDivisibility,
} from "./units.js";

const DASH_ONLY = /^[-–—]$/;
const EGG_WHITE = /\bblancs? de? /;
const EGG_WHITE_NAMED = /\bblancs? de? oeufs?\b/;
const PLURAL_ENDING = /s$|eaux$|aux$/i;
const SIBILANT_ENDING = /[sxz]$/i;
/** A word the page ended on a letter, which is what a plural mark attaches to. */
const LETTER_ENDING = /\p{L}$/u;
const EAU_ENDING = /eau$/i;
const AL_ENDING = /al$/i;
const EAUX_ENDING = /eaux$/i;
const AUX_ENDING = /aux$/i;
const VOWEL_OPENING = /^[aeiouàâäéèêëîïôöûü]/i;

export type ScalingKind =
  /** The arithmetic was exact. */
  | "scaled"
  /**
   * A countable item was moved to a whole or a half, or a measurement was
   * rounded to what a scale can show.
   */
  | "rounded"
  /** Left as published: nothing on the line is the factor's to multiply. */
  | "unscaled";

export interface ScaledIngredient {
  /** The line exactly as it was given. */
  original: string;
  /** The line after scaling, identical to `original` when unscaled. */
  text: string;
  /**
   * The scaled quantity, expressed in `unit`, and the lower bound when the line
   * gives a range.
   *
   * Read it together with `unit`, never on its own: a large result is moved to a
   * bigger unit, so scaling "200 g" by ten gives an amount of 2 with a unit of
   * "kg". The bare number can therefore shrink while the quantity grows.
   */
  amount: number | null;
  /**
   * Upper bound when the line gives a range, null otherwise.
   *
   * Written in the shape every source of recipes publishes it in, so a caller
   * merging two of them compares the same field on both.
   */
  amount_max: number | null;
  /** The unit `amount` is in, which may differ from the one the recipe used. */
  unit: string | null;
  scaling: ScalingKind;
  /**
   * Whether rounding moved the value away from the exact product. A line is
   * `rounded` either because of that or because a floor was reached, and this
   * says which of the two happened.
   */
  adjusted: boolean;
  /** Why the line was rounded, clamped or left alone. */
  note?: string;
}

/** Round to a step, keeping two decimals at most. */
function roundTo(value: number, step: number): number {
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

/**
 * Round a measured amount to something a kitchen scale can show.
 *
 * Large amounts do not need fine precision and small ones do, so the step grows
 * with the value rather than being fixed. The step stays a tenth in the single
 * digits because a unit can be a kilo as easily as a gram, and rounding 2,2 kg
 * to 2 would throw away a tenth of the ingredient.
 */
function roundMeasured(value: number): number {
  if (value >= 100) {
    return roundTo(value, 5);
  }
  if (value >= 10) {
    return roundTo(value, 1);
  }
  if (value >= 1) {
    return roundTo(value, 0.1);
  }
  return Math.round(value * 100) / 100;
}

/** Below this there is nothing a kitchen can measure out of a spoonful. */
const SMALLEST_USABLE_FRACTION = 0.25;

/** The smallest share of one thing that is still worth putting in a bowl. */
const SMALLEST_USABLE: Record<Divisibility, number> = {
  whole: 1,
  half: 0.5,
  quarter: 0.25,
};

/**
 * A list marker some pages carry in front of an ingredient.
 *
 * It is punctuation an editor left in rather than part of what is measured, and
 * a line opening with one reads as carrying no quantity at all: everything on it
 * would come back unscaled. The published line is kept whole under `original`.
 */
const BULLET = /^\s*[>\-–—•*]+\s+/;

const withoutBullet = (line: string): string => line.replace(BULLET, "").trim();

/**
 * The count past which a half stops being worth writing.
 *
 * Ten is where a recipe stops naming things one by one: below it a cook reads
 * "2 1/2 gousses" and measures it out, above it the half is noise beside the
 * number it hangs on.
 */
const HALF_STAYS_BELOW = 10;

/**
 * The longest line worth reading as an ingredient.
 *
 * A page is written by strangers, and the reading below walks a line several
 * times over. No cook writes an ingredient past a couple of hundred characters,
 * so a line beyond this is not one to read: it comes back as published, saying
 * why, rather than costing the caller a wait for an answer it will not get.
 */
const LONGEST_LINE = 500;

/** A line handed back whole, because it is too long to be read as one. */
const tooLong = (line: string): ScaledIngredient => ({
  original: line,
  text: line,
  amount: null,
  amount_max: null,
  unit: null,
  scaling: "unscaled",
  adjusted: false,
  note: `This line runs to ${line.length} characters, past the ${LONGEST_LINE} an ingredient is read within, so it was returned as published.`,
});

/** True when a number is a whole or a half, to the last bit of precision. */
function isHalfStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

/** Two decimals, which is finer than any kitchen resolves. */
function trim(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * How finely a counted thing divides, decided by the size of one of them
 * against what a recipe puts in.
 *
 * `PORTION_SIZED_ITEM` and `QUARTERED_ITEM` are the two ends of that one
 * comparison, and each entry earns its place by where the food falls on it.
 *
 * Une crevette, une moule, une noisette, un grain de poivre, une baie de
 * genièvre, une étoile de badiane is already a portion on its own. A recipe
 * counts five, twelve, twenty of them, and a cook taking a share of that recipe
 * puts one fewer in the pan; cutting one in two is not a thing a kitchen does.
 * These land on a whole number.
 *
 * Un gigot, une baguette, un camembert, un ananas, un oignon, une pastèque, une
 * pintade sits at the other end: a recipe asks for one or for two, and the
 * share it wants out of one is decided by a knife. A quarter of one is a piece
 * someone serves, and what is left keeps.
 *
 * The lists are read on an item stripped of its accents, so "échalote" and
 * "echalote" hit the same entry.
 */
const PORTION_SIZED_ITEM =
  /\b(crevettes?|gambas|langoustines?|moules?|noisettes?|grains?|genievres?|genevriers?|badianes?|anis)\b/;

const QUARTERED_ITEM =
  /\b(oignons?|echalotes?|pommes? de terre|pommes?|poires?|carottes?|citrons?|oranges?|tomates?|concombres?|courgettes?|aubergines?|courges?|potirons?|choux?|melons?|poivrons?|betteraves?|navets?|panais|poireaux?|bananes?|mangues?|avocats?|pasteques?|gigots?|baguettes?|camemberts?|fromages?|chevres?|chorizos?|reblochons?|buches?|ananas|peches?|abricots?|laits?|poulets?|pintades?|rotis?)\b/;

/**
 * A piece carved off a bird or off a joint, which stops at the half.
 *
 * The whole animal divides by the knife that portions it, and one of these is
 * already the portion that knife produced: a cuisse feeds one, and half of one
 * is the share a smaller recipe serves. Taking a quarter would name a piece no
 * one plates.
 *
 * It reads before the animal, whose name such a line carries alongside the cut.
 */
const HALVED_CUT = /\b(cuisses?|ailes?|pilons?|escalopes?|magrets?)\b/;

/**
 * A jus, the one counted thing whose division stops at the half.
 *
 * Half the jus of a citron is taken by squeezing half the fruit, which is a
 * step a recipe writes. A quarter of one has to be poured out and measured
 * back, and no recipe asks for that.
 *
 * It reads before the fruit, which a knife divides further on its own.
 */
const HALVED_ITEM = /\bjus\b/;

/**
 * Things a kitchen takes one of or none of.
 *
 * An oeuf comes out of its shell whole, and so does the jaune a recipe asks for
 * on its own: half of one would have to be beaten and weighed, which is not an
 * amount any recipe asks for and not one a cook can keep the rest of. A count of
 * them therefore lands on a whole number, whichever side of the half the
 * arithmetic fell on.
 *
 * Two more belong here for reasons the criterion cannot reach on its own:
 *
 * - a clou de girofle is a dried flower bud, dropped into the pot and fished
 *   back out of it. Nothing about it is measured, so there is no half of one to
 *   take;
 * - a zeste is what comes off one fruit in one go. A line asking for the zeste
 *   of a citron is asking for all of it, and a share of a zeste names no amount
 *   a cook stops at.
 */
const WHOLE_ITEM = /\b(oeufs?|jaunes?|clous?|zestes?)\b/;

/**
 * How far a "blanc" divides, when a line names one.
 *
 * The word covers two foods that answer the question in opposite ways. The
 * white of an oeuf goes with the oeuf and the jaune: half of one would have to
 * be beaten and weighed. A blanc de poulet or de dinde is a piece of meat, and
 * half of one is a portion a knife cuts and a fridge keeps.
 *
 * Deciding the word here rather than letting the line fall through is what
 * keeps the fruit or the vegetable such a line often names beside the meat from
 * answering for it.
 *
 * Null when the line names no blanc at all.
 */
function blancDivisibility(key: string): Divisibility | null {
  // The noun is the one followed by what it is the blanc of. "vin blanc" and
  // "oignon blanc" use the same letters as a colour and count as neither.
  if (!EGG_WHITE.test(key)) {
    return null;
  }
  return EGG_WHITE_NAMED.test(key) ? "whole" : "half";
}

/** How finely the thing a line counts can be divided. */
function divisibilityOf(unit: UnitInfo | null, item: string): Divisibility {
  if (unit) {
    return unitDivisibility(unit);
  }
  const key = item
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/['’]/g, " ");
  const blanc = blancDivisibility(key);
  if (blanc) {
    return blanc;
  }
  if (WHOLE_ITEM.test(key)) {
    return "whole";
  }
  if (PORTION_SIZED_ITEM.test(key)) {
    return "whole";
  }
  if (HALVED_ITEM.test(key)) {
    return "half";
  }
  if (HALVED_CUT.test(key)) {
    return "half";
  }
  if (QUARTERED_MEASURE.test(key)) {
    return "quarter";
  }
  return QUARTERED_ITEM.test(key) ? "quarter" : "half";
}

/**
 * How close a result has to be to the exact product to be called exact.
 *
 * Two tests, because one of them alone is wrong at some scale. An absolute gap
 * of a hundredth is beneath what a kitchen resolves at ordinary sizes, and at a
 * hundredth of a millilitre it is the whole quantity: 0,006 rounded to 0,01 sits
 * inside the absolute gap while being two thirds larger than what was asked for.
 * A share of half a percent catches that without calling ordinary rounding
 * inexact.
 */
const EXACT_WITHIN = 0.01;
const EXACT_SHARE = 0.005;

function landedExactly(exact: number, amount: number): boolean {
  const gap = Math.abs(exact - amount);
  if (gap > EXACT_WITHIN) {
    return false;
  }
  return exact === 0 || gap / Math.abs(exact) <= EXACT_SHARE;
}

interface CountableResult {
  value: number;
  /** The floor was hit, so this line no longer holds its share of the recipe. */
  clamped: boolean;
}

/**
 * Round a counted thing to an amount a kitchen produces.
 *
 * A count lands on a whole. The one exception is a share that comes out on a
 * half by itself, for a thing that divides in two: half a boîte de tomates is a
 * real amount, and rounding it up to a whole adds a sixth of the tomatoes to a
 * recipe that asked for three boîtes.
 *
 * How finely the thing divides decides the floor. Under that floor the amount is
 * clamped up rather than shrunk towards nothing, which keeps the ingredient in
 * the recipe at the cost of its proportion, and the caller is told through
 * `clamped`. The ceiling stops a shrinking recipe from ever asking for more than
 * it started with.
 */
function roundCountable(
  value: number,
  divisibility: Divisibility,
  ceiling: number,
): CountableResult {
  /* v8 ignore next 2 -- A factor is positive and a published amount is positive, so their 
     product is. */
  if (value <= 0) {
    return { value: 0, clamped: false };
  }

  const floor = SMALLEST_USABLE[divisibility];

  // A half is a quantity a cook takes out of a small count: two and a half
  // cloves of garlic is how a kitchen says it. Past a handful the half stops
  // meaning anything against the count beside it, and four hundred and
  // thirty-seven and a half apples is a figure nobody weighs against a basket.
  if (
    divisibility !== "whole" &&
    value >= floor &&
    value <= HALF_STAYS_BELOW &&
    isHalfStep(value)
  ) {
    return { value: trim(value), clamped: false };
  }

  if (divisibility === "whole") {
    // Below the halfway mark the nearest whole is none, and dropping the
    // ingredient is worse than overstating it, so the line keeps one and says it
    // no longer holds its share.
    if (value < 0.5) {
      return { value: floor, clamped: true };
    }
    return { value: Math.round(value), clamped: false };
  }

  if (value < floor) {
    return { value: floor, clamped: true };
  }

  if (value < 1) {
    // A knife takes a vegetable to quarters and thirds; anything else offers the
    // half it can be split on.
    const steps = divisibility === "quarter" ? [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1] : [0.5, 1];
    const candidates = steps.filter(
      (candidate) => candidate >= floor && candidate <= Math.max(ceiling, floor),
    );
    /* v8 ignore next 1 -- The steps always keep one candidate at or above the floor; this 
       narrows the type. */
    let closest = candidates[0] ?? floor;
    for (const candidate of candidates) {
      if (Math.abs(value - candidate) < Math.abs(value - closest)) {
        closest = candidate;
      }
    }
    return { value: trim(closest), clamped: false };
  }

  return { value: Math.round(value), clamped: false };
}

/**
 * Round a spoon, a glass or a bowl, which a kitchen measures out in halves and
 * in the fractions printed on a measuring set.
 */
function roundSpoon(value: number, ceiling: number): CountableResult {
  /* v8 ignore next 2 -- A factor is positive and a published amount is positive, so their 
     product is. */
  if (value <= 0) {
    return { value: 0, clamped: false };
  }

  if (value < 1) {
    const candidates = [SMALLEST_USABLE_FRACTION, 1 / 3, 0.5, 2 / 3, 0.75, 1].filter(
      (candidate) => candidate <= Math.max(ceiling, SMALLEST_USABLE_FRACTION),
    );
    /* v8 ignore next 1 -- The fractions always keep one candidate under the ceiling; this 
       narrows the type. */
    let closest = candidates[0] ?? SMALLEST_USABLE_FRACTION;
    for (const candidate of candidates) {
      if (Math.abs(value - candidate) < Math.abs(value - closest)) {
        closest = candidate;
      }
    }
    return { value: trim(closest), clamped: value < SMALLEST_USABLE_FRACTION };
  }

  return { value: roundTo(value, 0.5), clamped: false };
}

/**
 * Walk a spoon or a cup down to the smaller spoon while the amount sits under
 * one, so a share is stated in a measure that exists.
 *
 * An amount already on a whole or a half stays where the line put it: half a
 * cuillère à soupe is a spoon a kitchen owns, and there is nothing to gain by
 * calling it a cuillère à café et demie.
 */
function stepDownSpoon(unit: UnitInfo, reference: number): { unit: UnitInfo; ratio: number } {
  let current = unit;
  let ratio = 1;

  while (reference * ratio < 1 && !isHalfStep(reference * ratio)) {
    const step = demoteUnit(current);
    if (!step) {
      break;
    }
    ratio *= step.per;
    current = step.unit;
  }

  return { unit: current, ratio };
}

export interface ScaleOptions {
  /** Multiplier applied to the quantities. */
  factor: number;
}

interface ScaledBound {
  amount: number;
  /** The exact product, expressed in the unit that came back. */
  exact: number;
  clamped: boolean;
  /** The exact product in the unit the recipe wrote, for a readable note. */
  raw: number;
}

interface ScaledMeasure {
  /**
   * One bound for a single measure, two for a range, in that order. The shape
   * says so, because every reader takes the first without checking: a measure
   * that scaled to nothing is not a thing this can produce.
   */
  bounds: [ScaledBound, ...ScaledBound[]];
  /** The unit every bound is expressed in, which both ends of a range share. */
  unit: UnitInfo | null;
}

/**
 * Scale one measure, both ends of a range together.
 *
 * A measurement walks down to a smaller unit before it is rounded, so a
 * quantity divided a thousandfold never rounds to zero and states that the
 * recipe needs none of it.
 */
function scaleMeasure(
  low: number,
  high: number | null,
  unit: UnitInfo | null,
  factor: number,
  divisibility: Divisibility,
): ScaledMeasure {
  /** What the page published at one end of the measure, and what it scales to. */
  interface End {
    published: number;
    raw: number;
  }

  const ends: [End, ...End[]] =
    high === null
      ? [{ published: low, raw: low * factor }]
      : [
          { published: low, raw: low * factor },
          { published: high, raw: high * factor },
        ];

  /** Read both ends, keeping the shape every caller of the bounds relies on. */
  const eachEnd = <T>(read: (end: End) => T): [T, ...T[]] => [
    read(ends[0]),
    ...ends.slice(1).map(read),
  ];
  /**
   * The unit is chosen from the smaller end of a range.
   *
   * Both ends have to share one unit, or "450 à 1000 g" comes back as "450 à
   * 1 kg", where the two numbers are not in the same measure. Of the two, the
   * smaller end is the one a unit can ruin: choosing from the larger turns
   * "450 à 1000 g" into "0,45 à 1 kg", and pushed one step further it rounds the
   * small end away entirely. A large number in a small unit is merely long to
   * read.
   */
  const positive = ends.map((end) => end.raw).filter((raw) => raw > 0);
  /* v8 ignore next 1 -- A line reaching here carries a positive amount, so the list is never 
     empty. */
  const reference = positive.length > 0 ? Math.min(...positive) : low * factor;

  /** Both bounds share one unit, and each keeps the precision that unit affords. */
  const inUnit = (target: UnitInfo, ratio: number): ScaledMeasure => ({
    bounds: eachEnd(({ published, raw }) => {
      const exact = raw * ratio;
      // The rounding happens in the smaller of the two units, so moving to a
      // bigger one never throws away precision the page wrote: 1666 g rounded
      // as kilos is 1.7, and rounded as grams it is the 1.665 kg a scale shows.
      const rounded =
        ratio < 1 ? Number((roundMeasured(raw) * ratio).toPrecision(12)) : roundMeasured(exact);
      // At the bottom of a ladder, keep what precision is left rather than
      // deleting the ingredient.
      const usable = rounded === 0 && exact > 0 ? Number(exact.toPrecision(2)) : rounded;
      // Rounding to a step of five grams above a hundred can round upwards, and
      // a recipe being made smaller must never come out asking for more than
      // the page published.
      const ceiling = factor < 1 ? published * ratio : Number.POSITIVE_INFINITY;
      return { amount: Math.min(usable, ceiling), exact, clamped: false, raw };
    }),
    unit: target,
  });

  if (unit && unit.kind === "measured") {
    const chosen = chooseReadableUnit(unit, reference);
    return inUnit(chosen.unit, chosen.ratio);
  }

  if (unit && isSpoonMeasure(unit)) {
    const stepped = stepDownSpoon(unit, reference);
    // A share stated in the smaller spoon is a measurement, and keeps the
    // precision of one rather than being snapped to the fractions of a spoon it
    // no longer fills.
    if (stepped.ratio !== 1) {
      const bounds = eachEnd(({ published, raw }) => {
        const exact = raw * stepped.ratio;
        /* v8 ignore next 1 -- A spoon steps down only where the recipe is being reduced, so 
           the factor is under one. */
        const ceiling = factor < 1 ? published * stepped.ratio : Number.POSITIVE_INFINITY;
        const rounded = roundSpoon(exact, ceiling);
        return { amount: rounded.value, exact, clamped: rounded.clamped, raw };
      });
      return { bounds, unit: stepped.unit };
    }

    const bounds = eachEnd(({ published, raw }) => {
      const ceiling = factor < 1 ? published : Number.POSITIVE_INFINITY;
      const rounded = roundSpoon(raw, ceiling);
      return { amount: rounded.value, exact: raw, clamped: rounded.clamped, raw };
    });
    return { bounds, unit };
  }

  if (unit && unit.kind === "vague") {
    // A pincée, a poignée or a filet has the size the cook's hand gives it, so
    // the proportion of the recipe lives in how many are asked for. The count
    // therefore multiplies in whole units, and the measure stays in its own
    // vocabulary rather than being turned into grams or spoons, where published
    // equivalences span a fourfold range.
    const bounds = eachEnd(({ published, raw }) => {
      const ceiling = factor < 1 ? published : Number.POSITIVE_INFINITY;
      const rounded = roundCountable(raw, "whole", ceiling);
      return {
        amount: Math.min(rounded.value, ceiling),
        exact: raw,
        clamped: rounded.clamped,
        raw,
      };
    });
    return { bounds, unit };
  }

  const bounds = eachEnd(({ published, raw }) => {
    // Scaling down must never end up asking for more than the recipe did.
    const ceiling = factor < 1 ? published : Number.POSITIVE_INFINITY;
    const rounded = roundCountable(raw, divisibility, ceiling);
    return { amount: rounded.value, exact: raw, clamped: rounded.clamped, raw };
  });
  return { bounds, unit };
}

/* -------------------------------------------------------------------------- */
/* Agreement between a number and the thing it counts                          */
/* -------------------------------------------------------------------------- */

/**
 * Make a counted item agree with its amount, in both directions.
 *
 * French takes the plural from two onwards, so "2 oeufs" halved reads "1 oeuf"
 * and "1 brioche" tripled reads "3 brioches". Only the head word is touched, and
 * only its trailing "s": nouns already ending in -s, -x or -z are invariable in
 * the plural ("ananas", "choux"), and forcing one would be worse than leaving the
 * word as the recipe wrote it.
 *
 * Going back down needs `INVARIABLE_NOUN`, because the ending settles nothing on
 * its own: "jus" and "clous" both end in -us, and the first is a singular where
 * the second is a plural of "clou".
 */
function agreeWithAmount(item: string, amount: number): string {
  /* v8 ignore next 2 -- The caller writes the item before asking, and an empty one is handled 
     where it is read. */
  if (!item) {
    return item;
  }

  const words = item.split(" ");
  /* v8 ignore next 1 -- A string split on whitespace always yields a first piece; this narrows 
     the type. */
  const head = words[0] ?? "";
  if (head.length <= 3) {
    return item;
  }

  const wantsPlural = amount >= 2;
  const isPlural = PLURAL_ENDING.test(head);

  if (wantsPlural !== isPlural) {
    words[0] = wantsPlural ? headPlural(head) : headSingular(head);
  }

  const last = words.length - 1;
  const trailing = last > 0 ? words[last] : undefined;
  if (trailing !== undefined) {
    const adjective = agreeTrailingAdjective(trailing, wantsPlural);
    if (adjective) {
      words[last] = adjective;
    }
  }

  return words.join(" ");
}

/**
 * Nouns carrying a final -s, -x or -z in the singular.
 *
 * The word is the same whatever the number, so the ending a plural would give
 * back belongs to the singular and must stay.
 */
/**
 * The plural of the word a line counts.
 *
 * A word ending in -s, -x or -z takes no mark, and neither does one the page
 * ended on something other than a letter: "tomate(s)" is already written for
 * both numbers. "morceau" and "bocal" take -x and -aux where the ordinary noun
 * takes -s.
 */
function headPlural(head: string): string {
  if (SIBILANT_ENDING.test(head) || !LETTER_ENDING.test(head)) {
    return head;
  }
  if (EAU_ENDING.test(head)) {
    return `${head}x`;
  }
  if (AL_ENDING.test(head)) {
    return `${head.slice(0, -2)}aux`;
  }
  return `${head}s`;
}

/**
 * The singular of the word a line counts.
 *
 * The ending settles nothing on its own: "jus" and "clous" both end in -us, and
 * the first is a singular where the second is a plural of "clou". So the -s of a
 * noun that carries one in the singular is kept by name, and so is the -s of an
 * adjective a line put in front of what it counts: trimming the "gros" of
 * "2 gros oeufs" writes "gro", which is no word.
 */
function headSingular(head: string): string {
  if (EAUX_ENDING.test(head)) {
    return head.slice(0, -1);
  }
  if (AUX_ENDING.test(head)) {
    return `${head.slice(0, -3)}al`;
  }
  const folded = foldWord(head);
  if (INVARIABLE_NOUN.has(folded) || INVARIABLE_ADJECTIVE.has(folded)) {
    return head;
  }
  return head.slice(0, -1);
}

/**
 * Adjectives carrying a final -s in both numbers.
 *
 * A line writes them in front of what it counts, where the reading above takes
 * the first word for the noun. Trimming their -s to make a singular writes a
 * word nobody uses.
 */
const INVARIABLE_ADJECTIVE = new Set(["gros", "epais", "frais", "gras", "bas", "vieux", "doux"]);

const INVARIABLE_NOUN = new Set([
  "ananas",
  "anis",
  "brebis",
  "cassis",
  "colis",
  "coulis",
  "couscous",
  "gambas",
  "houmous",
  "jus",
  "mais",
  "pastis",
  "pois",
  "radis",
  "ris",
  "souris",
  "tamis",
  "tapas",
]);

/**
 * Adjectives a recipe puts after the noun, and which take a plain -s.
 *
 * A French adjective agrees with the noun it qualifies, so "1 piment entier"
 * counted four times reads "4 piments entiers". Only this list is declined: an
 * unknown trailing word can be a brand ("Golden"), a proper noun ("Cayenne") or
 * a phrase whose head sits elsewhere, and a word left as the recipe wrote it
 * reads as faithful where an invented ending reads as wrong.
 */
const AGREEABLE_ADJECTIVES = new Set([
  "entier",
  "entiere",
  "etoile",
  "etoilee",
  "moyen",
  "moyenne",
  "petit",
  "petite",
  "grand",
  "grande",
  "gros",
  "grosse",
  "mur",
  "mure",
  "vert",
  "verte",
  "rouge",
  "jaune",
  "noir",
  "noire",
  "blanc",
  "blanche",
  "rond",
  "ronde",
  "hache",
  "hachee",
  "coupe",
  "coupee",
  "rape",
  "rapee",
  "pele",
  "pelee",
  "epluche",
  "epluchee",
  "denoyaute",
  "denoyautee",
  "emince",
  "emincee",
]);

/** Lowercase and strip accents, so "entière" and "entiere" hit the same entry. */
function foldWord(word: string): string {
  return word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** The trailing adjective agreed with the count, or null when it is left alone. */
function agreeTrailingAdjective(word: string, wantsPlural: boolean): string | null {
  const folded = foldWord(word);
  const isPlural = folded.endsWith("s");
  const singular = isPlural ? word.slice(0, -1) : word;

  if (!AGREEABLE_ADJECTIVES.has(foldWord(singular))) {
    return null;
  }
  if (wantsPlural === isPlural) {
    return null;
  }

  return wantsPlural ? `${word}s` : singular;
}

/**
 * Agree the adjective a line put in front of its measure, as in the "grosse" of
 * "1 grosse pincée".
 *
 * The word qualifies the measure, so it takes the number the measure takes:
 * "2 grosses pincées". A word outside the declinable list stays as the recipe
 * wrote it, for the same reason it does after the noun.
 */
function agreeLeadingAdjective(word: string, amount: number): string {
  const wantsPlural = amount >= 2;
  const folded = foldWord(word);
  // An adjective the vocabulary already knows with its -s is invariable, and
  // one whose singular the vocabulary does not know is left alone below:
  // trimming "gros" writes "gro", which is no word.
  const isPlural =
    folded.endsWith("s") &&
    !AGREEABLE_ADJECTIVES.has(folded) &&
    AGREEABLE_ADJECTIVES.has(folded.slice(0, -1));
  const singular = isPlural ? word.slice(0, -1) : word;

  if (!AGREEABLE_ADJECTIVES.has(foldWord(singular))) {
    return word;
  }
  if (wantsPlural === isPlural) {
    return word;
  }
  return wantsPlural ? `${singular}s` : singular;
}

/**
 * "de" becomes "d'" before a vowel sound.
 *
 * The h is the hard case: it is silent in "huile" and sounded in "haricot", and
 * only a word list separates them. Elision is therefore limited to vowels plus
 * the handful of h-words a recipe actually uses, because "de haricots" merely
 * reads as careless while "d'haricots" reads as wrong.
 */
const MUTE_H_WORDS = /^(?:huile|huiles|huitre|huitres|huître|huîtres|herbe|herbes|hysope)\b/i;

function joinItem(item: string): string {
  /* v8 ignore next 2 -- The caller writes the item before asking, and an empty one is handled 
     where it is read. */
  if (!item) {
    return "";
  }
  const elides = VOWEL_OPENING.test(item) || MUTE_H_WORDS.test(item);
  return elides ? ` d'${item}` : ` de ${item}`;
}

/* -------------------------------------------------------------------------- */
/* Scaling one line                                                            */
/* -------------------------------------------------------------------------- */

/** How a line writes the choice between two quantities: "100 g de beurre ou 2 oeufs". */
const BRANCH_SEPARATOR = /\s+ou\s+/gi;

interface Branch {
  head: string;
  /** The separator as published, so the rewrite reads the way the line did. */
  separator: string;
  tail: string;
}

/**
 * Split a line that offers one ingredient twice, at the word that offers the
 * choice.
 *
 * The search starts where the item name starts, so the "ou" of a published
 * range such as "2 ou 3 gousses d'ail" is left to the range parser. A branch
 * counts only when it carries a quantity of its own; "sucre ou cassonade"
 * names one amount and stays one line.
 */
function splitBranch(text: string, parsed: ParsedIngredient): Branch | null {
  // The name was read out of this very line, so it is always found in it; the
  // guard below is what narrows the type.
  /* v8 ignore start -- The name was read out of this very line, so it is always
     found in it; the guard narrows the type. */
  const itemStart = parsed.item ? text.indexOf(parsed.item) : text.length;
  if (itemStart < 0) {
    return null;
  }
  /* v8 ignore stop */

  BRANCH_SEPARATOR.lastIndex = 0;
  for (let match = BRANCH_SEPARATOR.exec(text); match; match = BRANCH_SEPARATOR.exec(text)) {
    if (match.index < itemStart) {
      continue;
    }
    const tail = text.slice(match.index + match[0].length);
    if (parseIngredient(tail).amount === null) {
      continue;
    }
    return { head: text.slice(0, match.index), separator: match[0], tail };
  }
  return null;
}

/**
 * Scale one ingredient line.
 *
 * Countable items are rounded to something a kitchen can measure, ranges are
 * scaled at both ends, equivalents and alternatives are scaled with the amount
 * they stand beside, and an approximate measure such as a pincée has its count
 * scaled with a note saying how loosely one of them is defined.
 */
export function scaleIngredient(line: string, options: ScaleOptions): ScaledIngredient {
  const { factor } = options;
  if (line.length > LONGEST_LINE) {
    return tooLong(line);
  }
  // A factor of one changes nothing, and rewriting the line anyway would round
  // "178 ml" to "180 ml" and report a difference the caller never asked for.
  if (factor === 1) {
    return passthroughIngredient(line);
  }

  const text = withoutBullet(line);
  const branch = splitBranch(text, parseIngredient(text));
  if (branch) {
    return scaleBranchedLine(line, branch, options);
  }

  const scaled = scaleSingleLine(text, options);
  // The marker is dropped from the line as it now reads and kept in the line as
  // published, which is what `original` is for.
  return text === line.trim() ? scaled : { ...scaled, original: line };
}

/**
 * Scale a line that offers a choice, one branch at a time.
 *
 * A cook follows one branch and ignores the other, so both have to carry the
 * same share of the recipe: a doubled line whose second branch still reads as
 * published hands whoever takes it half the ingredient. The two branches name
 * different things, and how far one stands for the other is the page's claim
 * rather than arithmetic, so such a line is never reported as exact.
 */
function scaleBranchedLine(line: string, branch: Branch, options: ScaleOptions): ScaledIngredient {
  const head = scaleSingleLine(branch.head, options);
  /* v8 ignore next 2 -- A branch is split only where its head carried a quantity, so the head 
     always scales. */
  if (head.scaling === "unscaled") {
    return { ...head, text: line.trim(), original: line };
  }

  const tail = scaleAlternative(branch.tail, options);
  const result: ScaledIngredient = {
    ...head,
    original: line,
    text: `${head.text}${branch.separator}${tail.text}`,
    scaling: "rounded",
  };

  const branchNote = tail.rewritten
    ? "This line offers a choice between two quantities, and each was scaled on its own. " +
      "How far one stands for the other is the page's own claim."
    : "This line carries a further quantity after the first one, and only the first was scaled. " +
      "Read the rest as published.";
  result.note = head.note ? `${head.note} ${branchNote}` : branchNote;

  return result;
}

/**
 * Scale the branch a line offers as an alternative, when it can be stated in
 * the measure the line offered it in.
 *
 * Under one of that measure the branch would have to be restated in another
 * one, which changes the shape of the choice the cook is being handed, so it
 * keeps its published wording and the line says that it did.
 */
function scaleAlternative(
  tail: string,
  options: ScaleOptions,
): { text: string; rewritten: boolean } {
  const parsed = parseIngredient(tail);
  const published = tail.trim();
  /* v8 ignore next 2 -- An alternative branch is scaled only after its own quantity was read. */
  if (parsed.amount === null) {
    return { text: published, rewritten: false };
  }

  const largest = (parsed.amountMax ?? parsed.amount) * options.factor;
  if (largest < 1) {
    return { text: published, rewritten: false };
  }

  return { text: scaleIngredient(tail, options).text, rewritten: true };
}

/** The equivalents beside a measure, written the way the line wrote them. */
function alternateLabel(texts: readonly string[], restated: boolean): string {
  if (texts.length === 0) {
    return "";
  }
  return restated ? ` / ${texts.join(" / ")}` : ` (${texts.join(" / ")})`;
}

/**
 * What follows the amount: the partitive French puts between a measure and what
 * it measures, or the counted item itself, which stands straight after its
 * number and agrees with it, as in "1/3 oeuf" and "3 brioches".
 */
function itemLabelFor(unit: UnitInfo | null, item: string, counted: string): string {
  if (unit) {
    return joinItem(item);
  }
  /* v8 ignore next 1 -- A line with no unit names what it counts, and one with a unit took the 
     branch above. */
  if (counted) {
    return ` ${counted}`;
  }
  /* v8 ignore next 1 -- A line carrying neither a unit nor a name for what it
     counts carries no quantity, and is answered where the quantity is read. */
  return "";
}

/** What the answer says about a line beyond the figure it came to. */
interface LineOutcome {
  parsed: ParsedIngredient;
  bounds: readonly ScaledBound[];
  unit: UnitInfo | null;
  low: ScaledBound;
  clamped: ScaledBound | null;
  movedPrimary: boolean;
  movedAlternate: boolean;
  restated: boolean;
  collapsed: boolean;
}

/**
 * Everything the answer owes a caller about one scaled line, in one string.
 *
 * A note is built rather than assembled at the call site because the reasons
 * stack: a line can be clamped, carry a second quantity, collapse its range and
 * state an approximation, and each of those has to be said without cancelling
 * the others.
 */
function noteForScaledLine(outcome: LineOutcome): string | undefined {
  const {
    parsed,
    bounds: primaryBounds,
    unit,
    low,
    clamped,
    movedPrimary,
    movedAlternate,
    restated,
    collapsed,
  } = outcome;
  let note: string | undefined;

  /**
   * The exact product, written for a note.
   *
   * Decimals rather than kitchen fractions: this number exists to be compared
   * against the one on the line, and a fraction snapped from 0,32 to "1/3"
   * reads as the exact product while being a different number.
   */
  const asPublished = (value: number, source: UnitInfo | null) =>
    `${formatAmount(Math.round(value * 1000) / 1000, { fractions: false })}${
      source ? ` ${formatUnit(source, value)}` : ""
    }`;

  const sentences: string[] = [];

  if (clamped) {
    // Name the floor this line actually landed on: how far one of the thing
    // divides is what sets it, so a sachet stops at a half where an oignon goes
    // to a quarter.
    sentences.push(
      `Clamped up to ${formatAmount(clamped.amount)} from ` +
        `${formatAmount(Math.round(clamped.raw * 1000) / 1000)}, the smallest amount worth ` +
        "measuring. This line no longer holds its share of the recipe.",
    );
  } else if (movedPrimary) {
    // Every bound that moved is named, with the direction it moved in. On a
    // range the two ends can move opposite ways, and reporting one of them as
    // though it spoke for both states the wrong direction for half the quantity.
    const moved = primaryBounds.filter((bound) => !landedExactly(bound.exact, bound.amount));
    sentences.push(
      moved
        .map(
          (bound) =>
            `Rounded ${bound.amount > bound.exact ? "up" : "down"} from ` +
            `${asPublished(bound.raw, parsed.unit)}.`,
        )
        .join(" "),
    );
    // Reached only where the amount comes out exact and the equivalent beside
    // it does not, which the French unit ladders never produce.
    /* v8 ignore start -- Reached only where the amount comes out exact and the
       equivalent beside it does not, which the French unit ladders never
       produce. */
  } else if (movedAlternate) {
    // The amount itself came out exact, and only the equivalent beside it had to
    // move. Saying "rounded from 300 g" when 300 g is exact would send a cook
    // looking for an error that is not there.
    /* v8 ignore next 1 -- Reached only where the amount comes out exact and the
       equivalent beside it does not, which the French unit ladders never
       produce. */
    sentences.push(
      `The amount is exact; the equivalent ${
        /* v8 ignore next 1 -- Reached only from the branch above, which the
           French unit ladders never produce. */
        restated ? "beside it" : "in brackets"
      } was rounded to stay readable.`,
    );
    /* v8 ignore stop */
  } else if (restated) {
    sentences.push(
      "This line states one quantity twice, and both readings were scaled. " +
        "They agree as closely as the page wrote them, and no closer.",
    );
  }

  // A line can carry a second amount after the first, as in "20 g de levure
  // dissoute dans 1 cuillère à soupe d'eau". Only the amount the line opens with
  // is scaled, and one left at its published size contradicts it. This is said
  // whatever else happened to the line: a line that was also rounded is the one
  // where a stale second quantity is hardest to spot.
  if (hasEmbeddedMeasure(parsed.item)) {
    sentences.push(
      "This line carries a further quantity after the first one, and only the first was scaled. " +
        "Read the rest as published.",
    );
  }

  if (collapsed) {
    sentences.push("The page gave a range, and at this size both ends come to the same amount.");
  }

  // Below what any scale shows, the arithmetic is right and the kitchen cannot
  // follow it. Saying so is the difference between an answer and a number.
  if (unit?.kind === "measured" && low.amount > 0 && low.amount < 0.05) {
    sentences.push(
      "This is smaller than a kitchen scale resolves. Make a larger batch, or measure it by eye.",
    );
  }

  // The page put the amount forward as loose, and multiplying it keeps it that
  // way: the answer is as approximate as the figure it came from.
  if (parsed.approximation) {
    sentences.push(
      "The page gave this amount as an approximation, and the scaled figure is no firmer.",
    );
  }

  if (sentences.length > 0) {
    note = sentences.join(" ");
  }

  if (parsed.unit && parsed.unit.kind === "vague") {
    note = withApproximateNote(parsed.unit, note);
  }

  // A line that wrote its amount as a word says which word it was, so a caller
  // can see the figure came from the grammar rather than from a digit.
  if (parsed.articleWord) {
    // `amount` carries the product once a word such as "douzaine" has multiplied
    // it, and quoting that back would credit the article with a figure it never
    // gave.
    /* v8 ignore next 1 -- An article names a word only where it also gave an amount; this 
       narrows the type. */
    const stood = (parsed.amount ?? 0) / (parsed.countMultiplier ?? 1);
    const read = `"${parsed.articleWord}" read as ${formatAmount(stood)}.`;
    note = note ? `${read} ${note}` : read;
  }

  return note;
}

/** Why a line showing a figure came back as the page published it. */
const HELD_BACK_NOTE: Record<HeldBack, string> = {
  sizeQualifier:
    "The figures here give the size of one item rather than how many, so the line is " +
    "left as published.",
  itemSize:
    "The measure standing behind the item gives the size of one of them rather than how many, " +
    "so the line is left as published. Serving more people is a matter of taking a bigger one, " +
    "and serving fewer a smaller one.",
  perPerson:
    "This line already states an amount for one person, and the factor is what changes " +
    "how many people the recipe serves, so the line is left as published.",
  ambiguousDecimal:
    "The comma in this number marks thousands in one convention and the decimal point in " +
    "another, and the line gives no sign which was meant, so it is left as published.",
};

function scaleSingleLine(line: string, options: ScaleOptions): ScaledIngredient {
  const { factor } = options;
  const parsed = parseIngredient(line);

  if (parsed.amount === null || parsed.heldBack) {
    return {
      original: parsed.original,
      text: parsed.original,
      amount: null,
      amount_max: null,
      unit: null,
      scaling: "unscaled",
      adjusted: false,
      note: parsed.heldBack
        ? HELD_BACK_NOTE[parsed.heldBack]
        : "No quantity given; adjust to taste.",
    };
  }

  const divisibility = divisibilityOf(parsed.unit, parsed.item);
  const primary = scaleMeasure(parsed.amount, parsed.amountMax, parsed.unit, factor, divisibility);
  const alternates = parsed.alternates.map((measure) => renderMeasure(measure, factor));

  const primaryBounds = primary.bounds;
  const alternateBounds = alternates.flatMap((entry) => entry.bounds);
  const movedPrimary = primaryBounds.some((b) => !landedExactly(b.exact, b.amount));
  const movedAlternate = alternateBounds.some((b) => !landedExactly(b.exact, b.amount));
  const clamped = [...primaryBounds, ...alternateBounds].find((bound) => bound.clamped) ?? null;
  // Two figures beside each other agree only as closely as the page wrote them,
  // and multiplying both keeps that gap rather than closing it.
  const restated = parsed.alternateStyle === "slash";

  const low = primaryBounds[0];
  const high = primaryBounds[1] ?? null;
  const unit = primary.unit;
  const shown = high?.amount ?? low.amount;
  // Mass and volume read as decimals; counted and spooned things read as
  // fractions.
  const asText = (value: number) => formatAmount(value, { fractions: unit?.kind !== "measured" });

  // A range whose two ends land on the same amount stopped being a range. "1 à
  // 1 gousse" is not something a cook reads, so the line states the one amount
  // both ends came to.
  const collapsed = high !== null && high.amount === low.amount;
  const amountText = renderRange(
    asText(low.amount),
    high === null || collapsed ? null : asText(high.amount),
    parsed.rangeSeparator,
  );
  // The size word the page put in front of its measure goes back in front of
  // it: the page asked for a grosse pincée, and a pincée is not the same ask.
  const adjective =
    unit && parsed.measureAdjective
      ? ` ${agreeLeadingAdjective(parsed.measureAdjective, shown)}`
      : "";
  const unitLabel = unit ? `${adjective} ${formatUnit(unit, shown)}` : "";
  // Equivalents go back the way the line offered them: inside brackets, or
  // after a slash beside the amount they restate.
  const alternateTexts = alternates.map((entry) => entry.text);
  const altLabel = alternateLabel(alternateTexts, restated);
  // A measure needs the partitive French puts between it and what it measures.
  // A counted item stands straight after its number, and agrees with it:
  // "1/3 oeuf", "3 brioches".
  const counted = agreeWithAmount(parsed.item, shown);
  const itemLabel = itemLabelFor(unit, parsed.item, counted);

  const adjusted = movedPrimary || movedAlternate;
  const result: ScaledIngredient = {
    original: parsed.original,
    text: `${parsed.approximation ?? ""}${amountText}${unitLabel}${altLabel}${itemLabel}`.trim(),
    amount: low.amount,
    amount_max: collapsed ? null : (high?.amount ?? null),
    unit: unit?.canonical ?? null,
    scaling: adjusted || restated || clamped ? "rounded" : "scaled",
    adjusted,
  };

  const note = noteForScaledLine({
    parsed,
    bounds: primaryBounds,
    unit,
    low,
    clamped,
    movedPrimary,
    movedAlternate,
    restated,
    collapsed,
  });
  if (note !== undefined) {
    result.note = note;
  }

  return result;
}

/** Opening of the sentence an approximate measure carries. */
const APPROXIMATE_MEASURE_MARKER = "is an approximate measure";

/**
 * Say that a measure is held to no better than the hand that produces it, and
 * what a kitchen usually takes one to be.
 *
 * The equivalence belongs in the note. A recipe that asks for four pincées of
 * bicarbonate has said nothing about cuillères, and answering in cuillères
 * would hand back a figure with a precision the page never claimed. The
 * quantity stays in the measure the line used, and the count is what carries
 * the scaling.
 */
function withApproximateNote(unit: UnitInfo, existing: string | undefined): string {
  const equivalence = approximateEquivalent(unit);
  const sentence =
    `A ${unit.canonical} ${APPROXIMATE_MEASURE_MARKER}${equivalence ? `, ${equivalence}` : ""}. ` +
    "The count was scaled and the size of one is the cook's.";
  return existing ? `${existing} ${sentence}` : sentence;
}

/**
 * Whether this line was scaled as an approximate measure, so a caller can say
 * so once for a whole list instead of reading every note.
 */
export function isApproximateMeasure(entry: ScaledIngredient): boolean {
  return entry.note?.includes(APPROXIMATE_MEASURE_MARKER) ?? false;
}

/**
 * Scale an equivalent the line states beside the amount, and render it the way
 * the line wrote it.
 */
function renderMeasure(measure: Measure, factor: number): { text: string; bounds: ScaledBound[] } {
  const scaled = scaleMeasure(
    measure.amount,
    measure.amountMax,
    measure.unit,
    factor,
    divisibilityOf(measure.unit, ""),
  );
  const low = scaled.bounds[0];
  const high = scaled.bounds[1] ?? null;
  const unit = scaled.unit;
  const shown = high?.amount ?? low.amount;
  const asText = (value: number) => formatAmount(value, { fractions: unit?.kind !== "measured" });

  return {
    text: `${renderRange(
      asText(low.amount),
      /* v8 ignore next 1 -- A range keeps both its bounds through scaling, so the upper one is 
         always there. */
      high === null ? null : asText(high.amount),
      measure.rangeSeparator,
      // A line with no unit takes the other side of this, which the branch above
      // already returned.
      /* v8 ignore start -- A line with no unit takes the other side of this,
         which the branch above already returned. */
    )}${unit ? ` ${formatUnit(unit, shown)}` : ""}`,
    /* v8 ignore stop */
    bounds: scaled.bounds,
  };
}

/** Keep a range in the shape the recipe wrote it: "3-4" or "2 à 3". */
function renderRange(low: string, high: string | null, separator: string | null): string {
  if (high === null || separator === null) {
    return low;
  }
  return DASH_ONLY.test(separator) ? `${low}${separator}${high}` : `${low} ${separator} ${high}`;
}

export function scaleIngredients(lines: string[], options: ScaleOptions): ScaledIngredient[] {
  return lines.map((line) => scaleIngredient(line, options));
}

/**
 * A line returned as published, with whatever quantity could be read off it.
 *
 * A line that carries a readable amount is `scaled`, because leaving it alone
 * is what multiplying by one does. A line with no amount to multiply is
 * `unscaled` and says why.
 */
export function passthroughIngredient(line: string): ScaledIngredient {
  if (line.length > LONGEST_LINE) {
    return tooLong(line);
  }
  const parsed = parseIngredient(line);
  const held = parsed.amount === null || parsed.heldBack !== null;

  const result: ScaledIngredient = {
    original: parsed.original,
    text: parsed.original,
    amount: held ? null : parsed.amount,
    amount_max: held ? null : parsed.amountMax,
    unit: held ? null : (parsed.unit?.canonical ?? null),
    scaling: held ? "unscaled" : "scaled",
    adjusted: false,
  };
  if (parsed.heldBack) {
    result.note = HELD_BACK_NOTE[parsed.heldBack];
  } else if (parsed.amount === null) {
    result.note = "No quantity given; adjust to taste.";
  } else if (parsed.unit?.kind === "vague") {
    result.note = withApproximateNote(parsed.unit, undefined);
  }

  // A line that wrote its amount as a word says which word it was, here as in
  // every other answer: a figure the page does not print is one this server
  // read, and a caller has to be able to see that it did.
  if (parsed.articleWord) {
    // An article names a word only where it also gave an amount, so the
    // fallback below narrows the type and no state reaches it.
    /* v8 ignore start -- An article names a word only where it also gave an
       amount; the fallbacks narrow the types. */
    const stood = (parsed.amount ?? 0) / (parsed.countMultiplier ?? 1);
    /* v8 ignore stop */
    const read = `"${parsed.articleWord}" read as ${formatAmount(stood)}.`;
    result.note = result.note ? `${read} ${result.note}` : read;
  }
  return result;
}

/** An ingredient list returned unchanged, for when no scaling was requested. */
export function passthroughIngredients(lines: string[]): ScaledIngredient[] {
  return lines.map((line) => ({ ...passthroughIngredient(line), scaling: "unscaled" as const }));
}
