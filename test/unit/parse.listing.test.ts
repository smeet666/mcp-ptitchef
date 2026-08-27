import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type ListingContext, parseListingPage, readMinutes } from "../../src/ptitchef/parse.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const LISTING_URL = "https://www.ptitchef.com/recettes/brindilles";

const context = (over: Partial<ListingContext> = {}): ListingContext => ({
  asked: "brindilles",
  kind: "category",
  topicSlug: "brindilles",
  page: 1,
  url: LISTING_URL,
  ...over,
});

describe("one page of a listing", () => {
  const parsed = parseListingPage(read("listing-first.html"), context());

  it("reads every row the listing holds", () => {
    expect(parsed.report.result_count).toBe(3);
    expect(parsed.report.rows_seen).toBe(3);
    expect(parsed.skipped).toEqual([]);
  });

  it("identifies a recipe by the page path the site serves it from", () => {
    // The number at the end of that path, asked for on its own, comes back
    // empty, so the whole path is what a caller has to hand back.
    expect(parsed.report.results[0]?.id).toBe("recettes/accompagnement/brindilles-au-four-fid-101");
    expect(parsed.report.results[0]?.url).toBe(
      "https://www.ptitchef.com/recettes/accompagnement/brindilles-au-four-fid-101",
    );
  });

  it("takes the rating the page states rather than the one it draws", () => {
    // The row draws four stars where the payload states 3.8. Publishing the
    // drawn figure would report a rating the site never computed.
    expect(parsed.report.results[0]?.rating).toBe(3.8);
    expect(parsed.report.results[0]?.rating_count).toBe(9);
    expect(parsed.report.results[0]?.review_count).toBe(4);
  });

  it("leaves a review count the page published none of null", () => {
    expect(parsed.report.results[1]?.rating).toBe(4.1);
    expect(parsed.report.results[1]?.review_count).toBeNull();
  });

  it("repeats what a row states about itself, in the site's own wording", () => {
    const [first, second] = parsed.report.results;

    expect(first?.category).toBe("Accompagnement");
    expect(first?.difficulty).toBe("moyen");
    expect(first?.total_minutes).toBe(30);
    expect(first?.calories).toBe("295 kcal / 1 part");
    expect(second?.difficulty).toBe("facile");
  });

  it("adds the hours to the minutes of a duration written with both", () => {
    // Reading the first number alone would call two hours and twenty minutes
    // two minutes.
    expect(parsed.report.results[1]?.total_minutes).toBe(140);
  });

  it("leaves every field a row states nothing about null", () => {
    const third = parsed.report.results[2];

    expect(third?.rating).toBeNull();
    expect(third?.category).toBeNull();
    expect(third?.difficulty).toBeNull();
    expect(third?.total_minutes).toBeNull();
    expect(third?.calories).toBeNull();
    expect(third?.ingredients_preview).toBeNull();
  });

  it("carries the total the site prints, and the heading it publishes", () => {
    expect(parsed.report.total_available).toBe(306);
    expect(parsed.report.title).toBe("Brindilles");
  });

  it("says the site offers further pages, since it links them", () => {
    expect(parsed.report.single_page).toBe(false);
  });

  it("repeats what it was asked, without reading it back off the page", () => {
    const named = parseListingPage(
      read("listing-first.html"),
      context({ asked: "poulet", kind: "topic", page: 4 }),
    );

    expect(named.report.asked).toBe("poulet");
    expect(named.report.kind).toBe("topic");
    expect(named.report.page).toBe(4);
    expect(named.report.url).toBe(LISTING_URL);
  });
});

describe("a listing the site serves whole", () => {
  it("says so, since the page links no further one", () => {
    const parsed = parseListingPage(read("listing-whole.html"), context({ kind: "fridge" }));

    expect(parsed.report.single_page).toBe(true);
    expect(parsed.report.total_available).toBe(3);
  });
});

describe("a search that matched nothing", () => {
  const parsed = parseListingPage(
    read("listing-empty.html"),
    context({ asked: "zzzzqqqxx", kind: "free_text", topicSlug: null }),
  );

  it("renders an absence, which is what the site answered", () => {
    expect(parsed.report.results).toEqual([]);
    expect(parsed.report.result_count).toBe(0);
    expect(parsed.report.rows_seen).toBe(0);
  });

  it("keeps the count the site printed rather than calling it unknown", () => {
    // The site prints the count and drops the listing. A null here would say
    // the site published no figure, where it published zero.
    expect(parsed.report.total_available).toBe(0);
  });
});

describe("a page carrying neither a listing nor a count", () => {
  it("raises parse_failure, keeping it apart from a search that matched nothing", () => {
    expect(() => parseListingPage(read("listing-unreadable.html"), context())).toThrow();

    try {
      parseListingPage(read("listing-unreadable.html"), context());
    } catch (error) {
      expect((error as { code?: string }).code).toBe("parse_failure");
      expect((error as { details?: { url?: string } }).details?.url).toBe(LISTING_URL);
    }
  });
});

describe("a row with nothing to pass back", () => {
  const parsed = parseListingPage(read("listing-broken-row.html"), context());

  it("is set aside rather than rendered without an address", () => {
    expect(parsed.report.result_count).toBe(1);
    expect(parsed.skipped).toHaveLength(3);
  });

  it("is still counted among the rows the site served", () => {
    // Rendering three and reporting one would hide that the page held more.
    expect(parsed.report.rows_seen).toBe(4);
  });

  it("names what it set aside, by the words the row carried", () => {
    expect(parsed.skipped.join(" ")).toContain("Sans adresse");
    expect(parsed.skipped.join(" ")).toContain("Un article");
    // A row carrying no heading at all is named for what it lacks, since there
    // are no words in it to name it by.
    expect(parsed.skipped.join(" ")).toMatch(/no heading/i);
  });
});

describe("readMinutes", () => {
  it.each([
    ["30 min", 30],
    ["5 m", 5],
    ["2 h", 120],
    ["2 h 20 m", 140],
    ["24 h 10 m", 1450],
    ["1 h 5 min", 65],
  ])("reads %s as %i minutes", (written, minutes) => {
    expect(readMinutes(written)).toBe(minutes);
  });

  it("reads nothing from a wording carrying no duration", () => {
    expect(readMinutes("rapide")).toBeNull();
  });
});

describe("a listing written every awkward way the site writes one", () => {
  const parsed = parseListingPage(
    read("listing-odd.html"),
    context({ asked: "brindilles", topicSlug: "brindilles" }),
  );

  it("reads a total the site grouped with a space", () => {
    expect(parsed.report.total_available).toBe(12_345);
  });

  it("reads the payload that parses, past the one that does not", () => {
    // A page carries several of these and only one is the listing. One that
    // cannot be read says nothing about the others.
    expect(parsed.report.results[0]?.rating).toBe(4.5);
  });

  it("leaves a count the payload states as nothing usable null", () => {
    expect(parsed.report.results[0]?.rating_count).toBeNull();
    expect(parsed.report.results[0]?.review_count).toBeNull();
  });

  it("leaves a property carrying no wording out rather than keying it by itself", () => {
    expect(parsed.report.results[0]?.category).toBeNull();
    expect(parsed.report.results[0]?.difficulty).toBeNull();
  });

  it("leaves a duration it cannot read null", () => {
    expect(parsed.report.results[0]?.total_minutes).toBeNull();
  });

  it("repeats a calorie figure it cannot read as the row wrote it", () => {
    // Reading a number out of it would invent one; dropping it would hide what
    // the row states.
    expect(parsed.report.results[0]?.calories).toBe("pas un nombre");
  });

  it("leaves an empty image and an empty ingredient line null", () => {
    expect(parsed.report.results[0]?.image_url).toBeNull();
    expect(parsed.report.results[0]?.ingredients_preview).toBeNull();
  });

  it("reads the rows of a listing the page never closes", () => {
    expect(parsed.report.result_count).toBe(2);
  });

  it("leaves a row the payload says nothing about without a rating", () => {
    // The listing and its payload are two lists, and a row in one and not the
    // other gets no figure rather than the figure of its neighbour.
    const second = parsed.report.results[1];

    expect(second?.id).toBe("recettes/plat/brindilles-crues-fid-202");
    expect(second?.rating).toBeNull();
    expect(second?.rating_count).toBeNull();
  });

  it("leaves the heading null where the page carries none", () => {
    expect(parsed.report.title).toBeNull();
  });
});

describe("a row linking away from the site", () => {
  it("is set aside, since its address is no page of this site to hand back", () => {
    const parsed = parseListingPage(read("listing-off-site.html"), context());

    expect(parsed.report.result_count).toBe(1);
    expect(parsed.skipped.join(" ")).toMatch(/links away from this site/i);
  });
});

describe("a page stating a count and carrying no listing this can read", () => {
  it("raises parse_failure naming the count, rather than rendering an absence", () => {
    // Rendering it would answer "no recipe, and the site says it holds 3200",
    // which reports a failure to read as a result.
    try {
      parseListingPage(read("listing-counted-unread.html"), context());
      throw new Error("the page was read");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("parse_failure");
      expect((error as Error).message).toContain("3200");
    }
  });
});
