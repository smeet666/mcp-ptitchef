import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const at = (line: string, factor: number): string => scaleIngredient(line, { factor }).text;
const kindOf = (line: string, factor: number): string => scaleIngredient(line, { factor }).scaling;

describe("an adjective standing before the thing counted", () => {
  it("takes the plural where the vocabulary knows it", () => {
    expect(at("1 grosse pincée de sel", 2)).toBe("2 grosses pincées de sel");
  });

  it("goes back to the singular alongside its noun", () => {
    expect(at("2 grosses pincées de sel", 0.5)).toBe("1 grosse pincée de sel");
  });

  it("is left as the page wrote it where the vocabulary does not know it", () => {
    expect(at("1 belle pincée de sel", 2)).toContain("belle");
  });
});

describe("a line whose second half carries no quantity of its own", () => {
  it("stays one line, since it names one amount", () => {
    // "sucre ou cassonade" offers two names for one quantity, and splitting it
    // would double what the recipe asked for.
    expect(at("100 g de sucre ou cassonade", 2)).toBe("200 g de sucre ou cassonade");
  });
});

describe("a branch too small to be rewritten", () => {
  it("keeps the text the page wrote rather than one below what a spoon holds", () => {
    const line = "2 cuillères à soupe de sucre vanillé ou 1 sachet de sucre vanillé";

    expect(at(line, 0.2)).toContain("1 sachet");
  });
});

describe("a line counting something with no unit", () => {
  it("agrees the thing counted with the number", () => {
    expect(at("3 oeufs", 1 / 3)).toBe("1 oeuf");
    expect(at("1 carotte", 3)).toBe("3 carottes");
  });

  it("keeps a thing that is the same in both numbers as published", () => {
    expect(at("2 ananas", 0.5)).toBe("1 ananas");
  });
});

describe("a range of things a kitchen counts", () => {
  it("is written without a unit, since the line gives none", () => {
    expect(at("2 à 3 gousses d'ail", 2)).toBe("4 à 6 gousses d'ail");
  });

  it("is written with the unit where the line gives one", () => {
    expect(at("200 à 300 g de guanciale", 2)).toBe("400 à 600 g de guanciale");
  });
});

describe("a shrinking recipe", () => {
  it("never comes out asking for more of a measured quantity than it started with", () => {
    const scaled = scaleIngredient("102 g de beurre", { factor: 0.99 });

    expect(scaled.amount).toBeLessThanOrEqual(102);
  });
});

describe("a line whose quantity sits inside the name of what is counted", () => {
  it("is left alone and flagged rather than multiplied at the wrong place", () => {
    // Multiplying the "2 kg" of "1 canette de 2 kg" would rewrite the size of
    // the bird instead of the number of them.
    expect(kindOf("1 canette de 2 kg avec abattis", 2)).toBe("unscaled");
  });
});
