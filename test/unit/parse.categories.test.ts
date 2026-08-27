import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCategoryPage } from "../../src/ptitchef/parse.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const ROOT_URL = "https://www.ptitchef.com/recettes";
const FAMILY_URL = "https://www.ptitchef.com/recettes/cat/brindilles";

describe("the root of the tree", () => {
  const parsed = parseCategoryPage(read("categories-root.html"), null, ROOT_URL);

  it("reads every entry the container holds", () => {
    expect(parsed.report.category_count).toBe(4);
    expect(parsed.report.categories.map((entry) => entry.slug)).toEqual([
      "brindilles",
      "galinettes",
      "orpins",
      "mousserons",
    ]);
  });

  it("keeps the site's own wording for a title, entities resolved", () => {
    const [first, , third] = parsed.report.categories;

    expect(first?.title).toBe("Brindilles");
    expect(third?.title).toBe("Orpins & mousserons");
  });

  it("marks an entry that opens onto further categories", () => {
    expect(parsed.report.categories.every((entry) => entry.is_family)).toBe(true);
  });

  it("carries the heading the page publishes", () => {
    expect(parsed.report.family_title).toBe("Recettes de cuisine");
  });

  it("says which level it read, and from where", () => {
    expect(parsed.report.family).toBeNull();
    expect(parsed.report.url).toBe(ROOT_URL);
  });

  it("renders an address a caller can open for every entry", () => {
    expect(parsed.report.categories.map((entry) => entry.url)).toEqual([
      "https://www.ptitchef.com/recettes/cat/brindilles",
      "https://www.ptitchef.com/recettes/cat/galinettes",
      "https://www.ptitchef.com/recettes/cat/orpins",
      "https://www.ptitchef.com/recettes/cat/mousserons",
    ]);
  });

  it("reads the entries shown beside a family as the excerpt they are", () => {
    const [first, second, third, fourth] = parsed.report.categories;

    expect(first?.sample_children.map((child) => child.slug)).toEqual([
      "brindille-de-marne",
      "petite-brindille",
      "brindilles-seches",
    ]);
    expect(second?.sample_children).toHaveLength(2);
    // A family the page shows nothing beside carries nothing, rather than a
    // list this server filled in from somewhere else.
    expect(third?.sample_children).toEqual([]);
    // One of the fourth family's two is an article, which carries no category.
    expect(fourth?.sample_children.map((child) => child.slug)).toEqual(["mousseron-des-pres"]);
  });

  it("leaves a description null where the page carries none", () => {
    expect(parsed.report.categories.every((entry) => entry.description === null)).toBe(true);
  });

  it("sets nothing aside", () => {
    expect(parsed.skipped).toEqual([]);
  });
});

describe("one family, opened", () => {
  const parsed = parseCategoryPage(read("categories-family.html"), "brindilles", FAMILY_URL);

  it("reads its entries, none of which opens onto further categories", () => {
    expect(parsed.report.category_count).toBe(3);
    expect(parsed.report.categories.every((entry) => entry.is_family)).toBe(false);
  });

  it("repeats the blurb the site writes, and leaves it null where there is none", () => {
    const [first, second] = parsed.report.categories;

    expect(first?.description).toBe("Une brindille de saison, courte et tendre.");
    expect(second?.description).toBeNull();
  });

  it("carries the family it was asked for, and the heading the page publishes", () => {
    expect(parsed.report.family).toBe("brindilles");
    expect(parsed.report.family_title).toBe("Recettes Brindilles");
  });

  it("shows nothing beside an entry, since the page shows nothing there", () => {
    expect(parsed.report.categories.every((entry) => entry.sample_children.length === 0)).toBe(
      true,
    );
  });
});

describe("what the page carries outside the container", () => {
  it("leaves the navigation out, though it links the same shapes", () => {
    const parsed = parseCategoryPage(read("categories-root.html"), null, ROOT_URL);
    const slugs = parsed.report.categories.map((entry) => entry.slug);

    // Every page of the site carries these, and a parser reading the whole
    // document would publish them as categories of the level it was asked for.
    expect(slugs).not.toContain("aperitif");
    expect(slugs).not.toContain("plat");
    expect(slugs).not.toContain("faux");
  });
});

describe("an entry with nothing to pass back", () => {
  const parsed = parseCategoryPage(read("categories-broken-entry.html"), "galinettes", FAMILY_URL);

  it("is set aside rather than rendered without an address", () => {
    expect(parsed.report.categories.map((entry) => entry.slug)).toEqual([
      "galinette-de-varne",
      "galinette-rousse",
    ]);
  });

  it("is counted and named, so the caller learns a row was dropped", () => {
    expect(parsed.skipped).toHaveLength(1);
    expect(parsed.skipped[0]).toMatch(/link/i);
  });

  it("counts what was rendered rather than what the page held", () => {
    expect(parsed.report.category_count).toBe(2);
  });
});

describe("a container the site served empty", () => {
  const parsed = parseCategoryPage(read("categories-empty.html"), "orpins", FAMILY_URL);

  it("renders an absence, which is what the site answered", () => {
    expect(parsed.report.categories).toEqual([]);
    expect(parsed.report.category_count).toBe(0);
    expect(parsed.skipped).toEqual([]);
  });
});

describe("a page without the container", () => {
  it("raises parse_failure, keeping it apart from a level holding nothing", () => {
    expect(() => parseCategoryPage(read("categories-no-container.html"), null, ROOT_URL)).toThrow();

    try {
      parseCategoryPage(read("categories-no-container.html"), null, ROOT_URL);
    } catch (error) {
      expect((error as { code?: string }).code).toBe("parse_failure");
      expect((error as { details?: { url?: string } }).details?.url).toBe(ROOT_URL);
    }
  });
});

describe("a page without a heading of its own", () => {
  it("leaves the title null rather than borrowing one", () => {
    const parsed = parseCategoryPage(read("categories-no-heading.html"), "orpins", FAMILY_URL);

    expect(parsed.report.family_title).toBeNull();
    expect(parsed.report.category_count).toBe(1);
  });
});

describe("the entities a title carries", () => {
  const parsed = parseCategoryPage(read("categories-entities.html"), "epices", FAMILY_URL);

  it("resolves a numbered one and a hexadecimal one alike", () => {
    expect(parsed.report.categories[0]?.title).toBe("Café torréfié");
    expect(parsed.report.categories[0]?.description).toBe("Se moud à la demande.");
  });

  it("leaves an entity naming no character as the site wrote it", () => {
    // Past the last code point Unicode defines there is nothing to write, and
    // inventing a character here would put a letter in a title nobody published.
    expect(parsed.report.categories[1]?.title).toBe("Poivre &#99999999; long");
  });

  it("resolves them in the page's own heading too", () => {
    expect(parsed.report.family_title).toBe("Recettes Épices");
  });
});

describe("an entry pointing away from the tree", () => {
  const parsed = parseCategoryPage(read("categories-pointing-away.html"), "ailleurs", FAMILY_URL);

  it("is set aside, whether it links an article, nothing, or a level itself", () => {
    expect(parsed.report.categories).toEqual([]);
    expect(parsed.skipped).toHaveLength(5);
  });

  it("says so of an entry carrying no heading at all", () => {
    expect(parsed.skipped.join(" ")).toMatch(/no heading/i);
  });

  it("names each one it set aside by the words the entry carried", () => {
    expect(parsed.skipped.join(" ")).toContain("Un article");
    expect(parsed.skipped.join(" ")).toContain("Sans adresse");
    expect(parsed.skipped.join(" ")).toContain("La racine");
    expect(parsed.skipped.join(" ")).toContain("Une famille sans nom");
  });
});

describe("a page whose container is not followed by the end of its body", () => {
  it("is read to its last character rather than to nothing", () => {
    const parsed = parseCategoryPage(read("categories-no-body-end.html"), "sans-fin", FAMILY_URL);

    expect(parsed.report.category_count).toBe(1);
    expect(parsed.report.categories[0]?.slug).toBe("orpin-jaune");
  });
});
