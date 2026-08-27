/**
 * MCP server wiring.
 *
 * One client, one rate limiter and one store are shared by every tool, so
 * pacing applies to the server as a whole rather than per tool. Tools are
 * registered in a fixed order, which is what lets a client cache the listing.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { PtitchefClient } from "./ptitchef/client.js";
import type { ListCategoriesArgs } from "./tools/listCategories.js";
import {
  listCategoriesArgs,
  listCategoriesDescription,
  listCategoriesOutputShape,
  runListCategories,
} from "./tools/listCategories.js";
import { toToolError } from "./tools/shared.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** This server only reads, so every tool is read-only. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const INSTRUCTIONS = [
  "Tools for reading recipes on Ptitchef, a French recipe site. No API key and no account are needed.",
  "Start with list_categories: the site browses its recipes by a tree of ingredient families, and every category is addressed by a slug.",
  "Never build a slug by hand. The site writes them freely, so the same ingredient appears as 'chou-kale' on one line and as 'recette-de-petits-pois' on the next, and a guessed slug reaches a page the site does not hold.",
  "Called without arguments, list_categories returns the families; pass a family's slug back as 'family' to list what it holds.",
  "The entries shown beside a family are an excerpt the site prints followed by an ellipsis, so their number says nothing about what the family holds.",
  "'category_count' is what an answer rendered and 'categories_published' is what the page listed; the two differ whenever a limit cut the list.",
  "This server paces itself, and a rate_limited error means the site asked it to slow down, never that nothing matched.",
  "When you show a recipe or a listing to a user, credit Ptitchef and link the page.",
].join(" ");

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new PtitchefClient({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-ptitchef", version: PKG_VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "list_categories",
    {
      title: "List the categories recipes are browsed by",
      description: listCategoriesDescription,
      inputSchema: listCategoriesArgs,
      outputSchema: z.object(listCategoriesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runListCategories(client, args as ListCategoriesArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", min interval ${config.minIntervalMs}ms, cache ${config.cacheTtlMs}ms`,
  );

  return server;
}
