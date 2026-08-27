import { describe, expect, it } from "vitest";
import { parseIngredient } from "../../src/recipe/quantity.js";
import { passthroughIngredients, scaleIngredient } from "../../src/recipe/scale.js";

const at = (line: string, factor: number): string => scaleIngredient(line, { factor }).text;

describe("a fraction written after its measure", () => {
  it("belongs to the amount, as French writes one and a half", () => {
    // Reading the whole number alone leaves the fraction in the ingredient's
    // name, where it is neither multiplied nor removed, and the answer states a
    // third less than the page did.
    expect(parseIngredient("1 pot 1/2 de sucre").amount).toBe(1.5);
    expect(at("1 pot 1/2 de sucre", 2)).toBe("3 pots de sucre");
    expect(at("1 litre 1/2 de lait", 2)).toBe("3 l de lait");
  });

  it("agrees with the same amount written in front of the measure", () => {
    expect(at("1 pot 1/2 de sucre", 3)).toBe(at("1 1/2 pot de sucre", 3));
  });

  it("is not read where no measure came first", () => {
    // A fraction opening what is left of a line belongs to what it introduces.
    expect(parseIngredient("2 pommes 1/2 mûres").amount).toBe(2);
  });

  it("is not read where it divides by zero", () => {
    expect(parseIngredient("1 pot 1/0 de sucre").amount).toBe(1);
  });

  it("is not read on a line already stating a range", () => {
    expect(parseIngredient("2 à 3 pots 1/2 de sucre").amount).toBe(2);
  });
});

describe("a fraction introducing its measure through a partitive", () => {
  it("names a share of that measure rather than of a countable thing", () => {
    // Left as a countable thing, a quarter of a litre cannot be taken below the
    // floor a kitchen puts on one of a thing, and a tenth of the recipe leaves
    // the milk untouched.
    const parsed = parseIngredient("1/4 de litre de lait");

    expect(parsed.amount).toBe(0.25);
    expect(parsed.unit?.canonical).toBe("l");
    expect(parsed.item).toBe("lait");
  });

  it("comes down the ladder like the same volume written plainly", () => {
    expect(at("1/4 de litre de lait", 0.1)).toBe("2,5 cl de lait");
  });

  it("leaves a partitive alone where no measure follows it", () => {
    expect(parseIngredient("1/2 de la pâte").unit).toBeNull();
  });

  it("leaves a partitive alone where the amount is a whole number", () => {
    // "2 de litre" is not French, and reading it would invent a unit.
    expect(parseIngredient("2 de litre de lait").unit).toBeNull();
  });
});

describe("a measure the line states behind the name", () => {
  it("is read, since the page states grams as plainly either way", () => {
    const parsed = parseIngredient("lardons (200 à 300 g)");

    expect(parsed.amount).toBe(200);
    expect(parsed.amountMax).toBe(300);
    expect(parsed.item).toBe("lardons");
    expect(at("lardons (200 à 300 g)", 2)).toBe("400 à 600 g de lardons");
  });

  it("is left alone where the bracket names another ingredient", () => {
    // "(200 g de crevettes)" measures something the line does not count.
    const parsed = parseIngredient("2 pavés de saumon (200 g de crevettes roses)");

    expect(parsed.amount).toBe(2);
    expect(at("2 pavés de saumon (200 g de crevettes roses)", 2)).toContain(
      "(200 g de crevettes roses)",
    );
  });

  it("is left alone where the bracket holds a remark", () => {
    expect(parseIngredient("chapelure (maison de préférence)").amount).toBeNull();
  });

  it("is left alone where the bracket never closes the line", () => {
    expect(parseIngredient("lardons (200 g fumés").amount).toBeNull();
  });

  it("is left alone where nothing precedes the bracket", () => {
    // A line that is only a bracket names nothing to measure.
    expect(parseIngredient("(200 g)").amount).toBeNull();
  });

  it("is left alone where the bracket is empty", () => {
    expect(parseIngredient("lardons ()").amount).toBeNull();
  });
});

describe("a count past a handful landing on a half", () => {
  it("is rounded, since the half means nothing beside the number it hangs on", () => {
    expect(at("7 pommes golden", 62.5)).toBe("438 pommes golden");
    expect(scaleIngredient("7 pommes golden", { factor: 62.5 }).scaling).toBe("rounded");
  });

  it("keeps the half on a count a cook still measures out", () => {
    expect(at("5 gousses d'ail", 0.5)).toBe("2 1/2 gousses d'ail");
  });
});

describe("a figure read out of a word", () => {
  it("is named on a line handed back as published, as it is when scaled", () => {
    // The page prints no number here. A caller has to be able to see that this
    // server read one.
    const [line] = passthroughIngredients(["Quelques feuilles de mâche"]);

    expect(line?.amount).toBe(3);
    expect(line?.note).toContain('"Quelques" read as 3.');
  });

  it("is named alongside whatever else the line had to say", () => {
    const [line] = passthroughIngredients(["une pincée de sel"]);

    expect(line?.note).toContain('"une" read as 1.');
    expect(line?.note).toMatch(/approximate measure/i);
  });

  it("credits the word with what it gave, not with what a multiplier made of it", () => {
    // "une douzaine" states one douzaine and twelve escargots. Quoting twelve
    // back would credit the word with a figure it never gave.
    const [line] = passthroughIngredients(["une douzaine d'escargots"]);

    expect(line?.amount).toBe(12);
    expect(line?.note).toContain('"une" read as 1.');
  });

  it("is not named on a line that printed its own number", () => {
    const [line] = passthroughIngredients(["200 g de farine"]);

    expect(line?.note).toBeUndefined();
  });
});

describe("a vague measure taken below its floor", () => {
  it("says its proportion was broken, as every other measure does", () => {
    const scaled = scaleIngredient("1 pincée de sel", { factor: 0.1 });

    expect(scaled.note).toMatch(/no longer holds its share/i);
  });
});

describe("a line too long to read, on a list handed back as published", () => {
  it("comes back whole, saying why it was not read", () => {
    const [line] = passthroughIngredients([`${"1,".repeat(30_000)} g de farine`]);

    expect(line?.scaling).toBe("unscaled");
    expect(line?.note).toMatch(/past the 500/i);
  });
});
