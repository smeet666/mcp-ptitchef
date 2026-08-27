import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type ListingContext, parseListingPage } from "../../src/ptitchef/parse.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const GUIDE_URL = "https://www.ptitchef.com/recettes/brindilles";

const context = (over: Partial<ListingContext> = {}): ListingContext => ({
  asked: "brindilles",
  kind: "topic",
  topicSlug: "brindilles",
  page: 1,
  url: GUIDE_URL,
  ...over,
});

describe("the guide the site writes for some topics", () => {
  const parsed = parseListingPage(read("listing-guide.html"), context());

  it("is read as a guide, whatever the caller expected to find there", () => {
    // The site answers the unnumbered address of some topics with a guide of
    // its own instead of a listing, and the shape of the page is what says so.
    expect(parsed.report.kind).toBe("guide");
  });

  it("reads its rows across every heading, in the order the page prints them", () => {
    expect(parsed.report.results.map((row) => row.title)).toEqual([
      "Brindilles au four",
      "Galinette braisée",
      "Orpin confit",
      "Brindilles sucrées",
    ]);
  });

  it("counts a recipe listed under two headings once", () => {
    // The page names it twice because it belongs to both, and counting it twice
    // would state a length the page has not.
    expect(parsed.report.result_count).toBe(4);
    expect(parsed.report.rows_seen).toBe(5);
  });

  it("sets aside a row carrying no address, and says so", () => {
    expect(parsed.skipped).toHaveLength(1);
    expect(parsed.skipped[0]).toMatch(/guide/i);
  });

  it("publishes no rating, since the page draws one and states none", () => {
    // The drawn figure is rounded to the nearest star and is not what the site
    // computed, so nothing is published in its place.
    expect(parsed.report.results.every((row) => row.rating === null)).toBe(true);
  });

  it("publishes the vote count, which the page does state as a number", () => {
    expect(parsed.report.results[0]?.rating_count).toBe(153);
  });

  it("leaves every field the guide carries nothing for null", () => {
    const first = parsed.report.results[0];

    expect(first?.category).toBeNull();
    expect(first?.difficulty).toBeNull();
    expect(first?.total_minutes).toBeNull();
    expect(first?.calories).toBeNull();
    expect(first?.ingredients_preview).toBeNull();
  });

  it("keeps the address and the picture of every row", () => {
    const first = parsed.report.results[0];

    expect(first?.id).toBe("recettes/accompagnement/brindilles-au-four-fid-101");
    expect(first?.url).toBe(
      "https://www.ptitchef.com/recettes/accompagnement/brindilles-au-four-fid-101",
    );
    expect(first?.image_url).toContain("/imgupl/feed-data/101.webp");
  });

  it("states no total, since the guide publishes none", () => {
    expect(parsed.report.total_available).toBeNull();
  });

  it("is complete in itself, though it links the topic's own listing", () => {
    // The page it links is the listing of the same topic, which answers a
    // different question and carries a total of its own.
    expect(parsed.report.single_page).toBe(true);
  });

  it("carries the heading the page publishes", () => {
    expect(parsed.report.title).toBe("Brindilles : recettes faciles");
  });
});

describe("a row of a guide stating less than its neighbours", () => {
  const parsed = parseListingPage(read("listing-guide.html"), context());
  const bare = parsed.report.results[3];

  it("carries no picture where the page names an empty one", () => {
    expect(bare?.image_url).toBeNull();
  });

  it("carries no vote count where the page states none", () => {
    // Nobody having rated it and the page not saying are different claims, and
    // a zero here would make the first out of the second.
    expect(bare?.rating_count).toBeNull();
  });
});
