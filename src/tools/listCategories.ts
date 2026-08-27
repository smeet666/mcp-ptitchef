/**
 * The tool that publishes the category tree the site browses by.
 *
 * It exists because no slug on this site can be guessed. The same kind of thing
 * is written three different ways from one line to the next, so an address
 * built by hand lands on a page the site does not hold, and a caller reads that
 * as the site holding no such recipes. Publishing the tree is what makes the
 * question askable.
 */

import { z } from "zod";
import { PtitchefError } from "../errors.js";
import type { PtitchefClient } from "../ptitchef/client.js";
import type { Category, CategoryReport } from "../types.js";
import { refusalMessage, strictInput } from "./arguments.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const listCategoriesDescription =
  "List the categories Ptitchef browses its recipes by. Called without arguments it returns the " +
  "families of ingredients; pass a family's slug as 'family' to list the categories it holds. Read " +
  "this before building an address by hand: the site writes its slugs freely, so the same vegetable " +
  "appears as 'chou-kale' on one line and as 'recette-de-petits-pois' on the next, and a slug that " +
  "was guessed lands on a page the site does not hold. Each entry carries the slug to pass back and " +
  "the page to open.";

/** How many entries an answer renders when the caller names no number. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const listCategoriesInput = {
  family: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe(
      "The slug of a family to open, taken from a previous call. Leave it out to read the families " +
        "themselves, which is where the tree starts.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(
      `Entries to render, ${DEFAULT_LIMIT} by default. A level holding more than this says so, and ` +
        "'categories_published' always states what the page listed.",
    ),
} as const;

/** The declaration the SDK publishes, so an undeclared argument is refused there too. */
export const listCategoriesArgs = strictInput(listCategoriesInput);

const categoryLinkSchema = z.object({
  slug: z
    .string()
    .describe("Pass this back as 'family', or use it to browse the recipes under it."),
  title: z.string().describe("The site's own wording for it."),
  url: z.string().describe("The public page. Show this when citing the category."),
});

const categorySchema = categoryLinkSchema.extend({
  description: z
    .string()
    .nullable()
    .describe("The site's own blurb. Null when the page carries none for this entry."),
  sample_children: z
    .array(categoryLinkSchema)
    .describe(
      "Entries the site shows beside this one. It is an excerpt the site marks as such, so it " +
        "states nothing about how many the entry holds.",
    ),
  is_family: z
    .boolean()
    .describe("True when this entry opens onto further categories rather than onto recipes."),
});

export const listCategoriesOutputShape = {
  family: z.string().nullable().describe("The family that was opened, or null for the root."),
  family_title: z
    .string()
    .nullable()
    .describe("The site's own heading for this level. Null when the page carries none."),
  categories: z.array(categorySchema),
  category_count: z.number().int().describe("Entries rendered here."),
  categories_published: z
    .number()
    .int()
    .describe("Entries the page listed, before any were rendered."),
  url: z.string().describe("The page these categories were read from."),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

export type ListCategoriesArgs = z.infer<typeof listCategoriesArgs>;

const SAMPLE_NOTE =
  "The entries shown beside a family are an excerpt the site prints followed by an ellipsis, so their number says nothing about what the family holds.";

const OPEN_NOTE =
  "Pass a slug back as 'family' to list what it holds, and use an entry's page to reach its recipes.";

const LEAF_NOTE =
  "No entry here opens onto further categories. Pass a slug to browse_recipes to read the recipes under it; passing it as 'family' comes back as an absence.";

const EMPTY_NOTE =
  "The site publishes this level and lists nothing under it, which is what it answered rather than a failure to read it.";

interface Rendering {
  rendered: Category[];
  notes: string[];
}

/**
 * Cut the list to what was asked for, and say what the cut left out.
 *
 * A cap that says nothing reads as a complete listing, which is the same fault
 * as an excerpt rendered as a whole.
 */
function limitTo(report: CategoryReport, limit: number, skipped: string[]): Rendering {
  const rendered = report.categories.slice(0, limit);
  const notes: string[] = [];

  if (rendered.length < report.categories.length) {
    notes.push(
      `${rendered.length} of the ${report.categories.length} entries this page lists are rendered here. Raise 'limit' for the rest.`,
    );
  }
  if (rendered.some((entry) => entry.sample_children.length > 0)) {
    notes.push(SAMPLE_NOTE);
  }
  if (skipped.length > 0) {
    notes.push(
      `${skipped.length} ${skipped.length === 1 ? "entry was" : "entries were"} set aside: ${skipped.join("; ")}.`,
    );
  }
  if (rendered.length === 0) {
    notes.push(EMPTY_NOTE);
  } else if (rendered.some((entry) => entry.is_family)) {
    notes.push(OPEN_NOTE);
  } else {
    // Telling a caller to open one of these would send them to an absence: the
    // tool answers a family, and none of these is one.
    notes.push(LEAF_NOTE);
  }

  return { rendered, notes };
}

/**
 * One line per entry. Every word of it comes from the report, so a reader of
 * the text block learns nothing the structured payload does not also carry.
 */
function renderEntry(entry: Category): string {
  const opens = entry.is_family ? " (a family)" : "";
  const beside =
    entry.sample_children.length === 0
      ? ""
      : ` — among them: ${entry.sample_children.map((child) => child.title).join(", ")}`;
  return `${entry.slug}: ${entry.title}${opens}${beside}`;
}

function renderReport(report: CategoryReport, rendered: Category[]): string {
  const level =
    report.family === null ? "the families of the tree" : `the family "${report.family}"`;

  if (rendered.length === 0) {
    return `Ptitchef lists no categories under ${level}.`;
  }
  const heading =
    report.family_title === null ? "" : ` The page is headed "${report.family_title}".`;
  return [`Categories under ${level}.${heading}`, ...rendered.map(renderEntry)].join("\n");
}

export async function runListCategories(
  client: PtitchefClient,
  args: ListCategoriesArgs,
): Promise<ToolResult> {
  const parsed = listCategoriesArgs.safeParse(args);
  if (!parsed.success) {
    // Raised rather than rendered: the wiring above turns any failure into the
    // one error shape, so a refusal reads the same whichever layer produced it.
    // Every grievance, rather than the first: a call refused on two arguments
    // that names one sends a caller back for a second refusal.
    throw new PtitchefError("invalid_input", refusalMessage(parsed.error.issues));
  }

  const family = parsed.data.family ?? null;
  const read = await client.listCategories(family);
  const report = read.data;
  const { rendered, notes } = limitTo(
    report,
    parsed.data.limit ?? DEFAULT_LIMIT,
    read.skipped ?? [],
  );

  return ok(
    {
      family: report.family,
      family_title: report.family_title,
      categories: rendered,
      // Counted here rather than repeated, so each field states the length of
      // the list it describes: one what this answer holds, the other what the
      // page listed.
      category_count: rendered.length,
      categories_published: report.categories.length,
      url: report.url,
      source: SOURCE_NAME,
      notes,
    },
    renderReport(report, rendered),
    { notes },
  );
}
