/**
 * The tool that finds the same recipe in the other languages it was published
 * in.
 *
 * Ptitchef is the French edition of a network of sites that publish the same
 * recipes, and each page names its counterparts. Those names are the site's own
 * claim that the two pages hold the same recipe, so they are passed on as
 * published rather than matched by title.
 */

import { z } from "zod";
import { PtitchefError } from "../errors.js";
import type { PtitchefClient } from "../ptitchef/client.js";
import { strictInput } from "./arguments.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const getRecipeTranslationsDescription =
  "List the other languages a Ptitchef recipe was published in, with the page of each. Pass the 'id' " +
  "of a row from a search or a listing. The pairing is the site's own: each page names its " +
  "counterparts, and this repeats those names rather than matching titles. A recipe the site names no " +
  "counterpart for comes back with an empty list, which is what it published.";

export const getRecipeTranslationsInput = {
  id: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("The 'id' of a row from a search or a listing, which is the recipe's own page path."),
} as const;

export const getRecipeTranslationsArgs = strictInput(getRecipeTranslationsInput);
export type GetRecipeTranslationsArgs = z.infer<typeof getRecipeTranslationsArgs>;

export const getRecipeTranslationsOutputShape = {
  id: z.string(),
  title: z.string(),
  url: z.string().describe("The French page these counterparts were read from."),
  translations: z.array(
    z.object({
      language: z.string().describe("The language tag the site publishes, such as 'es' or 'pt'."),
      url: z.string(),
    }),
  ),
  translation_count: z.number().int(),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

const PAIRING_NOTE =
  "The pairing is the site's own: each page names its counterparts, and these are those names rather than a match made here.";

const NONE_NOTE =
  "This recipe names no counterpart, which is what the site published rather than a failure to read it.";

export async function runGetRecipeTranslations(
  client: PtitchefClient,
  args: GetRecipeTranslationsArgs,
): Promise<ToolResult> {
  const parsed = getRecipeTranslationsArgs.safeParse(args);
  if (!parsed.success) {
    throw new PtitchefError(
      "invalid_input",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const read = await client.getRecipe(parsed.data.id);
  const recipe = read.data;
  const notes = recipe.translations.length === 0 ? [NONE_NOTE] : [PAIRING_NOTE];

  const body =
    recipe.translations.length === 0
      ? `Ptitchef names no other language for "${recipe.title}".`
      : [
          `"${recipe.title}" is also published in:`,
          ...recipe.translations.map((one) => `${one.language}: ${one.url}`),
        ].join("\n");

  return ok(
    {
      id: recipe.id,
      title: recipe.title,
      url: recipe.url,
      translations: recipe.translations,
      // Counted here, so the field always states the length of the list beside it.
      translation_count: recipe.translations.length,
      source: SOURCE_NAME,
      notes,
    },
    body,
    { notes },
  );
}
