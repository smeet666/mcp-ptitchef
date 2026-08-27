import { describe, expect, it } from "vitest";

import { formatAmount, parseIngredient, parseLeadingQuantity } from "../../src/recipe/quantity.js";

describe("parseLeadingQuantity", () => {
  it("reads a plain integer", () => {
    const q = parseLeadingQuantity("200 g de farine");
    expect(q?.amount).toBe(200);
    expect(q?.length).toBe(3);
  });

  it("reads a decimal written with a dot", () => {
    expect(parseLeadingQuantity("0.5 oignon")?.amount).toBe(0.5);
  });

  it("reads a decimal written with a French comma", () => {
    expect(parseLeadingQuantity("1,5 l de lait")?.amount).toBe(1.5);
  });

  it("reads a simple fraction", () => {
    expect(parseLeadingQuantity("1/2 sachet")?.amount).toBe(0.5);
  });

  it("reads a mixed number", () => {
    expect(parseLeadingQuantity("1 1/2 verre")?.amount).toBe(1.5);
  });

  it("reads a vulgar fraction character", () => {
    expect(parseLeadingQuantity("½ citron")?.amount).toBe(0.5);
  });

  it("returns null when the line does not start with a number", () => {
    expect(parseLeadingQuantity("sel")).toBeNull();
    expect(parseLeadingQuantity("coriandre")).toBeNull();
  });

  it("does not treat a number inside a word as a quantity", () => {
    expect(parseLeadingQuantity("beurre 250 g")).toBeNull();
  });
});

describe("parseIngredient", () => {
  it("keeps the original line untouched", () => {
    const line = "200 g de farine";
    expect(parseIngredient(line).original).toBe(line);
  });

  it("splits a measured ingredient into amount, unit and item", () => {
    const p = parseIngredient("200 g de farine");
    expect(p.amount).toBe(200);
    expect(p.unit?.canonical).toBe("g");
    expect(p.unit?.kind).toBe("measured");
    expect(p.item).toBe("farine");
  });

  it("treats a bare count as a unitless countable", () => {
    const p = parseIngredient("3 oeufs");
    expect(p.amount).toBe(3);
    expect(p.unit).toBeNull();
    expect(p.item).toBe("oeufs");
  });

  it("keeps the qualifier attached to the item", () => {
    const p = parseIngredient("0.5 oignon coupée en cubes");
    expect(p.amount).toBe(0.5);
    expect(p.unit).toBeNull();
    expect(p.item).toBe("oignon coupée en cubes");
  });

  it("reads a fractional portioned amount", () => {
    const p = parseIngredient("1/2 sachet de levure");
    expect(p.amount).toBe(0.5);
    expect(p.unit?.canonical).toBe("sachet");
    expect(p.unit?.kind).toBe("portioned");
    expect(p.item).toBe("levure");
  });

  it("reads a mixed number with a portioned unit", () => {
    const p = parseIngredient("1 1/2 verre de lait");
    expect(p.amount).toBe(1.5);
    expect(p.unit?.canonical).toBe("verre");
    expect(p.item).toBe("lait");
  });

  it("reads a French comma decimal with a measured unit", () => {
    const p = parseIngredient("1,5 l de lait");
    expect(p.amount).toBe(1.5);
    expect(p.unit?.canonical).toBe("l");
    expect(p.unit?.kind).toBe("measured");
    expect(p.item).toBe("lait");
  });

  it("reads a vulgar fraction", () => {
    const p = parseIngredient("½ citron");
    expect(p.amount).toBe(0.5);
    expect(p.item).toBe("citron");
  });

  it("has no amount when the line carries none", () => {
    const p = parseIngredient("sel");
    expect(p.amount).toBeNull();
    expect(p.unit).toBeNull();
    expect(p.item).toBe("sel");
  });

  it("consumes a multi-word unit whole", () => {
    const p = parseIngredient("2 cuillères à soupe de sucre");
    expect(p.amount).toBe(2);
    expect(p.unit?.canonical).toBe("cuillère à soupe");
    expect(p.unit?.kind).toBe("portioned");
    // The tail of the unit must not leak into the item.
    expect(p.item).toBe("sucre");
    expect(p.item).not.toMatch(/soupe/);
  });

  it("recognises the abbreviated multi-word unit", () => {
    const p = parseIngredient("2 c. à soupe de sucre");
    expect(p.unit?.canonical).toBe("cuillère à soupe");
    expect(p.item).toBe("sucre");
  });

  it("recognises a vague unit", () => {
    const p = parseIngredient("1 pincée de sel");
    expect(p.amount).toBe(1);
    expect(p.unit?.kind).toBe("vague");
    expect(p.item).toBe("sel");
  });

  it("reads the article a recipe writes before an approximate measure", () => {
    const p = parseIngredient("une pincée de bicarbonate de soude");
    expect(p.amount).toBe(1);
    expect(p.articleWord).toBe("une");
    expect(p.unit?.canonical).toBe("pincée");
    expect(p.item).toBe("bicarbonate de soude");

    expect(parseIngredient("quelques gouttes de vanille").amount).toBe(3);
    expect(parseIngredient("un trait de vinaigre").amount).toBe(1);
  });

  it("leaves an article that stands before a countable thing", () => {
    // Telling "un oignon" from "un bouquet" takes a noun list this parser has
    // no business carrying, so the line keeps its published wording.
    const p = parseIngredient("un oignon");
    expect(p.amount).toBeNull();
    expect(p.articleWord).toBeNull();
  });

  it("strips every form of the leading article from the item", () => {
    expect(parseIngredient("200 g de farine").item).toBe("farine");
    expect(parseIngredient("25 cl d'eau").item).toBe("eau");
    expect(parseIngredient("100 g du beurre").item).toBe("beurre");
    expect(parseIngredient("2 tranches des pommes").item).toBe("pommes");
    expect(parseIngredient("25 cl de la crème").item).toBe("crème");
    expect(parseIngredient("25 cl de l'huile").item).toBe("huile");
  });

  it("does not strip a word that merely starts with the article letters", () => {
    expect(parseIngredient("200 g dessert").item).toBe("dessert");
  });

  it("preserves the unit text as written", () => {
    expect(parseIngredient("2 cuillères à soupe de sucre").unitText).toBe("cuillères à soupe");
  });
});

describe("formatAmount", () => {
  it("renders integers plainly", () => {
    expect(formatAmount(1)).toBe("1");
    expect(formatAmount(6)).toBe("6");
    expect(formatAmount(400)).toBe("400");
  });

  it("renders the cook's fractions as fractions", () => {
    expect(formatAmount(0.25)).toBe("1/4");
    expect(formatAmount(1 / 3)).toBe("1/3");
    expect(formatAmount(0.5)).toBe("1/2");
    expect(formatAmount(2 / 3)).toBe("2/3");
    expect(formatAmount(0.75)).toBe("3/4");
  });

  it("renders any other decimal with a French comma", () => {
    expect(formatAmount(0.2)).toBe("0,2");
    expect(formatAmount(2.4)).toBe("2,4");
  });

  it("renders one and a half without a dot", () => {
    // Ambiguous in the spec: "1,5" or "1 1/2" both read naturally in French.
    expect(formatAmount(1.5)).not.toContain(".");
    expect(["1,5", "1 1/2"]).toContain(formatAmount(1.5));
  });

  it("never emits a decimal dot", () => {
    for (const n of [0.1, 0.35, 1.25, 2.75, 12.5, 133.4]) {
      expect(formatAmount(n)).not.toContain(".");
    }
  });
});
