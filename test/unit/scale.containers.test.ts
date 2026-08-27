/**
 * What a counted thing gives back when a recipe asks for less than one of it.
 *
 * A container is divided by what it holds. Half a boîte de tomates is poured
 * out and the rest kept, half a sachet de sucre vanillé is weighed by eye, half
 * a feuille de gélatine is cut with scissors: each of those is an amount a
 * kitchen produces, so the count lands on the half. The egg is where that
 * stops, since half of one would have to be beaten and weighed.
 */

import { describe, expect, it } from "vitest";
import { scaleIngredient } from "../../src/recipe/scale.js";

const scale = (line: string, factor: number) => scaleIngredient(line, { factor });
const whole = (value: number | null) => value !== null && Number.isInteger(value);

describe("a container is divided by what it holds", () => {
  it("pours half a boîte rather than keeping a whole one", () => {
    const result = scale("1 boîte de tomates", 0.4);
    expect(result.amount).toBe(0.5);
    expect(result.text).toBe("1/2 boîte de tomates");
  });

  it("halves every container whose content pours, weighs or cuts", () => {
    for (const line of [
      "1 sachet de sucre vanillé",
      // A pot and a bouteille hold enough that a quarter of one is a portion,
      // and they are checked against that floor in scale.divisibility.
      "1 brique de lait",
      "1 feuille de gélatine",
      "1 branche de thym",
      "1 flacon de fleur d'oranger",
    ]) {
      expect(scale(line, 0.5).amount, line).toBe(0.5);
    }
  });

  it("keeps a half that the arithmetic landed on", () => {
    const result = scale("3 boîtes de tomates", 0.5);
    expect(result.amount).toBe(1.5);
    expect(result.text).toBe("1 1/2 boîte de tomates");
  });

  it("splits a gousse d'ail in two", () => {
    expect(scale("5 gousses d'ail", 0.5).amount).toBe(2.5);
  });
});

describe("an egg is counted whole", () => {
  it("lands on a whole number when a recipe for six is taken to twenty-five", () => {
    const result = scale("3 oeufs", 25 / 6);
    expect(result.amount).toBe(13);
    expect(result.text).toBe("13 oeufs");
    expect(result.scaling).toBe("rounded");
  });

  it("keeps one egg in the recipe rather than a share of one", () => {
    const result = scale("3 oeufs", 0.1);
    expect(result.amount).toBe(1);
    expect(result.text).toBe("1 oeuf");
  });

  it("holds for the yolk and for the white", () => {
    for (const line of ["3 jaunes d'oeufs", "3 blancs d'oeufs", "3 jaunes d'œufs"]) {
      expect(whole(scale(line, 0.5).amount), line).toBe(true);
    }
  });
});

describe("a measure the hand gives its size to keeps counting in whole ones", () => {
  it("leaves a pincée whole when the recipe shrinks", () => {
    const result = scale("2 pincées de sel", 0.4);
    expect(whole(result.amount)).toBe(true);
    expect(result.text).toBe("1 pincée de sel");
  });

  it("leaves a bouchon whole", () => {
    expect(whole(scale("3 bouchons de rhum", 0.5).amount)).toBe(true);
  });
});
