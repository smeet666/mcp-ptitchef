import { describe, expect, it } from "vitest";
import { parseYield } from "../../src/recipe/duration.js";
import {
  formatAmount,
  parseIngredient,
  parseLeadingQuantity,
  parseLeadingRange,
} from "../../src/recipe/quantity.js";

describe("a yield the page states in words alone", () => {
  it("keeps the wording and states no count, rather than reading one from nowhere", () => {
    const read = parseYield("quelques parts");

    expect(read.count).toBeNull();
    expect(read.unit).toBeNull();
    expect(read.text).toBe("quelques parts");
  });

  it("keeps the unit beside the count where the page writes one", () => {
    // "15 pièces" and "6 personnes" are different claims, so the wording that
    // says which is kept rather than dropped for the number.
    expect(parseYield("15 pièces")).toEqual({ count: 15, unit: "pièces", text: "15 pièces" });
  });

  it("states no unit where the page writes a bare number", () => {
    expect(parseYield("4")).toEqual({ count: 4, unit: null, text: "4" });
  });
});

describe("a quantity written as a fraction", () => {
  it.each([
    ["1/2", 0.5],
    ["3/4", 0.75],
    ["1 1/2", 1.5],
    ["½", 0.5],
    ["¼", 0.25],
    ["1 ½", 1.5],
  ])("reads %s as %s", (written, amount) => {
    expect(parseLeadingQuantity(written)?.amount).toBe(amount);
  });

  it("stops at the whole number when the fraction under it divides by zero", () => {
    // "1/0" names no quantity, so the 1 in front of it is all there is to read.
    expect(parseLeadingQuantity("1/0 pomme")?.amount).toBe(1);
    expect(parseLeadingQuantity("1 1/0 pomme")?.amount).toBe(1);
  });

  it("reads nothing from a line opening on a word", () => {
    expect(parseLeadingQuantity("beurre pommade")).toBeNull();
  });
});

describe("a range", () => {
  it("reads both bounds, whichever word joins them", () => {
    expect(parseLeadingRange("2 à 3 gousses")?.amount).toBe(2);
    expect(parseLeadingRange("2 à 3 gousses")?.max).toBe(3);
    expect(parseLeadingRange("1 ou 2 carottes")?.max).toBe(2);
    expect(parseLeadingRange("25-30 cl")?.max).toBe(30);
  });

  it("keeps the separator the page wrote, so the rewrite reads as published", () => {
    expect(parseLeadingRange("2 à 3 gousses")?.separator).toBe("à");
    expect(parseLeadingRange("25-30 cl")?.separator).toBe("-");
  });

  it("refuses a pair joined by a slash, which states one quantity twice", () => {
    // "500 g / 1.1 lb" is the same amount written again, and reading it as a
    // range would turn one quantity into two.
    expect(parseLeadingRange("500/1000 g")).toBeNull();
  });

  it("refuses a decreasing pair, which is no range", () => {
    expect(parseLeadingRange("3 à 2 gousses")).toBeNull();
  });

  it("refuses a line with no second bound", () => {
    expect(parseLeadingRange("2 gousses")).toBeNull();
  });
});

describe("a quantity restated between brackets", () => {
  it("is taken with the amount before it when the whole bracket is a measure", () => {
    const parsed = parseIngredient("450 g (1 livre) de spaghetti");

    expect(parsed.amount).toBe(450);
    expect(parsed.alternates.length).toBeGreaterThan(0);
  });

  it("is left in the name when the bracket is prose", () => {
    const parsed = parseIngredient("2 tasses de chili (maison ou en boîte)");

    expect(parsed.alternates).toEqual([]);
    expect(parsed.item).toContain("(maison ou en boîte)");
  });

  it("is left in the name when the bracket never closes", () => {
    const parsed = parseIngredient("450 g (1 livre de spaghetti");

    expect(parsed.alternates).toEqual([]);
  });

  it("is left in the name when the bracket opens on a word", () => {
    const parsed = parseIngredient("450 g (environ) de spaghetti");

    expect(parsed.alternates).toEqual([]);
  });

  it("is left in the name when the bracket carries more than a measure", () => {
    const parsed = parseIngredient("450 g (1 livre bien tassée) de spaghetti");

    expect(parsed.alternates).toEqual([]);
  });
});

describe("formatAmount", () => {
  it("writes a French decimal with a comma where fractions are not wanted", () => {
    // Mass and volume are decimal by nature: nobody weighs "8 1/3 kg".
    expect(formatAmount(1.5, { fractions: false })).toBe("1,5");
    expect(formatAmount(8.33, { fractions: false })).toBe("8,33");
  });

  it("keeps the significant digits of a quantity that survived a heavy division", () => {
    // Rounding to two decimals here would hand the ingredient back as none of it.
    expect(formatAmount(0.0002, { fractions: false })).toBe("0,0002");
  });

  it("magnets a count onto the fractions a kitchen uses", () => {
    expect(formatAmount(0.33)).toBe("1/3");
    expect(formatAmount(2.5)).toBe("2 1/2");
  });

  it("writes nothing for an amount that is not a number", () => {
    // An empty string rather than "NaN", which would read as a quantity.
    expect(formatAmount(Number.NaN)).toBe("");
    expect(formatAmount(Number.POSITIVE_INFINITY)).toBe("");
  });
});
