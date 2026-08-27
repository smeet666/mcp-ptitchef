/**
 * scale_ingredients: rescale an arbitrary ingredient list, offline.
 *
 * This tool makes no network request. It exposes the quantity parser on its own,
 * so a list copied from any source can be rescaled with the same care about
 * which quantities a factor may touch.
 */

import { z } from "zod";
import { invalidInput } from "../errors.js";
import { isApproximateMeasure, scaleIngredients } from "../recipe/scale.js";
import { strictInput } from "./arguments.js";
import { ok, scaledIngredientSchema, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

/** The note a scaling that could not go lower leaves on an ingredient. */
const CLAMPED_UP = /clamped up/i;

export const scaleIngredientsDescription = [
  "Rescale a list of ingredient lines to a different number of servings, without contacting any website.",
  "Give either 'factor' directly, or 'from_servings' and 'to_servings' and the factor is computed.",
  "Works on any French ingredient list, whatever its source, so it also serves a recipe pasted in by hand.",
  "Quantities in grams or millilitres are multiplied and rounded to readable values; a countable thing lands on",
  "a half when half of one can be poured, weighed or cut, as a boîte, a sachet, a feuille de gélatine or a",
  "cuillère can, and on a whole one when it cannot, as an oeuf, a jaune or a blanc; approximate measures such",
  "as a pinch or a handful have",
  "their count multiplied in whole units and stay in their own vocabulary. A line writing an article where a",
  "digit would go, as in 'un bouchon de rhum' or 'une pincée de sel', is read as one of that measure. Lines",
  "carrying no quantity are returned untouched and flagged. Prefer this over doing the arithmetic yourself.",
].join(" ");

export const scaleIngredientsInput = strictInput({
  ingredients: z
    .array(z.string().max(300))
    .min(1)
    .max(100)
    .describe("Ingredient lines, for example ['200 g de farine', '3 oeufs', 'sel']."),
  factor: z
    .number()
    .positive()
    .max(100)
    .optional()
    .describe("Multiplier to apply. Use this or the from/to pair."),
  from_servings: z
    .number()
    .positive()
    .max(500)
    .optional()
    .describe("How many servings the list is written for."),
  to_servings: z.number().positive().max(500).optional().describe("How many servings are wanted."),
});

export const scaleIngredientsOutputShape = {
  factor: z.number(),
  ingredients: z.array(scaledIngredientSchema),
  scaled_count: z.number().int(),
  rounded_count: z
    .number()
    .int()
    .describe(
      "Lines whose value rounding moved away from the exact product, not lines that could have been rounded.",
    ),
  unscaled_count: z.number().int(),
  notes: z.array(z.string()),
};

export interface ScaleIngredientsArgs {
  ingredients: string[];
  factor?: number;
  from_servings?: number;
  to_servings?: number;
}

/**
 * Print a factor without rounding it out of existence.
 *
 * Two decimals turn 0.001 into "0", which states that nothing was applied while
 * every quantity in the list was divided by a thousand.
 */
function formatFactor(factor: number): string {
  return String(Number(factor.toPrecision(3)));
}

export function runScaleIngredients(args: ScaleIngredientsArgs): ToolResult {
  try {
    let factor: number;
    const notes: string[] = [];

    if (args.factor !== undefined) {
      // Applying one and ignoring the other would answer a question the caller
      // did not ask, on a call that states two.
      if (args.from_servings !== undefined || args.to_servings !== undefined) {
        throw invalidInput(
          "'factor' was given alongside 'from_servings' or 'to_servings', which state the factor twice.",
          "Send one of the two: 'factor' on its own, or the pair on its own.",
        );
      }
      factor = args.factor;
    } else if (args.from_servings !== undefined && args.to_servings !== undefined) {
      factor = args.to_servings / args.from_servings;
    } else {
      throw invalidInput(
        "Provide either 'factor', or both 'from_servings' and 'to_servings'.",
        "For example from_servings=6 and to_servings=4, or factor=0.667.",
      );
    }

    const ingredients = scaleIngredients(args.ingredients, { factor });
    const counts = {
      scaled: ingredients.filter((entry) => entry.scaling === "scaled").length,
      // Lines that were actually moved, rather than lines that merely belong to
      // the roundable category: at a factor of 100 every egg lands whole.
      rounded: ingredients.filter((entry) => entry.scaling === "rounded" && entry.adjusted).length,
      unscaled: ingredients.filter((entry) => entry.scaling === "unscaled").length,
      clamped: ingredients.filter((entry) => CLAMPED_UP.test(entry.note ?? "")).length,
      approximate: ingredients.filter(isApproximateMeasure).length,
    };

    if (counts.rounded > 0) {
      notes.push(
        `${counts.rounded} quantity(ies) were rounded to stay usable, rather than left as fractions.`,
      );
    }
    if (counts.unscaled > 0) {
      notes.push(
        `${counts.unscaled} line(s) carry no usable quantity and were returned unchanged; adjust to taste.`,
      );
    }
    if (counts.approximate > 0) {
      notes.push(
        `${counts.approximate} approximate measure(s) such as a pinch or a handful had their count ` +
          "multiplied; the size of one is yours to judge.",
      );
    }
    if (counts.clamped > 0) {
      notes.push(
        `${counts.clamped} quantity(ies) fell below the smallest amount worth measuring and were clamped up, ` +
          "so their proportions no longer match the original recipe.",
      );
    }

    const structured = {
      factor: Number(factor.toPrecision(3)),
      ingredients,
      scaled_count: counts.scaled,
      rounded_count: counts.rounded,
      unscaled_count: counts.unscaled,
      notes,
    };

    const lines = ingredients
      .map((entry) => {
        const flag = entry.scaling === "unscaled" ? " (unscaled)" : "";
        return `- ${entry.text}${flag}`;
      })
      .join("\n");

    return ok(structured, `Factor ${formatFactor(factor)}:\n${lines}`, { notes });
  } catch (error) {
    return toToolError(error);
  }
}
