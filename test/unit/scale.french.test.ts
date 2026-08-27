import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

/** The line as it now reads, for a factor applied to what a page published. */
const at = (line: string, factor: number): string => scaleIngredient(line, { factor }).text;
const kindOf = (line: string, factor: number): string => scaleIngredient(line, { factor }).scaling;
const noteOf = (line: string, factor: number): string =>
  scaleIngredient(line, { factor }).note ?? "";

describe("the agreement of the thing being counted", () => {
  it("takes a plural in -aux where the noun ends in -al", () => {
    expect(at("1 bocal de cornichons", 3)).toContain("bocaux");
  });

  it("puts a noun the page wrote in -aux back in the singular", () => {
    expect(at("3 bocaux de cornichons", 1 / 3)).toContain("bocal");
  });

  it("puts a noun the page wrote in -eaux back in the singular", () => {
    expect(at("3 morceaux de sucre", 1 / 3)).toContain("morceau");
  });
});

describe("an adjective standing after the thing counted", () => {
  it("takes the plural where the vocabulary knows it", () => {
    expect(at("1 piment entier", 4)).toBe("4 piments entiers");
  });

  it("goes back to the singular alongside its noun", () => {
    expect(at("4 piments entiers", 0.25)).toBe("1 piment entier");
  });

  it("is left as the page wrote it where the vocabulary does not know it", () => {
    // A word this cannot decline is left alone rather than given an s that may
    // not belong to it.
    expect(at("1 pâte feuilletée", 2)).toContain("feuilletée");
  });
});

describe("a line offering a choice between two quantities", () => {
  it("scales each branch on its own, and is never reported as exact", () => {
    const line = "1 cuillère à soupe de sucre vanillé ou 1 cuillère à café d'extrait de vanille";

    expect(kindOf(line, 2)).toBe("rounded");
    expect(at(line, 2)).toContain("2 cuillères à soupe");
    expect(at(line, 2)).toContain("2 cuillères à café");
  });

  it("says how far one branch stands for the other is the page's own claim", () => {
    const line = "1 cuillère à soupe de sucre vanillé ou 1 cuillère à café d'extrait de vanille";

    expect(noteOf(line, 2)).toMatch(/choice between two quantities/i);
  });

  it("leaves the whole line alone when its first branch carries no quantity", () => {
    const line = "sel ou fleur de sel";

    expect(kindOf(line, 2)).toBe("unscaled");
    expect(at(line, 2)).toBe(line);
  });

  it("keeps a branch that would fall under one of its own measure as published", () => {
    const line = "1 cuillère à soupe de sucre vanillé ou 1 cuillère à café d'extrait de vanille";

    // A quarter of a teaspoon is the floor, so the second branch stays as the
    // page wrote it rather than being rewritten below what a spoon can hold.
    expect(at(line, 0.1)).toContain("1 cuillère à café");
  });
});

describe("a quantity restated beside the first", () => {
  it("moves both readings together when the bracket restates it", () => {
    const line = "450 g (1 livre) de spaghetti";

    expect(at(line, 2)).toBe("900 g (2 livres) de spaghetti");
    expect(kindOf(line, 2)).toBe("scaled");
  });

  it("says the two readings agree no more closely than the page wrote them", () => {
    // A line stating the same quantity twice, in two systems, cannot come out
    // exact in both: the pair is reported as rounded and the note says why.
    const line = "500 g / 1,1 lb de flocons";

    expect(kindOf(line, 2)).toBe("rounded");
    expect(noteOf(line, 2)).toMatch(/states one quantity twice/i);
  });
});

describe("a range of a measured quantity", () => {
  it("moves both bounds and writes them in one unit", () => {
    expect(at("25 à 30 cl de lait de coco", 2)).toBe("50 à 60 cl de lait de coco");
  });

  it("keeps the separator the page wrote", () => {
    expect(at("25-30 cl de lait de coco", 2)).toContain("-");
  });

  it("counts a range of countable things without a unit", () => {
    expect(at("1 ou 2 carottes", 3)).toBe("3 ou 6 carottes");
  });
});

describe("a quantity taken all the way down", () => {
  it("never comes back as none of the ingredient", () => {
    // A line that rounded to zero would delete an ingredient the page listed.
    const scaled = scaleIngredient("200 g de farine", { factor: 0.000_005 });

    expect(scaled.amount).toBeGreaterThan(0);
    expect(scaled.text).not.toMatch(/(^|\s)0(\s|$)/);
  });

  it("lands on the smallest share of one thing a cook can take", () => {
    expect(at("1 oeuf", 0.1)).toBe("1 oeuf");
    expect(at("1 sachet de levure", 0.1)).toContain("1/2 sachet");
  });

  it("never asks for more than the page published when a recipe is made smaller", () => {
    const scaled = scaleIngredient("1 boîte de tomates", { factor: 0.9 });

    expect(scaled.amount).toBeLessThanOrEqual(1);
  });
});

describe("a factor of one", () => {
  it("hands the line back untouched rather than rewriting it", () => {
    // Rewriting anyway would round "178 ml" to "180 ml" and report a difference
    // the caller never asked for.
    expect(at("178 ml de lait", 1)).toBe("178 ml de lait");
  });

  it("still reports what the line carries", () => {
    const passed = scaleIngredient("178 ml de lait", { factor: 1 });

    expect(passed.amount).toBe(178);
    expect(passed.unit).toBe("ml");
  });

  it("still says of a line carrying nothing that it carries nothing", () => {
    const passed = scaleIngredient("sel", { factor: 1 });

    expect(passed.scaling).toBe("unscaled");
    expect(passed.note).toMatch(/no quantity/i);
  });

  it("still says of a line whose quantity it held back why it did", () => {
    const passed = scaleIngredient("1 canette de 2 kg avec abattis", { factor: 1 });

    expect(passed.scaling).toBe("unscaled");
    expect(passed.note).toBeTruthy();
  });
});

describe("a line writing its amount as a word", () => {
  it("says which word the figure was read from", () => {
    // A caller has to see that the number came from the grammar rather than
    // from a digit the page printed.
    expect(noteOf("quelques feuilles de basilic", 2)).toMatch(/"quelques" read as/i);
    expect(at("quelques feuilles de basilic", 2)).toContain("6 feuilles");
  });

  it("reads an article as one of the measure that follows it", () => {
    expect(at("une pincée de sel", 4)).toContain("4 pincées");
  });

  it("invents no quantity where no measure follows the article", () => {
    expect(kindOf("un oignon", 2)).toBe("unscaled");
  });
});

describe("what a rounding says it moved from", () => {
  it("names the direction and the figure the arithmetic came to", () => {
    expect(noteOf("30 g de beurre", 1.37)).toMatch(/Rounded (up|down) from/i);
  });
});
