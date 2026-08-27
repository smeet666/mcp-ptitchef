import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PtitchefClient } from "../../src/ptitchef/client.js";
import { strictInput } from "../../src/tools/arguments.js";
import { runListCategories } from "../../src/tools/listCategories.js";
import type { CategoryReport, Read } from "../../src/types.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** The tool's argument object, handed over as the tool declares it. */
function args(value: Record<string, unknown>): Parameters<typeof runListCategories>[1] {
  return value as unknown as Parameters<typeof runListCategories>[1];
}

/** A stand-in client: no site is reached from a unit test. */
function fakeClient(): PtitchefClient {
  return {
    listCategories: async (family?: string | null): Promise<Read<CategoryReport>> => ({
      data: {
        family: family ?? null,
        family_title: null,
        categories: [],
        category_count: 0,
        url: "https://www.ptitchef.com/recettes",
      },
      cached: false,
    }),
  } as unknown as PtitchefClient;
}

/** The refusal a call earns, as the caller reads it. */
async function refusalOf(value: Record<string, unknown>): Promise<string> {
  try {
    await runListCategories(fakeClient(), args(value));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "the call was accepted";
}

/** The wording by which a refusal points at a declared argument. */
const SUGGESTS = /\b(did you mean|do you mean|perhaps you meant|closest|suggest)\b/i;

describe("an unknown argument", () => {
  it("is refused by [invalid_input], naming what the tool accepts", async () => {
    const message = await refusalOf({ scope: "sitewide" });

    expect(message).toBeTruthy();
    expect(message).toContain("scope");
    expect(message).toContain("family");
  });

  it("is named with its companion, in the plural, when two are unknown at once", async () => {
    const message = await refusalOf({ scope: "sitewide", sort: "name" });

    expect(message).toBeTruthy();
    expect(message).toContain("scope");
    expect(message).toContain("sort");
    expect(message).toMatch(/\barguments\b/i);
  });
});

describe("the declared name a refusal suggests", () => {
  const respellings = ["Family", "FAMILY", "fami_ly", "fami-ly"];
  const edges = ["fami", "familyName", "ingredientfamily", "amily"];
  const typos = ["familly", "famly", "faimly", "fmaily"];

  for (const name of respellings) {
    it(`suggests family for ${name}, the same name spelled otherwise`, async () => {
      const message = await refusalOf({ [name]: "legume" });

      expect(message).toBeTruthy();
      expect(message).toMatch(SUGGESTS);
      expect(message).toContain("family");
    });
  }

  for (const name of edges) {
    it(`suggests family for ${name}, which opens or closes it`, async () => {
      const message = await refusalOf({ [name]: "legume" });

      expect(message).toBeTruthy();
      expect(message).toMatch(SUGGESTS);
      expect(message).toContain("family");
    });
  }

  for (const name of typos) {
    it(`suggests family for ${name}, a typo or two away`, async () => {
      const message = await refusalOf({ [name]: "legume" });

      expect(message).toBeTruthy();
      expect(message).toMatch(SUGGESTS);
      expect(message).toContain("family");
    });
  }

  for (const name of ["cuisine", "sortBy", "difficulty"]) {
    it(`suggests nothing for ${name}, which is nowhere near it`, async () => {
      const message = await refusalOf({ [name]: "legume" });

      expect(message).toBeTruthy();
      // A suggestion that misses sends the caller to an argument answering
      // another question, which reads as an answer rather than a refusal.
      expect(message).not.toMatch(SUGGESTS);
    });
  }
});

/** The declared name a refusal points at, or an empty string when it points at none. */
function suggestionIn(message: string): string {
  const found =
    /(?:did you mean|do you mean|perhaps you meant|closest)\W{0,3}["'`]?([A-Za-z0-9_-]+)/i.exec(
      message,
    );
  return found?.[1] ?? "";
}

describe("a name carrying neither letter nor digit", () => {
  for (const name of ["___", "---", "!!!"]) {
    it(`is refused for ${name}, named alongside what the tool accepts, with nothing suggested`, async () => {
      const message = await refusalOf({ [name]: "legume" });

      expect(message).toBeTruthy();
      expect(message).toContain(name);
      expect(message).toContain("family");
      // There is nothing to compare here, so a suggestion drawn from it would be
      // drawn from nothing.
      expect(message).not.toMatch(SUGGESTS);
      expect(suggestionIn(message)).toBe("");
    });
  }
});

describe("a declared argument outside its bounds", () => {
  it("is refused by [invalid_input] when the limit is below one", async () => {
    const message = await refusalOf({ limit: 0 });

    expect(message).toBeTruthy();
  });

  it("is refused by [invalid_input] when the limit is not whole", async () => {
    const message = await refusalOf({ limit: 2.5 });

    expect(message).toBeTruthy();
  });
});

describe("the nearest of several declared names", () => {
  /** A shape of this suite's own, so several declared names have to be told apart. */
  function shape(): z.ZodObject {
    return strictInput({
      family: z.string(),
      cuisine: z.string().optional(),
      max_total_minutes: z.number().optional(),
    });
  }

  /** The refusal a shape writes for an object carrying an unknown name. */
  function refusalFromShape(name: string): string {
    const parsed = shape().safeParse({ family: "legume", [name]: "x" });

    expect(parsed.success).toBe(false);
    const messages = parsed.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).toBeTruthy();
    }
    return messages.join("\n");
  }

  it("suggests the first declared name for a name near it", () => {
    const message = refusalFromShape("familly");

    expect(message).toMatch(SUGGESTS);
    expect(suggestionIn(message)).toBe("family");
  });

  it("suggests the last declared name for a name near it", () => {
    const message = refusalFromShape("max_total_minute");

    expect(message).toMatch(SUGGESTS);
    expect(suggestionIn(message)).toBe("max_total_minutes");
  });

  it("suggests the last declared name for the same name spelled otherwise", () => {
    const message = refusalFromShape("maxTotalMinutes");

    expect(message).toMatch(SUGGESTS);
    expect(suggestionIn(message)).toBe("max_total_minutes");
  });

  it("suggests the middle declared name for a name near it", () => {
    const message = refusalFromShape("cuisin");

    expect(message).toMatch(SUGGESTS);
    expect(suggestionIn(message)).toBe("cuisine");
  });

  it("suggests none of them for a name equally far from all", () => {
    const message = refusalFromShape("zzzzzz");

    expect(message).not.toMatch(SUGGESTS);
    expect(suggestionIn(message)).toBe("");
    expect(message).toContain("family");
    expect(message).toContain("cuisine");
    expect(message).toContain("max_total_minutes");
  });
});
