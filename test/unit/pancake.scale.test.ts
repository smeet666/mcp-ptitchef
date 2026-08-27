/**
 * Lines a pancake batter is written with, and what each one owes a caller.
 *
 * They cover three things: a fraction taken of a single container, a measure
 * whose size the cook gives and whose name the vocabulary does not carry, and
 * the label a multiplication that came out exact is entitled to.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });

describe("a fraction taken of one container", () => {
  it("writes the count where the article stood", () => {
    const r = scale("2/3 d'un flacon de fleur d'oranger", 6);
    expect(r.text).toBe("4 flacons de fleur d'oranger");
    expect(r.amount).toBe(4);
  });

  it("reads the same fraction written as a glyph", () => {
    expect(scale("⅔ d'un flacon de fleur d'oranger", 6).text).toBe("4 flacons de fleur d'oranger");
  });

  it("takes the feminine article with the amount it belongs to", () => {
    expect(scale("2/3 d'une bouteille de cidre", 6).text).toBe("4 bouteilles de cidre");
  });

  it("reads a half of one thing", () => {
    expect(scale("1/2 d'un citron", 6).text).toBe("3 citrons");
  });

  it("gives the counted thing the plural it takes", () => {
    expect(scale("1/2 d'un morceau de beurre", 6).text).toBe("3 morceaux de beurre");
  });
});

describe("an approximate measure the vocabulary has not met", () => {
  it("counts a bouchon", () => {
    const r = scale("un bouchon de rhum", 6);
    expect(r.scaling).not.toBe("unscaled");
    expect(r.text).toBe("6 bouchons de rhum");
    expect(r.note).toMatch(/mesure approximative|Approximate measure/i);
  });

  it("counts a container named by a word no list carries", () => {
    expect(scale("un ramequin de crème fraîche", 6).text).toBe("6 ramequins de crème fraîche");
  });

  it("counts a container the list knows as a portion", () => {
    expect(scale("un sachet de levure", 6).text).toBe("6 sachets de levure");
  });

  it("leaves an article standing before a bare countable thing", () => {
    expect(scale("un oignon", 6).scaling).toBe("unscaled");
  });
});

describe("the whole batter, from four eaters to twenty-four", () => {
  const BATTER = [
    "une pincée de sel",
    "1 cuillère à café de sucre",
    "1 cuillère à soupe de beurre pommade",
    "1 dose (cup) de Mountain Dew",
    "6 oeufs",
    "1 kilo de farine",
    "2/3 d'un flacon de fleur d'oranger",
    "3 sucres vanillés (sachets)",
    "un bouchon de rhum",
    "1/4 litre de lait",
  ];

  it("multiplies every line by six and calls each one exact", () => {
    const lines = BATTER.map((line) => scale(line, 6));
    expect(lines.map((entry) => entry.text)).toEqual([
      "6 pincées de sel",
      "6 cuillères à café de sucre",
      "6 cuillères à soupe de beurre pommade",
      "6 doses (cup) de Mountain Dew",
      "36 oeufs",
      "6 kg de farine",
      "4 flacons de fleur d'oranger",
      "18 sucres vanillés (sachets)",
      "6 bouchons de rhum",
      "1,5 l de lait",
    ]);
    for (const entry of lines) {
      expect(entry.scaling, entry.original).toBe("scaled");
    }
  });
});

describe("the label an exact multiplication carries", () => {
  it("calls a whole-number product scaled", () => {
    for (const line of [
      "une pincée de sel",
      "1 cuillère à café de sucre",
      "1 cuillère à soupe de beurre pommade",
      "6 oeufs",
      "3 sucres vanillés (sachets)",
    ]) {
      expect(scale(line, 6).scaling, line).toBe("scaled");
    }
  });

  it("calls a product that had to move rounded", () => {
    const r = scale("3 oeufs", 0.5);
    expect(r.scaling).toBe("rounded");
    expect(r.amount).toBe(2);
  });

  it("keeps a converted measurement exact", () => {
    const r = scale("200 g de farine", 10);
    expect(r.text).toBe("2 kg de farine");
    expect(r.scaling).toBe("scaled");
    expect(r.adjusted).toBe(false);
  });
});
