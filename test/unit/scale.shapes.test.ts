import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a whole number followed by a fraction glyph", () => {
  it("reads the fraction rather than carrying it into the item", () => {
    const result = scale("3 ¼ tasses de flocons", 2);
    expect(result.text).toBe("6 1/2 tasses de flocons");
    expect(result.amount).toBe(6.5);
  });

  it("reads the glyph written against the number", () => {
    expect(scale("1½ cuillère à soupe de sucre", 2).amount).toBe(3);
  });
});

describe("the plural mark a page writes in brackets", () => {
  it("looks the measure up without it", () => {
    const result = scale("4 cuillère(s) à soupe de crème", 2);
    expect(result.unit).toBe("cuillère à soupe");
    expect(result.text).toBe("8 cuillères à soupe de crème");
  });
});

describe("a comma between digits", () => {
  it("reads it as the decimal mark French writes", () => {
    expect(scale("1,500 kg de farine", 2)).toMatchObject({ amount: 3, unit: "kg" });
  });

  it("refuses a number grouped the way French never groups one", () => {
    const result = scale("1,500,000 mg de sel", 2);
    expect(result.text).toBe("1,500,000 mg de sel");
    expect(result.scaling).toBe("unscaled");
    expect(result.note).toMatch(/virgule|comma/i);
  });
});

describe("a line offering a choice between two quantities", () => {
  it("scales each branch rather than leaving the second as published", () => {
    const result = scale("1 cuillère à soupe de sucre ou 1 cuillère à café de miel", 2);
    expect(result.text).toBe("2 cuillères à soupe de sucre ou 2 cuillères à café de miel");
    expect(result.scaling).toBe("rounded");
    expect(result.note).toMatch(/choice between two quantities/i);
  });

  it("scales a second branch that counts something else", () => {
    expect(scale("150 dés de jambon ou 4 tranches de jambon", 2).text).toBe(
      "300 dés de jambon ou 8 tranches de jambon",
    );
  });

  it("leaves a line whose second branch names no quantity in one piece", () => {
    expect(scale("100 g de sucre ou cassonade", 2).text).toBe("200 g de sucre ou cassonade");
  });
});

describe("a measure the page restates in brackets", () => {
  it("scales the bracket with the amount it stands beside", () => {
    expect(scale("450 g (1 livre) de spaghetti", 2).text).toBe("900 g (2 livres) de spaghetti");
  });

  it("leaves a bracket holding prose alone", () => {
    expect(scale("1 boîte de lait concentré sucré (397 g)", 2).text).toBe(
      "2 boîtes de lait concentré sucré (397 g)",
    );
  });
});

describe("a measure the page restates after a slash", () => {
  it("moves both readings together", () => {
    const result = scale("500 g / 1.1 lb de flocons d'avoine", 2);
    expect(result.text).toBe("1 kg / 2,2 lb de flocons d'avoine");
    expect(result.scaling).toBe("rounded");
  });
});

describe("a number that qualifies the size of one thing", () => {
  it("leaves a hyphenated size as published", () => {
    expect(scale("2-cm de gingembre frais", 2).scaling).toBe("unscaled");
  });
});

describe("a quantity already stated per person", () => {
  it("does not apply the factor a second time", () => {
    const result = scale("2 pommes de terre par personne", 2);
    expect(result.text).toBe("2 pommes de terre par personne");
    expect(result.scaling).toBe("unscaled");
    expect(result.note).toMatch(/one person/i);
  });
});

describe("a number the page introduced as approximate", () => {
  it("scales the amount and keeps the word that says it is loose", () => {
    const result = scale("environ 6 citrons", 2);
    expect(result.text).toBe("environ 12 citrons");
    expect(result.amount).toBe(12);
    expect(result.note).toMatch(/approximation/i);
  });

  it("scales an amount introduced by a sign", () => {
    expect(scale("~1 verre d'eau", 2).text).toBe("~2 verres d'eau");
  });
});

describe("an adjective standing between the number and the measure", () => {
  it("reads the measure behind it", () => {
    const result = scale("1 grosse pincée de sel", 2);
    expect(result.unit).toBe("pincée");
    expect(result.text).toBe("2 grosses pincées de sel");
  });

  it("reads a container behind it", () => {
    const result = scale("1 grande boîte de tomates", 2);
    expect(result.unit).toBe("boîte");
    expect(result.text).toBe("2 grandes boîtes de tomates");
  });
});

describe("a second quantity the line carries after the first", () => {
  it("says that only the first was scaled", () => {
    const result = scale("20 g de levure dissoute dans 1 cuillère à soupe d'eau tiède", 2);
    expect(result.text).toMatch(/^40 g/);
    expect(result.note).toMatch(/further quantity after the first one/i);
  });
});

describe("the step a measured amount rounds to between one and ten", () => {
  it("keeps a tenth, because a unit can be a kilo as readily as a gram", () => {
    expect(scale("2,2 kg de boeuf", 0.5)).toMatchObject({ amount: 1.1, scaling: "scaled" });
    expect(scale("1.2 kg de morue", 2)).toMatchObject({ amount: 2.4, scaling: "scaled" });
    expect(scale("2.5 kg de figues fraîches", 0.5).amount).toBe(1.3);
  });
});

describe("a spoon divided past what a spoon can hold", () => {
  it("states the share in the smaller spoon", () => {
    expect(scale("1 cuillère à soupe d'huile", 0.25).text).toBe("3/4 cuillère à café d'huile");
  });

  it("walks a cup down to the spoon", () => {
    expect(scale("1 tasse de riz", 0.25).text).toBe("4 cuillères à soupe de riz");
  });
});

describe("choosing one unit for both ends of a range", () => {
  it("chooses from the lower bound, so both ends stay readable", () => {
    expect(scale("450 à 1000 g de farine", 1).text).toBe("450 à 1000 g de farine");
    expect(scale("225-500 g de guanciale", 2).text).toBe("450-1000 g de guanciale");
  });

  it("reports the lower bound in `amount` and the upper one in `amount_max`", () => {
    expect(scale("200-300 g de guanciale", 2)).toMatchObject({ amount: 400, amount_max: 600 });
  });
});

describe("a range whose ends land on the same amount", () => {
  it("states the one amount rather than a range of it to itself", () => {
    const result = scale("1-2 oeufs", 0.5);
    expect(result.text).toBe("1 oeuf");
    expect(result.amount_max).toBeNull();
    expect(result.note).toMatch(/both ends come to the same amount/i);
  });
});

describe("a factor of one", () => {
  it("changes nothing rather than rewriting the line", () => {
    expect(scale("178 ml de lait", 1)).toMatchObject({ text: "178 ml de lait", amount: 178 });
  });
});

describe("a recipe being made smaller", () => {
  it("never comes out asking for more than the page published", () => {
    expect(scale("104 g de sucre", 0.99).text).toBe("104 g de sucre");
  });
});

describe("what counts as landing on the exact product", () => {
  it("calls a hundredth off a thousandth rounded rather than exact", () => {
    expect(scale("1 mg de safran", 0.006).scaling).toBe("rounded");
  });
});

describe("a quantity smaller than a kitchen scale resolves", () => {
  it("says so rather than handing back a figure alone", () => {
    expect(scale("1 mg de safran", 0.000_03).note).toMatch(/kitchen scale resolves/i);
  });
});

describe("an approximate measure", () => {
  it("names what a kitchen usually takes one to be", () => {
    expect(scale("1 pincée de sel", 2).note).toMatch(
      /A pincée is an approximate measure, commonly taken as about half a teaspoon\./,
    );
  });
});

describe("a range whose two ends both moved", () => {
  it("names each end with the direction it moved in", () => {
    const note = scale("2 à 3 gousses d'ail", 0.3).note ?? "";
    expect(note).toMatch(/Rounded down from 0,6 gousse\./);
    expect(note).toMatch(/Rounded up from 0,9 gousse\./);
  });
});

describe("how far a gousse d'ail divides", () => {
  // The cook who uses these recipes settled it: a gousse is split in two and no
  // finer.
  it("stops at the half", () => {
    expect(scale("1 gousse d'ail", 0.25).text).toBe("1/2 gousse d'ail");
  });

  it("keeps halving a count that lands on a half by itself", () => {
    expect(scale("5 gousses d'ail", 0.5).text).toBe("2 1/2 gousses d'ail");
  });
});

describe("small things a recipe counts one by one", () => {
  it("keeps a baie de genièvre whole", () => {
    expect(scale("1 baie de genièvre", 0.5).text).toBe("1 baie de genièvre");
  });

  it("keeps a baie de genévrier whole", () => {
    expect(scale("1 baie de genévrier", 0.5).text).toBe("1 baie de genévrier");
  });

  it("keeps an étoile de badiane whole", () => {
    expect(scale("1 étoile de badiane", 0.5).text).toBe("1 étoile de badiane");
  });

  it("keeps an anis étoilé whole", () => {
    expect(scale("1 anis étoilé", 0.5).text).toBe("1 anis étoilé");
  });
});
