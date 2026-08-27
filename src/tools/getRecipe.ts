/**
 * The tool that reads one recipe.
 *
 * Everything it returns is what the page states. A time the site gives nothing
 * for is null rather than added up from the steps, a nutrition figure is
 * repeated with the unit it was written in, and the cost the site estimates is
 * passed on with its currency rather than recomputed.
 *
 * Rescaling is the one place arithmetic happens, and it says of every line
 * whether the result is exact, moved to stay usable, or nothing that could be
 * multiplied at all.
 */

import { z } from "zod";
import { PtitchefError } from "../errors.js";
import type { PtitchefClient } from "../ptitchef/client.js";
import { formatMinutes } from "../recipe/duration.js";
import type { ScaledIngredient } from "../recipe/scale.js";
import { isApproximateMeasure, passthroughIngredients, scaleIngredients } from "../recipe/scale.js";
import type { Recipe } from "../types.js";
import { strictInput } from "./arguments.js";
import { ok, scaledIngredientSchema, SOURCE_NAME, type ToolResult } from "./shared.js";

export const getRecipeDescription =
  "Read one Ptitchef recipe: its ingredients, method, times, rating, nutrition and the cost the site " +
  "estimates for it. Pass the 'id' of a row from search_recipes, browse_recipes or " +
  "search_by_ingredients. Give 'servings' to rescale the ingredients, and read each line's 'scaling' " +
  "before quoting a quantity: 'scaled' is exact arithmetic, 'rounded' was moved to stay usable, and " +
  "'unscaled' carries nothing that could be multiplied. A time or a figure the site publishes none of " +
  "comes back null, never zero.";

export const getRecipeInput = {
  id: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("The 'id' of a row from a search or a listing, which is the recipe's own page path."),
  servings: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "Rescale the ingredients to this many servings. Left out, the ingredients come back as published.",
    ),
} as const;

export const getRecipeArgs = strictInput(getRecipeInput);
export type GetRecipeArgs = z.infer<typeof getRecipeArgs>;

const nutritionSchema = z.object({
  serving_size: z.string().nullable().describe("The serving the figures below describe."),
  calories: z.string().nullable(),
  carbohydrate: z.string().nullable(),
  fat: z.string().nullable(),
  saturated_fat: z.string().nullable(),
  protein: z.string().nullable(),
  fibre: z.string().nullable(),
  sugar: z.string().nullable(),
  sodium: z.string().nullable(),
});

export const getRecipeOutputShape = {
  id: z.string(),
  title: z.string(),
  url: z.string().describe("The public page. Show this when citing the recipe."),
  description: z.string().nullable(),
  image_url: z.string().nullable(),
  category: z.string().nullable(),
  cuisine: z.string().nullable(),
  difficulty: z.string().nullable().describe("The site's own wording, such as 'facile'."),
  author: z.string().nullable(),
  author_url: z.string().nullable(),
  published: z.string().nullable(),
  modified: z.string().nullable(),
  rating: z.number().nullable().describe("1 to 5, as the site states it."),
  rating_count: z.number().int().nullable(),
  review_count: z.number().int().nullable(),
  yield: z.object({
    original_count: z.number().nullable().describe("Servings the page states."),
    original_text: z.string().nullable().describe("The page's own wording for them."),
    requested: z.number().int().nullable().describe("Servings that were asked for."),
    unit: z.string().nullable(),
    factor: z.number().nullable().describe("What the ingredients were multiplied by."),
  }),
  ingredients: z.array(scaledIngredientSchema),
  steps: z.array(
    z.object({
      text: z.string(),
      image_url: z.string().nullable().describe("The photograph the site took of this step."),
    }),
  ),
  steps_are_one_block: z
    .boolean()
    .describe(
      "True when the site published its method as one block of prose, so the single step above is " +
        "that block rather than the first of several.",
    ),
  prep_minutes: z.number().int().nullable(),
  cook_minutes: z.number().int().nullable(),
  total_minutes: z.number().int().nullable(),
  nutrition: nutritionSchema.nullable().describe("As published, per the serving size it names."),
  estimated_cost: z
    .string()
    .nullable()
    .describe(
      "What the site estimates the ingredients cost, with the currency it names. Repeated as " +
        "published: it is the site's figure and readers of the site dispute it.",
    ),
  keywords: z.array(z.string()),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  translations: z.array(z.object({ language: z.string(), url: z.string() })),
  attribution: z.string(),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

/** The note a scaling that could not go lower leaves on an ingredient. */
const CLAMPED_UP = /clamped up/i;

const ONE_BLOCK_NOTE =
  "The site published this method as one block of prose rather than as numbered steps, so the single step above is that block.";

const NO_YIELD_NOTE =
  "The page states no number of servings, so the ingredients could not be rescaled and come back as published.";

const AS_PUBLISHED_NOTE =
  "No servings were asked for, so the ingredients are the lines as published and 'scaling' describes no arithmetic. Pass 'servings' to rescale them.";

const COST_NOTE =
  "The estimated cost is the site's own figure, repeated as published. Readers of the site dispute it as too low.";

/** What the ingredients were multiplied by, and why it may be nothing. */
interface Rescaling {
  factor: number | null;
  ingredients: ScaledIngredient[];
  notes: string[];
}

function rescale(recipe: Recipe, servings: number | undefined): Rescaling {
  if (servings === undefined) {
    return { factor: null, ingredients: passthroughIngredients(recipe.ingredients), notes: [] };
  }
  // Rescaling needs the number the page was written for, and inventing one
  // would multiply every quantity by a ratio nobody published.
  if (recipe.yield_count === null || recipe.yield_count <= 0) {
    return {
      factor: null,
      ingredients: passthroughIngredients(recipe.ingredients),
      notes: [NO_YIELD_NOTE],
    };
  }

  const factor = servings / recipe.yield_count;
  return { factor, ingredients: scaleIngredients(recipe.ingredients, { factor }), notes: [] };
}

/** What the arithmetic did, counted rather than characterised. */
function scalingNotes(ingredients: readonly ScaledIngredient[], factor: number | null): string[] {
  if (factor === null) {
    return [];
  }
  const notes: string[] = [];
  // Lines that were actually moved, rather than lines that merely belong to the
  // roundable category: at a factor of 100 every egg lands whole.
  const rounded = ingredients.filter(
    (entry) => entry.scaling === "rounded" && entry.adjusted,
  ).length;
  const unscaled = ingredients.filter((entry) => entry.scaling === "unscaled").length;
  const approximate = ingredients.filter(isApproximateMeasure).length;
  const clamped = ingredients.filter((entry) => CLAMPED_UP.test(entry.note ?? "")).length;

  if (rounded > 0) {
    notes.push(
      `${rounded} quantity(ies) were rounded to stay usable, rather than left as fractions.`,
    );
  }
  if (unscaled > 0) {
    notes.push(
      `${unscaled} line(s) carry no usable quantity and were returned unchanged; adjust to taste.`,
    );
  }
  if (approximate > 0) {
    notes.push(
      `${approximate} approximate measure(s) such as a pinch or a handful had their count multiplied; ` +
        "the size of one is yours to judge.",
    );
  }
  if (clamped > 0) {
    notes.push(
      `${clamped} quantity(ies) fell below the smallest amount worth measuring and were clamped up, ` +
        "so their proportions no longer match the original recipe.",
    );
  }
  return notes;
}

/**
 * One line per ingredient, then the method, all of it from the report.
 *
 * A line is flagged only where the flag says something: with no factor applied
 * every line is left as published, and marking each one would answer a question
 * that was never asked.
 */
function render(
  recipe: Recipe,
  ingredients: readonly ScaledIngredient[],
  factor: number | null,
): string {
  const times = [
    recipe.prep_minutes === null ? null : `prep ${formatMinutes(recipe.prep_minutes)}`,
    recipe.cook_minutes === null ? null : `cook ${formatMinutes(recipe.cook_minutes)}`,
    recipe.total_minutes === null ? null : `total ${formatMinutes(recipe.total_minutes)}`,
  ].filter((entry) => entry !== null);

  const heading = [
    recipe.category,
    recipe.difficulty,
    recipe.yield_text === null ? null : `${recipe.yield_text} servings`,
    times.length === 0 ? null : times.join(", "),
    recipe.estimated_cost === null ? null : `about ${recipe.estimated_cost}`,
  ].filter((entry) => entry !== null);

  return [
    `${recipe.title}${heading.length === 0 ? "" : ` — ${heading.join(" · ")}`}`,
    ...ingredients.map(
      (entry) =>
        `- ${entry.text}${factor !== null && entry.scaling === "unscaled" ? " (unscaled)" : ""}`,
    ),
    ...recipe.steps.map((step, index) => `${index + 1}. ${step.text}`),
  ].join("\n");
}

export async function runGetRecipe(
  client: PtitchefClient,
  args: GetRecipeArgs,
): Promise<ToolResult> {
  const parsed = getRecipeArgs.safeParse(args);
  if (!parsed.success) {
    throw new PtitchefError(
      "invalid_input",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const read = await client.getRecipe(parsed.data.id);
  const recipe = read.data;
  const { factor, ingredients, notes: yieldNotes } = rescale(recipe, parsed.data.servings);

  const notes = [
    ...(factor === null && yieldNotes.length === 0 ? [AS_PUBLISHED_NOTE] : []),
    ...yieldNotes,
    ...scalingNotes(ingredients, factor),
    ...(recipe.steps_are_one_block ? [ONE_BLOCK_NOTE] : []),
    ...(recipe.estimated_cost === null ? [] : [COST_NOTE]),
  ];

  return ok(
    {
      id: recipe.id,
      title: recipe.title,
      url: recipe.url,
      description: recipe.description,
      image_url: recipe.image_url,
      category: recipe.category,
      cuisine: recipe.cuisine,
      difficulty: recipe.difficulty,
      author: recipe.author,
      author_url: recipe.author_url,
      published: recipe.published,
      modified: recipe.modified,
      rating: recipe.rating,
      rating_count: recipe.rating_count,
      review_count: recipe.review_count,
      yield: {
        original_count: recipe.yield_count,
        original_text: recipe.yield_text,
        requested: parsed.data.servings ?? null,
        // The site states a bare number and offers it as a number of parts,
        // which is the only wording it gives them.
        unit: recipe.yield_count === null ? null : "parts",
        factor: factor === null ? null : Number(factor.toPrecision(3)),
      },
      ingredients,
      steps: recipe.steps,
      steps_are_one_block: recipe.steps_are_one_block,
      prep_minutes: recipe.prep_minutes,
      cook_minutes: recipe.cook_minutes,
      total_minutes: recipe.total_minutes,
      nutrition: recipe.nutrition,
      estimated_cost: recipe.estimated_cost,
      keywords: recipe.keywords,
      faq: recipe.faq,
      translations: recipe.translations,
      attribution: `${SOURCE_NAME} — ${recipe.url}`,
      source: SOURCE_NAME,
      notes,
    },
    render(recipe, ingredients, factor),
    { notes },
  );
}
