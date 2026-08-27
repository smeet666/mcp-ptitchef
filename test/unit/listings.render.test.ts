import { describe, expect, it } from "vitest";
import { limitRows, notesFor, renderListing } from "../../src/tools/listings.js";
import type { ListingReport, RecipeRow } from "../../src/types.js";

const row = (over: Partial<RecipeRow> = {}): RecipeRow => ({
  id: "recettes/plat/brindilles-fid-101",
  title: "Brindilles au four",
  url: "https://www.ptitchef.com/recettes/plat/brindilles-fid-101",
  image_url: null,
  rating: 3.8,
  rating_count: 9,
  review_count: null,
  category: "Plat",
  difficulty: "facile",
  total_minutes: 30,
  calories: 295,
  ingredients_preview: null,
  ...over,
});

const report = (over: Partial<ListingReport> = {}): ListingReport => ({
  asked: "brindilles",
  kind: "category",
  topic_slug: "brindilles",
  title: "Brindilles",
  results: [row()],
  result_count: 1,
  rows_seen: 1,
  total_available: 306,
  page: 1,
  single_page: false,
  url: "https://www.ptitchef.com/recettes/brindilles",
  ...over,
});

describe("what a listing's total counts", () => {
  it.each([
    ["topic", /category page of its own/i],
    ["free_text", /its own terms/i],
    ["category", /across all its pages/i],
    ["standing", /standing list/i],
    ["fridge", /from these ingredients/i],
  ] as const)("is said for a %s listing", (kind, wording) => {
    expect(notesFor(report({ kind })).join(" ")).toMatch(wording);
  });
});

describe("the page a search was answered from", () => {
  it("is offered back for its further pages", () => {
    const notes = notesFor(report({ kind: "topic", topic_slug: "tarte-aux-pommes" })).join(" ");

    expect(notes).toContain("tarte-aux-pommes");
    expect(notes).toContain("browse_recipes");
  });

  it("is not offered when the site answered on its own terms", () => {
    expect(notesFor(report({ kind: "free_text", topic_slug: null })).join(" ")).not.toContain(
      "browse_recipes",
    );
  });

  it("is not offered for a category that was opened directly", () => {
    // The caller already holds that slug; naming it back says nothing.
    expect(notesFor(report({ kind: "category" })).join(" ")).not.toContain("browse_recipes");
  });
});

describe("a listing served on one page", () => {
  it("says what the site counts past it and will not serve", () => {
    const notes = notesFor(
      report({ kind: "fridge", single_page: true, total_available: 89, rows_seen: 24 }),
    ).join(" ");

    expect(notes).toMatch(/cannot be read/i);
  });

  it("says nothing of a remainder when the site served the lot", () => {
    const notes = notesFor(
      report({ kind: "fridge", single_page: true, total_available: 3, rows_seen: 3 }),
    ).join(" ");

    expect(notes).not.toMatch(/cannot be read/i);
  });

  it("says nothing of a remainder when the site published no total", () => {
    // A remainder computed from a figure nobody published would be invented.
    const notes = notesFor(
      report({ kind: "fridge", single_page: true, total_available: null, rows_seen: 3 }),
    ).join(" ");

    expect(notes).not.toMatch(/cannot be read/i);
  });
});

describe("a page the site answered with another", () => {
  it("is named alongside the one that came back", () => {
    expect(notesFor(report({ page: 1 }), { askedPage: 99 }).join(" ")).toContain(
      "Page 99 was asked for",
    );
  });

  it("goes unmentioned when the site answered as asked", () => {
    expect(notesFor(report({ page: 4 }), { askedPage: 4 }).join(" ")).not.toContain(
      "was asked for",
    );
  });
});

describe("rows set aside", () => {
  it("are counted in the singular for one", () => {
    expect(notesFor(report(), { skipped: ["a row carries no heading"] }).join(" ")).toContain(
      "1 row was set aside",
    );
  });

  it("are counted in the plural for several, and each is named", () => {
    const notes = notesFor(report(), { skipped: ["first reason", "second reason"] }).join(" ");

    expect(notes).toContain("2 rows were set aside");
    expect(notes).toContain("first reason");
    expect(notes).toContain("second reason");
  });
});

describe("renderListing", () => {
  it("opens with the site's own heading, the page and the total", () => {
    const text = renderListing(report(), [row()]);

    expect(text).toContain("Brindilles, page 1.");
    expect(text).toContain("holds 306");
  });

  it("falls back to what was asked when the page carries no heading", () => {
    expect(renderListing(report({ title: null }), [row()])).toContain("brindilles, page 1.");
  });

  it("leaves the total out when the site published none", () => {
    expect(renderListing(report({ total_available: null }), [row()])).not.toContain("holds");
  });

  it("names an absence by what was asked for", () => {
    expect(renderListing(report({ results: [], result_count: 0 }), [])).toContain(
      'no recipe for "brindilles"',
    );
  });

  it("states only what a row carries", () => {
    const bare = row({
      rating: null,
      rating_count: null,
      category: null,
      difficulty: null,
      total_minutes: null,
    });

    expect(renderListing(report(), [bare])).toContain("Brindilles au four\n  recettes/");
  });

  it("states a rating without its count when the site published none", () => {
    expect(renderListing(report(), [row({ rating_count: null })])).toContain("3.8/5");
  });

  it("states a rating with its count when the site published one", () => {
    expect(renderListing(report(), [row()])).toContain("3.8/5 (9)");
  });
});

describe("limitRows", () => {
  it("says how many rows a cut left out", () => {
    const cut = limitRows(report({ results: [row(), row(), row()] }), 2);

    expect(cut.rendered).toHaveLength(2);
    expect(cut.note.join(" ")).toContain("2 of the 3 rows");
  });

  it("says nothing about a cut that left nothing out", () => {
    expect(limitRows(report(), 50).note).toEqual([]);
  });
});
