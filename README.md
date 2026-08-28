<img src="assets/icon-128.png" alt="" width="96" align="right">

# mcp-ptitchef

[![npm](https://img.shields.io/npm/v/mcp-ptitchef.svg)](https://www.npmjs.com/package/mcp-ptitchef)
[![CI](https://github.com/smeet666/mcp-ptitchef/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-ptitchef/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-ptitchef.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-ptitchef)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-ptitchef/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-ptitchef)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-ptitchef-gqkqc1?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-ptitchef-gqkqc1)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ptitchef&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1wdGl0Y2hlZiJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=ptitchef&config=%7B%22name%22%3A%22ptitchef%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-ptitchef%22%5D%7D)

[Ptitchef](https://www.ptitchef.com) is a French cooking site where home cooks
publish their recipes. Each one gives its ingredients, its steps, often
photographed one by one, its preparation and cooking times, its cost, its
nutrition figures and the ratings its readers left. The site files its recipes
under a tree of ingredient families, and publishes many of them in several
languages.

This server connects a chat client to that site. You can walk the tree of
categories, search the recipes by dish or by ingredient, browse a category or one
of the site's standing lists, ask what can be made from what is in the fridge,
read one recipe with its ingredients rescaled to the number of people at your
table, and find the other languages a recipe was published in. It needs no API
key and no account.

_[Version française](#mcp-ptitchef-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ptitchef&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1wdGl0Y2hlZiJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=ptitchef&config=%7B%22name%22%3A%22ptitchef%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-ptitchef%22%5D%7D)

**Claude Code**

```bash
claude mcp add ptitchef -- npx -y mcp-ptitchef
```

**Claude Desktop, Cursor, and any client using the standard config format**

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

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "ptitchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-ptitchef:1.0.0"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`www.ptitchef.com`, and nothing else: no volume, no port, no credential.

### Bundle, without npm

Download `mcp-ptitchef-1.0.0.mcpb` from
[the latest release](https://github.com/smeet666/mcp-ptitchef/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- « Qu'est-ce que Ptitchef a comme recettes de chou kale ? »
- "What can I cook with courgettes, feta and mint?"
- "Read me that gratin for eight people."
- "Show me the highest rated recipes on the site."
- "Is that recipe published in Spanish too?"

Ptitchef is a French site, so its recipes are found in French. The ordinary path
runs from a listing to a recipe: a row carries an `id`, and `get_recipe` takes
that id.

## Tools

| Tool                      | What it does                                                   |
| ------------------------- | -------------------------------------------------------------- |
| `list_categories`         | Walks the tree of ingredient families the site files under.    |
| `search_recipes`          | Finds recipes by dish or by ingredient.                        |
| `browse_recipes`          | Reads a category page by page, or a standing list.             |
| `search_by_ingredients`   | Answers what can be made from what a cook already has.         |
| `get_recipe`              | Reads one recipe, rescaled to a number of servings on request. |
| `scale_ingredients`       | Rescales any ingredient list, with no request to the site.     |
| `get_recipe_translations` | Lists the other languages a recipe was published in.           |

**Start at `list_categories`.** The site gives you the right addresses, which
saves building one by hand: an address built that way lands on the site's front
page.

### `list_categories`

Reads the tree the site files its recipes under. Called with no argument it
returns the families; pass a family's slug back as `family` to read what it
holds.

| Argument | Type                            | Required | What it does                                      |
| -------- | ------------------------------- | -------- | ------------------------------------------------- |
| `family` | string, 1 to 80 characters      | no       | A family's slug, to read the categories under it. |
| `limit`  | integer, 1 to 200, default `20` | no       | Rows to serve.                                    |

**In return:** rows carrying `slug`, which comes back as `family` or as
`category`; `title` in the site's own wording; `url`; `description`, which is
`null` where the page carries none; and `sample_children` for the categories one
level below.

### `search_recipes`

Searches the recipes for a dish or an ingredient.

| Argument | Type                            | Required | What it does                        |
| -------- | ------------------------------- | -------- | ----------------------------------- |
| `query`  | string, 1 to 120 characters     | yes      | A dish or an ingredient, in French. |
| `limit`  | integer, 1 to 100, default `20` | no       | Rows to serve.                      |

**In return:** `results`, rows carrying `id`, `title`, `url`, `image_url`,
`rating`, `rating_count` and `review_count`, a counter the page prints nothing
for being `null`. The envelope says how the site answered: `kind` reads
`category` when the answer came from a category page of its own, whose
`total_available` counts that whole category, and `free_text` when the site
answered on its own terms on a single page, where the total counts the rows
served. Those two totals count different things. `kind` also reads `guide` for a
topic the site wrote by hand, where rows carry a name and an address and no total
exists. Alongside come `result_count`, `rows_seen`, `page`, `single_page` and
`url`. A listing marked `single_page` whose total exceeds `rows_seen` has a
remainder the site counts and does not serve.

### `browse_recipes`

Reads a category page by page, or one of the site's standing lists.

| Argument   | Type                                   | Required | What it does                                                  |
| ---------- | -------------------------------------- | -------- | ------------------------------------------------------------- |
| `category` | string, 1 to 120 characters            | no       | A category slug, as `list_categories` published it.           |
| `listing`  | `latest`, `top_rated` or `most_viewed` | no       | A standing list, read instead of a category.                  |
| `page`     | integer, 1 to 1000                     | no       | The page of a category to read. A standing list has one page. |
| `limit`    | integer, 1 to 100, default `20`        | no       | Rows to serve.                                                |

**In return:** the envelope `search_recipes` returns, with `kind` reading
`category`, `standing` or `topic`. `page` is the page the site served, which is
the first one again when the page asked for is past the last.

### `search_by_ingredients`

Answers what can be made from the ingredients a cook already has.

| Argument      | Type                                        | Required | What it does                        |
| ------------- | ------------------------------------------- | -------- | ----------------------------------- |
| `ingredients` | array of 1 to 5 strings, 1 to 60 characters | yes      | The ingredients on hand, in French. |
| `limit`       | integer, 1 to 100, default `20`             | no       | Rows to serve.                      |

**In return:** the envelope the other listings return, with `kind` reading
`fridge`. The site matches on its own vocabulary, so an ingredient it writes
differently narrows the answer rather than widening it.

### `get_recipe`

Reads one recipe in full, and rescales its ingredients when a number of servings
is given.

| Argument   | Type                        | Required | What it does                                   |
| ---------- | --------------------------- | -------- | ---------------------------------------------- |
| `id`       | string, 1 to 300 characters | yes      | The `id` of a row from a search or a listing.  |
| `servings` | integer, 1 to 500           | no       | Rescale the ingredients to this many servings. |

**In return:** `title`, `url`, `description`, `image_url`, `category`, `cuisine`,
`difficulty` in the site's own wording, `author`, `published`, `modified`,
`rating`, `rating_count`, `review_count`, `prep_minutes`, `cook_minutes`,
`total_minutes`, `nutrition` as published for the serving size it names,
`estimated_cost`, `keywords`, `faq` and `translations`, each `null` where the
page states nothing. `steps` carries the method one line per step, and
`illustrated_steps` the same steps with the photograph the site took of each.
`yield` says what the recipe was written for and what it was rescaled to. Every
ingredient carries `scaling`, which reads `scaled`, `rounded` or `unscaled`: read
it before quoting a quantity, since `rounded` was moved to stay usable in a
kitchen.

### `scale_ingredients`

Applies the same arithmetic to any list of French ingredient lines, with no
request to the site.

| Argument        | Type                                       | Required   | What it does                               |
| --------------- | ------------------------------------------ | ---------- | ------------------------------------------ |
| `ingredients`   | array of 1 to 100 strings, up to 300 chars | yes        | The lines to rescale, in French.           |
| `factor`        | number, above 0 and up to 100              | one of two | The multiplier to apply.                   |
| `from_servings` | number, above 0 and up to 500              | one of two | How many servings the list is written for. |
| `to_servings`   | number, above 0 and up to 500              | one of two | How many servings are wanted.              |

Pass `factor`, or the `from_servings` and `to_servings` pair.

**In return:** the `factor` used, the rescaled `ingredients` in the shape
`get_recipe` returns, and `scaled_count`, `rounded_count` and `unscaled_count`.

### `get_recipe_translations`

Lists the other languages one recipe was published in, using the pairing the site
publishes itself.

| Argument | Type                        | Required | What it does                                  |
| -------- | --------------------------- | -------- | --------------------------------------------- |
| `id`     | string, 1 to 300 characters | yes      | The `id` of a row from a search or a listing. |

**In return:** `translations`, each carrying the `language` tag the site
publishes and the `url` of that version, with `translation_count` and the `url`
of the French page they were read from.

## Rescaling the quantities

A quantity is stated in the unit that suits it, so a line can come back in a
different unit from the one the recipe used: 200 g multiplied by twenty reads
`4 kg`.

How finely an ingredient can be divided depends on what it is. A baguette can be
cut in two, in three or in four; an egg cannot be shared out. A quantity landing
between the two is rounded, and the rescaled recipe then departs a little from
the proportions of the original. The line carries `rounded`, and its `note` says
what was done.

The figures are this server's arithmetic, so say they were recomputed when you
show them. A recipe whose page states no number of servings cannot be put to a
number of people, and the answer says so.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                | Default              | What it does                                                                              |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `PTC_USER_AGENT`        | the project identity | Names your application to the site, with an address where a person can be reached.        |
| `PTC_MIN_INTERVAL_MS`   | `1500`               | Gap between two requests, from 1000 to 60000.                                             |
| `PTC_TIMEOUT_MS`        | `20000`              | Deadline for one request, from 1000 to 120000.                                            |
| `PTC_MAX_RETRIES`       | `3`                  | Attempts after a transient failure, from 0 to 8.                                          |
| `PTC_CACHE_TTL_MS`      | `900000`             | How long a page stays in memory, from 0 to 86400000.                                      |
| `PTC_CACHE_MAX_ENTRIES` | `200`                | Pages held in memory at once, from 1 to 5000.                                             |
| `PTC_MAX_BODY_BYTES`    | `8000000`            | The largest response read whole, from 100000 to 64000000.                                 |
| `PTC_BUDGET_MS`         | `60000`              | The time one read owes an answer inside, retries and waits included, from 5000 to 600000. |
| `PTC_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                                  |

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                                                   |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `not_found`     | The site answered, and holds no such recipe or page.    | Check the slug with `list_categories`, or the id with a search.                                              |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                                                  |
| `rate_limited`  | The site asked this client to slow down.                | Wait the number of seconds the hint names and call again with the same arguments. The recipe is still there. |
| `parse_failure` | The page loaded and the expected content was absent.    | Report it at [the issue tracker](https://github.com/smeet666/mcp-ptitchef/issues).                           |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                                           |
| `timeout`       | The request passed its deadline or its budget.          | Raise `PTC_TIMEOUT_MS` or `PTC_BUDGET_MS`, or ask for fewer rows.                                            |

## As a library

The layer reading the site is published on its own, with its pacing, its cache
and its errors, and with no protocol attached.

```ts
import { PtitchefClient } from "mcp-ptitchef/client";

const client = new PtitchefClient();
const { data, cached } = await client.listCategories();
console.log(data.results.length, cached);
```

`listCategories`, `searchRecipes`, `browseRecipes`, `searchByIngredients` and
`getRecipe` each answer `{ data, cached }`, and throw an error carrying one of
the six codes. The floor between two requests holds here as well.

## Pacing and attribution

Requests go out one at a time with at least a second and a half between them, and
the floor of one second holds however the server is configured. The `User-Agent`
always ends with the project identity and an address where a person can be
reached.

Every result carries the address of the page it was read from, and `source` names
the site. Recipes, titles and categories belong to Ptitchef and to the cooks who
wrote them.

This MCP server is an unofficial project, with no affiliation to Ptitchef.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `www.ptitchef.com` and nothing else, holds its answers in memory
while it runs, and writes nothing to disk.
[PRIVACY.md](PRIVACY.md) states what a request carries and which settings change
any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
site itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-ptitchef/issues). Pull
requests are welcome; opening an issue first helps agree on the shape of the
change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The recipes belong to Ptitchef and to their authors.

---

<a name="mcp-ptitchef-français"></a>

# mcp-ptitchef (français)

_[English version](#mcp-ptitchef)_

[Ptitchef](https://www.ptitchef.com) est un site de cuisine français où des
cuisiniers publient leurs recettes. Chacune donne ses ingrédients, ses étapes,
souvent photographiées une à une, ses temps de préparation et de cuisson, son
coût, ses valeurs nutritionnelles et les notes laissées par ses lecteurs. Le site
classe ses recettes dans un arbre de familles d'ingrédients, et en publie
beaucoup en plusieurs langues.

Ce serveur relie un client de conversation à ce site. On peut parcourir l'arbre
des catégories, chercher des recettes par plat ou par ingrédient, lire une
catégorie ou l'une des listes permanentes du site, demander ce qu'on peut faire
avec ce qu'il y a dans le frigo, lire une recette avec ses ingrédients adaptés au
nombre de convives, et trouver les autres langues dans lesquelles une recette a
été publiée. Aucune clé d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ptitchef&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1wdGl0Y2hlZiJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=ptitchef&config=%7B%22name%22%3A%22ptitchef%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-ptitchef%22%5D%7D)

**Claude Code**

```bash
claude mcp add ptitchef -- npx -y mcp-ptitchef
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

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

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "ptitchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-ptitchef:1.0.0"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `www.ptitchef.com`, et de rien d'autre : aucun volume, aucun port,
aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-ptitchef-1.0.0.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-ptitchef/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Qu'est-ce que Ptitchef a comme recettes de chou kale ? »
- « Qu'est-ce que je peux cuisiner avec des courgettes, de la feta et de la menthe ? »
- « Lis-moi ce gratin pour huit personnes. »
- « Montre-moi les recettes les mieux notées du site. »
- « Cette recette existe-t-elle aussi en espagnol ? »

Ptitchef est un site français, donc ses recettes se trouvent en français. Le
chemin ordinaire va d'une liste à une recette : une ligne porte un `id`, et
`get_recipe` reprend cet identifiant.

## Les outils

| Outil                     | Ce qu'il fait                                                      |
| ------------------------- | ------------------------------------------------------------------ |
| `list_categories`         | Parcourt l'arbre des familles d'ingrédients du site.               |
| `search_recipes`          | Trouve des recettes par plat ou par ingrédient.                    |
| `browse_recipes`          | Lit une catégorie page par page, ou une liste permanente.          |
| `search_by_ingredients`   | Répond avec ce qu'on peut faire de ce qu'un cuisinier a déjà.      |
| `get_recipe`              | Lit une recette, adaptée à un nombre de parts sur demande.         |
| `scale_ingredients`       | Adapte n'importe quelle liste d'ingrédients, sans requête au site. |
| `get_recipe_translations` | Liste les autres langues où une recette a été publiée.             |

**Commencez par `list_categories`.** Le site vous donne les adresses correctes,
ce qui évite d'en construire une à la main : une adresse construite ainsi mène à
la page d'accueil du site.

### `list_categories`

Lit l'arbre sous lequel le site classe ses recettes. Appelé sans argument, il
rend les familles ; redonnez le slug d'une famille en `family` pour lire ce
qu'elle contient.

| Argument | Type                         | Requis | Ce qu'il fait                                            |
| -------- | ---------------------------- | ------ | -------------------------------------------------------- |
| `family` | chaîne, 1 à 80 caractères    | non    | Le slug d'une famille, pour lire les catégories dessous. |
| `limit`  | entier, 1 à 200, défaut `20` | non    | Lignes à servir.                                         |

**En retour :** des lignes portant `slug`, qui se redonne en `family` ou en
`category` ; `title` dans les termes du site ; `url` ; `description`, `null` là
où la page n'en porte pas ; et `sample_children` pour les catégories du niveau
inférieur.

### `search_recipes`

Cherche des recettes par plat ou par ingrédient.

| Argument | Type                         | Requis | Ce qu'il fait                          |
| -------- | ---------------------------- | ------ | -------------------------------------- |
| `query`  | chaîne, 1 à 120 caractères   | oui    | Un plat ou un ingrédient, en français. |
| `limit`  | entier, 1 à 100, défaut `20` | non    | Lignes à servir.                       |

**En retour :** `results`, des lignes portant `id`, `title`, `url`, `image_url`,
`rating`, `rating_count` et `review_count`, un compteur que la page n'imprime pas
valant `null`. L'enveloppe dit comment le site a répondu : `kind` vaut `category`
quand la réponse vient d'une page de catégorie, dont le `total_available` compte
toute la catégorie, et `free_text` quand le site a répondu à sa façon sur une
seule page, où le total compte les lignes servies. Ces deux totaux comptent des
choses différentes. `kind` vaut aussi `guide` pour un dossier que le site a
écrit à la main, où les lignes portent un nom et une adresse sans qu'aucun total
existe. Viennent aussi `result_count`, `rows_seen`, `page`, `single_page` et
`url`. Une liste marquée `single_page` dont le total dépasse `rows_seen` a un
reste que le site compte et ne sert pas.

### `browse_recipes`

Lit une catégorie page par page, ou l'une des listes permanentes du site.

| Argument   | Type                                   | Requis | Ce qu'il fait                                                    |
| ---------- | -------------------------------------- | ------ | ---------------------------------------------------------------- |
| `category` | chaîne, 1 à 120 caractères             | non    | Un slug de catégorie, publié par `list_categories`.              |
| `listing`  | `latest`, `top_rated` ou `most_viewed` | non    | Une liste permanente, lue à la place d'une catégorie.            |
| `page`     | entier, 1 à 1000                       | non    | La page de catégorie à lire. Une liste permanente n'en a qu'une. |
| `limit`    | entier, 1 à 100, défaut `20`           | non    | Lignes à servir.                                                 |

**En retour :** l'enveloppe que rend `search_recipes`, avec `kind` valant
`category`, `standing` ou `topic`. `page` est la page que le site a servie, qui
est la première de nouveau quand la page demandée dépasse la dernière.

### `search_by_ingredients`

Répond avec ce qu'on peut faire des ingrédients qu'un cuisinier a déjà.

| Argument      | Type                                        | Requis | Ce qu'il fait                              |
| ------------- | ------------------------------------------- | ------ | ------------------------------------------ |
| `ingredients` | tableau de 1 à 5 chaînes, 1 à 60 caractères | oui    | Les ingrédients sous la main, en français. |
| `limit`       | entier, 1 à 100, défaut `20`                | non    | Lignes à servir.                           |

**En retour :** l'enveloppe des autres listes, avec `kind` valant `fridge`. Le
site fait correspondre son propre vocabulaire, donc un ingrédient qu'il écrit
autrement resserre la réponse au lieu de l'élargir.

### `get_recipe`

Lit une recette en entier, et adapte ses ingrédients quand un nombre de parts est
donné.

| Argument   | Type                       | Requis | Ce qu'il fait                                |
| ---------- | -------------------------- | ------ | -------------------------------------------- |
| `id`       | chaîne, 1 à 300 caractères | oui    | L'`id` d'une ligne de recherche ou de liste. |
| `servings` | entier, 1 à 500            | non    | Adapte les ingrédients à ce nombre de parts. |

**En retour :** `title`, `url`, `description`, `image_url`, `category`,
`cuisine`, `difficulty` dans les termes du site, `author`, `published`,
`modified`, `rating`, `rating_count`, `review_count`, `prep_minutes`,
`cook_minutes`, `total_minutes`, `nutrition` telle que publiée pour la portion
qu'elle nomme, `estimated_cost`, `keywords`, `faq` et `translations`, chacun
`null` là où la page n'indique rien. `steps` porte la méthode une ligne par
étape, et `illustrated_steps` les mêmes étapes avec la photographie que le site a
prise de chacune. `yield` dit pour quoi la recette est écrite et vers quoi elle a
été adaptée. Chaque ingrédient porte `scaling`, qui vaut `scaled`, `rounded` ou
`unscaled` : lisez-le avant de citer une quantité, `rounded` ayant été déplacée
pour rester utilisable en cuisine.

### `scale_ingredients`

Applique la même arithmétique à n'importe quelle liste d'ingrédients en français,
sans requête au site.

| Argument        | Type                                               | Requis        | Ce qu'il fait                             |
| --------------- | -------------------------------------------------- | ------------- | ----------------------------------------- |
| `ingredients`   | tableau de 1 à 100 chaînes, jusqu'à 300 caractères | oui           | Les lignes à adapter, en français.        |
| `factor`        | nombre, au-delà de 0 jusqu'à 100                   | l'un des deux | Le multiplicateur à appliquer.            |
| `from_servings` | nombre, au-delà de 0 jusqu'à 500                   | l'un des deux | Le nombre de parts de la liste d'origine. |
| `to_servings`   | nombre, au-delà de 0 jusqu'à 500                   | l'un des deux | Le nombre de parts voulu.                 |

Passez `factor`, ou le couple `from_servings` et `to_servings`.

**En retour :** le `factor` employé, les `ingredients` adaptés dans la forme que
rend `get_recipe`, et `scaled_count`, `rounded_count` et `unscaled_count`.

### `get_recipe_translations`

Liste les autres langues dans lesquelles une recette a été publiée, d'après
l'appariement que le site publie lui-même.

| Argument | Type                       | Requis | Ce qu'il fait                                |
| -------- | -------------------------- | ------ | -------------------------------------------- |
| `id`     | chaîne, 1 à 300 caractères | oui    | L'`id` d'une ligne de recherche ou de liste. |

**En retour :** `translations`, chacune portant l'étiquette `language` que le
site publie et l'`url` de cette version, avec `translation_count` et l'`url` de
la page française d'où elles ont été lues.

## L'adaptation des quantités

Une quantité est exprimée dans l'unité qui lui convient. Après adaptation, une
ligne peut donc apparaître dans une autre unité que celle de la recette : 200 g
multipliés par vingt donnent `4 kg`.

La finesse à laquelle un ingrédient se coupe dépend de sa nature. Une baguette se
coupe en deux, en trois ou en quatre ; un oeuf ne se partage pas. Une quantité
qui tombe entre les deux est donc arrondie, et la recette adaptée s'écarte alors
un peu des proportions de l'originale. La ligne porte `rounded`, et sa `note` dit
ce qui a été fait.

Les chiffres sont l'arithmétique de ce serveur, donc dites qu'ils ont été
recalculés quand vous les montrez. Une recette dont la page n'indique aucun
nombre de parts ne peut pas être portée à un nombre de convives, et la réponse le
dit.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                | Défaut               | Ce qu'elle fait                                                                                             |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PTC_USER_AGENT`        | l'identité du projet | Nomme votre application auprès du site, avec une adresse où joindre une personne.                           |
| `PTC_MIN_INTERVAL_MS`   | `1500`               | Écart entre deux requêtes, de 1000 à 60000.                                                                 |
| `PTC_TIMEOUT_MS`        | `20000`              | Délai d'une requête, de 1000 à 120000.                                                                      |
| `PTC_MAX_RETRIES`       | `3`                  | Tentatives après un échec passager, de 0 à 8.                                                               |
| `PTC_CACHE_TTL_MS`      | `900000`             | Durée pendant laquelle une page reste en mémoire, de 0 à 86400000.                                          |
| `PTC_CACHE_MAX_ENTRIES` | `200`                | Pages gardées en mémoire à la fois, de 1 à 5000.                                                            |
| `PTC_MAX_BODY_BYTES`    | `8000000`            | La plus grosse réponse lue en entier, de 100000 à 64000000.                                                 |
| `PTC_BUDGET_MS`         | `60000`              | Le temps dans lequel une lecture doit rendre une réponse, reprises et attentes comprises, de 5000 à 600000. |
| `PTC_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.                                         |

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                        | Que faire                                                                                         |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `not_found`     | Le site a répondu, et n'a ni cette recette ni cette page. | Vérifiez le slug avec `list_categories`, ou l'identifiant avec une recherche.                     |
| `invalid_input` | Les arguments ont été refusés avant toute requête.        | Lisez le message, qui nomme l'argument.                                                           |
| `rate_limited`  | Le site demande à ce client de ralentir.                  | Attendez les secondes indiquées et rappelez avec les mêmes arguments. La recette est toujours là. |
| `parse_failure` | La page a chargé et le contenu attendu est absent.        | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-ptitchef/issues).          |
| `network_error` | La requête n'a pas abouti.                                | Réessayez sous peu.                                                                               |
| `timeout`       | La requête a dépassé son délai ou son budget.             | Augmentez `PTC_TIMEOUT_MS` ou `PTC_BUDGET_MS`, ou demandez moins de lignes.                       |

## Comme bibliothèque

La couche qui lit le site est publiée seule, avec son rythme, son cache et ses
erreurs, sans protocole attaché.

```ts
import { PtitchefClient } from "mcp-ptitchef/client";

const client = new PtitchefClient();
const { data, cached } = await client.listCategories();
console.log(data.results.length, cached);
```

`listCategories`, `searchRecipes`, `browseRecipes`, `searchByIngredients` et
`getRecipe` répondent chacun `{ data, cached }`, et lèvent une erreur portant un
des six codes. Le plancher entre deux requêtes tient également ici.

## Rythme et attribution

Les requêtes partent une à une avec au moins une seconde et demie entre elles, et
le plancher d'une seconde tient quelle que soit la configuration. Le `User-Agent`
se termine toujours par l'identité du projet et une adresse où joindre une
personne.

Chaque résultat porte l'adresse de la page d'où il a été lu, et `source` nomme le
site. Les recettes, les titres et les catégories appartiennent à Ptitchef et aux
cuisiniers qui les ont écrites.

Ce MCP est un projet non officiel, sans affiliation à Ptitchef.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `www.ptitchef.com`, garde ses réponses en mémoire le temps qu'il
tourne, et n'écrit rien sur le disque. [PRIVACY.md](PRIVACY.md) dit ce qu'une
requête emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre le site lui-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-ptitchef/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les recettes appartiennent à Ptitchef et à leurs
auteurs.
