import process from "node:process";
import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { PtitchefClient } from "../../src/ptitchef/client.js";
import { runBrowseRecipes } from "../../src/tools/browseRecipes.js";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runGetRecipeTranslations } from "../../src/tools/getRecipeTranslations.js";
import { runListCategories } from "../../src/tools/listCategories.js";
import { runSearchByIngredients } from "../../src/tools/searchByIngredients.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";

// This suite reads the real site, one request per route, to catch what the
// generated corpus cannot see: the day Ptitchef changes its answers. No fake
// clock here, and no assertion on wall-clock duration.

// A canary has nobody waiting on it and the site is free to read, so it paces
// itself far slower than the server's default.
const config = loadConfig({ PTC_MIN_INTERVAL_MS: "4000" });
const client = new PtitchefClient({ config, logger: createLogger("silent") });

interface CategoryShape {
  slug: string;
  title: string;
  url: string;
  sample_children: Array<{ slug: string; title: string }>;
  is_family: boolean;
}

interface CategoryReportShape {
  family: string | null;
  family_title: string | null;
  categories: CategoryShape[];
  category_count: number;
  categories_published: number;
  url: string;
}

const structuredOf = <T>(result: { structuredContent?: unknown }): T => {
  expect(result.structuredContent, "the tool answered without structuredContent").toBeDefined();
  return result.structuredContent as T;
};

describe.skipIf(!process.env.PTC_LIVE)("Ptitchef, live", () => {
  it("answers list_categories without a family with the families themselves", async () => {
    const report = structuredOf<CategoryReportShape>(await runListCategories(client, {}));

    expect(report.categories.length, "the root of the tree published no family").toBeGreaterThan(0);
    expect(
      report.categories.every((entry) => entry.is_family),
      "an entry of the root does not open onto further categories, so the tree changed shape",
    ).toBe(true);
    for (const entry of report.categories) {
      expect(entry.slug, "a family came back without slug").toBeTruthy();
      expect(entry.title, "a family came back without title").toBeTruthy();
      expect(entry.url, "a family came back without url").toBeTruthy();
    }
  });

  it("shows a sample of entries beside a family rather than what it holds", async () => {
    // The whole excerpt note rests on this: the site prints a few entries
    // beside each family and marks them with an ellipsis. If it ever printed
    // the lot, the note would qualify an answer that needed no qualifying.
    const report = structuredOf<CategoryReportShape>(await runListCategories(client, {}));
    const withSamples = report.categories.filter((entry) => entry.sample_children.length > 0);

    expect(
      withSamples.length,
      "no family shows an entry beside it, so the root stopped printing its excerpt",
    ).toBeGreaterThan(0);
  });

  it("answers list_categories with a family with what that family holds", async () => {
    const root = structuredOf<CategoryReportShape>(await runListCategories(client, {}));
    const first = root.categories[0];
    if (first === undefined) {
      throw new Error("the root published no family to open");
    }

    const opened = structuredOf<CategoryReportShape>(
      await runListCategories(client, { family: first.slug, limit: 200 }),
    );

    expect(opened.family, "the answer names a family other than the one asked for").toBe(
      first.slug,
    );
    expect(
      opened.categories.length,
      `the family ${first.slug} published no category`,
    ).toBeGreaterThan(0);
    expect(
      opened.categories.every((entry) => !entry.is_family),
      "a family's own page holds a further family, so the tree grew a level",
    ).toBe(true);
    expect(
      opened.categories_published,
      "categories_published left the number of rows the page listed",
    ).toBe(opened.categories.length);
  });

  it("refuses a family that cannot become an address, without asking the site", async () => {
    await expect(runListCategories(client, { family: "Légume" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("reports a family the site does not hold as an absence it stated", async () => {
    await expect(
      runListCategories(client, { family: "famille-qui-nexiste-pas-du-tout" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

interface ListingShape {
  asked: string;
  kind: string;
  topic_slug: string | null;
  results: Array<{ id: string; title: string; url: string; rating: number | null }>;
  result_count: number;
  rows_seen: number;
  total_available: number | null;
  page: number;
  single_page: boolean;
}

describe.skipIf(!process.env.PTC_LIVE)("Ptitchef listings, live", () => {
  it("answers a search the site holds a category page for by naming that page", async () => {
    // The whole 'kind' field rests on this: the site reads a search and, when
    // it holds a page of its own for it, sends the reader there. If it stopped,
    // every search would come back as free text and a category's total would
    // never be reported as one.
    const report = structuredOf<ListingShape>(
      await runSearchRecipes(client, { query: "puree de patate douce" }),
    );

    expect(report.kind, "the site stopped answering a search from a category page").toBe("topic");
    expect(report.topic_slug, "a topic answer came back without naming its page").toBeTruthy();
    expect(report.result_count, "a topic answer came back with no row").toBeGreaterThan(0);
  });

  it("answers a search it holds no page for on its own terms, on one page", async () => {
    const report = structuredOf<ListingShape>(
      await runSearchRecipes(client, { query: "soupe froide concombre menthe" }),
    );

    expect(report.kind, "the site sent this search to a category page").toBe("free_text");
    expect(
      report.single_page,
      "a free-text answer linked a further page, so it stopped serving one",
    ).toBe(true);
    expect(report.total_available, "a free-text total left the number of rows served").toBe(
      report.rows_seen,
    );
  });

  it("answers a search that matched nothing with an absence it stated", async () => {
    const report = structuredOf<ListingShape>(
      await runSearchRecipes(client, { query: "zzzzqqqxx" }),
    );

    expect(report.result_count, "an invented term returned rows").toBe(0);
    expect(report.total_available, "an invented term returned no count of zero").toBe(0);
  });

  it("pages a category, and answers a page past the last one with the first", async () => {
    // The page an answer reports is read off the address it came back from. If
    // the site started serving an empty page instead, a caller would page past
    // the end without noticing.
    const first = structuredOf<ListingShape>(
      await runBrowseRecipes(client, { category: "tarte-aux-pommes" }),
    );
    const past = structuredOf<ListingShape>(
      await runBrowseRecipes(client, { category: "tarte-aux-pommes", page: 999 }),
    );

    expect(first.page).toBe(1);
    expect(first.single_page, "a paged category stopped linking its further pages").toBe(false);
    expect(past.page, "the site stopped answering a page past the last one with the first").toBe(1);
  });

  it("reads a standing list the site serves whole", async () => {
    const report = structuredOf<ListingShape>(
      await runBrowseRecipes(client, { listing: "top_rated", limit: 5 }),
    );

    expect(report.kind).toBe("standing");
    expect(report.rows_seen, "a standing list came back with no row").toBeGreaterThan(0);
    expect(report.single_page, "a standing list linked a further page").toBe(true);
  });

  it("counts more from a fridge search than it will serve", async () => {
    // The note about a remainder rests on this: the fridge counts every recipe
    // it finds and offers one page of them.
    const report = structuredOf<ListingShape>(
      await runSearchByIngredients(client, { ingredients: ["poulet", "citron", "miel"], limit: 5 }),
    );

    expect(report.kind).toBe("fridge");
    expect(report.rows_seen, "the fridge came back with no row").toBeGreaterThan(0);
    expect(report.single_page, "the fridge started paging its answers").toBe(true);
    expect(
      report.total_available ?? 0,
      "the fridge stopped counting past what it serves",
    ).toBeGreaterThan(report.rows_seen);
  });

  it("answers some topics with a guide it wrote rather than with a listing", async () => {
    // The site serves the unnumbered address of some topics as a curated guide,
    // and the numbered one as the listing. If it stopped, a search for one of
    // them would come back as a topic and this would say so.
    const guide = structuredOf<ListingShape>(
      await runSearchRecipes(client, { query: "épinards", limit: 5 }),
    );

    expect(guide.kind, "the site stopped answering this topic with a guide").toBe("guide");
    expect(guide.total_available, "a guide started publishing a total").toBeNull();
    expect(guide.result_count, "the guide came back with no row").toBeGreaterThan(0);
    expect(guide.topic_slug, "a guide came back without naming its topic").toBeTruthy();
  });

  it("reaches the listing of such a topic by asking for its page by number", async () => {
    const guide = structuredOf<ListingShape>(
      await runSearchRecipes(client, { query: "épinards", limit: 1 }),
    );
    const listing = structuredOf<ListingShape>(
      await runBrowseRecipes(client, { category: guide.topic_slug ?? "", limit: 5 }),
    );

    expect(listing.kind, "the numbered page of this topic served a guide too").toBe("category");
    expect(
      listing.total_available ?? 0,
      "the listing of this topic stopped stating a total",
    ).toBeGreaterThan(0);
  });

  it("gives every row an identifier that leads back to its page", async () => {
    const report = structuredOf<ListingShape>(
      await runSearchRecipes(client, { query: "tarte aux pommes", limit: 5 }),
    );

    for (const row of report.results) {
      expect(row.id, "a row came back without an identifier").toBeTruthy();
      expect(row.url, "a row's address does not carry its identifier").toContain(row.id);
    }
  });
});

interface RecipeShape {
  id: string;
  title: string;
  yield: { original_count: number | null; requested: number | null; factor: number | null };
  ingredients: Array<{ original: string; text: string; scaling: string }>;
  steps: Array<{ text: string }>;
  steps_are_one_block: boolean;
  prep_minutes: number | null;
  total_minutes: number | null;
  nutrition: { calories: string | null } | null;
  estimated_cost: string | null;
  translations: Array<{ language: string; url: string }>;
}

/** A recipe the site holds, found rather than written down here. */
async function anyRecipeId(): Promise<string> {
  const listing = structuredOf<ListingShape>(
    await runSearchRecipes(client, { query: "tarte aux pommes", limit: 5 }),
  );
  const first = listing.results[0];
  if (first === undefined) {
    throw new Error("the site returned no row to read a recipe from");
  }
  return first.id;
}

describe.skipIf(!process.env.PTC_LIVE)("Ptitchef recipes, live", () => {
  it("reads a recipe from the identifier a listing row carried", async () => {
    const recipe = structuredOf<RecipeShape>(
      await runGetRecipe(client, { id: await anyRecipeId() }),
    );

    expect(recipe.title, "a recipe came back without a title").toBeTruthy();
    expect(recipe.ingredients.length, "a recipe came back with no ingredient line").toBeGreaterThan(
      0,
    );
    expect(recipe.steps.length, "a recipe came back with no step").toBeGreaterThan(0);
  });

  it("carries the fields that make this site worth reading", async () => {
    // The cost per recipe and the nutrition per serving are what this site
    // publishes and its neighbours do not. If either stopped, the answer would
    // quietly lose the reason for reading it.
    const recipe = structuredOf<RecipeShape>(
      await runGetRecipe(client, { id: await anyRecipeId() }),
    );

    expect(recipe.estimated_cost, "the site stopped estimating a cost").toBeTruthy();
    expect(recipe.nutrition?.calories, "the site stopped publishing calories").toBeTruthy();
    expect(recipe.total_minutes, "the site stopped stating a total time").not.toBeNull();
  });

  it("rescales the ingredients by the ratio the page states", async () => {
    const id = await anyRecipeId();
    const published = structuredOf<RecipeShape>(await runGetRecipe(client, { id }));
    const servings = (published.yield.original_count ?? 1) * 2;
    const doubled = structuredOf<RecipeShape>(await runGetRecipe(client, { id, servings }));

    expect(doubled.yield.requested).toBe(servings);
    expect(doubled.yield.factor, "the factor left the ratio the page states").toBe(2);
    expect(
      doubled.ingredients.some((line) => line.text !== line.original),
      "doubling this recipe moved no line at all",
    ).toBe(true);
  });

  it("refuses an identifier of another shape without asking the site", async () => {
    await expect(runGetRecipe(client, { id: "tarte-aux-pommes" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("reports an identifier the site does not hold as an absence", async () => {
    await expect(
      runGetRecipe(client, { id: "recettes/plat/rien-du-tout-fid-999999999" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("names the other languages a recent recipe was published in", async () => {
    // The network publishes the same recipe on five neighbouring sites and each
    // page names its counterparts. A recent recipe is where that pairing lives.
    const latest = structuredOf<ListingShape>(
      await runBrowseRecipes(client, { listing: "latest", limit: 5 }),
    );
    const first = latest.results[0];
    if (first === undefined) {
      throw new Error("the standing list returned no row");
    }

    const out = structuredOf<{ translations: Array<{ language: string; url: string }> }>(
      await runGetRecipeTranslations(client, { id: first.id }),
    );

    for (const one of out.translations) {
      expect(one.language, "a counterpart came back without a language").toBeTruthy();
      expect(one.url, "a counterpart came back without an address").toMatch(/^https:\/\//);
    }
  });
});
