import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { PtitchefClient } from "../../src/ptitchef/client.js";
import { runBrowseRecipes } from "../../src/tools/browseRecipes.js";
import { runSearchByIngredients } from "../../src/tools/searchByIngredients.js";
import { runSearchRecipes } from "../../src/tools/searchRecipes.js";
import { ATTRIBUTION, MAX_TEXT_CHARS, SOURCE_NAME } from "../../src/tools/shared.js";

const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}.html`, import.meta.url)), "utf8");
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function clientServing(body: string, servedFrom?: string): PtitchefClient {
  const fetchImpl = (async (input: string | URL | Request): Promise<Response> => {
    const asked = urlOf(input);
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    Object.defineProperty(response, "url", { value: servedFrom ?? asked });
    return response;
  }) as unknown as typeof fetch;
  return new PtitchefClient({ config: loadConfig({}), logger: createLogger("silent"), fetchImpl });
}

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

interface Structured {
  asked: string;
  kind: string;
  topic_slug: string | null;
  title: string | null;
  results: Array<{
    id: string;
    title: string;
    rating: number | null;
    total_minutes: number | null;
  }>;
  result_count: number;
  rows_seen: number;
  total_available: number | null;
  page: number;
  single_page: boolean;
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

/** Args as the tool declares them, so an undeclared one still reaches the check. */
const args = <T>(value: Record<string, unknown>): T => value as unknown as T;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("search_recipes", () => {
  it("renders the rows and credits the site", async () => {
    const result = await runWithClock(
      runSearchRecipes(clientServing(fixture("listing-whole")), args({ query: "brindilles" })),
    );
    const structured = structuredOf(result);

    expect(structured.result_count).toBe(3);
    expect(structured.rows_seen).toBe(3);
    expect(structured.source).toBe(SOURCE_NAME);
    expect(textOf(result)).toContain(ATTRIBUTION);
  });

  it("says what the total counts when the site answered on its own terms", async () => {
    const result = await runWithClock(
      runSearchRecipes(clientServing(fixture("listing-whole")), args({ query: "brindilles" })),
    );
    const structured = structuredOf(result);

    expect(structured.kind).toBe("free_text");
    expect(structured.notes.join(" ")).toMatch(/its own terms/i);
  });

  it("names the category page a search was answered from", async () => {
    const result = await runWithClock(
      runSearchRecipes(
        clientServing(fixture("listing-first"), "https://www.ptitchef.com/recettes/brindilles"),
        args({ query: "brindille" }),
      ),
    );
    const structured = structuredOf(result);

    expect(structured.kind).toBe("topic");
    expect(structured.topic_slug).toBe("brindilles");
    // A total counting a category is not a count of what matched the words.
    expect(structured.notes.join(" ")).toMatch(/category page of its own/i);
    expect(structured.notes.join(" ")).toContain("browse_recipes");
  });

  it("renders an absence the site stated, without calling it a failure", async () => {
    const result = await runWithClock(
      runSearchRecipes(clientServing(fixture("listing-empty")), args({ query: "zzzzqqqxx" })),
    );
    const structured = structuredOf(result);

    expect(structured.results).toEqual([]);
    expect(structured.total_available).toBe(0);
    expect(textOf(result)).toMatch(/lists no recipe/i);
  });

  it("says how many rows a limit left out", async () => {
    const result = await runWithClock(
      runSearchRecipes(
        clientServing(fixture("listing-whole")),
        args({ query: "brindilles", limit: 2 }),
      ),
    );
    const structured = structuredOf(result);

    expect(structured.result_count).toBe(2);
    expect(structured.rows_seen).toBe(3);
    expect(structured.notes.join(" ")).toContain("2 of the 3 rows");
  });

  it("refuses an argument it does not declare", async () => {
    await expect(
      runSearchRecipes(
        clientServing(fixture("listing-whole")),
        args({ query: "x", sort: "rating" }),
      ),
    ).rejects.toThrow(/^\[invalid_input]/);
  });

  it("stays within the text ceiling, credit and notes included", async () => {
    const result = await runWithClock(
      runSearchRecipes(clientServing(fixture("listing-whole")), args({ query: "brindilles" })),
    );

    expect(textOf(result).length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
  });
});

describe("browse_recipes", () => {
  it("reads a category and says what its total counts", async () => {
    const result = await runWithClock(
      runBrowseRecipes(clientServing(fixture("listing-first")), args({ category: "brindilles" })),
    );
    const structured = structuredOf(result);

    expect(structured.kind).toBe("category");
    expect(structured.total_available).toBe(306);
    expect(structured.single_page).toBe(false);
    expect(structured.notes.join(" ")).toMatch(/across all its pages/i);
  });

  it("says when the site answered with another page than the one asked for", async () => {
    const result = await runWithClock(
      runBrowseRecipes(
        clientServing(fixture("listing-first"), "https://www.ptitchef.com/recettes/brindilles"),
        args({ category: "brindilles", page: 99 }),
      ),
    );
    const structured = structuredOf(result);

    expect(structured.page).toBe(1);
    expect(structured.notes.join(" ")).toContain("Page 99 was asked for");
  });

  it("says nothing about a page the site answered as asked", async () => {
    const result = await runWithClock(
      runBrowseRecipes(
        clientServing(
          fixture("listing-first"),
          "https://www.ptitchef.com/recettes/brindilles-page-2",
        ),
        args({ category: "brindilles", page: 2 }),
      ),
    );

    expect(structuredOf(result).notes.join(" ")).not.toContain("was asked for");
  });

  it("reads a standing list and says the total is its length", async () => {
    const result = await runWithClock(
      runBrowseRecipes(clientServing(fixture("listing-whole")), args({ listing: "top_rated" })),
    );
    const structured = structuredOf(result);

    expect(structured.kind).toBe("standing");
    expect(structured.notes.join(" ")).toMatch(/standing list/i);
  });

  it("refuses a call naming neither a category nor a listing", async () => {
    await expect(
      runBrowseRecipes(clientServing(fixture("listing-first")), args({})),
    ).rejects.toThrow(/^\[invalid_input]/);
  });

  it("refuses a call naming both, since it asks two questions", async () => {
    await expect(
      runBrowseRecipes(
        clientServing(fixture("listing-first")),
        args({ category: "brindilles", listing: "latest" }),
      ),
    ).rejects.toThrow(/not both/);
  });

  it("refuses a standing list it does not keep", async () => {
    await expect(
      runBrowseRecipes(clientServing(fixture("listing-first")), args({ listing: "quickest" })),
    ).rejects.toThrow(/^\[invalid_input]/);
  });
});

describe("search_by_ingredients", () => {
  it("renders what the site found and names what was asked", async () => {
    const result = await runWithClock(
      runSearchByIngredients(
        clientServing(fixture("listing-whole")),
        args({ ingredients: ["poulet", "citron"] }),
      ),
    );
    const structured = structuredOf(result);

    expect(structured.kind).toBe("fridge");
    expect(structured.asked).toBe("poulet, citron");
    expect(structured.result_count).toBe(3);
  });

  it("says the site counts more than it will serve", async () => {
    // The fridge counts every recipe it finds and serves one page. A caller
    // told only the total would go looking for rows that cannot be reached.
    const result = await runWithClock(
      runSearchByIngredients(
        clientServing(fixture("listing-fridge-cut")),
        args({ ingredients: ["poulet"] }),
      ),
    );
    const structured = structuredOf(result);

    expect(structured.single_page).toBe(true);
    expect(structured.total_available).toBe(89);
    expect(structured.rows_seen).toBe(3);
    expect(structured.notes.join(" ")).toMatch(/cannot be read/i);
  });

  it("says nothing of a remainder when the site served the lot", async () => {
    const result = await runWithClock(
      runSearchByIngredients(
        clientServing(fixture("listing-whole")),
        args({ ingredients: ["poulet"] }),
      ),
    );

    expect(structuredOf(result).notes.join(" ")).not.toMatch(/cannot be read/i);
  });

  it("refuses a longer list than the site's own form reads", async () => {
    await expect(
      runSearchByIngredients(
        clientServing(fixture("listing-whole")),
        args({ ingredients: ["a", "b", "c", "d", "e", "f"] }),
      ),
    ).rejects.toThrow(/^\[invalid_input]/);
  });

  it("refuses an argument it does not declare", async () => {
    await expect(
      runSearchByIngredients(
        clientServing(fixture("listing-whole")),
        args({ ingredients: ["poulet"], exclude: ["citron"] }),
      ),
    ).rejects.toThrow(/^\[invalid_input]/);
  });
});

describe("a row the page held and this could not render", () => {
  it("is named in the notes of a search", async () => {
    const result = await runWithClock(
      runSearchRecipes(clientServing(fixture("listing-broken-row")), args({ query: "brindilles" })),
    );

    expect(structuredOf(result).notes.join(" ")).toMatch(/rows were set aside/i);
  });

  it("is named in the notes of a browse", async () => {
    const result = await runWithClock(
      runBrowseRecipes(
        clientServing(fixture("listing-broken-row")),
        args({ category: "brindilles" }),
      ),
    );

    expect(structuredOf(result).notes.join(" ")).toMatch(/rows were set aside/i);
  });

  it("is named in the notes of a fridge search", async () => {
    const result = await runWithClock(
      runSearchByIngredients(
        clientServing(fixture("listing-broken-row")),
        args({ ingredients: ["poulet"] }),
      ),
    );

    expect(structuredOf(result).notes.join(" ")).toMatch(/rows were set aside/i);
  });
});
