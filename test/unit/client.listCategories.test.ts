import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { PtitchefClient } from "../../src/ptitchef/client.js";

const FIXED_NOW = new Date("2026-01-01T00:00:00Z");
const ROOT_URL = "https://www.ptitchef.com/recettes";
const FAMILY_URL = "https://www.ptitchef.com/recettes/cat/brindilles";

// The address a site owner writes to when this client misbehaves. It is the
// project's own repository, published in package.json.
const CONTACT = "github.com/smeet666/mcp-ptitchef";

function fixture(name: string): string {
  const path = fileURLToPath(new URL(`../fixtures/${name}.html`, import.meta.url));
  return readFileSync(path, "utf8");
}

interface Call {
  url: string;
  headers: Headers;
}

interface Fake {
  fetchImpl: typeof fetch;
  calls: Call[];
}

function pageResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function headersOf(input: string | URL | Request, init: RequestInit | undefined): Headers {
  if (typeof input !== "string" && !(input instanceof URL)) {
    return input.headers;
  }
  return new Headers(init?.headers);
}

/** Answers every address with the same page, and records what was asked. */
function fakeFetch(body: string): Fake {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: urlOf(input), headers: headersOf(input, init) });
    return pageResponse(body);
  };
  return { fetchImpl: impl as unknown as typeof fetch, calls };
}

/** Answers every address with a page served from somewhere else. */
function redirectingFetch(body: string, servedFrom: string): Fake {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: urlOf(input), headers: headersOf(input, init) });
    const response = pageResponse(body);
    Object.defineProperty(response, "url", { value: servedFrom });
    return response;
  };
  return { fetchImpl: impl as unknown as typeof fetch, calls };
}

/** Answers with a status the site chose, and records what was asked. */
function refusingFetch(status: number): Fake {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: urlOf(input), headers: headersOf(input, init) });
    return new Response("", { status });
  };
  return { fetchImpl: impl as unknown as typeof fetch, calls };
}

/**
 * Drives the fake clock forward until `promise` settles, so nothing in a test
 * waits on the real one. `stepMs` is the resolution the test needs from
 * `Date.now()`; `capMs` bounds the walk so an unfulfilled promise fails loudly
 * instead of hanging.
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

function clientFor(fetchImpl: typeof fetch, env: Record<string, string> = {}): PtitchefClient {
  const config = loadConfig(env);
  return new PtitchefClient({ config, logger: createLogger("error"), fetchImpl });
}

/** The single address a call asked for. */
function onlyCall(fake: Fake): Call {
  expect(fake.calls).toHaveLength(1);
  const call = fake.calls[0];
  if (call === undefined) {
    throw new Error("no call recorded");
  }
  return call;
}

describe("PtitchefClient.listCategories", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the root of the tree when no family is named", async () => {
    const fake = fakeFetch(fixture("categories-root"));
    const client = clientFor(fake.fetchImpl);

    const read = await runWithClock(client.listCategories());

    expect(onlyCall(fake).url).toBe(ROOT_URL);
    expect(read.cached).toBe(false);
    expect(read.data.family).toBeNull();
    expect(read.data.url).toBe(ROOT_URL);
    expect(read.data.category_count).toBe(read.data.categories.length);
  });

  it("treats an explicit null family as the root of the tree", async () => {
    const fake = fakeFetch(fixture("categories-root"));
    const client = clientFor(fake.fetchImpl);

    const read = await runWithClock(client.listCategories(null));

    expect(onlyCall(fake).url).toBe(ROOT_URL);
    expect(read.data.family).toBeNull();
  });

  it("asks for the page of the family it was given", async () => {
    const fake = fakeFetch(fixture("categories-family"));
    const client = clientFor(fake.fetchImpl);

    const read = await runWithClock(client.listCategories("brindilles"));

    expect(onlyCall(fake).url).toBe(FAMILY_URL);
    expect(read.data.family).toBe("brindilles");
  });

  it("trims a family before it becomes an address", async () => {
    const fake = fakeFetch(fixture("categories-family"));
    const client = clientFor(fake.fetchImpl);

    const read = await runWithClock(client.listCategories("  brindilles  "));

    expect(onlyCall(fake).url).toBe(FAMILY_URL);
    expect(read.data.family).toBe("brindilles");
  });

  it("carries what the page could not render", async () => {
    const fake = fakeFetch(fixture("categories-broken-entry"));
    const client = clientFor(fake.fetchImpl);

    const read = await runWithClock(client.listCategories("galinettes"));

    expect(read.skipped).toHaveLength(1);
  });

  it("leaves the skipped list off an answer that dropped nothing", async () => {
    const fake = fakeFetch(fixture("categories-family"));
    const client = clientFor(fake.fetchImpl);

    const read = await runWithClock(client.listCategories("brindilles"));

    expect(read.skipped).toBeUndefined();
  });

  it("sends a User-Agent carrying the project's contact address", async () => {
    const fake = fakeFetch(fixture("categories-root"));
    const client = clientFor(fake.fetchImpl);

    await runWithClock(client.listCategories());

    expect(onlyCall(fake).headers.get("user-agent")).toContain(CONTACT);
  });

  it("keeps the contact address even when PTC_USER_AGENT supplies its own", async () => {
    const fake = fakeFetch(fixture("categories-root"));
    const client = clientFor(fake.fetchImpl, {
      PTC_USER_AGENT: "SomeoneElse/1.0 (+https://example.invalid/contact)",
    });

    await runWithClock(client.listCategories());

    const agent = onlyCall(fake).headers.get("user-agent");
    expect(agent).toContain("SomeoneElse/1.0");
    expect(agent).toContain(CONTACT);
  });

  it("reports the spacing currently in force", () => {
    const fake = fakeFetch(fixture("categories-root"));
    const config = loadConfig({});
    const client = new PtitchefClient({
      config,
      logger: createLogger("error"),
      fetchImpl: fake.fetchImpl,
    });

    expect(client.currentIntervalMs).toBe(config.minIntervalMs);
  });
});

describe("a family the site does not hold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("comes back as not_found, which is what the site answered", async () => {
    const fake = refusingFetch(404);
    const client = clientFor(fake.fetchImpl);

    await expect(runWithClock(client.listCategories("galinettes"))).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("a family that cannot become an address", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const family of ["Légume", "cat/legume", "légume", "a b", "UPPER", ""]) {
    it(`is refused by invalid_input for ${JSON.stringify(family)}, without spending a request`, async () => {
      const fake = fakeFetch(fixture("categories-root"));
      const client = clientFor(fake.fetchImpl);

      await expect(runWithClock(client.listCategories(family))).rejects.toMatchObject({
        code: "invalid_input",
      });
      // A slug the site would answer with a 404 costs the site nothing here,
      // and a refusal reads differently from an absence it never stated.
      expect(fake.calls).toHaveLength(0);
    });
  }
});

describe("the same level asked for twice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is served from the store the second time", async () => {
    const fake = fakeFetch(fixture("categories-root"));
    const client = clientFor(fake.fetchImpl);

    const first = await runWithClock(client.listCategories());
    const second = await runWithClock(client.listCategories());

    expect(fake.calls).toHaveLength(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.data.categories).toEqual(first.data.categories);
  });

  it("carries what was set aside on the repeated read too", async () => {
    const fake = fakeFetch(fixture("categories-broken-entry"));
    const client = clientFor(fake.fetchImpl);

    await runWithClock(client.listCategories("galinettes"));
    const second = await runWithClock(client.listCategories("galinettes"));

    expect(second.cached).toBe(true);
    expect(second.skipped).toHaveLength(1);
  });

  it("asks again once the entry has expired", async () => {
    const fake = fakeFetch(fixture("categories-root"));
    const client = clientFor(fake.fetchImpl, { PTC_CACHE_TTL_MS: "1000" });

    await runWithClock(client.listCategories());
    await vi.advanceTimersByTimeAsync(1001);
    const second = await runWithClock(client.listCategories());

    expect(fake.calls).toHaveLength(2);
    expect(second.cached).toBe(false);
  });

  it("holds two levels apart, since they are two addresses", async () => {
    const fake = fakeFetch(fixture("categories-root"));
    const client = clientFor(fake.fetchImpl);

    await runWithClock(client.listCategories());
    await runWithClock(client.listCategories("brindilles"));

    expect(fake.calls.map((call) => call.url)).toEqual([ROOT_URL, FAMILY_URL]);
  });
});

describe("a page the store never holds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the one nobody could read, so the failure is not served back", async () => {
    const fake = fakeFetch(fixture("categories-no-container"));
    const client = clientFor(fake.fetchImpl);

    await expect(runWithClock(client.listCategories())).rejects.toMatchObject({
      code: "parse_failure",
    });
    await expect(runWithClock(client.listCategories())).rejects.toMatchObject({
      code: "parse_failure",
    });

    expect(fake.calls).toHaveLength(2);
  });
});

describe("a client built without a fetch of its own", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reads through the runtime's own, so a plain build still reaches the site", async () => {
    const globalFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(pageResponse(fixture("categories-root")));
    const client = new PtitchefClient({
      config: loadConfig({}),
      logger: createLogger("silent"),
    });

    const read = await runWithClock(client.listCategories());

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(read.data.category_count).toBe(4);
  });
});

describe("several entries set aside at once", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("are all carried back, and counted in the plural on the way out", async () => {
    const written: string[] = [];
    const logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (message: string) => written.push(message),
      error: () => undefined,
    };
    const fetchImpl = (async () =>
      pageResponse(fixture("categories-pointing-away"))) as unknown as typeof fetch;
    const client = new PtitchefClient({ config: loadConfig({}), logger, fetchImpl });

    const read = await runWithClock(client.listCategories("ailleurs"));

    expect(read.skipped).toHaveLength(5);
    expect(written.join(" ")).toContain("5 entries set aside");
  });
});

describe("a family the site answers with another level", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("comes back as not_found rather than as the level it was sent to", async () => {
    // The site answers a family it does not hold by sending the reader to the
    // root, with HTTP 200 and the root's own categories. Rendering those would
    // answer "here is what this family holds" with a level nobody asked for.
    const fake = redirectingFetch(fixture("categories-root"), ROOT_URL);
    const client = clientFor(fake.fetchImpl);

    await expect(runWithClock(client.listCategories("famille-absente"))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("names the family that was asked for, so the caller knows what to change", async () => {
    const fake = redirectingFetch(fixture("categories-root"), ROOT_URL);
    const client = clientFor(fake.fetchImpl);

    await expect(runWithClock(client.listCategories("famille-absente"))).rejects.toThrow(
      /famille-absente/,
    );
  });

  it("holds the root to the same rule, so a substituted root is refused too", async () => {
    const fake = redirectingFetch(fixture("categories-family"), FAMILY_URL);
    const client = clientFor(fake.fetchImpl);

    await expect(runWithClock(client.listCategories())).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("reports the family under the slug the site served it from", async () => {
    // A family the site answers from a canonical address of its own is still a
    // family, and the answer names the level it actually read.
    const fake = redirectingFetch(
      fixture("categories-family"),
      "https://www.ptitchef.com/recettes/cat/brindilles-seches",
    );
    const client = clientFor(fake.fetchImpl);

    const read = await runWithClock(client.listCategories("brindilles"));

    expect(read.data.family).toBe("brindilles-seches");
    expect(read.data.url).toBe("https://www.ptitchef.com/recettes/cat/brindilles-seches");
  });
});
