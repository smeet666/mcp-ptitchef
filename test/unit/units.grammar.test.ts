import { describe, expect, it } from "vitest";
import {
  chooseReadableUnit,
  demoteUnit,
  lookupUnit,
  readPartitiveMeasure,
} from "../../src/recipe/units.js";

/** A unit by its key, refusing the test rather than the code when it is absent. */
function unit(key: string) {
  const found = lookupUnit(key);
  if (found === null) {
    throw new Error(`the vocabulary carries no unit "${key}"`);
  }
  return found;
}

describe("a container the vocabulary does not name", () => {
  it("is read from the grammar when a noun stands before a partitive", () => {
    const read = readPartitiveMeasure("bouquet de persil");

    expect(read?.unit.canonical).toBe("bouquet");
    expect(read?.unit.kind).toBe("vague");
    // The partitive stays on the rest, which is where the caller strips it.
    expect(read?.rest).toBe("de persil");
  });

  it("is put back in the plural the noun takes", () => {
    expect(readPartitiveMeasure("morceau de sucre")?.unit.plural).toBe("morceaux");
    expect(readPartitiveMeasure("bocal de cornichons")?.unit.plural).toBe("bocaux");
    // A noun already ending in a sibilant is the same in both numbers, so no
    // plural is written for it rather than one being invented.
    expect(readPartitiveMeasure("noix de muscade")?.unit.plural).toBeUndefined();
  });

  it("reads a noun the line wrote in the plural back in the singular", () => {
    expect(readPartitiveMeasure("morceaux de sucre")?.unit.canonical).toBe("morceau");
    expect(readPartitiveMeasure("bocaux de cornichons")?.unit.canonical).toBe("bocal");
    expect(readPartitiveMeasure("bouquets de persil")?.unit.canonical).toBe("bouquet");
  });

  it("leaves a noun already invariable alone", () => {
    // "ananas" and "noix" end in a sibilant in both numbers, so trimming an s
    // would invent a singular that no one writes.
    expect(readPartitiveMeasure("ananas de la ferme")?.unit.canonical).toBe("ananas");
  });

  it("leaves a short word alone, since two letters name nothing", () => {
    expect(readPartitiveMeasure("de de sucre")).toBeNull();
  });

  it("refuses a word the vocabulary rules out as a measure", () => {
    // "un peu de sel" states no quantity, and reading "peu" as a container
    // would put a number where the recipe wrote none.
    expect(readPartitiveMeasure("peu de sel")).toBeNull();
    expect(readPartitiveMeasure("moitié de la pâte")).toBeNull();
  });

  it("refuses a word the vocabulary already names, so it keeps its own kind", () => {
    expect(readPartitiveMeasure("sachet de levure")).toBeNull();
    expect(readPartitiveMeasure("gousse de vanille")).toBeNull();
  });

  it("refuses a line opening on the noun rather than on the measure", () => {
    expect(readPartitiveMeasure("beurre pommade")).toBeNull();
  });
});

describe("demoteUnit", () => {
  it("gives the unit one step down, with how many fit in one", () => {
    expect(demoteUnit(unit("kg"))).toEqual({ unit: unit("g"), per: 1000 });
    expect(demoteUnit(unit("l"))).toEqual({ unit: unit("cl"), per: 100 });
    expect(demoteUnit(unit("cl"))).toEqual({ unit: unit("ml"), per: 10 });
  });

  it("gives nothing at the bottom of a ladder", () => {
    expect(demoteUnit(unit("mg"))).toBeNull();
    expect(demoteUnit(unit("ml"))).toBeNull();
  });

  it("steps a spoonful down to the smaller spoon, which is its own ladder", () => {
    expect(demoteUnit(unit("cuillère à soupe"))?.per).toBe(3);
  });

  it("gives nothing for a measure that sits on no ladder", () => {
    expect(demoteUnit(unit("pincée"))).toBeNull();
  });
});

describe("chooseReadableUnit", () => {
  it("walks all the way down a ladder rather than rounding a quantity away", () => {
    // Two tenths of a gram, so the walk carries on past grams to milligrams.
    expect(chooseReadableUnit(unit("kg"), 0.0002)).toEqual({ unit: unit("mg"), ratio: 1_000_000 });
  });

  it("takes one step up at a full unit of the step above", () => {
    expect(chooseReadableUnit(unit("g"), 2000)).toEqual({ unit: unit("kg"), ratio: 0.001 });
  });

  it("stays put just under a full unit of the step above", () => {
    expect(chooseReadableUnit(unit("g"), 999)).toEqual({ unit: unit("g"), ratio: 1 });
  });

  it("leaves a unit that is not a measure alone", () => {
    // A pinch is not a measured quantity, and moving it would invent a
    // conversion the page never wrote.
    expect(chooseReadableUnit(unit("pincée"), 0.001)).toEqual({
      unit: unit("pincée"),
      ratio: 1,
    });
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "leaves the unit alone for an amount of %s, which names no quantity",
    (amount) => {
      expect(chooseReadableUnit(unit("g"), amount)).toEqual({ unit: unit("g"), ratio: 1 });
    },
  );
});
