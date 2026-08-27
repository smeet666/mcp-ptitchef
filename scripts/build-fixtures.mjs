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

/**
 * One row of a listing, written the way the site writes one.
 *
 * The rating lives in two places that disagree by design: the structured
 * payload states it to a tenth, and the row draws it rounded to a whole star.
 * Both are written here so a reader of the corpus can see which one is taken.
 */
const row = (id, slug, title, props, preview) => `
  <article class="item">
    <img class="i-photo" src="/imgupl/feed-data/${id}.webp" alt="Recette ${title}">
    <div class="i-data">
      <h2 class="i-title"><a class="stretched-link" href="https://www.ptitchef.com/recettes/${slug}-fid-${id}">${title}</a></h2>
      <span class="i-stats"><span data-content=" (${props.votes} votes)" title="${props.stars}/${props.votes} votes"><i class="note-fa" aria-hidden="true"></i></span></span>
      <div class="i-prop">
        ${props.category === null ? "" : `<span title="Type de recette: ${props.category}"><i class="fas fa-utensils"></i> ${props.category}</span>`}
        ${props.difficulty === null ? "" : `<span title="Difficulté: ${props.difficulty}"><i class="fas fa-signal"></i> ${props.difficulty}</span>`}
        ${props.time === null ? "" : `<span class="totalTime" title="Prêt en: ${props.time}"><i class="fas fa-clock"></i> ${props.time}</span>`}
        ${props.calories === null ? "" : `<span title="Calories: ${props.calories} kcal / 1 part"><i class="fas fa-scale-balanced"></i> ${props.calories} kcal</span>`}
      </div>
      ${preview === null ? "" : `<div class="i-text"><span>Ingrédients</span>: ${preview}</div>`}
    </div>
  </article>
  <aside class="item-aux" aria-label="Advertisement"><div class="adspace"></div></aside>`;

const itemList = (rows) =>
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": ["ItemList", "CollectionPage"],
    itemListElement: rows.map((r, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Recipe",
        url: `https://www.ptitchef.com/recettes/${r.slug}-fid-${r.id}`,
        name: r.title,
        ...(r.rating === null
          ? {}
          : {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: r.rating,
                bestRating: "5",
                ratingCount: String(r.votes),
                ...(r.reviews === null ? {} : { reviewCount: String(r.reviews) }),
              },
            }),
      },
    })),
  })}</script>`;

/** The page a listing is served on. `pages` is what its pager links. */
const listingPage = (heading, total, rows, pages = []) => `<!doctype html>
<html lang="fr"><head><title>${heading}${total === null ? "" : ` - ${total} recettes sur Ptitchef`}</title>
${itemList(rows)}</head>
<body>${chrome}
<main id="page-main">
  <h1 class="title">${heading}</h1>
  ${total === null ? "" : `<div class="under-title">${total} recettes</div>`}
  <section class="line-list ll-recipes" aria-label="${heading}">${rows
    .map((r) => row(r.id, r.slug, r.title, r, r.preview))
    .join("")}
  </section>
  ${pages.map((n) => `<a href="/recettes/brindilles-page-${n}">${n}</a>`).join(" ")}
</main>
</body></html>
`;

const recipe = (id, slug, title, over = {}) => ({
  id,
  slug,
  title,
  rating: "3.8",
  stars: 4,
  votes: 9,
  reviews: 4,
  category: "Accompagnement",
  difficulty: "moyen",
  time: "30 min",
  calories: 295,
  preview: "2 brindilles 1 pincée de sel",
  ...over,
});

const listingRows = [
  recipe(101, "accompagnement/brindilles-au-four", "Brindilles au four"),
  recipe(102, "plat/galinette-braisee", "Galinette braisée", {
    rating: "4.1",
    stars: 4,
    votes: 16,
    reviews: null,
    category: "Plat",
    difficulty: "facile",
    time: "2 h 20 m",
    calories: 554,
  }),
  recipe(103, "dessert/orpin-confit", "Orpin confit", {
    rating: null,
    stars: 0,
    votes: 0,
    reviews: null,
    category: null,
    difficulty: null,
    time: null,
    calories: null,
    preview: null,
  }),
];

/** A listing the site pages, read at its first page. */
const listingFirst = listingPage("Brindilles", 306, listingRows, [2, 3]);

/** A listing the site serves whole, linking no further page. */
const listingWhole = listingPage("Recettes du frigo", 3, listingRows);

/**
 * A listing the site counts far past what it serves.
 *
 * The fridge search counts every recipe it finds and offers one page of them,
 * so the rows beyond that page are counted and unreachable.
 */
const listingCut = listingPage("Recettes du frigo", 89, listingRows);
/** A listing whose single row lost the address that identifies it. */
const listingOneBrokenRow = `<!doctype html>
<html lang="fr"><head><title>Brindilles - 2 recettes sur Ptitchef</title>
${itemList([listingRows[0]])}</head>
<body>${chrome}
<main id="page-main">
  <h1 class="title">Brindilles</h1>
  <section class="line-list ll-recipes">
    ${row(101, "accompagnement/brindilles-au-four", "Brindilles au four", listingRows[0], "2 brindilles")}
    <article class="item"><div class="i-data"><h2 class="i-title">Sans adresse</h2></div></article>
  </section>
</main>
</body></html>
`;

/**
 * A search the site matched nothing for.
 *
 * It prints the count and drops the listing altogether, so an absence here is
 * what the site answered rather than a page this could not read.
 */
const listingEmpty = `<!doctype html>
<html lang="fr"><head><title>Zzzzqqqxx - 0 recettes sur Ptitchef</title></head>
<body>${chrome}
<main id="page-main"><h1 class="title">Zzzzqqqxx</h1></main>
</body></html>
`;

/** A page carrying neither a listing nor a count of one. */
const listingUnreadable = `<!doctype html>
<html lang="fr"><head><title>Ptitchef</title></head>
<body>${chrome}<main id="page-main"><h1 class="title">Ptitchef</h1><p>Rien ici.</p></main></body></html>
`;

/** A listing whose second row lost the address that identifies it. */
const listingBrokenRow = `<!doctype html>
<html lang="fr"><head><title>Brindilles - 3 recettes sur Ptitchef</title>
${itemList([listingRows[0]])}</head>
<body>${chrome}
<main id="page-main">
  <h1 class="title">Brindilles</h1>
  <div class="under-title">3 recettes</div>
  <section class="line-list ll-recipes">
    ${row(101, "accompagnement/brindilles-au-four", "Brindilles au four", listingRows[0], "2 brindilles")}
    <article class="item"><div class="i-data"><h2 class="i-title">Sans adresse</h2></div></article>
    <article class="item"><div class="i-data"><p>Une ligne sans titre du tout.</p></div></article>
    <article class="item"><div class="i-data"><h2 class="i-title"><a href="/dossiers/un-article-aid-3">Un article</a></h2></div></article>
  </section>
</main>
</body></html>
`;

/**
 * A listing written every awkward way the site writes one.
 *
 * A total grouped with a space, a payload that will not parse beside one that
 * will, a rating stated as a number rather than as a string, an entry with no
 * address, an element that is not an object, a property carrying no wording, a
 * row with an empty image and an empty ingredient line, and a listing the page
 * never closes.
 */
const listingOdd = `<!doctype html>
<html lang="fr"><head><title>Brindilles - 12 345 recettes sur Ptitchef</title>
<script type="application/ld+json">{ not json at all }</script>
<script type="application/ld+json">"a payload that is not an object at all"</script>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: [
    "a string where an object was expected",
    { "@type": "ListItem", item: { "@type": "Recipe", name: "Sans adresse" } },
    {
      "@type": "ListItem",
      item: {
        "@type": "Recipe",
        url: "https://www.ptitchef.com/recettes/plat/brindilles-braisees-fid-201",
        name: "Brindilles braisées",
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: 4.5,
          ratingCount: "",
          reviewCount: "sept",
        },
      },
    },
  ],
})}</script>
<script type="application/ld+json">${JSON.stringify({ "@type": "WebSite", name: "Ptitchef" })}</script></head>
<body>${chrome}
<main id="page-main">
  <div class="under-title">12 345 recettes</div>
  <section class="line-list ll-recipes">
    <article class="item">
      <img class="i-photo" src="" alt="">
      <div class="i-data">
        <h2 class="i-title"><a href="/recettes/plat/brindilles-braisees-fid-201">Brindilles braisées</a></h2>
        <div class="i-prop">
          <span title="sans deux points"><i></i> rien</span>
          <span title="Calories: pas un nombre"><i></i></span>
          <span title="Prêt en: bientôt"><i></i></span>
        </div>
        <div class="i-text"></div>
      </div>
    </article>
    <article class="item">
      <div class="i-data">
        <h2 class="i-title"><a href="/recettes/plat/brindilles-crues-fid-202">Brindilles crues</a></h2>
      </div>
    </article>
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
  "listing-first.html": listingFirst,
  "listing-whole.html": listingWhole,
  "listing-empty.html": listingEmpty,
  "listing-unreadable.html": listingUnreadable,
  "listing-broken-row.html": listingBrokenRow,
  "listing-fridge-cut.html": listingCut,
  "listing-odd.html": listingOdd,
  "listing-one-broken-row.html": listingOneBrokenRow,
};

for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(out, name), body, "utf8");
}

process.stdout.write(`wrote ${Object.keys(files).length} fixtures to ${out}\n`);
