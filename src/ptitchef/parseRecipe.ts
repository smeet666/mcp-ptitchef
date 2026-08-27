/**
 * Reading one recipe out of the page the site serves.
 *
 * The page carries a schema.org Recipe, and that payload is where every field
 * comes from, because it is what the site itself states rather than what its
 * layout happens to draw. Three things live only in the markup around it: the
 * difficulty, the servings the page offers to rescale by, and the addresses of
 * the same recipe on the other sites of the network.
 */

import { parseFailure } from "../errors.js";
import { parseIsoDuration, parseYield } from "../recipe/duration.js";
import type {
  Recipe,
  RecipeNutrition,
  RecipeQuestion,
  RecipeStep,
  RecipeTranslation,
} from "../types.js";
import { textOf } from "./text.js";
import { absolute, recipeIdFrom, recipeNumberOf } from "./urls.js";

const LD_BLOCK = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
/** The wording the page prints the difficulty behind. */
const DIFFICULTY = /title="Difficult[^:"]*:\s*([^"]*)"/;
/** The servings the page offers to rescale by. */
const SERVINGS = /data-servings="(\d+)"/;
/** The same recipe elsewhere in the network that publishes it. */
const ALTERNATE = /<link[^>]*\brel="alternate"[^>]*>/g;
const HREFLANG = /\bhreflang="([^"]*)"/;
const HREF = /\bhref="([^"]*)"/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** A string the payload states, trimmed, or nothing when it states none. */
function ldText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** A number the payload states as a string or as a number, or nothing. */
function ldNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }
  const text = ldText(value);
  if (text === null) {
    return null;
  }
  const read = Number(text);
  return Number.isFinite(read) ? read : null;
}

/** The first image the payload names, whichever shape it names it in. */
function ldImage(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.length === 0 ? null : ldImage(value[0]);
  }
  if (isRecord(value)) {
    return ldText(value.url ?? value.contentUrl);
  }
  const url = ldText(value);
  return url === null ? null : absolute(url);
}

/**
 * The method, in whichever of the two shapes the site wrote it.
 *
 * A page carries either a list of steps, each with the photograph taken of it,
 * or one block of prose. The second is not a step, so an answer built from it
 * says as much rather than presenting a paragraph as step one of one.
 */
function readSteps(value: unknown): { steps: RecipeStep[]; oneBlock: boolean } {
  const prose = ldText(value);
  if (prose !== null) {
    return { steps: [{ text: prose, image_url: null }], oneBlock: true };
  }
  if (!Array.isArray(value)) {
    return { steps: [], oneBlock: false };
  }

  const steps: RecipeStep[] = [];
  for (const entry of value) {
    const text = isRecord(entry) ? ldText(entry.text) : ldText(entry);
    if (text === null) {
      continue;
    }
    steps.push({ text, image_url: isRecord(entry) ? ldImage(entry.image) : null });
  }
  return { steps, oneBlock: false };
}

/** The lines the payload lists, in the order it lists them. */
function readIngredients(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const lines: string[] = [];
  for (const entry of value) {
    const text = ldText(entry);
    if (text !== null) {
      lines.push(text);
    }
  }
  return lines;
}

/**
 * Nutrition, repeated with the units the site wrote it in.
 *
 * "718Kcal" and "59.4g" are strings the site published, and turning them into
 * numbers would make this server the one claiming the unit.
 */
function readNutrition(value: unknown): RecipeNutrition | null {
  if (!isRecord(value)) {
    return null;
  }
  const nutrition: RecipeNutrition = {
    serving_size: ldText(value.servingSize),
    calories: ldText(value.calories),
    carbohydrate: ldText(value.carbohydrateContent),
    fat: ldText(value.fatContent),
    saturated_fat: ldText(value.saturatedFatContent),
    protein: ldText(value.proteinContent),
    fibre: ldText(value.fiberContent),
    sugar: ldText(value.sugarContent),
    sodium: ldText(value.sodiumContent),
  };
  // A block whose every field is empty is one the site published nothing in,
  // and rendering it would offer a table of nulls as nutrition.
  return Object.values(nutrition).some((field) => field !== null) ? nutrition : null;
}

/** The cost the site estimates, with the currency it names it in. */
function readCost(value: unknown): string | null {
  if (!isRecord(value)) {
    return ldText(value);
  }
  const amount = ldText(value.value);
  if (amount === null) {
    return null;
  }
  const currency = ldText(value.currency);
  return currency === null ? amount : `${amount} ${currency}`;
}

/** The words the site files a recipe under, however it wrote the list. */
function readKeywords(value: unknown): string[] {
  const list = Array.isArray(value) ? value : ldText(value)?.split(",");
  if (list === undefined) {
    return [];
  }
  const words: string[] = [];
  for (const entry of list) {
    const word = ldText(entry);
    if (word !== null) {
      words.push(word);
    }
  }
  return words;
}

/** The questions the page answers beside the recipe. */
function readFaq(payload: unknown): RecipeQuestion[] {
  if (!isRecord(payload)) {
    return [];
  }
  const entries = payload.mainEntity;
  if (!Array.isArray(entries)) {
    return [];
  }

  const questions: RecipeQuestion[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }
    const question = ldText(entry.name);
    const accepted = entry.acceptedAnswer;
    const answer = isRecord(accepted) ? ldText(accepted.text) : null;
    if (question !== null && answer !== null) {
      questions.push({ question, answer });
    }
  }
  return questions;
}

/** The same recipe on the other sites of the network that publishes it. */
function readTranslations(html: string, self: string): RecipeTranslation[] {
  const here = recipeNumberOf(self);
  const found: RecipeTranslation[] = [];

  for (const link of html.matchAll(ALTERNATE)) {
    const tag = link[0];
    const language = textOf(HREFLANG.exec(tag)?.[1] ?? "");
    const href = HREF.exec(tag)?.[1];
    if (language === "" || href === undefined) {
      continue;
    }

    // Resolved rather than repeated: a counterpart written relative to the page
    // would otherwise be published as an address nobody can open.
    let url: string;
    try {
      url = new URL(href, self).toString();
    } catch {
      continue;
    }

    // The page names itself among them, and "x-default" names one of the others
    // a second time; neither is another language to offer. The page is
    // recognised by the number its address ends on rather than by the address
    // matching character for character, because the site rewrites the words of
    // an address around that number.
    if (
      language === "x-default" ||
      (here !== null && recipeNumberOf(url) === here) ||
      found.some((other) => other.language === language)
    ) {
      continue;
    }
    found.push({ language, url });
  }
  return found;
}

/** Every payload the page carries, read past the ones that will not parse. */
function payloadsIn(html: string): unknown[] {
  const payloads: unknown[] = [];
  for (const block of html.matchAll(LD_BLOCK)) {
    try {
      /* v8 ignore next 2 -- The pattern writes the group it reads, so a match
         always carries it; the fallback is what narrows the type. */
      payloads.push(JSON.parse(block[1] ?? ""));
    } catch {
      // A page carries several of these and only one is the recipe. One that
      // cannot be read says nothing about the others.
    }
  }
  return payloads;
}

/** The payload of a given type, or nothing when the page carries none. */
function payloadOfType(payloads: readonly unknown[], type: string): Record<string, unknown> | null {
  for (const payload of payloads) {
    if (isRecord(payload) && payload["@type"] === type) {
      return payload;
    }
  }
  return null;
}

/**
 * Read one recipe.
 *
 * A page served without the payload is a page this cannot read, which is a
 * different statement from a recipe the site does not hold: the first is
 * reported as a failure, and only the second is an absence.
 */
export function parseRecipePage(html: string, url: string): Recipe {
  const payloads = payloadsIn(html);
  const recipe = payloadOfType(payloads, "Recipe");
  if (recipe === null) {
    throw parseFailure("Ptitchef served a page carrying no recipe payload.", { url });
  }

  const rating = isRecord(recipe.aggregateRating) ? recipe.aggregateRating : {};
  const author = isRecord(recipe.author) ? recipe.author : {};
  const published = parseYield(recipe.recipeYield);
  const { steps, oneBlock } = readSteps(recipe.recipeInstructions);
  const id = recipeIdFrom(url);

  return {
    // A page reached by an address of the shape the site writes carries that
    // address as its identifier; anything else is named by the address itself.
    id: id ?? url,
    title: ldText(recipe.name) ?? "",
    url,
    description: ldText(recipe.description),
    image_url: ldImage(recipe.image),
    category: ldText(recipe.recipeCategory),
    cuisine: ldText(recipe.recipeCuisine),
    // Read through the same cleaner as every other piece of the page: an
    // attribute carries newlines and entities as readily as a body does.
    difficulty: textOf(DIFFICULTY.exec(html)?.[1] ?? "") || null,
    author: ldText(author.name),
    author_url: ldText(author.url),
    published: ldText(recipe.datePublished),
    modified: ldText(recipe.dateModified),
    rating: ldNumber(rating.ratingValue),
    rating_count: ldNumber(rating.ratingCount),
    review_count: ldNumber(rating.reviewCount),
    prep_minutes: parseIsoDuration(recipe.prepTime),
    cook_minutes: parseIsoDuration(recipe.cookTime),
    total_minutes: parseIsoDuration(recipe.totalTime),
    // The payload states the servings and the page offers the same number to
    // rescale by, so the second is read only where the first is silent.
    yield_count: published.count ?? readServings(html),
    yield_text: published.text === "" ? null : published.text,
    yield_unit: published.unit,
    ingredients: readIngredients(recipe.recipeIngredient),
    steps,
    steps_are_one_block: oneBlock,
    nutrition: readNutrition(recipe.nutrition),
    estimated_cost: readCost(recipe.estimatedCost),
    keywords: readKeywords(recipe.keywords),
    faq: readFaq(payloadOfType(payloads, "FAQPage")),
    translations: readTranslations(html, url),
  };
}

/** The servings the page offers to rescale by. */
function readServings(html: string): number | null {
  const found = SERVINGS.exec(html)?.[1];
  return found === undefined ? null : Number(found);
}
