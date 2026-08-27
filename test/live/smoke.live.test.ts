import process from "node:process";
import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { PtitchefClient } from "../../src/ptitchef/client.js";
import { runListCategories } from "../../src/tools/listCategories.js";

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
