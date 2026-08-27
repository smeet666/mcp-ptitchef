#!/usr/bin/env node
/**
 * Writes the corpus the unit suite reads.
 *
 * Every category name here is invented. The shapes come from what the site
 * publishes, and none of its wording is stored in this repository. A page the
 * site has never served gets written just as easily, which is the other reason
 * the corpus is written rather than captured.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "test", "fixtures");
mkdirSync(out, { recursive: true });

/**
 * The navigation every page of the site carries.
 *
 * It sits outside the category container and holds links of the very shape the
 * parser reads, so the corpus carries it: a page without it would let a parser
 * that reads the whole document pass.
 */
const chrome = `
<nav class="main-nav">
  <a href="/recettes/aperitif">Ouverture</a>
  <a href="/recettes/plat">Milieu</a>
  <a href="/recettes/cat/faux">Rubrique absente</a>
</nav>`;

const sample = (slug, title) => `<li><a href="/recettes/${slug}">${title}</a></li>`;

const familyItem = (slug, title, children) => `
  <div class="col-md-4 item clearfix">
    <h2 class="i-title"><a href="/recettes/cat/${slug}">${title}</a></h2>
    <a href="/recettes/cat/${slug}" class="thumbnail rounded">
      <img loading="lazy" src="/imgupl/ingredient-cat/1.jpg" alt="${title}">
    </a>
    <ul>${children.map(([s, t]) => sample(s, t)).join("")}</ul>
    <i class="pointsx3">...</i>
    <div class="see-all-right text-truncate"><a href="/recettes/cat/${slug}">Toutes ${title}</a></div>
  </div>`;

const leafItem = (slug, title, description) => `
  <div class="col-md-4 item clearfix">
    <h2 class="i-title"><a href="/recettes/${slug}">${title}</a></h2>
    <a href="/recettes/${slug}" class="thumbnail rounded">
      <img loading="lazy" src="/imgupl/ingredient/2.jpg" alt="${title}">
    </a>
    ${description === null ? "" : `<p>${description}</p>`}
  </div>`;

const page = (heading, items) => `<!doctype html>
<html lang="fr"><head><title>${heading}</title></head>
<body>${chrome}
<main id="page-main">
  <h1 class="title animated fadeInDown">${heading}</h1>
  <div class="row recipe-cat-list">${items.join("\n")}
  </div>
</main>
</body></html>
`;

/** The root of the tree: families, each showing a sample of what it holds. */
const root = page("Recettes de cuisine", [
  familyItem("brindilles", "Brindilles", [
    ["brindille-de-marne", "Brindille de Marne"],
    ["petite-brindille", "Petite brindille"],
    ["brindilles-seches", "Brindilles sèches"],
  ]),
  familyItem("galinettes", "Galinettes", [
    ["galinette-de-varne", "Galinette de Varne"],
    ["galinette-rousse", "Galinette rousse"],
  ]),
  familyItem("orpins", "Orpins &amp; mousserons", []),
  `
  <div class="col-md-4 item clearfix">
    <h2 class="i-title"><a href="/recettes/cat/mousserons">Mousserons</a></h2>
    <ul>
      <li><a href="/recettes/mousseron-des-pres">Mousseron des prés</a></li>
      <li><a href="/dossiers/un-article-aid-2">Un article</a></li>
    </ul>
    <i class="pointsx3">...</i>
  </div>`,
]);

/** One family, opened: its categories, each with the blurb the site writes. */
const family = page("Recettes Brindilles", [
  leafItem(
    "brindille-de-marne",
    "Brindille de Marne",
    "Une brindille de saison, courte et tendre.",
  ),
  leafItem("petite-brindille", "Petite brindille", null),
  leafItem("brindilles-seches", "Brindilles sèches", "Se garde tout l'hiver dans un bocal."),
]);

/**
 * A level whose titles carry the entities the site writes.
 *
 * A numbered one and a hexadecimal one both name a character, and one naming a
 * code point past the last Unicode defines names none.
 */
const withEntities = page("Recettes &#201;pices", [
  leafItem("cafe-torrefie", "Caf&#233; torr&#xE9;fi&#233;", "Se moud &#224; la demande."),
  leafItem("hors-unicode", "Poivre &#99999999; long", null),
]);

/**
 * A level whose entries point away from the tree.
 *
 * An entry whose heading links an article, an empty address, or the tree's own
 * root carries no category to pass back, so each is set aside.
 */
const pointingAway = page("Recettes Ailleurs", [
  `
  <div class="col-md-4 item clearfix">
    <p>Une entrée sans titre du tout.</p>
  </div>`,
  `
  <div class="col-md-4 item clearfix">
    <h2 class="i-title"><a href="/dossiers/un-article-aid-1">Un article</a></h2>
  </div>`,
  `
  <div class="col-md-4 item clearfix">
    <h2 class="i-title"><a href="">Sans adresse</a></h2>
  </div>`,
  `
  <div class="col-md-4 item clearfix">
    <h2 class="i-title"><a href="/recettes/">La racine</a></h2>
  </div>`,
  `
  <div class="col-md-4 item clearfix">
    <h2 class="i-title"><a href="/recettes/cat/">Une famille sans nom</a></h2>
  </div>`,
]);

/**
 * A family whose second entry lost its link.
 *
 * An entry with nothing to pass back cannot be opened, so it is set aside and
 * counted rather than rendered with an address that was never published.
 */
const familyWithBrokenEntry = page("Recettes Galinettes", [
  leafItem("galinette-de-varne", "Galinette de Varne", "Se cuisine au four."),
  `
  <div class="col-md-4 item clearfix">
    <h2 class="i-title">Galinette sans lien</h2>
    <p>Une entrée dont le lien manque.</p>
  </div>`,
  leafItem("galinette-rousse", "Galinette rousse", null),
]);

/** A page the site served without the container the tree lives in. */
const withoutContainer = `<!doctype html>
<html lang="fr"><head><title>Recettes</title></head>
<body>${chrome}
<main id="page-main"><h1 class="title">Recettes</h1><p>Rien ici.</p></main>
</body></html>
`;

/** The container, served empty. The site answered; it listed nothing. */
const emptyContainer = page("Recettes Orpins &amp; mousserons", []);

/**
 * A page whose container is not followed by the end of its body.
 *
 * The body's end is what bounds the region this reads, and a page that carries
 * none is read to its last character.
 */
const withoutBodyEnd = `<!doctype html>
<html lang="fr"><head><title>Recettes</title></head>
<body>${chrome}
<h1 class="title">Recettes Sans fin</h1>
<div class="row recipe-cat-list">${leafItem("orpin-jaune", "Orpin jaune", null)}
</div>
</body></html>
`;

/** A page carrying the container and no heading of its own. */
const withoutHeading = `<!doctype html>
<html lang="fr"><head><title>Recettes</title></head>
<body>${chrome}
<main id="page-main">
  <div class="row recipe-cat-list">${leafItem("orpin-blanc", "Orpin blanc", null)}
  </div>
</main>
</body></html>
`;

const files = {
  "categories-root.html": root,
  "categories-family.html": family,
  "categories-broken-entry.html": familyWithBrokenEntry,
  "categories-no-container.html": withoutContainer,
  "categories-empty.html": emptyContainer,
  "categories-no-heading.html": withoutHeading,
  "categories-entities.html": withEntities,
  "categories-pointing-away.html": pointingAway,
  "categories-no-body-end.html": withoutBodyEnd,
};

for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(out, name), body, "utf8");
}

process.stdout.write(`wrote ${Object.keys(files).length} fixtures to ${out}\n`);
