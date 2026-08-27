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
  rating_count: z
    .number()
    .int()
    .nullable()
    .describe("How many readers rated it. Null when the site published no figure."),
  review_count: z
    .number()
    .int()
    .nullable()
    .describe(
      "How many readers wrote a review. It counts a different thing from 'rating_count', and the " +
        "two are never added: a reader who wrote is a reader who rated. Null when the site " +
        "published no figure.",
    ),
  category: z.string().nullable().describe("The site's own wording, such as 'Plat'."),
  difficulty: z.string().nullable().describe("The site's own wording, such as 'facile'."),
  total_minutes: z
    .number()
    .int()
    .nullable()
    .describe("Minutes the row states for the whole recipe."),
  calories: z
    .string()
    .nullable()
    .describe(
      "The calorie figure as the row prints it, with its unit and the serving it names, such as " +
        "'295 kcal / 1 part'. Rows of one listing can name different servings, so two figures are " +
        "comparable only where the serving they name is the same.",
    ),
  ingredients_preview: z.string().nullable().describe("The opening of the ingredient list."),
});

export const listingOutputShape = {
  asked: z
    .string()
    .describe(
      "What was asked for: a search, a category, or a list of ingredients. 'query' carries the same " +
        "value under the name every source of recipes publishes it in.",
    ),
  query: z.string().describe("What was asked for, under the name a search publishes it in."),
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
      "The category page this listing was served from. Pass it to browse_recipes as 'category' to " +
        "read the topic's further pages, and its total where this answer carries none.",
    ),
  title: z.string().nullable().describe("The site's own heading for the listing."),
  results: z.array(recipeRowSchema),
  result_count: z.number().int().describe("Rows rendered here."),
  rows_seen: z
    .number()
    .int()
    .describe("Rows the site served on this page, before any were set aside."),
  folded: z
    .number()
    .int()
    .describe(
      "Rows naming a recipe already held. A guide lists one recipe under two headings where it " +
        "belongs to both; such a row is counted in 'rows_seen' and rendered once.",
    ),
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
  source: z.string().describe("The site this answer was read from. Credit it when showing a row."),
  notes: z
    .array(z.string())
    .describe(
      "What qualifies this answer: what its total counts, what it left out, and where the site " +
        "answered from an address other than the one asked for. Read these before quoting a figure.",
    ),
} as const;

/** What each kind of listing counts, said rather than left to the reader. */
const TOTAL_MEANS: Readonly<Record<ListingReport["kind"], string>> = {
  topic:
    "The site answered this search from a category page of its own, so the total counts what that category holds rather than what matched the words that were typed.",
  free_text: "The site answered this search on its own terms rather than from a page of its own.",
  category: "The total counts what this category holds across all its pages.",
  guide:
    "The site answered with a guide it wrote for this topic: recipes grouped under headings of its own, with no total and no further page. A row of a guide carries its name, its address, its picture and how many readers rated it; the guide draws a rating and computes none, so no rating is published from it. Pass 'topic_slug' to browse_recipes for the full listing of the topic, which states how many recipes it holds.",
  standing:
    "This is one of the site's own standing lists, so the total is the length of that list rather than a count of its catalogue.",
  fridge:
    "The total counts every recipe the site found from these ingredients, and it serves one page of them.",
  recipe:
    "The site judged these words precise enough to name one recipe and opened it, in place of a listing. The row below is that recipe, read from its own page.",
  unmatched:
    "The site answered with its recipes home page, which is what it serves for words it could make nothing of. It listed no result for them and stated no count, so this is not a search that found nothing: it is one the site did not run.",
};

const CUT_OFF =
  "The site serves this listing on one page, so the rows beyond it are counted in the total and cannot be read.";

/** Said only where the two figures agree, rather than assumed from the kind. */
const TOTAL_IS_ROWS = "The total is the number of rows the site served here.";

/** Rows a guide named a second time, folded into the first. */
const FOLDED = (folded: number): string =>
  `${folded} ${folded === 1 ? "row names a recipe" : "rows name recipes"} already listed under another heading, counted in 'rows_seen' and rendered once.`;

export interface ListingNotes {
  /** The page a caller asked for, when it differs from the one that was served. */
  askedPage?: number;
  /** What a caller asked for, when the site answered from another address. */
  askedSlug?: string;
  /** The most rows a caller can ask this tool for. */
  maxLimit?: number;
  /** Rows the page held that could not be rendered. */
  skipped?: string[];
  /** Anything else this particular tool has to say. */
  extra?: string[];
}

export function notesFor(report: ListingReport, options: ListingNotes = {}): string[] {
  const notes = [TOTAL_MEANS[report.kind]];

  // Read off the two figures rather than assumed from how the listing came to
  // be: the site counts more than it serves on some searches and not on others,
  // and the same sentence on both would be false on one of them.
  if (report.total_available !== null && report.total_available === report.rows_seen) {
    notes.push(TOTAL_IS_ROWS);
  }
  // The site answers an address it does not hold by serving another. Naming the
  // two is what keeps a listing of one topic from reading as a listing of the
  // one that was asked for.
  if (options.askedSlug !== undefined && options.askedSlug !== report.topic_slug) {
    notes.push(
      `"${options.askedSlug}" was asked for and the site answered from "${report.topic_slug}", which is what it does with an address it does not hold.`,
    );
  }
  if (report.folded > 0) {
    notes.push(FOLDED(report.folded));
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
    notes.push(setAside(skipped));
  }
  return [...notes, ...(options.extra ?? [])];
}

/**
 * How many rows were set aside, and why, without reciting every one.
 *
 * Each reason quotes the words the row carried, so a page whose markup moved
 * sends every one of its rows here at once. Reciting them all builds a note
 * longer than the answer it qualifies.
 */
export function setAside(reasons: readonly string[]): string {
  const named = reasons.slice(0, MOST_REASONS_NAMED);
  const rest = reasons.length - named.length;
  const more = rest > 0 ? ` and ${rest} more for reasons of the same kind` : "";
  return `${reasons.length} ${reasons.length === 1 ? "row was" : "rows were"} set aside: ${named.join("; ")}${more}.`;
}

/** Past this the reasons repeat each other, and the note stops earning its length. */
const MOST_REASONS_NAMED = 3;

/**
 * As many rows as one answer carries.
 *
 * Measured rather than counted, because a row's size is the site's: a listing
 * of long titles and long ingredient previews outgrows the budget on fewer rows
 * than a listing of short ones.
 */
function withinBudget(rows: readonly RecipeRow[]): { rendered: RecipeRow[]; outgrew: boolean } {
  const rendered: RecipeRow[] = [];
  let held = 0;

  for (const row of rows) {
    held += JSON.stringify(row).length;
    if (held > MOST_CHARS_RENDERED && rendered.length > 0) {
      return { rendered, outgrew: true };
    }
    rendered.push(row);
  }
  return { rendered, outgrew: false };
}

/** The most one answer's rows are allowed to run to. */
const MOST_CHARS_RENDERED = 24_000;

/** One line per row. Every word of it comes from the report. */
function renderRow(row: RecipeRow): string {
  const stated = [row.category, row.difficulty].filter((value) => value !== null);
  if (row.total_minutes !== null) {
    stated.push(`${row.total_minutes} min`);
  }
  if (row.rating !== null) {
    stated.push(`${row.rating}/5${row.rating_count === null ? "" : ` (${row.rating_count})`}`);
  }
  const detail = stated.length > 0 ? `: ${stated.join(", ")}` : "";
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
      query: report.asked,
      kind: report.kind,
      topic_slug: report.topic_slug,
      title: report.title,
      results: rendered,
      // Counted here rather than repeated, so the field always states the
      // length of the list it sits beside.
      result_count: rendered.length,
      rows_seen: report.rows_seen,
      folded: report.folded,
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
  const { rendered, outgrew } = withinBudget(report.results.slice(0, limit));
  if (rendered.length === report.results.length) {
    return { rendered, note: [] };
  }
  // A row runs to several hundred characters, so a hundred of them make an
  // answer larger than a tool result carries: the caller then receives nothing
  // at all, which is worse than receiving fewer rows and being told.
  if (outgrew) {
    return {
      rendered,
      note: [
        `${rendered.length} of the ${report.results.length} rows this page served are rendered here, which is as many as one answer carries. Ask again with a smaller 'limit' to choose which.`,
      ],
    };
  }
  // Raising the limit only helps below the ceiling. At the ceiling the rows are
  // out of reach, and telling a caller to ask again would send them nowhere.
  const more =
    limit >= MAX_LIMIT
      ? `No call to this tool reaches the rest, ${MAX_LIMIT} rows being the most it renders.`
      : "Raise 'limit' for the rest.";
  return {
    rendered,
    note: [
      `${rendered.length} of the ${report.results.length} rows this page served are rendered here. ${more}`,
    ],
  };
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
