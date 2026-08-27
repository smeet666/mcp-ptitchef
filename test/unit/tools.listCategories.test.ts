import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { PtitchefClient } from "../../src/ptitchef/client.js";
import {
  listCategoriesArgs,
  listCategoriesDescription,
  listCategoriesOutputShape,
  runListCategories,
} from "../../src/tools/listCategories.js";
import { ATTRIBUTION, MAX_TEXT_CHARS, SOURCE_NAME } from "../../src/tools/shared.js";

const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

function fixture(name: string): string {
  const path = fileURLToPath(new URL(`../fixtures/${name}.html`, import.meta.url));
  return readFileSync(path, "utf8");
}

function pageResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function clientServing(body: string, env: Record<string, string> = {}): PtitchefClient {
  const fetchImpl = (async () => pageResponse(body)) as unknown as typeof fetch;
  return new PtitchefClient({ config: loadConfig(env), logger: createLogger("silent"), fetchImpl });
}

/**
 * Drives the fake clock forward until `promise` settles, so nothing in a test
 * waits on the real one.
 */
async function runWithClock<T>(promise: Promise<T>, stepMs = 50, capMs = 300_000): Promise<T> {
  let settled = false;
  const tracked = promise.then(
    (value) => {
      settled = true;
      return { ok: true, value } as const;
    },
    (error: unknown) => {
      settled = true;
      return { ok: false, error } as const;
    },
  );
  let elapsed = 0;
  while (!settled && elapsed < capMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
    elapsed += stepMs;
  }
  if (!settled) {
    throw new Error(`promise never settled within ${capMs}ms of fake time`);
  }
  const outcome = await tracked;
  if (outcome.ok) {
    return outcome.value;
  }
  throw outcome.error;
}

/** The tool's argument object, handed over as the tool declares it. */
function args(value: Record<string, unknown>): Parameters<typeof runListCategories>[1] {
  return value as unknown as Parameters<typeof runListCategories>[1];
}

interface Structured {
  family: string | null;
  family_title: string | null;
  categories: Array<{
    slug: string;
    title: string;
    url: string;
    description: string | null;
    sample_children: Array<{ slug: string; title: string; url: string }>;
    is_family: boolean;
  }>;
  category_count: number;
  categories_published: number;
  url: string;
  source: string;
  notes: string[];
}

function structuredOf(result: { structuredContent?: Record<string, unknown> }): Structured {
  const structured = result.structuredContent;
  if (structured === undefined) {
    throw new Error("the result carried no structured content");
  }
  return structured as unknown as Structured;
}

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  const first = result.content[0];
  if (first === undefined) {
    throw new Error("the result carried no text");
  }
  return first.text;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the root of the tree", () => {
  it("renders every family, with the slug a caller passes back", async () => {
    const result = await runWithClock(
      runListCategories(clientServing(fixture("categories-root")), args({})),
    );
    const structured = structuredOf(result);

    expect(structured.family).toBeNull();
    expect(structured.category_count).toBe(4);
    expect(structured.categories_published).toBe(4);
    expect(structured.categories.map((entry) => entry.slug)).toEqual([
      "brindilles",
      "galinettes",
      "orpins",
      "mousserons",
    ]);
    expect(structured.categories.every((entry) => entry.is_family)).toBe(true);
  });

  it("credits the site in the text and in the payload", async () => {
    const result = await runWithClock(
      runListCategories(clientServing(fixture("categories-root")), args({})),
    );

    expect(structuredOf(result).source).toBe(SOURCE_NAME);
    expect(textOf(result)).toContain(ATTRIBUTION);
  });

  it("carries no note where the level in hand raises none", async () => {
    // That the entries beside a family are an excerpt, and that a slug is
    // passed back as 'family', hold for every level alike: both are written in
    // the schema, which a caller reads once rather than on every call.
    const result = await runWithClock(
      runListCategories(clientServing(fixture("categories-root")), args({})),
    );

    expect(structuredOf(result).notes).toEqual([]);
  });
});

describe("one family, opened", () => {
  it("renders its categories, and none of them opens onto further ones", async () => {
    const result = await runWithClock(
      runListCategories(
        clientServing(fixture("categories-family")),
        args({ family: "brindilles" }),
      ),
    );
    const structured = structuredOf(result);

    expect(structured.family).toBe("brindilles");
    expect(structured.family_title).toBe("Recettes Brindilles");
    expect(structured.categories.every((entry) => entry.is_family)).toBe(false);
    // Nothing sits beside an entry at this level, so nothing is offered as one.
    expect(structured.categories.every((entry) => entry.sample_children.length === 0)).toBe(true);
    expect(structured.notes.join(" ")).not.toMatch(/excerpt|sample/i);
  });

  it("repeats the blurb the site writes, and leaves it null where there is none", async () => {
    const result = await runWithClock(
      runListCategories(
        clientServing(fixture("categories-family")),
        args({ family: "brindilles" }),
      ),
    );
    const [first, second] = structuredOf(result).categories;

    expect(first?.description).toBe("Une brindille de saison, courte et tendre.");
    expect(second?.description).toBeNull();
  });
});

describe("a level holding nothing", () => {
  it("renders an absence, which is what the site answered", async () => {
    const result = await runWithClock(
      runListCategories(clientServing(fixture("categories-empty")), args({ family: "orpins" })),
    );
    const structured = structuredOf(result);

    expect(structured.categories).toEqual([]);
    expect(structured.category_count).toBe(0);
    expect(textOf(result)).toMatch(/no categor/i);
  });
});

describe("a limit", () => {
  it("renders that many, and says how many the site published", async () => {
    const result = await runWithClock(
      runListCategories(clientServing(fixture("categories-root")), args({ limit: 2 })),
    );
    const structured = structuredOf(result);

    expect(structured.category_count).toBe(2);
    expect(structured.categories_published).toBe(4);
    // A cap that says nothing reads as a complete listing, which this is not.
    expect(structured.notes.join(" ")).toContain("4");
  });

  it("says nothing about a cap that dropped nothing", async () => {
    const result = await runWithClock(
      runListCategories(clientServing(fixture("categories-root")), args({ limit: 50 })),
    );
    const structured = structuredOf(result);

    expect(structured.category_count).toBe(4);
    expect(structured.notes.join(" ")).not.toMatch(/of the 4\b/);
  });
});

describe("an entry the page held and this could not render", () => {
  it("is named in the notes, so the caller learns a row was dropped", async () => {
    const result = await runWithClock(
      runListCategories(
        clientServing(fixture("categories-broken-entry")),
        args({ family: "galinettes" }),
      ),
    );
    const structured = structuredOf(result);

    expect(structured.category_count).toBe(2);
    expect(structured.categories_published).toBe(2);
    expect(structured.notes.join(" ")).toMatch(/set aside|dropped/i);
  });
});

describe("what the caller reads when only the text block is rendered", () => {
  it("stays within the ceiling, credit and notes included", async () => {
    const result = await runWithClock(
      runListCategories(clientServing(fixture("categories-root")), args({})),
    );

    expect(textOf(result).length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
  });

  it("names each category by the slug that opens it", async () => {
    const result = await runWithClock(
      runListCategories(clientServing(fixture("categories-root")), args({})),
    );
    const text = textOf(result);

    for (const slug of ["brindilles", "galinettes", "orpins", "mousserons"]) {
      expect(text).toContain(slug);
    }
  });
});

describe("the declaration the tool publishes", () => {
  it("takes family and limit, and nothing else", () => {
    expect(Object.keys(listCategoriesOutputShape)).toContain("categories");
    const parsed = listCategoriesArgs.safeParse({ family: "brindilles", limit: 5 });

    expect(parsed.success).toBe(true);
  });

  it("says why a slug cannot be guessed", () => {
    expect(listCategoriesDescription).toMatch(/slug/i);
    expect(listCategoriesDescription.length).toBeGreaterThan(80);
  });
});

describe("several entries set aside at once", () => {
  it("are counted in the plural, and each one is named", async () => {
    const result = await runWithClock(
      runListCategories(
        clientServing(fixture("categories-pointing-away")),
        args({ family: "ailleurs" }),
      ),
    );
    const notes = structuredOf(result).notes.join(" ");

    expect(notes).toContain("5 entries were set aside");
    expect(notes).toContain("Un article");
  });
});

describe("a level whose page carries no heading", () => {
  it("renders the level without borrowing a title for it", async () => {
    const result = await runWithClock(
      runListCategories(
        clientServing(fixture("categories-no-heading")),
        args({ family: "orpins" }),
      ),
    );

    expect(structuredOf(result).family_title).toBeNull();
    expect(textOf(result)).not.toContain("headed");
  });
});
