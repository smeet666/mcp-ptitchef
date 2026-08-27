/**
 * A figure that gives the size of one thing rather than how many.
 *
 * "1 dinde de 3 kg" counts one bird and states what it weighs. Multiplying the
 * count sends a cook after a second bird, and half of one, for a line that only
 * ever asked for a bigger one. Such a line comes back as the page wrote it, and
 * the note says which of the two figures the reader should act on.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a mass or a volume attached to the thing counted", () => {
  const sized = [
    "1 dinde de 3 kg",
    "1 poulet de 1,5 kg",
    "1 rôti de 800 g",
    "1 poisson de 2 kg",
    "1 pastèque de 4 kg",
  ];

  for (const line of sized) {
    it(`returns "${line}" as published`, () => {
      const result = scale(line, 1.5);

      expect(result.text).toBe(line);
      expect(result.scaling).toBe("unscaled");
      expect(result.amount).toBeNull();
    });
  }

  it("says the figure gives a size, and what to buy instead of half a bird", () => {
    const result = scale("1 dinde de 3 kg", 1.5);

    expect(result.note).toMatch(/size/i);
    expect(result.note, "a cook needs to be told to take a bigger one").toMatch(/bigger|larger/i);
  });

  it("holds the line back whichever way the factor goes", () => {
    expect(scale("1 dinde de 3 kg", 0.5).text).toBe("1 dinde de 3 kg");
  });

  it("holds back a count stated as a word", () => {
    expect(scale("une dinde de 3 kg", 1.5).text).toBe("une dinde de 3 kg");
  });
});

describe("a second figure that restates the first", () => {
  it("keeps scaling both readings of an equivalence", () => {
    const result = scale("450 g (1 livre) de spaghetti", 1.5);

    expect(result.text).toContain("675 g");
    expect(result.text).toContain("1,5 livre");
    expect(result.amount).toBe(675);
  });
});

describe("a count of containers whose size the line states", () => {
  it("scales the number of boîtes, which is what the line counts", () => {
    const result = scale("2 boîtes de 400 g de tomates", 1.5);

    expect(result.text).toContain("3 boîtes");
  });

  it("scales a container the vocabulary does not list", () => {
    const result = scale("1 pot de 500 g de miel", 2);

    expect(result.text).toMatch(/^2 pots/);
  });
});
