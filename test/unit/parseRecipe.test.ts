import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRecipePage } from "../../src/ptitchef/parseRecipe.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const PAGE = "https://www.ptitchef.com/recettes/accompagnement/brindilles-au-four-fid-101";

describe("a recipe with everything the site puts on a page", () => {
  const recipe = parseRecipePage(read("recipe-full.html"), PAGE);

  it("is identified by the page path it was read from", () => {
    expect(recipe.id).toBe("recettes/accompagnement/brindilles-au-four-fid-101");
    expect(recipe.url).toBe(PAGE);
  });

  it("reads what the payload states about it", () => {
    expect(recipe.title).toBe("Brindilles au four");
    expect(recipe.category).toBe("Accompagnement");
    expect(recipe.cuisine).toBe("Fr");
    expect(recipe.author).toBe("Wren Holloway");
    expect(recipe.author_url).toContain("/team/");
    expect(recipe.published).toBe("2026-02-11T10:00:00+01:00");
    expect(recipe.modified).toBe("2026-08-01T09:30:00+02:00");
  });

  it("reads the rating the payload states, with both counts", () => {
    expect(recipe.rating).toBe(3.8);
    expect(recipe.rating_count).toBe(9);
    expect(recipe.review_count).toBe(4);
  });

  it("reads the times as minutes, each from its own field", () => {
    expect(recipe.prep_minutes).toBe(10);
    expect(recipe.cook_minutes).toBe(20);
    expect(recipe.total_minutes).toBe(30);
  });

  it("reads the servings, and keeps the page's own wording for them", () => {
    expect(recipe.yield_count).toBe(4);
    expect(recipe.yield_text).toBe("4");
  });

  it("takes the difficulty from the markup, which is the only place it lives", () => {
    expect(recipe.difficulty).toBe("moyen");
  });

  it("lists the ingredient lines as published, in the order the page lists them", () => {
    expect(recipe.ingredients).toEqual([
      "800 gr de brindilles",
      "1 oeuf",
      "5 cl de lait",
      "1,5kg de galinettes",
      "> 2 cuillères à soupe de miel",
      "sel, poivre",
    ]);
  });

  it("keeps each step beside the photograph the site took of it", () => {
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.steps[0]?.text).toBe("Lavez les brindilles.");
    expect(recipe.steps[0]?.image_url).toContain("recipe-step");
    // A step the site photographed nothing for carries nothing.
    expect(recipe.steps[1]?.image_url).toBeNull();
    expect(recipe.steps_are_one_block).toBe(false);
  });

  it("repeats nutrition with the units the site wrote it in", () => {
    // Turning "295Kcal" into 295 would make this server the one claiming the
    // unit, where the site is the one that wrote it.
    expect(recipe.nutrition?.calories).toBe("295Kcal");
    expect(recipe.nutrition?.serving_size).toBe("326g");
    expect(recipe.nutrition?.sodium).toBe("0.3g");
  });

  it("passes on the cost with the currency the site names", () => {
    expect(recipe.estimated_cost).toBe("4.82 EUR");
  });

  it("splits the keywords the site writes as one string", () => {
    expect(recipe.keywords).toEqual(["brindilles", "accompagnement", "recettes economiques"]);
  });

  it("reads a question only where the page carries its answer", () => {
    expect(recipe.faq).toHaveLength(1);
    expect(recipe.faq[0]?.question).toContain("la veille");
    expect(recipe.faq[0]?.answer).toContain("réchauffent");
  });

  it("reads the payload that parses, past the one that does not", () => {
    expect(recipe.description).toContain("brindilles dorées");
  });
});

describe("the other languages a recipe names", () => {
  const recipe = parseRecipePage(read("recipe-full.html"), PAGE);

  it("leaves out the page's own language and the default that repeats one", () => {
    // Both name a page already in hand, and offering either would present the
    // recipe as its own translation.
    expect(recipe.translations.map((one) => one.language)).toEqual(["es", "it"]);
  });

  it("keeps the first address named for a language rather than the last", () => {
    expect(recipe.translations[0]?.url).toContain("ramitas-al-horno");
  });
});

describe("a recipe the site published almost nothing about", () => {
  const recipe = parseRecipePage(read("recipe-bare.html"), PAGE);

  it("leaves every field the page states nothing for null", () => {
    expect(recipe.category).toBeNull();
    expect(recipe.difficulty).toBeNull();
    expect(recipe.author).toBeNull();
    expect(recipe.rating).toBeNull();
    expect(recipe.description).toBeNull();
    expect(recipe.image_url).toBeNull();
    expect(recipe.estimated_cost).toBeNull();
    expect(recipe.nutrition).toBeNull();
  });

  it("leaves a time it states nothing for null, never zero", () => {
    // On a scale that starts at zero the two would be indistinguishable, and a
    // zero would say the dish needs no cooking.
    expect(recipe.prep_minutes).toBeNull();
    expect(recipe.cook_minutes).toBeNull();
    expect(recipe.total_minutes).toBeNull();
  });

  it("leaves the servings null rather than assuming one", () => {
    expect(recipe.yield_count).toBeNull();
    expect(recipe.yield_text).toBeNull();
  });

  it("carries empty lists where the page carries no list", () => {
    expect(recipe.steps).toEqual([]);
    expect(recipe.keywords).toEqual([]);
    expect(recipe.faq).toEqual([]);
    expect(recipe.translations).toEqual([]);
  });

  it("still reads what the page does state", () => {
    expect(recipe.title).toBe("Brindilles nues");
    expect(recipe.ingredients).toEqual(["2 brindilles"]);
  });
});

describe("a method the site wrote as one block", () => {
  const recipe = parseRecipePage(read("recipe-one-block.html"), PAGE);

  it("comes back as one step, said to be a block rather than the first of many", () => {
    expect(recipe.steps).toHaveLength(1);
    expect(recipe.steps[0]?.text).toContain("Lavez les brindilles");
    expect(recipe.steps_are_one_block).toBe(true);
  });
});

describe("a payload written in the awkward shapes the site allows", () => {
  const recipe = parseRecipePage(read("recipe-odd.html"), PAGE);

  it("reads an image named as an object", () => {
    expect(recipe.image_url).toContain("etrange.webp");
  });

  it("falls back to the servings the markup offers when the payload states none", () => {
    expect(recipe.yield_count).toBe(4);
    expect(recipe.yield_text).toBeNull();
  });

  it("leaves a nutrition block holding nothing null rather than a table of nulls", () => {
    expect(recipe.nutrition).toBeNull();
  });

  it("passes on a cost the site named no currency for", () => {
    expect(recipe.estimated_cost).toBe("4.82");
  });

  it("reads keywords written as a list, dropping what is empty", () => {
    expect(recipe.keywords).toEqual(["brindilles", "four"]);
  });

  it("keeps only the steps carrying words", () => {
    expect(recipe.steps).toHaveLength(1);
    expect(recipe.steps[0]?.text).toBe("Enfournez.");
  });

  it("leaves a rating stated as something other than a number null", () => {
    expect(recipe.rating).toBeNull();
  });
});

describe("a page carrying no recipe payload", () => {
  it("raises parse_failure, keeping it apart from a recipe the site does not hold", () => {
    expect(() => parseRecipePage(read("recipe-missing.html"), PAGE)).toThrow();

    try {
      parseRecipePage(read("recipe-missing.html"), PAGE);
    } catch (error) {
      expect((error as { code?: string }).code).toBe("parse_failure");
      expect((error as { details?: { url?: string } }).details?.url).toBe(PAGE);
    }
  });
});

describe("a recipe read from an address of another shape", () => {
  it("is named by that address, since there is no identifier in it", () => {
    const odd = "https://www.ptitchef.com/recettes/brindilles";
    const recipe = parseRecipePage(read("recipe-full.html"), odd);

    expect(recipe.id).toBe(odd);
  });
});

describe("a payload written in the remaining awkward shapes", () => {
  const recipe = parseRecipePage(read("recipe-awkward.html"), PAGE);

  it("lists no ingredient where the payload wrote one string instead of a list", () => {
    // A string is not a list of lines, and splitting it here would invent a
    // division the site never made.
    expect(recipe.ingredients).toEqual([]);
  });

  it("states no cost where the payload names a currency and no amount", () => {
    expect(recipe.estimated_cost).toBeNull();
  });

  it("carries no question where the payload wrote something other than a list", () => {
    expect(recipe.faq).toEqual([]);
  });
});

describe("questions the payload lists oddly", () => {
  it("keeps only the entries carrying both a question and its answer", () => {
    const recipe = parseRecipePage(read("recipe-odd-faq.html"), PAGE);

    expect(recipe.faq).toEqual([]);
  });
});

describe("a payload stating things a reader may not hold", () => {
  const recipe = parseRecipePage(read("recipe-unnamed.html"), PAGE);

  it("carries an empty title where the payload names none", () => {
    expect(recipe.title).toBe("");
  });

  it("reads an image named by its content address", () => {
    expect(recipe.image_url).toContain("/c.webp");
  });

  it("keeps only the ingredient entries that are lines", () => {
    expect(recipe.ingredients).toEqual(["2 brindilles", "1 oeuf"]);
  });

  it("leaves a count written in words null rather than reading a number from it", () => {
    expect(recipe.rating).toBe(4);
    expect(recipe.rating_count).toBeNull();
  });

  it("keeps the wording of a yield stated with its unit", () => {
    expect(recipe.yield_count).toBe(6);
    expect(recipe.yield_text).toBe("6 personnes");
  });
});

describe("a payload naming no image at all", () => {
  it("states none rather than reaching into an empty list", () => {
    expect(parseRecipePage(read("recipe-no-image.html"), PAGE).image_url).toBeNull();
  });
});

describe("counterparts named oddly", () => {
  const recipe = parseRecipePage(read("recipe-odd-alternates.html"), PAGE);

  it("leaves out the page itself, recognised by the number its address ends on", () => {
    // The site rewrites the words of an address around that number, so an
    // entry naming the same recipe under other words is still this page.
    expect(recipe.translations.some((one) => one.language === "fr")).toBe(false);
  });

  it("leaves out an entry missing its language or its address", () => {
    expect(recipe.translations.map((one) => one.language)).toEqual(["it"]);
  });

  it("leaves out an entry whose address is no address at all", () => {
    expect(recipe.translations.some((one) => one.language === "pt")).toBe(false);
  });

  it("resolves a counterpart written relative to the page", () => {
    expect(recipe.translations[0]?.url).toBe(
      "https://www.ptitchef.com/ricette/contorno/rametti-fid-103",
    );
  });
});

describe("a recipe listing no ingredient", () => {
  it("carries an empty list rather than one this filled in", () => {
    expect(parseRecipePage(read("recipe-no-ingredients.html"), PAGE).ingredients).toEqual([]);
  });
});
