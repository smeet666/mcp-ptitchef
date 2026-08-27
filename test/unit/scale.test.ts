import { describe, expect, it } from "vitest";

import { parseIngredient } from "../../src/recipe/quantity.js";
import {
  passthroughIngredients,
  scaleIngredient,
  scaleIngredients,
} from "../../src/recipe/scale.js";

/** The ingredient list of `recipe-full.html`: one line per unit class. */
const FULL_RECIPE = [
  "200 g de farine",
  "25 cl de lait",
  "3 oeufs",
  "2 cuillères à soupe de sucre",
  "0.5 citron",
  "1 pincée de sel",
  "1/2 sachet de levure",
  "coriandre",
];

/**
 * Amounts a cook can act on: whole numbers, or the five fractions a measuring
 * spoon and a knife can actually produce. Anything else ("0,3 oeuf", "2/7") is
 * noise dressed up as precision.
 */
const READABLE_AMOUNT_RE =
  /^(?:\d+\s+(?:1\/4|1\/3|1\/2|2\/3|3\/4)|1\/4|1\/3|1\/2|2\/3|3\/4|[1-9]\d*(?:,5)?)\b/;

describe("scaleIngredient — measured units scale continuously", () => {
  it("doubles a mass", () => {
    const r = scaleIngredient("200 g de farine", { factor: 2 });
    expect(r.scaling).toBe("scaled");
    expect(r.amount).toBe(400);
    expect(r.text).toBe("400 g de farine");
  });

  it("doubles a volume", () => {
    const r = scaleIngredient("25 cl de lait", { factor: 2 });
    expect(r.scaling).toBe("scaled");
    expect(r.amount).toBe(50);
    expect(r.text).toBe("50 cl de lait");
  });

  it("halves a mass", () => {
    const r = scaleIngredient("200 g de farine", { factor: 0.5 });
    expect(r.amount).toBe(100);
    expect(r.text).toBe("100 g de farine");
  });

  it("rounds to a 5 step at or above 100", () => {
    // 200 x 0.667 = 133.4, and 135 is not that product: a value a step moved
    // is reported as rounded, whatever unit it is written in.
    const r = scaleIngredient("200 g de farine", { factor: 0.667 });
    expect(r.scaling).toBe("rounded");
    expect(r.amount! % 5).toBe(0);
    expect(r.amount).toBe(135);
  });

  it("rounds to a 1 step between 10 and 100", () => {
    // 25 x 0.667 = 16.675, and the answer of 17 is a rounded one.
    const r = scaleIngredient("25 cl de lait", { factor: 0.667 });
    expect(r.scaling).toBe("rounded");
    expect(Number.isInteger(r.amount)).toBe(true);
    expect(r.amount).toBe(17);
  });

  it("rounds to a tenth between 1 and 10", () => {
    // A unit in that range can be a kilo as readily as a gram, so a coarser
    // step would move 3.6 kg of meat by a hundred grams.
    const r = scaleIngredient("3 g de sel fin", { factor: 1.2 });
    expect(r.scaling).toBe("scaled");
    expect(r.amount).toBe(3.6);

    const coarser = scaleIngredient("3 g de sel fin", { factor: 1.21 });
    expect(coarser.scaling).toBe("rounded");
    expect(coarser.amount).toBe(3.6);
  });

  it("keeps the unit symbol invariable when scaling up", () => {
    expect(scaleIngredient("200 g de farine", { factor: 3 }).text).toBe("600 g de farine");
  });

  it("reports the unit it scaled", () => {
    expect(scaleIngredient("200 g de farine", { factor: 2 }).unit).toBe("g");
  });
});

describe("scaleIngredient — countables round to whole units", () => {
  it("doubles eggs", () => {
    // Six is the product itself, so nothing was rounded and the label says so.
    const r = scaleIngredient("3 oeufs", { factor: 2 });
    expect(r.scaling).toBe("scaled");
    expect(r.amount).toBe(6);
    expect(r.text).toBe("6 oeufs");
  });

  it("never produces a fraction of an egg on a plausible factor", () => {
    // 3 x 0.667 = 2.001, near enough to two whole eggs to count as exact.
    const r = scaleIngredient("3 oeufs", { factor: 0.667 });
    expect(r.scaling).toBe("scaled");
    expect(Number.isInteger(r.amount)).toBe(true);
    expect(r.amount).toBe(2);
    expect(r.text).toBe("2 oeufs");
  });

  it("rounds a half-egg to a whole egg without inventing or losing one", () => {
    const r = scaleIngredient("3 oeufs", { factor: 0.5 });
    expect(Number.isInteger(r.amount)).toBe(true);
    expect(r.amount).toBeGreaterThanOrEqual(1);
    expect(r.amount).toBeLessThanOrEqual(3);
  });

  it("promotes a half citron to a whole one when doubling", () => {
    // Half a lemon doubled is one lemon exactly.
    const r = scaleIngredient("0.5 citron", { factor: 2 });
    expect(r.scaling).toBe("scaled");
    expect(r.amount).toBe(1);
    expect(r.text).toBe("1 citron");
  });

  it("keeps a countable below one as a fraction rather than dropping it", () => {
    const r = scaleIngredient("3 oeufs", { factor: 0.1 });
    expect(r.amount).not.toBe(0);
    expect(r.amount).toBeGreaterThan(0);
    expect(r.text).toMatch(READABLE_AMOUNT_RE);
    expect(r.text).not.toMatch(/^0\b/);
  });
});

describe("scaleIngredient — portioned units tolerate halves only where a cook does", () => {
  it("doubles spoons and agrees the plural", () => {
    // Two spoons doubled are four spoons exactly.
    const r = scaleIngredient("2 cuillères à soupe de sucre", { factor: 2 });
    expect(r.scaling).toBe("scaled");
    expect(r.amount).toBe(4);
    expect(r.text).toBe("4 cuillères à soupe de sucre");
  });

  it("allows a half spoon", () => {
    // 2 x 0.667 = 1.334 -> 1.5 on a half step
    const r = scaleIngredient("2 cuillères à soupe de sucre", {
      factor: 0.667,
    });
    expect(r.amount).toBe(1.5);
    // French keeps the unit singular at 1.5.
    expect(r.text).toMatch(/cuillère à soupe/);
    expect(r.text).not.toMatch(/cuillères/);
  });

  it("doubles half a sachet into exactly one", () => {
    const r = scaleIngredient("1/2 sachet de levure", { factor: 2 });
    expect(r.amount).toBe(1);
    expect(r.text).toBe("1 sachet de levure");
  });

  it("uses the singular for one sachet and the plural for two", () => {
    expect(scaleIngredient("1 sachet de levure", { factor: 2 }).text).toBe("2 sachets de levure");
    expect(scaleIngredient("2 sachets de levure", { factor: 0.5 }).text).toBe("1 sachet de levure");
  });

  // This test used to forbid a half gousse d'ail outright. A clove is cut in
  // two with the same knife that peels it; what makes this line whole is the
  // product itself, 2,001, and not a rule against halves.
  it("keeps a count on the whole the product landed on", () => {
    const r = scaleIngredient("3 gousses d'ail", { factor: 0.667 });
    expect(Number.isInteger(r.amount)).toBe(true);
    expect(scaleIngredient("3 gousses d'ail", { factor: 0.5 }).amount).toBe(1.5);
  });
});

describe("scaleIngredient — a counted item agrees with its amount both ways", () => {
  it("adds the plural mark when scaling up", () => {
    // Scaling only ever removed an "s", never added one, so tripling a recipe
    // produced "3 brioche" next to "30 oeufs" in the same list.
    expect(scaleIngredient("1 brioche", { factor: 3 }).text).toBe("3 brioches");
    expect(scaleIngredient("1 orange", { factor: 3 }).text).toBe("3 oranges");
    expect(scaleIngredient("1 pomme Golden", { factor: 4 }).text).toBe("4 pommes Golden");
  });

  it("removes the plural mark when scaling down", () => {
    expect(scaleIngredient("6 pommes", { factor: 1 / 6 }).text).toBe("1 pomme");
    expect(scaleIngredient("3 oeufs", { factor: 1 / 3 }).text).toBe("1 oeuf");
  });

  it("keeps a plural already correct and a singular already correct", () => {
    expect(scaleIngredient("2 citrons", { factor: 2 }).text).toBe("4 citrons");
    expect(scaleIngredient("1 citron", { factor: 1 }).text).toBe("1 citron");
  });

  it("uses the singular below one, where French does", () => {
    // A knife takes an apple to quarters and thirds: 3 x 0.1 = 0.3, whose
    // nearest usable share is a third. This test used to read the same figure
    // off "3 oeufs", which a kitchen has no way of cutting into thirds.
    expect(scaleIngredient("3 pommes", { factor: 0.1 }).text).toBe("1/3 pomme");
    expect(scaleIngredient("1 brioche", { factor: 0.5 }).text).toBe("1/2 brioche");
  });

  it("leaves invariable nouns alone in both directions", () => {
    // Nouns ending in -s, -x or -z take no plural mark, and those whose singular
    // already ends in -s must not lose it. A wrong form is worse than an
    // unchanged one, since the reader cannot tell it was computed.
    expect(scaleIngredient("1 ananas", { factor: 3 }).text).toBe("3 ananas");
    expect(scaleIngredient("2 ananas", { factor: 0.5 }).text).toBe("1 ananas");
    expect(scaleIngredient("1 chou", { factor: 2 }).text).toBe("2 chous");
    expect(scaleIngredient("1 choux", { factor: 2 }).text).toBe("2 choux");
  });

  it("never touches the item when a unit carries the count", () => {
    // "3 g de farine" tripled is "9 g de farine": the noun follows the unit, not
    // the number, so agreement must not be applied to it.
    expect(scaleIngredient("100 g de pommes", { factor: 3 }).text).toBe("300 g de pommes");
    expect(scaleIngredient("200 g de farine", { factor: 0.5 }).text).toBe("100 g de farine");
  });
});

describe("scaleIngredient — approximate measures scale by their count", () => {
  it("multiplies the number of pinches, in whole pinches", () => {
    const line = "1 pincée de sel";
    // A pinch multiplied by a whole number lands on a whole count with no
    // rounding to do, and only the halved line had to be moved, up to the one
    // pinch a hand can still produce.
    for (const [factor, expected, scaling] of [
      [2, "2 pincées de sel", "scaled"],
      [4, "4 pincées de sel", "scaled"],
      [0.5, "1 pincée de sel", "rounded"],
    ] as [number, string, string][]) {
      const r = scaleIngredient(line, { factor });
      expect(r.scaling, `factor ${factor}`).toBe(scaling);
      expect(r.text, `factor ${factor}`).toBe(expected);
      expect(r.original).toBe(line);
      expect(r.note, `factor ${factor}`).toBeTruthy();
    }
  });

  it("returns a line with no amount byte-identical", () => {
    const line = "coriandre";
    const r = scaleIngredient(line, { factor: 3 });
    expect(r.scaling).toBe("unscaled");
    expect(r.text).toBe(line);
    expect(r.note).toBeTruthy();
  });

  it("multiplies the other approximate measures too", () => {
    for (const [line, expected] of [
      ["1 trait de vinaigre", "3 traits de vinaigre"],
      ["1 filet d'huile d'olive", "3 filets d'huile d'olive"],
      ["2 gouttes d'extrait de vanille", "6 gouttes d'extrait de vanille"],
      ["1 poignée de roquette", "3 poignées de roquette"],
    ] as [string, string][]) {
      const r = scaleIngredient(line, { factor: 3 });
      expect(r.scaling, line).toBe("scaled");
      expect(r.text, line).toBe(expected);
    }
  });
});

describe("scaleIngredient — the two rules that matter", () => {
  it("scaling down never yields more than the original", () => {
    const factors = [0.1, 0.2, 0.25, 1 / 3, 0.5, 0.6, 0.667, 0.75, 0.9];
    for (const line of FULL_RECIPE) {
      const before = parseIngredient(line).amount;
      if (before === null) {
        continue;
      }
      for (const factor of factors) {
        const r = scaleIngredient(line, { factor });
        if (r.scaling === "unscaled") {
          continue;
        }
        expect(r.amount, `${line} x ${factor}`).not.toBeNull();
        expect(r.amount!, `${line} x ${factor}`).toBeLessThanOrEqual(before);
      }
    }
  });

  it("half a sachet reduced by a third does not become a whole sachet", () => {
    const r = scaleIngredient("1/2 sachet de levure", { factor: 0.667 });
    expect(r.amount!).toBeLessThanOrEqual(0.5);
    expect(r.text).not.toMatch(/^1 sachet/);
  });

  it("scaling up never yields less than the original", () => {
    // Compared in base units, because a scaled amount may come back in a bigger
    // unit than it went in: "200 g" times ten is "2 kg", where the bare number
    // shrinks while the quantity grows.
    const TO_BASE: Record<string, number> = {
      mg: 0.001,
      g: 1,
      kg: 1000,
      ml: 1,
      cl: 10,
      dl: 100,
      l: 1000,
    };
    const base = (amount: number, unit: string | null) => amount * (TO_BASE[unit ?? ""] ?? 1);

    for (const line of FULL_RECIPE) {
      const parsed = parseIngredient(line);
      if (parsed.amount === null) {
        continue;
      }
      const before = base(parsed.amount, parsed.unit?.canonical ?? null);

      for (const factor of [1.1, 1.5, 2, 3, 10]) {
        const r = scaleIngredient(line, { factor });
        if (r.scaling === "unscaled") {
          continue;
        }
        expect(base(r.amount!, r.unit), `${line} x ${factor}`).toBeGreaterThanOrEqual(before);
      }
    }
  });

  it("never deletes an ingredient by rounding it to zero", () => {
    const factors = [0.05, 0.1, 0.125, 0.2, 0.25, 1 / 3, 0.5];
    for (const line of FULL_RECIPE) {
      for (const factor of factors) {
        const r = scaleIngredient(line, { factor });
        if (r.scaling === "unscaled") {
          continue;
        }
        expect(r.amount, `${line} x ${factor}`).not.toBe(0);
        expect(r.amount!, `${line} x ${factor}`).toBeGreaterThan(0);
        expect(r.text, `${line} x ${factor}`).not.toMatch(/(^|\s)0(\s|$)/);
      }
    }
  });

  it("never prints an amount a cook cannot measure", () => {
    const factors = [0.05, 0.1, 0.25, 1 / 3, 0.5, 0.667, 0.9, 1.5, 2, 2.5, 7];
    for (const line of FULL_RECIPE) {
      for (const factor of factors) {
        const r = scaleIngredient(line, { factor });
        if (r.scaling === "unscaled") {
          continue;
        }
        expect(r.text, `${line} x ${factor}`).toMatch(READABLE_AMOUNT_RE);
        expect(r.text, `${line} x ${factor}`).not.toContain(".");
      }
    }
  });

  it("never prints a fraction of an egg with an unusable denominator", () => {
    for (const factor of [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
      const r = scaleIngredient("3 oeufs", { factor });
      expect(r.text, `factor ${factor}`).toMatch(READABLE_AMOUNT_RE);
    }
  });

  it("always keeps the original line available", () => {
    for (const line of FULL_RECIPE) {
      expect(scaleIngredient(line, { factor: 2 }).original).toBe(line);
    }
  });

  it("a factor of 1 leaves every amount where it was", () => {
    for (const line of FULL_RECIPE) {
      const before = parseIngredient(line).amount;
      const r = scaleIngredient(line, { factor: 1 });
      if (before === null) {
        expect(r.amount).toBeNull();
      } else if (r.scaling !== "unscaled") {
        expect(r.amount, line).toBe(before);
      }
    }
  });
});

describe("scaleIngredients", () => {
  it("scales the whole list from 6 servings to 4 (factor 0.667)", () => {
    const out = scaleIngredients(FULL_RECIPE, { factor: 4 / 6 });
    expect(out).toHaveLength(FULL_RECIPE.length);
    expect(out.map((r) => r.original)).toEqual(FULL_RECIPE);

    const byOriginal = new Map(out.map((r) => [r.original, r]));

    expect(byOriginal.get("200 g de farine")!.text).toBe("135 g de farine");
    expect(byOriginal.get("25 cl de lait")!.text).toBe("17 cl de lait");
    expect(byOriginal.get("3 oeufs")!.text).toBe("2 oeufs");
    expect(byOriginal.get("1 pincée de sel")!.text).toBe("1 pincée de sel");
    expect(byOriginal.get("coriandre")!.text).toBe("coriandre");
  });

  it("classifies each line of the reference recipe", () => {
    const out = scaleIngredients(FULL_RECIPE, { factor: 2 });
    const kinds = Object.fromEntries(out.map((r) => [r.original, r.scaling]));
    expect(kinds["200 g de farine"]).toBe("scaled");
    expect(kinds["25 cl de lait"]).toBe("scaled");
    // Doubling lands every one of these on a whole count with nothing to
    // round, which is what "scaled" states.
    expect(kinds["3 oeufs"]).toBe("scaled");
    expect(kinds["2 cuillères à soupe de sucre"]).toBe("scaled");
    expect(kinds["0.5 citron"]).toBe("scaled");
    expect(kinds["1/2 sachet de levure"]).toBe("scaled");
    expect(kinds["1 pincée de sel"]).toBe("scaled");
    expect(kinds["coriandre"]).toBe("unscaled");
  });

  it("only the unscaled lines carry a note", () => {
    for (const r of scaleIngredients(FULL_RECIPE, { factor: 2 })) {
      if (r.scaling === "unscaled") {
        expect(r.note, r.original).toBeTruthy();
      }
    }
  });

  it("handles an empty list", () => {
    expect(scaleIngredients([], { factor: 2 })).toEqual([]);
  });

  it("preserves order", () => {
    const out = scaleIngredients(FULL_RECIPE, { factor: 3 });
    expect(out.map((r) => r.original)).toEqual(FULL_RECIPE);
  });
});

describe("passthroughIngredients", () => {
  it("marks everything unscaled and rewrites nothing", () => {
    const out = passthroughIngredients(FULL_RECIPE);
    expect(out).toHaveLength(FULL_RECIPE.length);
    for (const [i, r] of out.entries()) {
      expect(r.original).toBe(FULL_RECIPE[i]);
      expect(r.text).toBe(FULL_RECIPE[i]);
      expect(r.scaling).toBe("unscaled");
    }
  });

  it("still exposes the parsed amount where there is one", () => {
    const out = passthroughIngredients(["200 g de farine", "coriandre"]);
    expect(out[0]!.amount).toBe(200);
    expect(out[1]!.amount).toBeNull();
  });

  it("handles an empty list", () => {
    expect(passthroughIngredients([])).toEqual([]);
  });
});

describe("scaleIngredient — a scaled amount stays at a human size", () => {
  it("climbs to kilos past a thousand grams", () => {
    // A canteen factor is where this shows: 250 g x 33.33 is correct as 8335 g
    // and unusable. Every earlier test used a factor between 0.1 and 3, which is
    // why the gap went unnoticed.
    const r = scaleIngredient("250 g de sucre en poudre", { factor: 100 / 3 });
    expect(r.unit).toBe("kg");
    expect(r.amount).toBeGreaterThan(8);
    expect(r.amount).toBeLessThan(8.5);
    expect(r.text).toContain("kg de sucre en poudre");
    expect(r.text).not.toMatch(/\d{4}/);
  });

  it("climbs to litres past a hundred centilitres", () => {
    const r = scaleIngredient("5 cl de liqueur d'orange", { factor: 100 / 3 });
    expect(r.unit).toBe("l");
    expect(r.amount).toBeCloseTo(1.65, 2);
  });

  it("stays put just below the promotion threshold", () => {
    // 990 g is still grams; the ladder must not fire early. Note that 999 g
    // would legitimately promote, because rounding to a 5 step lands it on
    // 1000 g before the ladder is consulted.
    expect(scaleIngredient("990 g de farine", { factor: 1 }).unit).toBe("g");
    expect(scaleIngredient("99 cl de lait", { factor: 1 }).unit).toBe("cl");
  });

  it("promotes exactly at the threshold", () => {
    expect(scaleIngredient("500 g de farine", { factor: 2 }).unit).toBe("kg");
    expect(scaleIngredient("50 cl de lait", { factor: 2 }).unit).toBe("l");
  });

  it("comes back down below one unit", () => {
    // Half a litre reads better as 50 cl than as "1/2 l".
    const r = scaleIngredient("1 l de lait", { factor: 0.5 });
    expect(r.unit).toBe("cl");
    expect(r.amount).toBe(50);

    const k = scaleIngredient("1 kg de farine", { factor: 0.25 });
    expect(k.unit).toBe("g");
    expect(k.amount).toBe(250);
  });

  it("keeps the conversion faithful to the rounded amount", () => {
    // The promoted value must describe the same quantity, within the rounding
    // the kitchen scale would apply anyway.
    const r = scaleIngredient("50 g de maïzena", { factor: 100 / 3 });
    const grams = (r.amount ?? 0) * 1000;
    expect(Math.abs(grams - 50 * (100 / 3))).toBeLessThan(20);
  });

  it("leaves countable and approximate units off the ladder", () => {
    // Only mass and volume have a metric ladder; 2000 sachets stay sachets, and
    // a thousand pinches stay pinches rather than being weighed out in grams.
    expect(scaleIngredient("2 sachets de levure", { factor: 1000 }).unit).toBe("sachet");
    expect(scaleIngredient("1 pincée de sel", { factor: 1000 }).unit).toBe("pincée");
  });
});

describe("scaleIngredient — mass and volume read as decimals, not fractions", () => {
  it("writes a promoted mass as a decimal", () => {
    // "8 1/3 kg de sucre" is not how anyone weighs sugar. Fractions belong to
    // things a cook counts or spoons out, not to a scale reading.
    const r = scaleIngredient("250 g de sucre", { factor: 100 / 3 });
    expect(r.text).not.toMatch(/\d\/\d/);
    expect(r.text).toMatch(/^8,3\d? kg de sucre$/);
  });

  it("writes a promoted volume as a decimal", () => {
    const r = scaleIngredient("5 cl de liqueur", { factor: 100 / 3 });
    expect(r.text).not.toMatch(/\d\/\d/);
    expect(r.text).toMatch(/^1,6\d? l de liqueur$/);
  });

  it("writes a half unit of volume as a decimal", () => {
    expect(scaleIngredient("3 cl de rhum", { factor: 0.5 }).text).toBe("1,5 cl de rhum");
  });

  it("still uses fractions for counted and spooned things", () => {
    expect(scaleIngredient("2 cuillères à soupe de sucre", { factor: 0.667 }).text).toContain(
      "1/2",
    );
    expect(scaleIngredient("1 boîte de tomates", { factor: 0.5 }).text).toContain("1/2");
  });
});
