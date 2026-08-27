import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { PtitchefClient } from "../../src/ptitchef/client.js";
import { runGetRecipe } from "../../src/tools/getRecipe.js";
import { runGetRecipeTranslations } from "../../src/tools/getRecipeTranslations.js";
import { runScaleIngredients } from "../../src/tools/scaleIngredients.js";
import { ATTRIBUTION, SOURCE_NAME } from "../../src/tools/shared.js";

const FIXED_NOW = new Date("2026-01-01T00:00:00Z");
const ID = "recettes/accompagnement/brindilles-au-four-fid-101";
const PAGE = `https://www.ptitchef.com/${ID}`;

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
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    Object.defineProperty(response, "url", { value: servedFrom ?? urlOf(input) });
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

interface RecipeOut {
  id: string;
  title: string;
  yield: {
    original_count: number | null;
    original_text: string | null;
    requested: number | null;
    unit: string | null;
    factor: number | null;
  };
  ingredients: Array<{ original: string; text: string; scaling: string; amount: number | null }>;
  steps: Array<{ text: string; image_url: string | null }>;
  steps_are_one_block: boolean;
  prep_minutes: number | null;
  estimated_cost: string | null;
  nutrition: { calories: string | null } | null;
  faq: Array<{ question: string; answer: string }>;
  translations: Array<{ language: string; url: string }>;
  attribution: string;
  source: string;
  notes: string[];
}

function structuredOf<T>(result: { structuredContent?: Record<string, unknown> }): T {
  const structured = result.structuredContent;
  if (structured === undefined) {
    throw new Error("the result carried no structured content");
  }
  return structured as unknown as T;
}

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  const first = result.content[0];
  if (first === undefined) {
    throw new Error("the result carried no text");
  }
  return first.text;
}

const args = <T>(value: Record<string, unknown>): T => value as unknown as T;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("get_recipe without servings", () => {
  it("returns the lines as published and says no arithmetic was done", async () => {
    const result = await runWithClock(
      runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID })),
    );
    const recipe = structuredOf<RecipeOut>(result);

    expect(recipe.yield.factor).toBeNull();
    expect(recipe.yield.requested).toBeNull();
    expect(recipe.ingredients.map((line) => line.text)).toEqual(
      recipe.ingredients.map((line) => line.original),
    );
    expect(recipe.notes.join(" ")).toMatch(/no arithmetic/i);
  });

  it("leaves the text unflagged, since a flag would answer a question nobody asked", async () => {
    const result = await runWithClock(
      runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID })),
    );

    expect(textOf(result)).not.toContain("(unscaled)");
  });

  it("credits the site and links the page it read", async () => {
    const result = await runWithClock(
      runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID })),
    );
    const recipe = structuredOf<RecipeOut>(result);

    expect(recipe.source).toBe(SOURCE_NAME);
    expect(recipe.attribution).toContain(PAGE);
    expect(textOf(result)).toContain(ATTRIBUTION);
  });

  it("carries what the page states, times and cost included", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID })),
      ),
    );

    expect(recipe.prep_minutes).toBe(10);
    expect(recipe.estimated_cost).toBe("4.82 EUR");
    expect(recipe.nutrition?.calories).toBe("295Kcal");
    expect(recipe.faq).toHaveLength(1);
    expect(recipe.translations).toHaveLength(2);
  });

  it("says the cost is the site's own figure rather than one computed here", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID })),
      ),
    );

    expect(recipe.notes.join(" ")).toMatch(/site's own figure/i);
  });
});

describe("get_recipe with servings", () => {
  it("multiplies by the ratio of what was asked to what the page states", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID, servings: 8 })),
      ),
    );

    expect(recipe.yield.original_count).toBe(4);
    expect(recipe.yield.requested).toBe(8);
    expect(recipe.yield.factor).toBe(2);
    expect(recipe.yield.unit).toBe("parts");
  });

  it("reads a line the site's editor left a list marker on", async () => {
    // The marker is punctuation rather than part of what is measured, and a
    // line opening with one would otherwise come back carrying no quantity.
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID, servings: 8 })),
      ),
    );
    const honey = recipe.ingredients.find((line) => line.original.includes("miel"));

    expect(honey?.original).toBe("> 2 cuillères à soupe de miel");
    expect(honey?.scaling).not.toBe("unscaled");
    expect(honey?.text).toContain("4 cuillères à soupe de miel");
  });

  it("reads the units the site writes without a space, and its own abbreviations", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID, servings: 8 })),
      ),
    );

    expect(recipe.ingredients.find((line) => line.original.startsWith("800 gr"))?.text).toContain(
      "1,6 kg",
    );
    expect(recipe.ingredients.find((line) => line.original.startsWith("1,5kg"))?.text).toContain(
      "3 kg",
    );
  });

  it("says how many lines were rounded and how many carry nothing to multiply", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID, servings: 10 })),
      ),
    );

    expect(recipe.notes.join(" ")).toMatch(/rounded to stay usable/i);
    expect(recipe.notes.join(" ")).toMatch(/no usable quantity/i);
  });

  it("flags the lines it could not multiply, now that a factor was applied", async () => {
    const result = await runWithClock(
      runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID, servings: 8 })),
    );

    expect(textOf(result)).toContain("(unscaled)");
  });

  it("leaves the lines as published when the page states no servings", async () => {
    // Rescaling needs the number the page was written for, and inventing one
    // would multiply every quantity by a ratio nobody published.
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-bare"), PAGE), args({ id: ID, servings: 8 })),
      ),
    );

    expect(recipe.yield.factor).toBeNull();
    expect(recipe.yield.unit).toBeNull();
    expect(recipe.ingredients[0]?.text).toBe("2 brindilles");
    expect(recipe.notes.join(" ")).toMatch(/could not be rescaled/i);
  });
});

describe("get_recipe on a method written as one block", () => {
  it("says the single step is that block", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-one-block"), PAGE), args({ id: ID })),
      ),
    );

    expect(recipe.steps_are_one_block).toBe(true);
    expect(recipe.notes.join(" ")).toMatch(/one block of prose/i);
  });
});

describe("get_recipe on an identifier the site cannot answer", () => {
  it("refuses one of another shape without spending a request", async () => {
    await expect(
      runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: "brindilles" })),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("reports a page the site answered from elsewhere as an absence", async () => {
    // The site answers an address it does not hold by serving another page.
    const client = clientServing(fixture("recipe-full"), "https://www.ptitchef.com/recettes");

    await expect(runWithClock(runGetRecipe(client, args({ id: ID })))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses an argument it does not declare", async () => {
    await expect(
      runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID, portions: 8 })),
    ).rejects.toThrow(/^\[invalid_input]/);
  });
});

describe("get_recipe_translations", () => {
  it("lists what the page names, without the page itself", async () => {
    const result = await runWithClock(
      runGetRecipeTranslations(clientServing(fixture("recipe-full"), PAGE), args({ id: ID })),
    );
    const out = structuredOf<{
      translations: Array<{ language: string }>;
      translation_count: number;
      notes: string[];
    }>(result);

    expect(out.translations.map((one) => one.language)).toEqual(["es", "it"]);
    expect(out.translation_count).toBe(2);
    expect(out.notes.join(" ")).toMatch(/site's own/i);
    expect(textOf(result)).toContain("petitchef.es");
  });

  it("says an empty list is what the site published", async () => {
    const result = await runWithClock(
      runGetRecipeTranslations(clientServing(fixture("recipe-bare"), PAGE), args({ id: ID })),
    );
    const out = structuredOf<{ translation_count: number; notes: string[] }>(result);

    expect(out.translation_count).toBe(0);
    expect(out.notes.join(" ")).toMatch(/names no counterpart/i);
    expect(textOf(result)).toMatch(/no other language/i);
  });

  it("refuses an argument it does not declare", async () => {
    await expect(
      runGetRecipeTranslations(
        clientServing(fixture("recipe-full"), PAGE),
        args({ id: ID, language: "es" }),
      ),
    ).rejects.toThrow(/^\[invalid_input]/);
  });
});

describe("scale_ingredients", () => {
  it("multiplies by the factor it was given, without touching the network", () => {
    const result = runScaleIngredients({
      ingredients: ["200 g de farine", "3 oeufs", "sel"],
      factor: 2,
    });
    const out = structuredOf<{
      factor: number;
      ingredients: Array<{ text: string; scaling: string }>;
      scaled_count: number;
      unscaled_count: number;
    }>(result);

    expect(out.factor).toBe(2);
    expect(out.ingredients[0]?.text).toBe("400 g de farine");
    expect(out.ingredients[1]?.text).toBe("6 oeufs");
    expect(out.ingredients[2]?.scaling).toBe("unscaled");
    expect(out.unscaled_count).toBe(1);
  });

  it("computes the factor from a pair of serving counts", () => {
    const out = structuredOf<{ factor: number }>(
      runScaleIngredients({ ingredients: ["200 g de farine"], from_servings: 4, to_servings: 6 }),
    );

    expect(out.factor).toBe(1.5);
  });

  it("says which of the two it applied when both were given", () => {
    const out = structuredOf<{ factor: number; notes: string[] }>(
      runScaleIngredients({
        ingredients: ["200 g de farine"],
        factor: 3,
        from_servings: 4,
        to_servings: 6,
      }),
    );

    expect(out.factor).toBe(3);
    expect(out.notes.join(" ")).toContain("'factor' was applied");
  });

  it("refuses a call giving neither", () => {
    const result = runScaleIngredients({ ingredients: ["200 g de farine"] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^\[invalid_input]/);
  });

  it("reads a list marker some pages leave in front of a line", () => {
    const out = structuredOf<{ ingredients: Array<{ text: string; original: string }> }>(
      runScaleIngredients({ ingredients: ["> 2 gousses d'ail"], factor: 2 }),
    );

    expect(out.ingredients[0]?.original).toBe("> 2 gousses d'ail");
    expect(out.ingredients[0]?.text).toBe("4 gousses d'ail");
  });
});

describe("the same recipe asked for twice", () => {
  it("is served from the store the second time", async () => {
    let calls = 0;
    const fetchImpl = (async (): Promise<Response> => {
      calls += 1;
      const response = new Response(fixture("recipe-full"), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      Object.defineProperty(response, "url", { value: PAGE });
      return response;
    }) as unknown as typeof fetch;
    const client = new PtitchefClient({
      config: loadConfig({}),
      logger: createLogger("silent"),
      fetchImpl,
    });

    await runWithClock(runGetRecipe(client, args({ id: ID })));
    await runWithClock(runGetRecipeTranslations(client, args({ id: ID })));

    // The two tools read the same page, so the second is answered from the
    // store rather than by asking the site again.
    expect(calls).toBe(1);
  });
});

describe("scale_ingredients on measures a kitchen cannot halve", () => {
  it("multiplies the count of an approximate measure and says the size is yours", () => {
    const out = structuredOf<{ ingredients: Array<{ text: string }>; notes: string[] }>(
      runScaleIngredients({ ingredients: ["1 pincée de sel"], factor: 4 }),
    );

    expect(out.ingredients[0]?.text).toContain("pincées");
    expect(out.notes.join(" ")).toMatch(/approximate measure/i);
  });

  it("says when a quantity was clamped up to the smallest worth measuring", () => {
    const out = structuredOf<{ notes: string[] }>(
      runScaleIngredients({ ingredients: ["1 sachet de levure"], factor: 0.1 }),
    );

    expect(out.notes.join(" ")).toMatch(/clamped up/i);
  });

  it("says how many lines it had to round", () => {
    const out = structuredOf<{ notes: string[] }>(
      runScaleIngredients({ ingredients: ["1 oeuf", "3 oeufs"], factor: 2.5 }),
    );

    expect(out.notes.join(" ")).toMatch(/rounded to stay usable/i);
  });
});

describe("get_recipe when the arithmetic clamps or approximates", () => {
  it("says a measure whose size is the cook's was multiplied by count", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(clientServing(fixture("recipe-full"), PAGE), args({ id: ID, servings: 2 })),
      ),
    );

    expect(recipe.yield.factor).toBe(0.5);
  });
});

describe("get_recipe on a list reaching every verdict at once", () => {
  it("counts the approximate measures, the clamps and the rounds apart", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(
          clientServing(fixture("recipe-verdicts"), PAGE),
          args({ id: ID, servings: 1 }),
        ),
      ),
    );
    const notes = recipe.notes.join(" ");

    expect(notes).toMatch(/approximate measure/i);
    expect(notes).toMatch(/clamped up/i);
    expect(notes).toMatch(/no usable quantity/i);
  });
});

describe("a rescale where every line came out exact", () => {
  it("says nothing about lines carrying no usable quantity, since there are none", async () => {
    const recipe = structuredOf<RecipeOut>(
      await runWithClock(
        runGetRecipe(
          clientServing(fixture("recipe-all-scalable"), PAGE),
          args({ id: ID, servings: 8 }),
        ),
      ),
    );

    expect(recipe.ingredients.every((line) => line.scaling === "scaled")).toBe(true);
    expect(recipe.notes.join(" ")).not.toMatch(/no usable quantity/i);
  });
});
