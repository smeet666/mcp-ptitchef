# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
