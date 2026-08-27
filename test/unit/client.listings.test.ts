import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { PtitchefClient } from "../../src/ptitchef/client.js";

const FIXED_NOW = new Date("2026-01-01T00:00:00Z");
const FEED = "https://www.ptitchef.com/index.php";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}.html`, import.meta.url)), "utf8");
}

interface Call {
  url: string;
}

interface Fake {
  fetchImpl: typeof fetch;
  calls: Call[];
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

/** Answers every address with one page, served from an address of its own. */
function fakeFetch(body: string, servedFrom?: string): Fake {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const asked = urlOf(input);
    calls.push({ url: asked });
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    Object.defineProperty(response, "url", { value: servedFrom ?? asked });
    return response;
  };
  return { fetchImpl: impl as unknown as typeof fetch, calls };
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

function clientFor(fetchImpl: typeof fetch, env: Record<string, string> = {}): PtitchefClient {
  return new PtitchefClient({ config: loadConfig(env), logger: createLogger("silent"), fetchImpl });
}

function onlyCall(fake: Fake): string {
  expect(fake.calls).toHaveLength(1);
  const call = fake.calls[0];
  if (call === undefined) {
    throw new Error("no call recorded");
  }
  return call.url;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PtitchefClient.searchRecipes", () => {
  it("asks the site's own search route for the words it was given", async () => {
    const fake = fakeFetch(fixture("listing-whole"));
    const read = await runWithClock(clientFor(fake.fetchImpl).searchRecipes("purée de patate"));

    const asked = new URL(onlyCall(fake));
    expect(`${asked.origin}${asked.pathname}`).toBe(FEED);
    expect(asked.searchParams.get("obj")).toBe("feed");
    expect(asked.searchParams.get("action")).toBe("list");
    expect(asked.searchParams.get("q")).toBe("purée de patate");
    expect(read.data.asked).toBe("purée de patate");
  });

  it("reports a search the site answered on its own terms as free text", async () => {
    const fake = fakeFetch(fixture("listing-whole"));
    const read = await runWithClock(clientFor(fake.fetchImpl).searchRecipes("brindille rare"));

    expect(read.data.kind).toBe("free_text");
    expect(read.data.topic_slug).toBeNull();
  });

  it("reports a search the site sent to a category page, and names that page", async () => {
    // The site reads a search and answers it from a page of its own choosing.
    // A caller told nothing would read that page's total as a count of what
    // matched the words they typed.
    const fake = fakeFetch(
      fixture("listing-first"),
      "https://www.ptitchef.com/recettes/puree-de-patates-douces",
    );
    const read = await runWithClock(clientFor(fake.fetchImpl).searchRecipes("puree de patate"));

    expect(read.data.kind).toBe("topic");
    expect(read.data.topic_slug).toBe("puree-de-patates-douces");
    expect(read.data.url).toBe("https://www.ptitchef.com/recettes/puree-de-patates-douces");
  });

  it("reads the page the site served rather than the one asked for", async () => {
    const fake = fakeFetch(
      fixture("listing-first"),
      "https://www.ptitchef.com/recettes/tarte-aux-pommes-page-4",
    );
    const read = await runWithClock(clientFor(fake.fetchImpl).searchRecipes("tarte"));

    expect(read.data.page).toBe(4);
  });

  it("refuses a search carrying no word, without spending a request", async () => {
    const fake = fakeFetch(fixture("listing-whole"));

    await expect(
      runWithClock(clientFor(fake.fetchImpl).searchRecipes("   ")),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("PtitchefClient.browseRecipes", () => {
  it("asks for the first page of a category without a page number", async () => {
    const fake = fakeFetch(fixture("listing-first"));
    const read = await runWithClock(
      clientFor(fake.fetchImpl).browseRecipes({ category: "brindilles" }),
    );

    expect(onlyCall(fake)).toBe("https://www.ptitchef.com/recettes/brindilles");
    expect(read.data.kind).toBe("category");
    expect(read.data.asked).toBe("brindilles");
  });

  it("numbers every page after the first", async () => {
    const fake = fakeFetch(fixture("listing-first"));
    await runWithClock(
      clientFor(fake.fetchImpl).browseRecipes({ category: "brindilles", page: 7 }),
    );

    expect(onlyCall(fake)).toBe("https://www.ptitchef.com/recettes/brindilles-page-7");
  });

  it("reports the page the site served when it answered past the last one", async () => {
    // The site answers a page past the last one with the first page. Repeating
    // the number that was asked for would send a caller round the same rows.
    const fake = fakeFetch(
      fixture("listing-first"),
      "https://www.ptitchef.com/recettes/brindilles",
    );
    const read = await runWithClock(
      clientFor(fake.fetchImpl).browseRecipes({ category: "brindilles", page: 99 }),
    );

    expect(read.data.page).toBe(1);
  });

  it("asks for a standing list by its own address", async () => {
    const fake = fakeFetch(fixture("listing-whole"));
    const read = await runWithClock(
      clientFor(fake.fetchImpl).browseRecipes({ listing: "top_rated" }),
    );

    expect(onlyCall(fake)).toBe("https://www.ptitchef.com/les-mieux-notees");
    expect(read.data.kind).toBe("standing");
    expect(read.data.page).toBe(1);
  });

  it("keeps the page a standing list was asked for, since it carries no number", async () => {
    const fake = fakeFetch(fixture("listing-whole"));
    const read = await runWithClock(
      clientFor(fake.fetchImpl).browseRecipes({ listing: "latest", page: 3 }),
    );

    expect(read.data.page).toBe(3);
  });

  for (const category of ["Brindilles", "cat/legume", "a b", ""]) {
    it(`refuses the category ${JSON.stringify(category)} without spending a request`, async () => {
      const fake = fakeFetch(fixture("listing-first"));

      await expect(
        runWithClock(clientFor(fake.fetchImpl).browseRecipes({ category })),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(fake.calls).toHaveLength(0);
    });
  }

  it("refuses a standing list it does not keep, naming the ones it does", async () => {
    const fake = fakeFetch(fixture("listing-whole"));

    await expect(
      runWithClock(clientFor(fake.fetchImpl).browseRecipes({ listing: "quickest" })),
    ).rejects.toMatchObject({
      code: "invalid_input",
      // The names live in the hint, which is where a caller reads what to do
      // about a refusal.
      details: { hint: expect.stringContaining("latest") as unknown as string },
    });
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a browse naming neither a category nor a listing", async () => {
    const fake = fakeFetch(fixture("listing-whole"));

    await expect(runWithClock(clientFor(fake.fetchImpl).browseRecipes({}))).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});

describe("PtitchefClient.searchByIngredients", () => {
  it("sends one parameter per ingredient, as the site's own form does", async () => {
    const fake = fakeFetch(fixture("listing-whole"));
    const read = await runWithClock(
      clientFor(fake.fetchImpl).searchByIngredients(["poulet", "citron", "miel"]),
    );

    const asked = new URL(onlyCall(fake));
    expect(asked.searchParams.get("list_type")).toBe("fridge_search");
    expect(asked.searchParams.getAll("ingred[]")).toEqual(["poulet", "citron", "miel"]);
    expect(read.data.kind).toBe("fridge");
    expect(read.data.asked).toBe("poulet, citron, miel");
  });

  it("drops what is only whitespace before deciding there is nothing to ask", async () => {
    const fake = fakeFetch(fixture("listing-whole"));
    const read = await runWithClock(
      clientFor(fake.fetchImpl).searchByIngredients(["  poulet  ", "   ", "miel"]),
    );

    expect(new URL(onlyCall(fake)).searchParams.getAll("ingred[]")).toEqual(["poulet", "miel"]);
    expect(read.data.asked).toBe("poulet, miel");
  });

  it("refuses an empty list without spending a request", async () => {
    const fake = fakeFetch(fixture("listing-whole"));

    await expect(
      runWithClock(clientFor(fake.fetchImpl).searchByIngredients(["  "])),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a longer list than the site's own form reads", async () => {
    // Sending six where the form has five boxes would have the sixth dropped by
    // the site, and the answer would read as though it had been taken into
    // account.
    const fake = fakeFetch(fixture("listing-whole"));

    await expect(
      runWithClock(clientFor(fake.fetchImpl).searchByIngredients(["a", "b", "c", "d", "e", "f"])),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("a listing asked for twice", () => {
  it("is served from the store the second time", async () => {
    const fake = fakeFetch(fixture("listing-first"));
    const client = clientFor(fake.fetchImpl);

    const first = await runWithClock(client.browseRecipes({ category: "brindilles" }));
    const second = await runWithClock(client.browseRecipes({ category: "brindilles" }));

    expect(fake.calls).toHaveLength(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.data.results).toEqual(first.data.results);
  });

  it("carries what was set aside on the repeated read too", async () => {
    const fake = fakeFetch(fixture("listing-broken-row"));
    const client = clientFor(fake.fetchImpl);

    await runWithClock(client.browseRecipes({ category: "brindilles" }));
    const second = await runWithClock(client.browseRecipes({ category: "brindilles" }));

    expect(second.cached).toBe(true);
    expect(second.skipped).toHaveLength(3);
  });

  it("holds a search and a browse apart, since they are two addresses", async () => {
    const fake = fakeFetch(fixture("listing-first"));
    const client = clientFor(fake.fetchImpl);

    await runWithClock(client.searchRecipes("brindilles"));
    await runWithClock(client.browseRecipes({ category: "brindilles" }));

    expect(fake.calls).toHaveLength(2);
  });
});

describe("several rows set aside at once", () => {
  it("are counted in the plural on the way out", async () => {
    const written: string[] = [];
    const logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (message: string) => written.push(message),
      error: () => undefined,
    };
    const fake = fakeFetch(fixture("listing-broken-row"));
    const client = new PtitchefClient({
      config: loadConfig({}),
      logger,
      fetchImpl: fake.fetchImpl,
    });

    const read = await runWithClock(client.browseRecipes({ category: "brindilles" }));

    expect(read.skipped).toHaveLength(3);
    expect(written.join(" ")).toContain("3 rows set aside");
  });

  it("is counted in the singular for one", async () => {
    const written: string[] = [];
    const logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (message: string) => written.push(message),
      error: () => undefined,
    };
    const fake = fakeFetch(fixture("listing-one-broken-row"));
    const client = new PtitchefClient({
      config: loadConfig({}),
      logger,
      fetchImpl: fake.fetchImpl,
    });

    await runWithClock(client.browseRecipes({ category: "brindilles" }));

    expect(written.join(" ")).toContain("1 row set aside");
  });
});
