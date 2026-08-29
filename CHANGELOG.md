# Changelog

## 1.0.1

- **Every tool is documented, with its arguments and what its answer carries.**
  The README is written for a person deciding whether to install and for a
  program installing on its own, and a test holds both halves to what the server
  registers.
- **The privacy policy travels in the package.** It states the hosts contacted,
  what a request carries, what is held and for how long.
- **The manifest names every tool the server registers**, which a host reads
  before installing anything.

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `server.json` declares the `.mcpb` bundle among its packages. The publish step
  was written to stamp its address and hash from the file the release carries,
  and found nothing to stamp, so the 1.0.0 registry entry names the npm package
  alone. The bundle is on the GitHub release either way.

## [1.0.0] - 2026-08-27

The first release. Everything below is what this server does, rather than how it
differs from a state anyone has installed.

### Added

- `list_categories`, which publishes the tree of categories Ptitchef browses its
  recipes by: the families of ingredients, or what one family holds, each with
  the slug that opens it and the page it lives on. It exists because the site
  writes those slugs freely, and an address built by hand reaches a page it does
  not hold.
- `search_recipes`, which searches by dish or ingredient. The site answers in
  five shapes and the answer states which: from a category page of its own, on
  its own terms, with a guide it wrote for the topic, with the one recipe it
  opens for words precise enough to name one, and with its recipes home page for
  words it could make nothing of.
- `browse_recipes`, which reads a category page by page or one of the lists the
  site keeps standing, and reports the page and the address the site served
  rather than the ones it was asked for.
- `search_by_ingredients`, which reads the site's own fridge search and says how
  much of what it counts it will not serve.
- `get_recipe`, which reads one recipe with its ingredients, method, times,
  nutrition and estimated cost, rescaled to a number of servings on request.
  Nothing is multiplied blindly: a countable thing lands on the smallest share a
  cook takes out of one of it, a mass moves to a smaller unit before it is
  rounded, and every line states what the arithmetic did to it.
- `scale_ingredients`, which does that arithmetic offline on any French
  ingredient list, whatever its source.
- `get_recipe_translations`, which lists the other languages a recipe was
  published in, using the pairing the site itself publishes between its
  editions.

### Notes on what this holds itself to

- A note qualifies the answer it sits on. What holds for every answer alike is
  written in the schema and in the tool's description, which a caller reads once
  rather than on every call.
- Every guard excluded from the coverage measurement carries the reason it is
  excluded, stated for that guard rather than for guards in general.
