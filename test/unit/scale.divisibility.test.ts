/**
 * Counted things the general criterion does not settle on its own.
 *
 * A counted thing divides as far as the smallest share a cook can take out of
 * one and still do something with the rest, and almost everything a recipe
 * counts stops at the half. The lines below name the ones decided by what the
 * thing is rather than by the word that counts it: a bud that has no half, a
 * zest taken in one piece, foods a knife takes to a quarter, measures and
 * containers holding enough that a quarter is still a portion, cuts of meat
 * that stop at the half, a word standing for a number of things, and a word
 * covering two different foods at once.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a clou de girofle is counted whole", () => {
  it("lands on a whole number rather than on a half", () => {
    expect(scale("3 clous de girofle", 0.5).amount).toBe(2);
  });

  it("keeps one in the recipe rather than a share of one", () => {
    expect(scale("1 clou de girofle", 0.5).amount).toBe(1);
  });
});

describe("a zeste is taken whole", () => {
  it("keeps the whole zest when the recipe shrinks", () => {
    const result = scale("1 zeste de citron", 0.5);
    expect(result.amount).toBe(1);
    expect(result.text).toBe("1 zeste de citron");
  });

  it("holds even though the fruit itself is quartered", () => {
    expect(scale("1 citron", 0.5).amount).toBe(0.5);
  });
});

describe("a whole food a knife takes to a quarter", () => {
  const quartered = [
    ["1 pastèque", "1/4 pastèque"],
    ["1 pintade", "1/4 pintade"],
    ["1 poireau", "1/4 poireau"],
    ["1 banane", "1/4 banane"],
    ["1 mangue", "1/4 mangue"],
    ["1 avocat", "1/4 avocat"],
    ["1 poulet", "1/4 poulet"],
    ["1 reblochon", "1/4 reblochon"],
    ["1 rôti de porc", "1/4 rôti de porc"],
    ["1 bûche de saumon", "1/4 bûche de saumon"],
  ];

  for (const [line, expected] of quartered) {
    it(`takes a quarter of "${line}"`, () => {
      const result = scale(line!, 0.25);
      expect(result.amount).toBe(0.25);
      expect(result.text).toBe(expected);
    });
  }
});

describe("a portion cut off a bird or a joint stops at the half", () => {
  it("halves a cuisse, an aile and a pilon", () => {
    for (const line of ["3 cuisses de poulet", "2 ailes de poulet", "1 pilon de poulet"]) {
      expect(scale(line, 0.1).amount, line).toBe(0.5);
    }
  });

  it("halves an escalope and a magret", () => {
    expect(scale("1 escalope de veau", 0.1).amount).toBe(0.5);
    expect(scale("1 magret de canard", 0.1).amount).toBe(0.5);
  });
});

describe("a measure cut off something larger goes to the quarter", () => {
  // The cook who uses these recipes settled how far a gousse goes: it is split
  // in two and no finer.
  it("takes a half of a gousse", () => {
    const result = scale("1 gousse d'ail", 0.25);
    expect(result.amount).toBe(0.5);
    expect(result.text).toBe("1/2 gousse d'ail");
  });

  it("gives one gousse where four are reduced to a quarter", () => {
    expect(scale("4 gousses d'ail", 0.25).text).toBe("1 gousse d'ail");
  });

  it("takes a quarter of a tranche", () => {
    expect(scale("1 tranche de pain", 0.25).amount).toBe(0.25);
  });
});

describe("a container holding enough for a quarter to be a portion", () => {
  it("takes a quarter of a pot", () => {
    const result = scale("1 pot de crème fraîche", 0.25);
    expect(result.amount).toBe(0.25);
    expect(result.text).toBe("1/4 pot de crème fraîche");
  });

  it("takes a quarter of a pot the line names inside the item", () => {
    expect(scale("1 petit pot de crème", 0.25).amount).toBe(0.25);
  });

  it("takes a quarter of a bouteille", () => {
    const result = scale("1 bouteille de vin", 0.25);
    expect(result.amount).toBe(0.25);
    expect(result.text).toBe("1/4 bouteille de vin");
  });
});

describe("a douzaine states how many things are counted", () => {
  it("counts the things themselves, twelve to the douzaine", () => {
    const result = scale("2 douzaines d'escargots", 0.75);
    expect(result.amount).toBe(18);
    expect(result.text).toBe("18 escargots");
  });

  it("reads the same when the line writes the count as a word", () => {
    expect(scale("une douzaine d'oeufs", 0.5).text).toBe("6 oeufs");
  });
});

describe("a blanc is divided by which blanc it is", () => {
  it("counts the white of an egg whole, as the egg and the yolk are", () => {
    for (const line of ["2 blancs d'oeufs", "2 blancs d'œufs"]) {
      expect(scale(line, 0.5).amount, line).toBe(1);
    }
    expect(scale("1 blanc d'oeuf", 0.5).amount).toBe(1);
  });

  it("halves the breast of a bird, which is a piece of meat", () => {
    for (const line of ["1 blanc de poulet", "1 blanc de dinde"]) {
      expect(scale(line, 0.5).amount, line).toBe(0.5);
    }
  });

  it("halves the meat even when the line also names a fruit", () => {
    expect(scale("2 blancs de poulet aux pommes", 0.25).amount).toBe(0.5);
  });

  it("leaves the colour alone, which names no blanc at all", () => {
    expect(scale("1 oignon blanc", 0.25).amount).toBe(0.25);
    expect(scale("1 bouteille de vin blanc", 0.25).amount).toBe(0.25);
  });
});

describe("what the criterion already settled stays settled", () => {
  it("keeps an oeuf whole", () => {
    expect(scale("1 oeuf", 0.5).amount).toBe(1);
  });

  it("splits a boîte in two", () => {
    expect(scale("1 boîte de tomates", 0.5).amount).toBe(0.5);
  });

  it("takes an oignon to a quarter", () => {
    expect(scale("1 oignon", 0.25).amount).toBe(0.25);
  });
});

describe("a feuille, whichever leaf it names", () => {
  it("splits a feuille de laurier in two, as a pair of scissors does", () => {
    expect(scale("1 feuille de laurier", 1.5).text).toBe("1 1/2 feuille de laurier");
  });

  it("splits a feuille de gélatine the same way", () => {
    expect(scale("1 feuille de gélatine", 1.5).text).toBe("1 1/2 feuille de gélatine");
  });
});
