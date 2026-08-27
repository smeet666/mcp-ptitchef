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

**A rating is the figure the site computed.** A row states
3.8 in its payload and draws four stars. The drawn figure is left alone.

**A page past the last one comes back as the page the site served.** The site
answers it with the first page, so reporting the number that was asked for would
send a caller round the same rows for ever.

**The fridge search counts far past what it serves.** It finds eighty-nine
recipes for three ingredients, offers twenty-four of them on one page, and links
no other. The answer states both figures and says the rest cannot be read.

**A guide is not a listing, and the answer says which arrived.** Some topics are
served as a guide the site wrote: recipes grouped under headings of its own,
with no total, and rows carrying only a name and an address. `kind` says `guide`
there, and `browse_recipes` on the same slug reads the topic's full listing with
its total: `épinards` comes back as a guide of 32, and its listing holds 736.

**Another recipe served in place of one is rendered as an absence.** The words
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
| `PTC_MAX_BODY_BYTES`    | 8000000 | 100000 to 64000000. Past it a page is abandoned rather than held whole             |
| `PTC_BUDGET_MS`         | 60000   | 5000 to 600000. The whole of one read, its retries and their waits included        |
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

## Les outils

### `list_categories`

Liste les catégories par lesquelles les recettes se parcourent. Appelé sans
argument il rend les familles d'ingrédients ; en lui repassant le slug d'une
famille il rend ce qu'elle contient.

| Argument | Type              | Sens                                                                                           |
| -------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `family` | chaîne, optionnel | Le slug d'une famille à ouvrir, issu d'un appel précédent. Absent, l'arbre est lu à sa racine. |
| `limit`  | entier, optionnel | Entrées rendues, 20 par défaut, 200 au plus.                                                   |

### `search_recipes`

Cherche par plat ou par ingrédient. Le site répond de cinq façons, et `kind` dit
laquelle : `topic` quand il envoie la recherche sur une page de catégorie à lui,
`free_text` quand il répond sur ses propres termes, `guide` quand il a rédigé un
guide pour ce sujet, `recipe` quand il juge les mots assez précis pour ouvrir une
fiche, et `unmatched` quand il sert sa page d'accueil faute d'avoir compris.

| Argument | Type              | Sens                                        |
| -------- | ----------------- | ------------------------------------------- |
| `query`  | chaîne            | Un plat ou un ingrédient, en français.      |
| `limit`  | entier, optionnel | Lignes rendues, 20 par défaut, 100 au plus. |

### `browse_recipes`

Parcourt une catégorie page par page, ou l'une des trois listes que le site tient
à jour.

| Argument   | Type                                     | Sens                                                              |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `category` | chaîne, optionnel                        | Un slug de `list_categories`, ou le `topic_slug` d'une recherche. |
| `listing`  | `latest` \| `top_rated` \| `most_viewed` | L'une des listes permanentes du site.                             |
| `page`     | entier, optionnel                        | La page d'une catégorie à lire.                                   |
| `limit`    | entier, optionnel                        | Lignes rendues, 20 par défaut.                                    |

### `search_by_ingredients`

Lit la recherche du frigo du site : de un à cinq ingrédients en entrée, les
recettes qui les contiennent en sortie.

| Argument      | Type              | Sens                                   |
| ------------- | ----------------- | -------------------------------------- |
| `ingredients` | chaîne[]          | De un à cinq ingrédients, en français. |
| `limit`       | entier, optionnel | Lignes rendues, 20 par défaut.         |

### `get_recipe`

Lit une recette, et remet ses ingrédients à l'échelle sur demande.

| Argument   | Type              | Sens                                                       |
| ---------- | ----------------- | ---------------------------------------------------------- |
| `id`       | chaîne            | Le `id` d'une ligne rendue par une recherche ou une liste. |
| `servings` | entier, optionnel | Remet les ingrédients à l'échelle pour ce nombre de parts. |

Chaque ligne porte un `scaling` qui dit ce que l'arithmétique a fait : `scaled`
est exact, `rounded` a été déplacé pour rester utilisable, `unscaled` ne portait
rien à multiplier. Doubler `1 oeuf` donne `2 oeufs` ; le diviser par deux donne
`1 oeuf` marqué `rounded`, parce qu'un demi-œuf n'est pas une quantité qu'une
cuisine mesure.

### `scale_ingredients`

La même arithmétique, hors ligne, sur n'importe quelle liste française quelle
qu'en soit la source.

| Argument                         | Type     | Sens                                   |
| -------------------------------- | -------- | -------------------------------------- |
| `ingredients`                    | chaîne[] | Les lignes à remettre à l'échelle.     |
| `factor`                         | nombre   | Le multiplicateur à appliquer.         |
| `from_servings` et `to_servings` | nombres  | Ou la paire dont le facteur se déduit. |

### `get_recipe_translations`

Liste les autres langues dans lesquelles une recette a été publiée. Ptitchef est
l'édition française d'un réseau de sites qui publient les mêmes recettes, et
chaque page nomme ses homologues. Combien il y en a appartient à la recette : une
récente en nomme plus de vingt, une ancienne aucune.

## Ce que les réponses refusent d'affirmer

**Un guide n'est pas une liste, et la réponse dit lequel est arrivé.** Certains
sujets sont servis par un guide que le site rédige, sans total, dont les lignes
portent un nom, une adresse, une image et un nombre de votes. `kind` vaut `guide`
là, et `browse_recipes` sur le même slug rend la liste complète du sujet avec son
total : `épinards` rend un guide de 32 recettes, sa liste en tient 736.

**Une recette servie à la place d'une autre est rendue comme une absence.** Les
mots d'une adresse de recette sont décoratifs et son numéro ne l'est pas :
demander un numéro que le site ne tient pas ramène une recette sans rapport, en
HTTP 200 et en détail complet. Le numéro revenu est comparé au numéro demandé.

**Une page dont la liste est illisible n'est pas une absence.** Un titre portant
un compte et aucune liste lisible est une page que ce serveur ne sait pas lire,
et c'est ce qu'il rend plutôt que « aucune recette, le site dit qu'il en tient
3200 ».

**Une note est le chiffre que le site a calculé.** Une ligne annonce 3,8 dans sa
charge et dessine quatre étoiles ; c'est le chiffre calculé qui est publié, et un
guide qui n'en calcule aucun n'en publie aucun.

**Ce qu'un total compte est lu sur la réponse.** Une recherche que le site envoie
sur une page de catégorie rend le total de cette catégorie ; une recherche qu'il
traite lui-même rend ce qu'il a compté, qui dépasse parfois les lignes servies.
La note ne le dit que là où les deux chiffres l'établissent.

**Rien n'est multiplié à l'aveugle.** Un dénombrable tombe sur la plus petite
part qu'un cuisinier prend d'un seul : un entier là où la moitié d'un ne se
mesure pas, un œuf ; une moitié là où elle se verse ou se coupe, un sachet. Une
masse descend d'unité avant d'être arrondie, donc une quantité sous l'unité ne
tombe jamais à zéro. Une pincée garde son propre vocabulaire et voit son compte
multiplié, parce que la taille d'une est celle du cuisinier.

**Une liste rendue sans mise à l'échelle le dit une fois**, plutôt que ligne par
ligne. Sans `servings` il n'y a pas d'arithmétique, et marquer chaque ligne
`unscaled` affirmerait qu'aucune ne porte rien à multiplier.

**Le coût estimé est répété, jamais recalculé.** C'est le chiffre du site, publié
pour le nombre de parts que la page annonce, et la réponse dit lequel.

**Une adresse lue dans une page ne quitte pas ce site.** Une ligne qui pointe
ailleurs est écartée plutôt que publiée sous l'étiquette « la page publique de la
recette ».

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
