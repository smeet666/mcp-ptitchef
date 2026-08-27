# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A page whose listing this server cannot read, but whose title states a count,
  is reported as a failure to read rather than rendered as an absence.
- A search is answered by the site in five shapes, and all five are read: a
  category listing, its own free-text results, a guide it wrote, the one recipe
  it opens for words precise enough to name one, and the recipes home page it
  falls back to for words it made nothing of.
- What a listing's total counts is read off the answer rather than asserted from
  how the listing came to be. A search whose total exceeded the rows served
  carried two notes contradicting each other.
- `browse_recipes` names the address it was given alongside the one the site
  answered from, as it already did for a page past the last one.
- The servings keep the wording the page writes them in: a recipe yielding
  pieces is no longer described as serving people.
- The cost the site estimates is stated with the servings it was published for,
  and the opinion that accompanied it, which no data carried, is gone.
- A figure read out of a word is named wherever it is published, so "Quelques
  feuilles" no longer comes back carrying a three the page never printed.
- A fraction written after its measure belongs to the amount: "1 pot 1/2" is one
  and a half rather than one. A measure the line states behind the name, as in
  "lardons (200 à 300 g)", is read. "1/4 de litre" is a volume rather than a
  share of a countable thing. A half hanging on a count past a handful is
  rounded away.
- A vague measure taken below its floor says its proportion was broken, and a
  guide's repeated row is counted among the rows the page served.
- A line opening the way this server's own notes open is quoted whatever its
  case, its indentation or its spacing before the colon.
- An address read out of a page is refused unless it stays on this site, an
  identifier walking up out of its path is refused, and a read the site
  redirected elsewhere is refused rather than credited to it.
- A text block cut to fit says that it was cut.
- The refusal code is written once rather than twice.

- A topic the site answers with a guide of its own, rather than with a listing,
  is read as a guide instead of failing. Every listing address now carries its
  page number, which is what reaches the listing of such a topic.
- The kinds of listing a tool may answer with are declared in one place, so a
  kind the server can produce can no longer be refused by the schema that
  publishes it.

### Changed

- `amount_max`, `query` and `steps` are published in the shapes every source of
  recipes publishes them in; `illustrated_steps` carries the photograph the site
  took of each step.
- `calories` on a listing row keeps the wording the row prints, unit and serving
  included, since rows of one listing name different servings.
- `scale_ingredients` refuses a call stating the factor twice rather than
  applying one and noting the other.

### Added

- `list_categories`, which publishes the tree of categories Ptitchef browses its
  recipes by: the families of ingredients, or what one family holds, each with
  the slug that opens it and the page it lives on.
- `search_recipes`, which searches by dish or ingredient and states whether the
  site answered from a category page of its own or on its own terms, since the
  two totals count different things.
- `browse_recipes`, which reads a category page by page or one of the lists the
  site keeps standing, and reports the page the site served rather than the page
  that was asked for.
- `search_by_ingredients`, which reads the site's own fridge search and says how
  much of what it counts it will not serve.
- `get_recipe`, which reads one recipe with its ingredients, method, times,
  nutrition and estimated cost, rescaled to a number of servings on request and
  saying of every line what the arithmetic did to it.
- `scale_ingredients`, which does that arithmetic offline on any French
  ingredient list, whatever its source.
- `get_recipe_translations`, which lists the other languages a recipe was
  published in, using the pairing the site itself publishes.
