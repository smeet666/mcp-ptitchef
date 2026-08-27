import { describe, expect, it } from "vitest";

import { formatMinutes, parseIsoDuration, parseYield } from "../../src/recipe/duration.js";

describe("parseIsoDuration", () => {
  it("reads minutes", () => {
    expect(parseIsoDuration("PT25M")).toBe(25);
    expect(parseIsoDuration("PT5M")).toBe(5);
  });

  it("reads hours", () => {
    expect(parseIsoDuration("PT2H")).toBe(120);
  });

  it("reads hours and minutes together", () => {
    expect(parseIsoDuration("PT1H30M")).toBe(90);
    expect(parseIsoDuration("PT1H05M")).toBe(65);
  });

  it("returns null on junk", () => {
    for (const junk of ["", "25 min", "PT", "hello", "P1D2H", null, undefined, 42, {}]) {
      expect(parseIsoDuration(junk), String(junk)).toBeNull();
    }
  });
});

describe("formatMinutes", () => {
  it("renders minutes below an hour", () => {
    expect(formatMinutes(25)).toBe("25 min");
    expect(formatMinutes(5)).toBe("5 min");
  });

  it("renders hours and minutes", () => {
    expect(formatMinutes(90)).toBe("1 h 30");
  });

  it("renders a round hour", () => {
    expect(formatMinutes(120)).toBe("2 h");
  });

  it("returns null when there is nothing to render", () => {
    expect(formatMinutes(null)).toBeNull();
  });
});

describe("parseYield", () => {
  it("reads servings expressed in people", () => {
    expect(parseYield("6 personnes")).toEqual({
      count: 6,
      unit: "personnes",
      text: "6 personnes",
    });
  });

  it("reads a yield expressed in pieces", () => {
    expect(parseYield("15 pièces")).toEqual({
      count: 15,
      unit: "pièces",
      text: "15 pièces",
    });
  });

  it("reads a single serving", () => {
    const y = parseYield("1 personne");
    expect(y.count).toBe(1);
    expect(y.unit).toBe("personne");
  });

  it("keeps the text and gives up on the count when there is no number", () => {
    expect(parseYield("")).toEqual({ count: null, unit: null, text: "" });
  });

  it("never invents a count for a non-string yield", () => {
    for (const v of [null, undefined, {}, []]) {
      const y = parseYield(v);
      expect(y.count, String(v)).toBeNull();
      expect(typeof y.text, String(v)).toBe("string");
    }
  });

  it("accepts a numeric yield", () => {
    expect(parseYield(4).count).toBe(4);
  });

  it("takes the first entry of an array yield", () => {
    expect(parseYield(["6 personnes"]).count).toBe(6);
  });
});
