# mcp-ptitchef

[![CI](https://github.com/smeet666/mcp-ptitchef/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-ptitchef/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-ptitchef)](https://www.npmjs.com/package/mcp-ptitchef)
[![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

An MCP server that reads recipes on [Ptitchef](https://www.ptitchef.com).
Read-only, no API key, no account.

_[Version française](#mcp-ptitchef-français)_

---

## Why it exists

Ptitchef browses its recipes by a tree of ingredient families, and it writes the
address of each category freely. The same kind of thing appears as `chou-kale`
on one line, as `recette-de-petits-pois` on the next and as `recettes-aux-feves`
on a third. There is no rule to derive one from an ingredient's name.

An address built by hand therefore misses, and the site answers a miss by
sending the reader to the root of the tree with HTTP 200 and the root's own
categories. A model that guessed a slug gets a full, confident answer about a
level it never asked for.

This server publishes the tree, so a category is opened by the name the site
gave it.

## The tools

### `list_categories`

Lists the categories recipes are browsed by. Called without arguments it returns
the families of ingredients; pass a family's slug back to list what it holds.

| Argument | Type              | Meaning                                                                            |
| -------- | ----------------- | ---------------------------------------------------------------------------------- |
| `family` | string, optional  | The slug of a family to open, from a previous call. Leave it out to read the root. |
| `limit`  | integer, optional | Entries to render, 50 by default, 200 at most.                                     |

```json
{
  "family": null,
  "family_title": "Recettes de cuisine sur Ptitchef",
  "categories": [
    {
      "slug": "legume",
      "title": "Légume",
      "url": "https://www.ptitchef.com/recettes/cat/legume",
      "description": null,
      "sample_children": [
        {
          "slug": "pois-mange-tout",
          "title": "Pois mange-tout",
          "url": "https://www.ptitchef.com/recettes/pois-mange-tout"
        }
      ],
      "is_family": true
    }
  ],
  "category_count": 15,
  "categories_published": 15,
  "url": "https://www.ptitchef.com/recettes",
  "source": "Ptitchef",
  "notes": ["…"]
}
```

### `search_recipes`

Searches by dish or ingredient. The site answers in one of two ways, and `kind`
says which.

| Argument | Type              | Meaning                                     |
| -------- | ----------------- | ------------------------------------------- |
| `query`  | string            | A dish or an ingredient, in French.         |
| `limit`  | integer, optional | Rows to render, 20 by default, 100 at most. |

Searching `puree de patate douce` comes back as `kind: "topic"` with
`topic_slug: "puree-de-patates-douces"`: the site holds a page for it, sent the
search there, and the total counts what that page holds. Searching
`soupe froide concombre menthe` comes back as `kind: "free_text"`: the site holds
no such page, answered on its own terms, and the total is the number of rows it
served.

### `browse_recipes`

Reads a category page by page, or one of the three lists the site keeps standing.

| Argument   | Type                                     | Meaning                                                    |
| ---------- | ---------------------------------------- | ---------------------------------------------------------- |
| `category` | string, optional                         | A slug from `list_categories`, or a search's `topic_slug`. |
| `listing`  | `latest` \| `top_rated` \| `most_viewed` | One of the site's standing lists.                          |
| `page`     | integer, optional                        | The page of a category to read.                            |
| `limit`    | integer, optional                        | Rows to render, 20 by default.                             |

### `search_by_ingredients`

Reads the site's own fridge search: one to five ingredients in, recipes holding
them out.

| Argument      | Type              | Meaning                             |
| ------------- | ----------------- | ----------------------------------- |
| `ingredients` | string[]          | One to five ingredients, in French. |
| `limit`       | integer, optional | Rows to render, 20 by default.      |

### `get_recipe`

Reads one recipe, and rescales its ingredients on request.

| Argument   | Type              | Meaning                                        |
| ---------- | ----------------- | ---------------------------------------------- |
| `id`       | string            | The `id` of a row from a search or a listing.  |
| `servings` | integer, optional | Rescale the ingredients to this many servings. |

Every line carries a `scaling` that says what the arithmetic did: `scaled` is
exact, `rounded` was moved to stay usable, `unscaled` carries nothing that could
be multiplied. Doubling `1 oeuf` gives `2 oeufs`; halving it gives `1 oeuf`
marked `rounded`, because half an egg is not an amount a kitchen measures out.

### `scale_ingredients`

The same arithmetic, offline, on any French ingredient list whatever its source.

| Argument                          | Type     | Meaning                              |
| --------------------------------- | -------- | ------------------------------------ |
| `ingredients`                     | string[] | The lines to rescale.                |
| `factor`                          | number   | The multiplier to apply.             |
| `from_servings` and `to_servings` | numbers  | Or the pair the factor is read from. |

### `get_recipe_translations`

Lists the other languages a recipe was published in. Ptitchef is the French
edition of a network of sites publishing the same recipes, and each page names
its counterparts. How many there are is the recipe's own business: a recent one
names more than twenty, an older one names none, and the answer states what the
page carries rather than a number fixed here.

## What the answers refuse to overstate

**A level the site substituted is not the level that was asked for.** An unknown
family is answered with HTTP 200 and the root of the tree, so the address the
answer came back from decides which level it is. A family that was not held is
reported as `not_found`, rather than rendered as the categories the site offered
instead.

**The entries beside a family are an excerpt.** The root shows three of them
followed by an ellipsis the site prints itself. They are returned under
`sample_children` and a note says what they are, because rendering them as the
family's contents would offer a family of ninety as a family of three.

**Two counts, because they answer two questions.** `categories_published` is what
the page listed and `category_count` is what the answer rendered. They differ
whenever a limit cut the list, and the note says by how much rather than letting
a capped listing read as a complete one.

**An entry with no address is set aside rather than rendered.** A heading the
site published without a link carries no slug to pass back, so it is dropped,
counted, and named in the notes.

**A blurb the page does not carry is `null`, never an empty string.** An empty
description would offer wording that was never published.

**A listing has two totals that count different things, and the answer says
which arrived.** A search the site sends to a category page reports that
category's total; a search it answers itself reports the number of rows it
served. Summing the two would add a catalogue to a page.

**A rating is the figure the site computed, not the one it drew.** A row states
3.8 in its payload and draws four stars. The drawn figure is left alone.

**A page past the last one comes back as the page the site served.** The site
answers it with the first page, so reporting the number that was asked for would
send a caller round the same rows for ever.

**The fridge search counts far past what it serves.** It finds eighty-nine
recipes for three ingredients, offers twenty-four of them on one page, and links
no other. The answer states both figures and says the rest cannot be read.

**A guide is not a listing, and the answer says which arrived.** Some topics are
served as a guide the site wrote — recipes grouped under headings of its own,
with no total, and rows carrying only a name and an address. `kind` says `guide`
there, and `browse_recipes` on the same slug reads the topic's full listing with
its total: `épinards` comes back as a guide of 32, and its listing holds 736.

**Another recipe served in place of one is an absence, not an answer.** The words
of a recipe's address are decorative and its number is not: asking for a number
the site does not hold brings back an unrelated recipe, in HTTP 200 and full
detail. The number that came back is compared with the number asked for.

**Nothing is multiplied blindly.** A countable thing lands on the smallest share
a cook takes out of one of it: a whole where half of one cannot be measured out,
an egg; a half where half of one pours or splits, a sachet. A mass moves to a
smaller unit before it is rounded, so a quantity under one never rounds to zero.
A pinch keeps its own vocabulary and has its count multiplied, because the size
of one is the cook's.

**A list handed back unrescaled says so once, rather than line by line.** With no
servings asked for there is no arithmetic, and marking every line `unscaled`
would claim that none of them carries anything to multiply.

**The cost the site estimates is repeated, never recomputed.** It is the site's
own figure, and readers of the site dispute it as too low; the answer says so
rather than quietly passing it on or silently dropping it.

## Install

```bash
npx mcp-ptitchef
```

### Claude Code

```bash
claude mcp add ptitchef -- npx -y mcp-ptitchef
```

### Any MCP client

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

### Container

```bash
docker build -t mcp-ptitchef .
docker run -i --rm mcp-ptitchef
```

The container needs to reach `www.ptitchef.com` and nothing else. It takes no
credentials, because there are none to take.

## Settings

Every setting is an environment variable, and none is required. A value outside
its range is refused with a line on stderr and the default stands: a setting that
cannot take effect says so rather than being quietly clamped.

| Variable                | Default | Range                                                                              |
| ----------------------- | ------- | ---------------------------------------------------------------------------------- |
| `PTC_USER_AGENT`        | —       | Your own identifier. This project's stays appended, so the site can reach a human. |
| `PTC_MIN_INTERVAL_MS`   | 1500    | 1000 to 60000                                                                      |
| `PTC_TIMEOUT_MS`        | 20000   | 1000 to 120000                                                                     |
| `PTC_MAX_RETRIES`       | 3       | 0 to 8                                                                             |
| `PTC_CACHE_TTL_MS`      | 900000  | 0 to 86400000, 0 turns storage off                                                 |
| `PTC_CACHE_MAX_ENTRIES` | 200     | 1 to 5000                                                                          |
| `PTC_LOG_LEVEL`         | `error` | `silent`, `error`, `info`, `debug`                                                 |

The pacing floor cannot be lowered from outside. The site is free to read and
publishes no crawl delay, which is a reason to be careful rather than a licence
to be fast.

## As a library

The reading layer is published on its own, with its pacing, its storage and its
error vocabulary and no protocol attached:

```ts
import { PtitchefClient } from "mcp-ptitchef/client";
```

## Errors

Six codes and no more. A caller branches on the code that opens the message.

| Code            | What it means                                                                           |
| --------------- | --------------------------------------------------------------------------------------- |
| `not_found`     | The site holds nothing at that address                                                  |
| `invalid_input` | The arguments could not produce a request                                               |
| `rate_limited`  | The site asked this client to slow down. It says nothing about whether anything matched |
| `parse_failure` | An answer arrived in a shape this server cannot read                                    |
| `network_error` | The request could not be completed                                                      |
| `timeout`       | No answer arrived within the deadline                                                   |

## Attribution

Recipes, titles and categories belong to Ptitchef. Every answer carries the
source, and a listing shown to a reader should credit the site and link the page.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Tests come first, coverage has a floor of
100%, and the rule everything follows is that the server never says anything the
data does not carry.

Licensed under [MIT](LICENSE).

---

# mcp-ptitchef (français)

Un serveur MCP qui lit les recettes de [Ptitchef](https://www.ptitchef.com).
En lecture seule, sans clé d'API et sans compte.

## Pourquoi il existe

Ptitchef parcourt ses recettes par un arbre de familles d'ingrédients, et écrit
librement l'adresse de chaque catégorie. La même sorte de chose s'appelle
`chou-kale` sur une ligne, `recette-de-petits-pois` sur la suivante et
`recettes-aux-feves` sur une troisième. Aucune règle ne permet de déduire l'une
du nom d'un ingrédient.

Une adresse construite à la main tombe donc à côté, et le site répond à côté en
renvoyant le lecteur à la racine de l'arbre, en HTTP 200, avec les catégories de
la racine. Un modèle qui a deviné un slug reçoit une réponse entière et assurée
sur un niveau qu'il n'a jamais demandé.

Ce serveur publie l'arbre, pour qu'une catégorie s'ouvre par le nom que le site
lui a donné.

## L'outil

### `list_categories`

Liste les catégories par lesquelles les recettes se parcourent. Appelé sans
argument il rend les familles d'ingrédients ; en lui repassant le slug d'une
famille il rend ce qu'elle contient.

| Argument | Type              | Sens                                                                                           |
| -------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `family` | chaîne, optionnel | Le slug d'une famille à ouvrir, issu d'un appel précédent. Absent, l'arbre est lu à sa racine. |
| `limit`  | entier, optionnel | Entrées rendues, 50 par défaut, 200 au plus.                                                   |

## Ce que les réponses refusent d'affirmer

**Un niveau substitué n'est pas le niveau demandé.** Une famille inconnue est
répondue en HTTP 200 par la racine de l'arbre, donc l'adresse d'où la réponse
revient décide de quel niveau il s'agit. Une famille que le site ne tient pas
rend `not_found`, plutôt que les catégories qu'il a proposées à la place.

**Les entrées montrées à côté d'une famille sont un échantillon.** La racine en
montre trois, suivies de trois points que le site imprime lui-même. Elles sont
rendues sous `sample_children` avec une note qui dit ce qu'elles sont : les
rendre comme le contenu de la famille offrirait une famille de quatre-vingt-dix
comme une famille de trois.

**Deux compteurs, parce qu'ils répondent à deux questions.**
`categories_published` est ce que la page a listé et `category_count` est ce que
la réponse a rendu. Ils diffèrent dès qu'une limite a coupé la liste, et la note
dit de combien.

**Une entrée sans adresse est écartée plutôt que rendue.** Un titre publié sans
lien ne porte aucun slug à repasser : il est écarté, compté, et nommé dans les
notes.

**Une description que la page ne porte pas vaut `null`, jamais une chaîne vide.**

## Installation

```bash
npx mcp-ptitchef
```

### Claude Code

```bash
claude mcp add ptitchef -- npx -y mcp-ptitchef
```

### N'importe quel client MCP

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

### Conteneur

```bash
docker build -t mcp-ptitchef .
docker run -i --rm mcp-ptitchef
```

Le conteneur doit joindre `www.ptitchef.com` et rien d'autre. Il ne prend aucun
identifiant, puisqu'il n'y en a aucun à prendre.

## Réglages

Chaque réglage est une variable d'environnement, et aucune n'est requise. Une
valeur hors bornes est refusée par une ligne sur stderr et la valeur par défaut
tient : un réglage qui ne peut pas s'appliquer le dit plutôt que d'être ramené
en silence dans les bornes.

| Variable                | Défaut  | Bornes                                                                                         |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `PTC_USER_AGENT`        | —       | Votre identifiant. Celui du projet reste ajouté, pour que le site puisse joindre une personne. |
| `PTC_MIN_INTERVAL_MS`   | 1500    | 1000 à 60000                                                                                   |
| `PTC_TIMEOUT_MS`        | 20000   | 1000 à 120000                                                                                  |
| `PTC_MAX_RETRIES`       | 3       | 0 à 8                                                                                          |
| `PTC_CACHE_TTL_MS`      | 900000  | 0 à 86400000, 0 éteint le stockage                                                             |
| `PTC_CACHE_MAX_ENTRIES` | 200     | 1 à 5000                                                                                       |
| `PTC_LOG_LEVEL`         | `error` | `silent`, `error`, `info`, `debug`                                                             |

Le plancher de rythme ne se baisse pas depuis l'extérieur. Le site est libre à
lire et ne publie aucun délai d'exploration, ce qui est une raison d'être
prudent.

## Comme bibliothèque

La couche de lecture se publie seule, avec son rythme, son stockage et son
vocabulaire d'erreurs, sans protocole attaché :

```ts
import { PtitchefClient } from "mcp-ptitchef/client";
```

## Erreurs

Six codes et pas un de plus. Un appelant se branche sur le code qui ouvre le
message.

| Code            | Ce qu'il signifie                                                             |
| --------------- | ----------------------------------------------------------------------------- |
| `not_found`     | Le site ne tient rien à cette adresse                                         |
| `invalid_input` | Les arguments ne pouvaient pas produire une requête                           |
| `rate_limited`  | Le site a demandé à ce client de ralentir. Cela ne dit rien de ce qu'il tient |
| `parse_failure` | Une réponse est arrivée dans une forme que ce serveur ne sait pas lire        |
| `network_error` | La requête n'a pas pu aboutir                                                 |
| `timeout`       | Aucune réponse n'est arrivée dans le délai                                    |

## Attribution

Les recettes, les titres et les catégories appartiennent à Ptitchef. Chaque
réponse porte la source, et une liste montrée à un lecteur doit créditer le site
et lier la page.

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md). Les tests d'abord, la couverture a un
plancher de 100 %, et la règle que tout suit est qu'un serveur ne dit jamais
quelque chose que la donnée ne porte pas.

Sous licence [MIT](LICENSE).
