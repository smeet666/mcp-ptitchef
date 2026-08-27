import { describe, expect, it } from "vitest";
import {
  categoryUrl,
  fridgeUrl,
  isFamilyHref,
  isRecipeId,
  isSlug,
  listingAt,
  listingUrl,
  recipeIdFrom,
  recipeUrl,
  searchUrl,
  slugFromHref,
  standingUrl,
  STANDING_NAMES,
} from "../../src/ptitchef/urls.js";

describe("isSlug", () => {
  it.each(["legume", "fruits-secs", "chou-kale", "recette-a-l-abricot", "b12"])(
    "accepts %s, which is how the site writes one",
    (slug) => {
      expect(isSlug(slug)).toBe(true);
    },
  );

  it.each(["Légume", "cat/legume", "a b", "", "-legume", "legume-", "legume--x", "UPPER"])(
    "refuses %s, which the site would answer with another page",
    (slug) => {
      expect(isSlug(slug)).toBe(false);
    },
  );
});

describe("categoryUrl", () => {
  it("reads the root of the tree when no family is named", () => {
    expect(categoryUrl(null)).toBe("https://www.ptitchef.com/recettes");
  });

  it("reads one family from its own page", () => {
    expect(categoryUrl("legume")).toBe("https://www.ptitchef.com/recettes/cat/legume");
  });
});

describe("slugFromHref", () => {
  it.each([
    ["/recettes/cat/legume", "legume"],
    ["https://www.ptitchef.com/recettes/cat/fruits-secs", "fruits-secs"],
    ["/recettes/chou-kale", "chou-kale"],
  ])("reads %s as %s", (href, slug) => {
    expect(slugFromHref(href)).toBe(slug);
  });

  it.each(["/dossiers/un-article-aid-1", "/recettes", "/recettes/", "/recettes/cat/", "/"])(
    "reads nothing from %s, which names no category",
    (href) => {
      expect(slugFromHref(href)).toBeNull();
    },
  );
});

describe("isFamilyHref", () => {
  it("tells a family's page from a category's", () => {
    expect(isFamilyHref("/recettes/cat/legume")).toBe(true);
    expect(isFamilyHref("/recettes/chou-kale")).toBe(false);
    expect(isFamilyHref("/les-mieux-notees")).toBe(false);
  });
});

describe("searchUrl", () => {
  it("sends the words through the site's own search route", () => {
    const url = new URL(searchUrl("purée & pommes"));

    expect(`${url.origin}${url.pathname}`).toBe("https://www.ptitchef.com/index.php");
    expect(url.searchParams.get("q")).toBe("purée & pommes");
    // Encoded rather than pasted: an ampersand written into the query string
    // would turn one search into two parameters.
    expect(url.toString()).not.toContain("& pommes");
  });
});

describe("fridgeUrl", () => {
  it("repeats one parameter per ingredient, as the site's own form does", () => {
    const url = new URL(fridgeUrl(["poulet", "citron vert"]));

    expect(url.searchParams.get("list_type")).toBe("fridge_search");
    expect(url.searchParams.getAll("ingred[]")).toEqual(["poulet", "citron vert"]);
  });
});

describe("listingUrl", () => {
  it("leaves the first page unnumbered, as the site writes it", () => {
    expect(listingUrl("brindilles", 1)).toBe("https://www.ptitchef.com/recettes/brindilles");
  });

  it("numbers every page after the first", () => {
    expect(listingUrl("brindilles", 4)).toBe("https://www.ptitchef.com/recettes/brindilles-page-4");
  });
});

describe("standingUrl", () => {
  it.each(STANDING_NAMES)("gives %s an address of its own", (name) => {
    expect(standingUrl(name)).toMatch(/^https:\/\/www\.ptitchef\.com\//);
  });

  it("gives nothing for a list the site does not keep", () => {
    expect(standingUrl("quickest")).toBeNull();
  });
});

describe("listingAt", () => {
  it.each([
    ["https://www.ptitchef.com/recettes/brindilles", "brindilles", 1],
    ["https://www.ptitchef.com/recettes/brindilles-page-7", "brindilles", 7],
    ["/recettes/tarte-aux-pommes-page-13", "tarte-aux-pommes", 13],
  ])("reads %s as %s page %i", (href, slug, page) => {
    expect(listingAt(href)).toEqual({ slug, page });
  });

  it.each([
    "https://www.ptitchef.com/index.php?obj=feed&action=list&q=tarte",
    "https://www.ptitchef.com/les-mieux-notees",
    "https://www.ptitchef.com/recettes",
    "https://www.ptitchef.com/recettes/",
  ])("reads nothing from %s, which is no category listing", (href) => {
    expect(listingAt(href)).toBeNull();
  });
});

describe("the identifier a recipe is read back by", () => {
  const id = "recettes/plat/spaghetti-aux-sardines-fid-1613987";
  const page = `https://www.ptitchef.com/${id}`;

  it("is the whole page path, since the site serves a recipe from nowhere else", () => {
    expect(recipeIdFrom(page)).toBe(id);
    expect(recipeIdFrom(`/${id}`)).toBe(id);
  });

  it("goes back to the address it came from", () => {
    expect(recipeUrl(id)).toBe(page);
    expect(recipeUrl(`/${id}`)).toBe(page);
  });

  it.each([
    "https://www.ptitchef.com/recettes/brindilles",
    "https://www.ptitchef.com/dossiers/un-article-aid-1",
    "https://www.ptitchef.com/recettes/plat/sans-numero",
  ])("is nothing for %s, which is no recipe address", (href) => {
    expect(recipeIdFrom(href)).toBeNull();
  });

  it("is recognised without a request being spent on it", () => {
    expect(isRecipeId(id)).toBe(true);
    expect(isRecipeId(`/${id}`)).toBe(true);
    expect(isRecipeId("recettes/brindilles")).toBe(false);
    expect(isRecipeId("")).toBe(false);
  });
});
