/**
 * The tool that reads a listing without a search.
 *
 * It answers the question a search cannot: everything under one category, page
 * by page, or one of the lists the site keeps standing. It is also how a search
 * that landed on a category page is read past its first page.
 *
 * The site answers a page past the last one with the first page, so the page
 * this reports is the one the site served rather than the one that was asked
 * for. A caller told otherwise would walk the same rows for ever.
 */

import { z } from "zod";
import { PtitchefError } from "../errors.js";
import type { PtitchefClient } from "../ptitchef/client.js";
import { STANDING_NAMES } from "../ptitchef/urls.js";
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

export const browseRecipesDescription =
  "Read the recipes under one category of Ptitchef, page by page, or one of the lists the site " +
  "keeps standing. Pass 'category' with a slug from list_categories or from a search's 'topic_slug', " +
  "or pass 'listing' for one of: " +
  `${STANDING_NAMES.join(", ")}. ` +
  "Never build a category slug by hand: the site writes them freely and answers an address it does " +
  "not hold by serving another page. The page in the answer is the one the site served, which is the " +
  "first page again when the page asked for is past the last one.";

export const browseRecipesInput = {
  category: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe(
      "A category slug: one from list_categories whose 'is_family' is false, or the 'topic_slug' a " +
        "search answered with. A family's slug belongs to list_categories instead.",
    ),
  listing: z
    .enum(["latest", "top_rated", "most_viewed"])
    .optional()
    .describe("One of the site's standing lists, read instead of a category."),
  page: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("The page of a category to read. A standing list has one page only."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Rows to render, ${DEFAULT_LIMIT} by default.`),
} as const;

export const browseRecipesArgs = strictInput(browseRecipesInput);
export const browseRecipesOutputShape = listingOutputShape;
export type BrowseRecipesArgs = z.infer<typeof browseRecipesArgs>;

export async function runBrowseRecipes(
  client: PtitchefClient,
  args: BrowseRecipesArgs,
): Promise<ToolResult> {
  const parsed = browseRecipesArgs.safeParse(args);
  if (!parsed.success) {
    throw new PtitchefError("invalid_input", refusalMessage(parsed.error.issues));
  }

  const { category, listing, page, limit } = parsed.data;
  // One of the two, and only one: a call naming both asks two questions, and
  // answering the first would quietly drop the second.
  if ((category === undefined) === (listing === undefined)) {
    throw new PtitchefError(
      "invalid_input",
      category === undefined
        ? "Name either 'category' or 'listing'."
        : "Name either 'category' or 'listing'. Naming both asks two questions, and answering the first would drop the second.",
    );
  }

  const read = await client.browseRecipes({
    ...(category === undefined ? {} : { category }),
    ...(listing === undefined ? {} : { listing }),
    ...(page === undefined ? {} : { page }),
  });
  const { rendered, note } = limitRows(read.data, limit ?? DEFAULT_LIMIT);
  const notes = notesFor(read.data, {
    ...(page === undefined ? {} : { askedPage: page }),
    ...(category === undefined ? {} : { askedSlug: category.trim() }),
    maxLimit: MAX_LIMIT,
    ...(read.skipped ? { skipped: read.skipped } : {}),
    extra: note,
  });

  return listingResult(read.data, rendered, notes);
}
