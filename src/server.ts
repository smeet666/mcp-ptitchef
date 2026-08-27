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
import type { BrowseRecipesArgs } from "./tools/browseRecipes.js";
import {
  browseRecipesArgs,
  browseRecipesDescription,
  browseRecipesOutputShape,
  runBrowseRecipes,
} from "./tools/browseRecipes.js";
import type { GetRecipeArgs } from "./tools/getRecipe.js";
import {
  getRecipeArgs,
  getRecipeDescription,
  getRecipeOutputShape,
  runGetRecipe,
} from "./tools/getRecipe.js";
import type { GetRecipeTranslationsArgs } from "./tools/getRecipeTranslations.js";
import {
  getRecipeTranslationsArgs,
  getRecipeTranslationsDescription,
  getRecipeTranslationsOutputShape,
  runGetRecipeTranslations,
} from "./tools/getRecipeTranslations.js";
import type { SearchByIngredientsArgs } from "./tools/searchByIngredients.js";
import {
  runSearchByIngredients,
  searchByIngredientsArgs,
  searchByIngredientsDescription,
  searchByIngredientsOutputShape,
} from "./tools/searchByIngredients.js";
import type { SearchRecipesArgs } from "./tools/searchRecipes.js";
import {
  runSearchRecipes,
  searchRecipesArgs,
  searchRecipesDescription,
  searchRecipesOutputShape,
} from "./tools/searchRecipes.js";
import {
  runScaleIngredients,
  scaleIngredientsDescription,
  scaleIngredientsInput,
  scaleIngredientsOutputShape,
} from "./tools/scaleIngredients.js";
import type { ScaleIngredientsArgs } from "./tools/scaleIngredients.js";
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
  "search_recipes is answered by the site in one of two ways, and 'kind' says which: from a category page of its own, whose total counts that category, or on its own terms on a single page whose total is the rows served. The two totals count different things.",
  "browse_recipes reads a category page by page, and search_by_ingredients answers what can be made from what a cook has.",
  "Some topics are answered with a guide the site wrote: recipes grouped under headings of its own, with no total and rows carrying only a name and an address. 'kind' says 'guide' there, and browse_recipes on the same 'topic_slug' reads the topic's full listing with its total.",
  "A listing marked 'single_page' whose total exceeds 'rows_seen' has a remainder the site counts and will not serve.",
  "The page an answer reports is the page the site served, which is the first page again when the page asked for is past the last one.",
  "get_recipe reads one recipe from the 'id' a listing row carried, and rescales its ingredients when given 'servings'. Read each line's 'scaling' before quoting a quantity: 'scaled' is exact, 'rounded' was moved to stay usable, 'unscaled' carries nothing that could be multiplied.",
  "scale_ingredients does the same arithmetic offline on any French ingredient list, whatever its source.",
  "get_recipe_translations lists the other languages a recipe was published in, using the pairing the site itself publishes.",
  "A time or a figure the site publishes none of is null, never zero, and the cost it estimates is repeated as published rather than recomputed.",
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

  server.registerTool(
    "search_recipes",
    {
      title: "Search recipes",
      description: searchRecipesDescription,
      inputSchema: searchRecipesArgs,
      outputSchema: z.object(searchRecipesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runSearchRecipes(client, args as SearchRecipesArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "browse_recipes",
    {
      title: "Browse a category or a standing list",
      description: browseRecipesDescription,
      inputSchema: browseRecipesArgs,
      outputSchema: z.object(browseRecipesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runBrowseRecipes(client, args as BrowseRecipesArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "search_by_ingredients",
    {
      title: "Find recipes from the ingredients a cook has",
      description: searchByIngredientsDescription,
      inputSchema: searchByIngredientsArgs,
      outputSchema: z.object(searchByIngredientsOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runSearchByIngredients(client, args as SearchByIngredientsArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Read one recipe",
      description: getRecipeDescription,
      inputSchema: getRecipeArgs,
      outputSchema: z.object(getRecipeOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runGetRecipe(client, args as GetRecipeArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "scale_ingredients",
    {
      title: "Rescale an ingredient list",
      description: scaleIngredientsDescription,
      inputSchema: scaleIngredientsInput,
      outputSchema: z.object(scaleIngredientsOutputShape),
      annotations: { ...READ_ONLY, openWorldHint: false },
    },
    (args) => runScaleIngredients(args as ScaleIngredientsArgs),
  );

  server.registerTool(
    "get_recipe_translations",
    {
      title: "Find a recipe in the other languages it was published in",
      description: getRecipeTranslationsDescription,
      inputSchema: getRecipeTranslationsArgs,
      outputSchema: z.object(getRecipeTranslationsOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runGetRecipeTranslations(client, args as GetRecipeTranslationsArgs);
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
