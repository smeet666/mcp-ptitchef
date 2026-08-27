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
  calories: "295 kcal / 1 part",
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
  folded: 0,
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
    ["recipe", /precise enough to name one recipe/i],
    ["unmatched", /did not run/i],
  ] as const)("is said for a %s listing", (kind, wording) => {
    expect(notesFor(report({ kind })).join(" ")).toMatch(wording);
  });
});

describe("what the notes carry", () => {
  it("says what this listing's total counts", () => {
    expect(notesFor(report({ kind: "topic" })).join(" ")).toMatch(/category page of its own/i);
  });

  it("says nothing that holds for every answer alike", () => {
    // Where to pass a slug back is true of every listing, so it is written in
    // the schema, which a caller reads once rather than on every call.
    const notes = notesFor(report({ kind: "topic", topic_slug: "tarte-aux-pommes" })).join(" ");

    expect(notes).not.toContain("Pass topic_slug");
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

describe("a listing the site answered from another address", () => {
  it("names what was asked and what answered", () => {
    const notes = notesFor(report({ topic_slug: "recette-aux-epinards" }), {
      askedSlug: "epinards",
    }).join(" ");

    expect(notes).toContain('"epinards" was asked for');
    expect(notes).toContain("recette-aux-epinards");
  });

  it("says nothing when the site answered from the address asked for", () => {
    expect(notesFor(report(), { askedSlug: "brindilles" }).join(" ")).not.toContain(
      "was asked for and the site answered from",
    );
  });
});

describe("a total that is the number of rows served", () => {
  it("says so, read off the two figures rather than assumed", () => {
    const notes = notesFor(report({ total_available: 24, rows_seen: 24 })).join(" ");

    expect(notes).toContain("the number of rows the site served");
  });

  it("says nothing of the sort when the site counts more than it served", () => {
    // The same sentence on both would be false on one of them.
    const notes = notesFor(report({ total_available: 286, rows_seen: 24 })).join(" ");

    expect(notes).not.toContain("the number of rows the site served");
  });
});

describe("rows a guide named twice", () => {
  it("are counted, in the singular for one", () => {
    expect(notesFor(report({ folded: 1 })).join(" ")).toContain("1 row names a recipe");
  });

  it("are counted, in the plural for several", () => {
    expect(notesFor(report({ folded: 3 })).join(" ")).toContain("3 rows name recipes");
  });
});

describe("a cut no further call can undo", () => {
  /** Rows small enough that their number bites before their size does. */
  const slim = (count: number): ListingReport => ({
    ...report(),
    results: Array.from({ length: count }, () => ({
      ...row(),
      id: "a-fid-1",
      url: "u",
      title: "t",
      category: null,
      difficulty: null,
      ingredients_preview: null,
    })),
  });

  it("says so rather than telling a caller to raise a limit already at its top", () => {
    expect(limitRows(slim(120), 100).note.join(" ")).toMatch(
      /No call to this tool reaches the rest/i,
    );
  });

  it("tells a caller to raise the limit while raising it would help", () => {
    expect(limitRows(slim(120), 20).note.join(" ")).toContain("Raise 'limit'");
  });
});

describe("an answer whose rows outgrow what one answer carries", () => {
  it("renders as many as fit and says how to choose the rest", () => {
    // A row runs to several hundred characters, so a hundred of them make an
    // answer larger than a tool result carries: the caller then receives
    // nothing at all, which is worse than receiving fewer rows and being told.
    const many = { ...report(), results: Array.from({ length: 120 }, () => row()) };
    const cut = limitRows(many, 100);

    expect(cut.rendered.length).toBeLessThan(100);
    expect(cut.note.join(" ")).toMatch(/as many as one answer carries/i);
    expect(JSON.stringify(cut.rendered).length).toBeLessThan(30_000);
  });
});

describe("rows set aside in numbers", () => {
  it("are summarised rather than recited", () => {
    // Each reason quotes the words its row carried, so a page whose markup
    // moved sends every row here at once and the note outgrows the answer.
    const many = Array.from({ length: 40 }, (_, index) => `reason number ${index}`);
    const note = notesFor(report(), { skipped: many }).join(" ");

    expect(note).toContain("40 rows were set aside");
    expect(note).toContain("reason number 0");
    expect(note).toContain("37 more");
    expect(note).not.toContain("reason number 39");
  });
});
