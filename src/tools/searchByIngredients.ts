/**
 * The tool that answers "what can I make with what I have".
 *
 * The site keeps a search of its own for this, with five boxes to fill, and it
 * returns recipes holding the ingredients that were named. It serves them on a
 * single page while counting every one it found, so an answer states both and
 * says that the remainder cannot be read.
 */

import { z } from "zod";
import { PtitchefError } from "../errors.js";
import type { PtitchefClient } from "../ptitchef/client.js";
import { MAX_FRIDGE_INGREDIENTS } from "../ptitchef/urls.js";
import { refusalMessage, strictInput } from "./arguments.js";
import {
  DEFAULT_LIMIT,
  limitRows,
  listingOutputShape,
  listingResult,
  MAX_LIMIT,
  notesFor,
} from "./listings.js";
import type { ToolResult } from "./shared.js";

export const searchByIngredientsDescription =
  "Find Ptitchef recipes from ingredients you already have. Give one to " +
  `${MAX_FRIDGE_INGREDIENTS} ingredients in French, as a cook would name them ("poulet", "citron"). ` +
  "The site counts every recipe it finds and serves one page of them, so 'total_available' can be " +
  "far larger than the rows returned, and the rest cannot be reached. A longer list than the site's " +
  "own form reads is refused rather than sent and silently cut.";

export const searchByIngredientsInput = {
  ingredients: z
    .array(z.string().trim().min(1).max(60))
    .min(1)
    .max(MAX_FRIDGE_INGREDIENTS)
    .describe(
      `One to ${MAX_FRIDGE_INGREDIENTS} ingredients, in French. The site reads no more than that.`,
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Rows to render, ${DEFAULT_LIMIT} by default.`),
} as const;

export const searchByIngredientsArgs = strictInput(searchByIngredientsInput);
export const searchByIngredientsOutputShape = listingOutputShape;
export type SearchByIngredientsArgs = z.infer<typeof searchByIngredientsArgs>;

export async function runSearchByIngredients(
  client: PtitchefClient,
  args: SearchByIngredientsArgs,
): Promise<ToolResult> {
  const parsed = searchByIngredientsArgs.safeParse(args);
  if (!parsed.success) {
    throw new PtitchefError("invalid_input", refusalMessage(parsed.error.issues));
  }

  const read = await client.searchByIngredients(parsed.data.ingredients);
  const { rendered, note } = limitRows(read.data, parsed.data.limit ?? DEFAULT_LIMIT);
  const notes = notesFor(read.data, {
    ...(read.skipped ? { skipped: read.skipped } : {}),
    extra: note,
  });

  return listingResult(read.data, rendered, notes);
}
