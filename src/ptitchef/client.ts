/**
 * The reading layer, publishable on its own.
 *
 * It owns the pacing, the store and the error vocabulary, and it knows nothing
 * about the protocol above it. A program can import it as an ordinary library
 * and get the same care the tools get.
 */

import type { Config, Logger } from "../config.js";
import { invalidInput, notFound } from "../errors.js";
import type { CategoryReport, Read } from "../types.js";
import { Cache } from "./cache.js";
import { fetchPage } from "./http.js";
import { parseCategoryPage } from "./parse.js";
import { RateLimiter } from "./rateLimiter.js";
import { categoryUrl, isFamilyHref, isSlug, slugFromHref } from "./urls.js";

export interface ClientOptions {
  config: Config;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

/** A read held in the store, kept with what it had to set aside. */
interface StoredCategories {
  report: CategoryReport;
  skipped: string[];
}

export class PtitchefClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly limiter: RateLimiter;
  private readonly categories: Cache<StoredCategories>;

  constructor(options: ClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl;
    this.limiter = new RateLimiter({ intervalMs: options.config.minIntervalMs });
    this.categories = new Cache<StoredCategories>(
      options.config.cacheTtlMs,
      options.config.cacheMaxEntries,
    );
  }

  /**
   * Read one level of the category tree.
   *
   * Without a family this reads the root, which lists the families themselves.
   * With one it reads that family's own page, which lists the categories it
   * holds.
   *
   * A family that cannot become an address is refused here rather than sent.
   * The site answers an address it does not hold with a 404, and reporting that
   * as an absence would state something about the tree that a misspelling
   * caused.
   */
  async listCategories(family?: string | null): Promise<Read<CategoryReport>> {
    const named = typeof family === "string" ? family.trim() : null;
    if (named !== null && !isSlug(named)) {
      throw invalidInput(
        `"${named}" is not a family of this site's category tree.`,
        "A family is written in lowercase letters, digits and hyphens. Call this tool without one to read the families the site publishes.",
      );
    }

    const url = categoryUrl(named);

    const stored = this.categories.get(url);
    if (stored) {
      this.logger.debug(`served from the store: ${url}`);
      return withSkipped({ data: stored.report, cached: true }, stored.skipped);
    }

    const page = await this.limiter.schedule(() =>
      fetchPage({
        url,
        userAgent: this.config.userAgent,
        timeoutMs: this.config.timeoutMs,
        maxRetries: this.config.maxRetries,
        limiter: this.limiter,
        logger: this.logger,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      }),
    );

    // The site answers a family it does not hold by sending the reader to the
    // root of the tree, with HTTP 200 and the root's own categories. Rendering
    // that would answer "here is what this family holds" with a level nobody
    // asked for, so the address the answer came from settles which level it is.
    const served = servedLevel(page.url, named);
    if (!served.held) {
      throw notFound(
        named === null
          ? "Ptitchef answered the root of its category tree with another level."
          : `Ptitchef holds no category family named "${named}".`,
        {
          url,
          hint: "Call this tool without a family to list the families the site publishes.",
        },
      );
    }

    // Parsed before it is stored, so a page nobody could read is never served
    // back for the rest of the entry's lifetime.
    const parsed = parseCategoryPage(page.body, served.family, page.url);
    if (parsed.skipped.length > 0) {
      const count = parsed.skipped.length;
      this.logger.warn(`${count} ${count === 1 ? "entry" : "entries"} set aside on ${url}`);
    }
    this.categories.set(url, { report: parsed.report, skipped: parsed.skipped });
    return withSkipped({ data: parsed.report, cached: false }, parsed.skipped);
  }

  /** The spacing in force, reported rather than guessed. */
  get currentIntervalMs(): number {
    return this.limiter.currentIntervalMs;
  }
}

/** Whether the site answered the level that was asked for, and which one it is. */
type ServedLevel = { held: true; family: string | null } | { held: false };

/**
 * The level a page belongs to, read from the address it was served from.
 *
 * The root is asked for by an address carrying no family, and a family by one
 * that does, so each can only be answered from its own kind of address. A page
 * of the other kind is one the site put in place of what was asked for.
 */
function servedLevel(servedUrl: string, asked: string | null): ServedLevel {
  const fromFamily = isFamilyHref(servedUrl);
  if (asked === null) {
    return fromFamily ? { held: false } : { held: true, family: null };
  }
  const slug = fromFamily ? slugFromHref(servedUrl) : null;
  return slug === null ? { held: false } : { held: true, family: slug };
}

/**
 * Attach what was set aside, and only when something was.
 *
 * An empty list beside every answer would read as a field the caller has to
 * check, where its absence says plainly that nothing was dropped.
 */
function withSkipped(read: Read<CategoryReport>, skipped: string[]): Read<CategoryReport> {
  return skipped.length > 0 ? { ...read, skipped } : read;
}
