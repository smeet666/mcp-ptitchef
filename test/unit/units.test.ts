import { describe, expect, it } from "vitest";

import { UNIT_KEYS, formatUnit, lookupUnit, normalizeUnitKey } from "../../src/recipe/units.js";

describe("lookupUnit", () => {
  it("classifies masses and volumes as measured", () => {
    for (const key of ["g", "kg", "ml", "cl", "l"]) {
      expect(lookupUnit(key)?.kind, key).toBe("measured");
    }
  });

  it("classifies kitchen portions as portioned", () => {
    for (const key of [
      "cuillère à soupe",
      "cuillère à café",
      "verre",
      "sachet",
      "gousse",
      "tranche",
      "boîte",
    ]) {
      expect(lookupUnit(key)?.kind, key).toBe("portioned");
    }
  });

  it("classifies imprecise measures as vague", () => {
    for (const key of ["pincée", "trait", "filet", "goutte", "poignée", "noix", "soupçon"]) {
      expect(lookupUnit(key)?.kind, key).toBe("vague");
    }
  });

  it("returns null for something that is not a unit", () => {
    expect(lookupUnit("farine")).toBeNull();
    expect(lookupUnit("")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(lookupUnit("Cuillères à Soupe")?.canonical).toBe("cuillère à soupe");
    expect(lookupUnit("KG")?.canonical).toBe("kg");
  });

  it("is accent-insensitive", () => {
    expect(lookupUnit("cuilleres a soupe")?.canonical).toBe("cuillère à soupe");
    expect(lookupUnit("pincee")?.canonical).toBe("pincée");
    expect(lookupUnit("soupcon")?.canonical).toBe("soupçon");
  });

  it("resolves common abbreviations to the same unit", () => {
    const full = lookupUnit("cuillères à soupe");
    expect(lookupUnit("cas")?.canonical).toBe(full?.canonical);
    expect(lookupUnit("c. à soupe")?.canonical).toBe(full?.canonical);
    expect(lookupUnit("cac")?.canonical).toBe("cuillère à café");
  });

  it("accepts the plural of a portioned unit", () => {
    expect(lookupUnit("sachets")?.canonical).toBe("sachet");
    expect(lookupUnit("gousses")?.canonical).toBe("gousse");
  });
});

describe("normalizeUnitKey", () => {
  it("collapses case, accents and spacing to one key", () => {
    const a = normalizeUnitKey("Cuillères à Soupe");
    const b = normalizeUnitKey("cuilleres a soupe");
    const c = normalizeUnitKey("  CUILLERES   A SOUPE ");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("leaves an already-normal key alone", () => {
    expect(normalizeUnitKey("g")).toBe("g");
  });
});

describe("UNIT_KEYS", () => {
  it("lists the known keys longest first, so multi-word units win", () => {
    expect(UNIT_KEYS.length).toBeGreaterThan(0);
    for (let i = 1; i < UNIT_KEYS.length; i += 1) {
      expect(UNIT_KEYS[i]!.length).toBeLessThanOrEqual(UNIT_KEYS[i - 1]!.length);
    }
  });

  it("every listed key resolves", () => {
    for (const key of UNIT_KEYS) {
      expect(lookupUnit(key), key).not.toBeNull();
    }
  });
});

describe("formatUnit", () => {
  const spoon = lookupUnit("cuillère à soupe")!;
  const sachet = lookupUnit("sachet")!;
  const gram = lookupUnit("g")!;

  it("stays singular for one", () => {
    expect(formatUnit(spoon, 1)).toBe("cuillère à soupe");
    expect(formatUnit(sachet, 1)).toBe("sachet");
  });

  it("stays singular below one", () => {
    expect(formatUnit(sachet, 0.5)).toBe("sachet");
  });

  it("stays singular at one and a half, as French does", () => {
    expect(formatUnit(spoon, 1.5)).toBe("cuillère à soupe");
    expect(formatUnit(sachet, 1.5)).toBe("sachet");
  });

  it("turns plural from two onwards", () => {
    expect(formatUnit(spoon, 2)).toBe("cuillères à soupe");
    expect(formatUnit(sachet, 2)).toBe("sachets");
    expect(formatUnit(sachet, 3)).toBe("sachets");
    expect(formatUnit(spoon, 2.5)).toBe("cuillères à soupe");
  });

  it("leaves symbols invariable", () => {
    for (const amount of [0.5, 1, 2, 200]) {
      expect(formatUnit(gram, amount)).toBe("g");
      expect(formatUnit(lookupUnit("cl")!, amount)).toBe("cl");
      expect(formatUnit(lookupUnit("kg")!, amount)).toBe("kg");
      expect(formatUnit(lookupUnit("l")!, amount)).toBe("l");
    }
  });

  it("uses the irregular plural when the unit declares one", () => {
    for (const key of UNIT_KEYS) {
      const unit = lookupUnit(key)!;
      if (unit.plural) {
        expect(formatUnit(unit, 2)).toBe(unit.plural);
      }
    }
  });
});
