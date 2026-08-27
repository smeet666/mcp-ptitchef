# mcp-ptitchef

Read Ptitchef from an MCP client. No API key, no account, read-only.

## What it does

**`list_categories`** publishes the tree of categories Ptitchef browses its
recipes by: the families of ingredients, or what one family holds, each with the
slug that opens it and the page it lives on.

It exists because the site writes those slugs freely. The same kind of thing
appears as `chou-kale` on one line and as `recette-de-petits-pois` on the next,
so an address built by hand misses, and the site answers a miss by sending the
reader to the root of the tree with HTTP 200 and the root's own categories. A
caller who guessed a slug gets a full, confident answer about a level they never
asked for.

## What sets it apart

The address an answer came back from is what decides which level it describes, so
a family the site does not hold is reported as an absence rather than rendered as
the categories it offered instead.

The entries the site shows beside a family are returned as the excerpt the site
marks them to be, with a note saying so. Every answer states what the page listed
beside what it rendered, so a capped listing never reads as a complete one, and an
entry the site published without a link is set aside, counted and named.

## Install

```bash
npx mcp-ptitchef
```

Or in an MCP client's configuration:

```json
{
  "mcpServers": {
    "ptitchef": {
      "command": "npx",
      "args": ["-y", "mcp-ptitchef"]
    }
  }
}
```

## Links

- Source: https://github.com/smeet666/mcp-ptitchef
- Package: https://www.npmjs.com/package/mcp-ptitchef
- Licence: MIT
