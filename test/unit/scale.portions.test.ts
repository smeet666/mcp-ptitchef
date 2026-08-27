/**
 * How finely a counted thing divides, decided by the size of one against what a
 * recipe puts in.
 *
 * A recipe counting twelve of something is counting things that are each
 * already a portion, and a smaller recipe puts fewer of them in the pan. A
 * recipe counting one is counting something a knife then takes a share out of.
 * The two families below are the two ends of that one comparison.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a thing that is already a portion is counted whole", () => {
  it("lands on whole numbers for the shellfish a recipe counts by the dozen", () => {
    expect(scale("12 crevettes", 0.5).text).toBe("6 crevettes");
    expect(scale("5 crevettes", 0.5).amount).toBe(3);
    expect(scale("12 moules", 0.5).text).toBe("6 moules");
    expect(scale("6 gambas", 0.25).amount).toBe(2);
    expect(scale("3 langoustines", 0.5).amount).toBe(2);
  });

  it("lands on whole numbers for the seeds and buds a recipe counts out", () => {
    expect(scale("20 grains de poivre", 0.5).text).toBe("10 grains de poivre");
    expect(scale("3 grains de poivre", 0.5).amount).toBe(2);
    expect(scale("3 baies de genièvre", 0.5).amount).toBe(2);
    expect(scale("1 anis étoilé", 0.5).amount).toBe(1);
  });

  it("keeps one nut rather than a share of one", () => {
    expect(scale("1 noisette de beurre", 0.5).amount).toBe(1);
    expect(scale("5 noisettes", 0.5).amount).toBe(3);
  });
});

describe("a thing a recipe asks one of is taken to a quarter", () => {
  it("quarters the joints and the loaves a knife carves", () => {
    expect(scale("1 gigot d'agneau", 0.25).text).toBe("1/4 gigot d'agneau");
    expect(scale("1 baguette", 0.25).text).toBe("1/4 baguette");
  });

  it("quarters the cheeses a recipe asks one of", () => {
    expect(scale("1 camembert", 0.25).text).toBe("1/4 camembert");
    expect(scale("1 fromage de chèvre", 0.25).amount).toBe(0.25);
    expect(scale("1 chèvre frais", 0.25).amount).toBe(0.25);
    expect(scale("1 chorizo", 0.25).amount).toBe(0.25);
  });

  it("quarters the fruit a recipe cuts up", () => {
    expect(scale("1 ananas", 0.25).text).toBe("1/4 ananas");
    expect(scale("1 pêche", 0.25).amount).toBe(0.25);
    expect(scale("1 abricot", 0.25).amount).toBe(0.25);
  });

  it("quarters a bare lait, which a line counts as what it was bought in", () => {
    expect(scale("1 lait de coco", 0.25).amount).toBe(0.25);
  });
});

describe("a jus stops at the half", () => {
  it("takes the half a squeezed fruit gives", () => {
    expect(scale("1 jus de citron", 0.5).text).toBe("1/2 jus de citron");
  });

  it("comes back up to the half when a quarter is asked for", () => {
    const result = scale("1 jus de citron", 0.25);
    expect(result.amount).toBe(0.5);
    expect(result.text).toBe("1/2 jus de citron");
  });
});

describe("a number and the thing it counts agree at one", () => {
  it("puts the head word back in the singular", () => {
    expect(scale("2 clous de girofle", 0.5).text).toBe("1 clou de girofle");
    expect(scale("2 crevettes", 0.5).text).toBe("1 crevette");
    expect(scale("2 moules", 0.5).text).toBe("1 moule");
    expect(scale("2 noisettes", 0.5).text).toBe("1 noisette");
    expect(scale("2 langoustines", 0.5).text).toBe("1 langoustine");
    expect(scale("2 grains de poivre", 0.5).text).toBe("1 grain de poivre");
    expect(scale("2 baies de genièvre", 0.5).text).toBe("1 baie de genièvre");
    expect(scale("2 kiwis", 0.5).text).toBe("1 kiwi");
  });

  it("leaves alone the nouns whose singular already ends in -s", () => {
    expect(scale("2 gambas", 0.5).text).toBe("1 gambas");
    expect(scale("2 anis étoilés", 0.5).text).toBe("1 anis étoilé");
    expect(scale("2 ananas", 0.5).text).toBe("1 ananas");
    expect(scale("4 radis", 0.5).text).toBe("2 radis");
    expect(scale("2 jus de citron", 0.5).text).toBe("1 jus de citron");
  });
});
