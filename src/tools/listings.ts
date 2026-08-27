/**
 * What the three listing tools share: the shape they publish and how they
 * render it.
 *
 * The three ask the site different questions and get one kind of answer back,
 * so a caller reading a row from a search compares it with a row from the
 * fridge without translating anything. What differs between them is what their
 * total counts, and that is said in each answer rather than left to the reader.
 */

import { z } from "zod";
import { LISTING_KINDS, type ListingReport, type RecipeRow } from "../types.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

const recipeRowSchema = z.object({
  id: z.string().describe("Pass this back to read the recipe."),
  title: z.string(),
  url: z.string().describe("The public page. Show this when citing the recipe."),
  image_url: z.string().nullable(),
  rating: z
    .number()
    .nullable()
    .describe(
      "1 to 5, as the site states it. The page also draws it rounded to a whole star, and the two " +
        "disagree by design; this is the figure the site computed. Null when it states none.",
    ),
  rating_count: z.number().int().nullable(),
  review_count: z.number().int().nullable(),
  category: z.string().nullable().describe("The site's own wording, such as 'Plat'."),
  difficulty: z.string().nullable().describe("The site's own wording, such as 'facile'."),
  total_minutes: z
    .number()
    .int()
    .nullable()
    .describe("Minutes the row states for the whole recipe."),
  calories: z.number().nullable().describe("Calories per serving, as the row states them."),
  ingredients_preview: z.string().nullable().describe("The opening of the ingredient list."),
});

export const listingOutputShape = {
  asked: z.string().describe("What was asked for: a search, a category, or a list of ingredients."),
  kind: z
    // Read from the one list that declares them, so a kind added to the server
    // cannot be refused by the schema that publishes it.
    .enum(LISTING_KINDS)
    .describe(
      "How the listing came to be, which decides what its total counts. 'topic' means the site " +
        "answered a search from a page of its own; 'free_text' means it answered on its own terms.",
    ),
  topic_slug: z
    .string()
    .nullable()
    .describe(
      "The category page this listing was served from. Pass it to browse_recipes to read further " +
        "pages of it.",
    ),
  title: z.string().nullable().describe("The site's own heading for the listing."),
  results: z.array(recipeRowSchema),
  result_count: z.number().int().describe("Rows rendered here."),
  rows_seen: z
    .number()
    .int()
    .describe("Rows the site served on this page, before any were set aside."),
  total_available: z
    .number()
    .int()
    .nullable()
    .describe("Recipes the site says this listing holds. Null when it published no figure."),
  page: z.number().int().describe("The page that was read, which is the one the site served."),
  single_page: z
    .boolean()
    .describe("True when the site serves this listing on one page and offers no further one."),
  url: z.string().describe("The address the listing was read from."),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

/** What each kind of listing counts, said rather than left to the reader. */
const TOTAL_MEANS: Readonly<Record<ListingReport["kind"], string>> = {
  topic:
    "The site answered this search from a category page of its own, so the total counts what that category holds rather than what matched the words that were typed.",
  free_text:
    "The site answered this search on its own terms, on one page, and the total is the number of rows it served.",
  category: "The total counts what this category holds across all its pages.",
  guide:
    "The site answered with a guide it wrote for this topic: recipes grouped under headings of its own, with no total and no further page. Its rows carry a name and an address and nothing else. Pass 'topic_slug' to browse_recipes for the full listing of the topic, which states how many recipes it holds.",
  standing:
    "This is one of the site's own standing lists, so the total is the length of that list rather than a count of its catalogue.",
  fridge:
    "The total counts every recipe the site found from these ingredients, and it serves one page of them.",
};

const CUT_OFF =
  "The site serves this listing on one page, so the rows beyond it are counted in the total and cannot be read.";

export interface ListingNotes {
  /** The page a caller asked for, when it differs from the one that was served. */
  askedPage?: number;
  /** Rows the page held that could not be rendered. */
  skipped?: string[];
  /** Anything else this particular tool has to say. */
  extra?: string[];
}

export function notesFor(report: ListingReport, options: ListingNotes = {}): string[] {
  const notes = [TOTAL_MEANS[report.kind]];

  if (report.topic_slug !== null && report.kind === "topic") {
    notes.push(
      `Pass topic_slug "${report.topic_slug}" to browse_recipes to read further pages of it.`,
    );
  }
  // Only when rows were left behind: a listing served whole on one page has
  // nothing beyond it, and saying otherwise would invent a remainder.
  if (
    report.single_page &&
    report.total_available !== null &&
    report.total_available > report.rows_seen
  ) {
    notes.push(CUT_OFF);
  }
  if (options.askedPage !== undefined && options.askedPage !== report.page) {
    notes.push(
      `Page ${options.askedPage} was asked for and the site answered with page ${report.page}, which is what it does past the last page.`,
    );
  }
  const skipped = options.skipped ?? [];
  if (skipped.length > 0) {
    notes.push(
      `${skipped.length} ${skipped.length === 1 ? "row was" : "rows were"} set aside: ${skipped.join("; ")}.`,
    );
  }
  return [...notes, ...(options.extra ?? [])];
}

/** One line per row. Every word of it comes from the report. */
function renderRow(row: RecipeRow): string {
  const stated = [row.category, row.difficulty].filter((value) => value !== null);
  if (row.total_minutes !== null) {
    stated.push(`${row.total_minutes} min`);
  }
  if (row.rating !== null) {
    stated.push(`${row.rating}/5${row.rating_count === null ? "" : ` (${row.rating_count})`}`);
  }
  const detail = stated.length > 0 ? ` — ${stated.join(", ")}` : "";
  return `${row.title}${detail}\n  ${row.id}`;
}

export function renderListing(report: ListingReport, rendered: RecipeRow[]): string {
  const held =
    report.total_available === null
      ? ""
      : ` The site says this listing holds ${report.total_available}.`;

  if (rendered.length === 0) {
    return `Ptitchef lists no recipe for "${report.asked}".${held}`;
  }
  const heading = report.title ?? report.asked;
  return [`${heading}, page ${report.page}.${held}`, ...rendered.map(renderRow)].join("\n");
}

/** The answer the three tools return, built once so their shapes cannot drift. */
export function listingResult(
  report: ListingReport,
  rendered: RecipeRow[],
  notes: string[],
): ToolResult {
  return ok(
    {
      asked: report.asked,
      kind: report.kind,
      topic_slug: report.topic_slug,
      title: report.title,
      results: rendered,
      // Counted here rather than repeated, so the field always states the
      // length of the list it sits beside.
      result_count: rendered.length,
      rows_seen: report.rows_seen,
      total_available: report.total_available,
      page: report.page,
      single_page: report.single_page,
      url: report.url,
      source: SOURCE_NAME,
      notes,
    },
    renderListing(report, rendered),
    { notes },
  );
}

/**
 * Cut the rows to what was asked for, and say what the cut left out.
 *
 * A cap that says nothing reads as the whole of what the page served.
 */
export function limitRows(
  report: ListingReport,
  limit: number,
): { rendered: RecipeRow[]; note: string[] } {
  const rendered = report.results.slice(0, limit);
  return rendered.length < report.results.length
    ? {
        rendered,
        note: [
          `${rendered.length} of the ${report.results.length} rows this page served are rendered here. Raise 'limit' for the rest.`,
        ],
      }
    : { rendered, note: [] };
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
