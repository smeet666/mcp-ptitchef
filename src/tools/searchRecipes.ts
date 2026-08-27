/**
 * The tool that searches recipes.
 *
 * The site reads a search and answers it in one of two ways. When it holds a
 * category page for what was typed, it sends the reader there, and that page's
 * total counts what the category holds. When it holds none, it answers on its
 * own terms, on a single page whose total is the number of rows it served.
 *
 * The two totals count different things, so which one came back is reported
 * rather than left for a caller to infer from its size.
 */

import { z } from "zod";
import { PtitchefError } from "../errors.js";
import type { PtitchefClient } from "../ptitchef/client.js";
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

export const searchRecipesDescription =
  "Search recipes on Ptitchef by dish or ingredient. The site answers in one of two ways and the " +
  "answer says which: it either sends the search to a category page of its own, whose total counts " +
  "what that category holds, or it answers on its own terms on a single page whose total is the " +
  "number of rows served. When a category answered, 'topic_slug' names it and browse_recipes reads " +
  "its further pages. Some topics come back as a guide the site wrote instead, grouped under headings " +
  "of its own and carrying no total; browse_recipes on the same 'topic_slug' reads their full listing. A search the site matched nothing for comes back with no row and a total of " +
  "zero, which is an absence the site stated.";

export const searchRecipesInput = {
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("A dish or an ingredient, in French, as a reader of the site would type it."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(
      `Rows to render, ${DEFAULT_LIMIT} by default. 'rows_seen' states what the page served.`,
    ),
} as const;

export const searchRecipesArgs = strictInput(searchRecipesInput);
export const searchRecipesOutputShape = listingOutputShape;
export type SearchRecipesArgs = z.infer<typeof searchRecipesArgs>;

export async function runSearchRecipes(
  client: PtitchefClient,
  args: SearchRecipesArgs,
): Promise<ToolResult> {
  const parsed = searchRecipesArgs.safeParse(args);
  if (!parsed.success) {
    throw new PtitchefError("invalid_input", refusalMessage(parsed.error.issues));
  }

  const read = await client.searchRecipes(parsed.data.query);
  const { rendered, note } = limitRows(read.data, parsed.data.limit ?? DEFAULT_LIMIT);
  const notes = notesFor(read.data, {
    ...(read.skipped ? { skipped: read.skipped } : {}),
    extra: note,
  });

  return listingResult(read.data, rendered, notes);
}
