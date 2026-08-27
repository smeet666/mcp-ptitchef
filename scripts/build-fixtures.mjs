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

/** One row of a guide, which states a vote count and draws the rating. */
const guideRow = (id, slug, title, votes) => `
      <div class="item clearfix">
        <img loading="lazy" src="/imgupl/feed-data/${id}.webp" alt="Recette ${title}">
        <a href="https://www.ptitchef.com/recettes/${slug}-fid-${id}" class="i-title stretched-link">${title}</a>
        <span class="i-stats">
          <span data-content=" (${votes} votes)" title="4/${votes} votes"><i class="note-fa n45"></i></span>
          <span data-content="6" title="6 commentaires"><i class="fal fa-comments"></i></span>
        </span>
      </div>`;

/**
 * The guide the site writes for some topics in place of a listing.
 *
 * Its rows are grouped under headings it chose, it publishes no total, and the
 * same recipe appears under two headings where it belongs to both. The last row
 * carries no address at all.
 */
const listingGuide = `<!doctype html>
<html lang="fr"><head><title>Brindilles : recettes faciles pour les cuisiner sans se lasser</title></head>
<body>${chrome}
<main id="page-main">
  <h1 class="title">Brindilles : recettes faciles</h1>
  <div class="silo-sections mb-3">
    <section id="ss-1" class="ss-item">
      <h2 class="ssi-title stitle">Bien préparer les brindilles</h2>
      <div class="ssi-text mb-2">Lavez-les avant cuisson.</div>
      <div class="ssi-data"><div class="basic-list clearfix">
        ${guideRow(101, "accompagnement/brindilles-au-four", "Brindilles au four", 153)}
        ${guideRow(102, "plat/galinette-braisee", "Galinette braisée", 38)}
      </div></div>
    </section>
    <section id="ss-2" class="ss-item mb-0">
      <h2 class="ssi-title stitle">Plats complets aux brindilles</h2>
      <div class="ssi-data"><div class="basic-list clearfix">
        ${guideRow(101, "accompagnement/brindilles-au-four", "Brindilles au four", 153)}
        ${guideRow(103, "dessert/orpin-confit", "Orpin confit", 0)}
        <div class="item clearfix">
          <img loading="lazy" src="" alt="">
          <a href="https://www.ptitchef.com/recettes/gouter/brindilles-sucrees-fid-104" class="i-title">Brindilles sucrées</a>
        </div>
        <div class="item clearfix"><span class="i-title">Sans adresse</span></div>
      </div></div>
    </section>
  </div>
  <a href="/recettes/brindilles-page-1">1</a>
</main>
</body></html>
`;

/**
 * A listing holding a row that links away from the site.
 *
 * The address of such a row is no page of this site, so there is nothing to
 * hand back for it and nothing to credit the site with.
 */
const listingOffSite = `<!doctype html>
<html lang="fr"><head><title>Brindilles - 2 recettes sur Ptitchef</title>
${itemList([listingRows[0]])}</head>
<body>${chrome}
<main id="page-main">
  <h1 class="title">Brindilles</h1>
  <section class="line-list ll-recipes">
    ${row(101, "accompagnement/brindilles-au-four", "Brindilles au four", listingRows[0], "2 brindilles")}
    <article class="item"><div class="i-data">
      <h2 class="i-title"><a href="//ailleurs.invalid/recettes/plat/copie-fid-999">Une copie ailleurs</a></h2>
    </div></article>
  </section>
</main>
</body></html>
`;

/** A page stating a count of recipes and carrying no listing this can read. */
const listingCountedButUnread = `<!doctype html>
<html lang="fr"><head><title>Brindilles - 3200 recettes sur Ptitchef</title></head>
<body>${chrome}
<main id="page-main"><h1 class="title">Brindilles</h1><p>Rien de lisible ici.</p></main>
</body></html>
`;

/** A guide the page never closes the body of. */
const guideWithoutBodyEnd = `<!doctype html>
<html lang="fr"><head><title>Brindilles : recettes faciles</title></head>
<body>${chrome}
<h1 class="title">Brindilles : recettes faciles</h1>
<div class="silo-sections">
  <section class="ss-item"><div class="basic-list">
    ${guideRow(101, "accompagnement/brindilles-au-four", "Brindilles au four", 12)}
  </div></section>
</div>
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

/** The payload a recipe page carries, written the way the site writes one. */
const recipePayload = (over = {}) => ({
  "@context": "https://schema.org/",
  "@type": "Recipe",
  name: "Brindilles au four",
  inLanguage: "fr",
  recipeCategory: "Accompagnement",
  recipeCuisine: "Fr",
  image: "https://www.ptitchef.com/imgupl/recipe/brindilles-au-four.webp",
  author: {
    "@type": "Person",
    name: "Wren Holloway",
    url: "https://www.ptitchef.com/team/wren-tmid-9",
  },
  datePublished: "2026-02-11T10:00:00+01:00",
  dateModified: "2026-08-01T09:30:00+02:00",
  description: "Des brindilles dorées au four, sans rien de compliqué.",
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: 3.8,
    bestRating: 5,
    ratingCount: 9,
    reviewCount: 4,
  },
  prepTime: "PT10M",
  cookTime: "PT20M",
  totalTime: "PT30M",
  recipeYield: "4",
  nutrition: {
    "@type": "NutritionInformation",
    servingSize: "326g",
    calories: "295Kcal",
    carbohydrateContent: "49.3g",
    fatContent: "5.9g",
    saturatedFatContent: "3.4g",
    proteinContent: "7.2g",
    fiberContent: "7.8g",
    sugarContent: "16.9g",
    sodiumContent: "0.3g",
  },
  recipeIngredient: [
    "800 gr de brindilles",
    "1 oeuf",
    "5 cl de lait",
    "1,5kg de galinettes",
    "> 2 cuillères à soupe de miel",
    "sel, poivre",
  ],
  estimatedCost: { "@type": "MonetaryAmount", currency: "EUR", value: "4.82" },
  recipeInstructions: [
    {
      "@type": "HowToStep",
      image: "https://www.ptitchef.com/imgupl/recipe-step/1.jpg",
      text: "Lavez les brindilles.",
    },
    { "@type": "HowToStep", text: "Enfournez vingt minutes." },
  ],
  keywords: "brindilles,accompagnement,recettes economiques",
  ...over,
});

const faqPayload = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Peut-on préparer les brindilles la veille ?",
      acceptedAnswer: { "@type": "Answer", text: "Oui, elles se réchauffent très bien au four." },
    },
    { "@type": "Question", name: "Une question sans réponse ?" },
  ],
};

/** The addresses of the same recipe on the other sites of the network. */
const alternates = `
<link rel="alternate" hreflang="fr" href="https://www.ptitchef.com/recettes/accompagnement/brindilles-au-four-fid-101">
<link rel="alternate" hreflang="es" href="https://www.petitchef.es/recetas/guarnicion/ramitas-al-horno-fid-102">
<link rel="alternate" hreflang="it" href="https://www.petitchef.it/ricette/contorno/rametti-al-forno-fid-103">
<link rel="alternate" hreflang="es" href="https://www.petitchef.es/recetas/guarnicion/un-doublon-fid-104">
<link rel="alternate" hreflang="x-default" href="https://www.ptitchef.com/recettes/accompagnement/brindilles-au-four-fid-101">`;

/** A recipe page, with everything the site puts on one. */
const recipePage = (payload, extras = {}) => `<!doctype html>
<html lang="fr"><head><title>${payload.name}</title>
<script type="application/ld+json">{ not json at all }</script>
<script type="application/ld+json">${JSON.stringify({ "@type": "WebSite", name: "Ptitchef" })}</script>
<script type="application/ld+json">${JSON.stringify(payload)}</script>
${extras.faq === false ? "" : `<script type="application/ld+json">${JSON.stringify(faqPayload)}</script>`}
${extras.alternates === false ? "" : alternates}</head>
<body>${chrome}
<main id="page-main">
  <h1 class="title">${payload.name}</h1>
  ${extras.difficulty === false ? "" : '<span title="Difficulté: moyen"><i></i> moyen</span>'}
  ${extras.servings === false ? "" : '<span class="servings-form" data-servings="4"></span>'}
</main>
</body></html>
`;

const recipeFull = recipePage(recipePayload());

/**
 * A recipe whose method is one block of prose.
 *
 * The site writes it either way, and a block is not a step: an answer built
 * from one says so rather than offering a paragraph as step one of one.
 */
const recipeOneBlock = recipePage(
  recipePayload({
    recipeInstructions: "Lavez les brindilles, puis enfournez-les vingt minutes.",
    name: "Brindilles en bloc",
  }),
);

/** A recipe the site published almost nothing about. */
const recipeBare = recipePage(
  {
    "@context": "https://schema.org/",
    "@type": "Recipe",
    name: "Brindilles nues",
    recipeIngredient: ["2 brindilles"],
  },
  { faq: false, alternates: false, difficulty: false, servings: false },
);

/**
 * A recipe whose payload states things in the awkward shapes the site allows.
 *
 * An image named as an object, a yield the page states only in its markup, a
 * nutrition block holding nothing, a cost with no currency, and keywords
 * written as a list rather than as one string.
 */
const recipeOdd = recipePage(
  recipePayload({
    name: "Brindilles étranges",
    image: [{ "@type": "ImageObject", url: "https://www.ptitchef.com/imgupl/recipe/etrange.webp" }],
    recipeYield: "",
    nutrition: { "@type": "NutritionInformation" },
    estimatedCost: { "@type": "MonetaryAmount", value: "4.82" },
    keywords: ["brindilles", "", "four"],
    recipeInstructions: [{ "@type": "HowToStep" }, "Enfournez.", 42],
    aggregateRating: { "@type": "AggregateRating", ratingValue: "pas un nombre" },
  }),
);

/**
 * A recipe whose payload states the remaining awkward shapes.
 *
 * Ingredients that are not a list, a cost stated with a currency and no amount,
 * an FAQ that is not a list, and an FAQ entry that is not an object.
 */
const recipeAwkward = recipePage(
  recipePayload({
    name: "Brindilles bancales",
    recipeIngredient: "800 gr de brindilles",
    estimatedCost: { "@type": "MonetaryAmount", currency: "EUR" },
    recipeInstructions: [{ "@type": "HowToStep", text: "Enfournez." }],
  }),
).replace(
  JSON.stringify(faqPayload),
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: "pas une liste",
  }),
);

/** A recipe whose questions are a list holding something that is not one. */
const recipeOddFaq = recipePage(recipePayload({ name: "Brindilles interrogées" })).replace(
  JSON.stringify(faqPayload),
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: ["une chaîne", { "@type": "Question", name: "Sans réponse ?" }],
  }),
);

/**
 * A recipe whose lines exercise every verdict the arithmetic can reach.
 *
 * A pinch whose size is the cook's, a sachet that clamps at the smallest share
 * worth measuring, a mass that rounds, and a line carrying nothing at all.
 */
const recipeVerdicts = recipePage(
  recipePayload({
    name: "Brindilles à toutes les sauces",
    recipeIngredient: ["1 pincée de sel", "1 sachet de levure", "155 g de farine", "poivre"],
  }),
);

/**
 * A recipe stating things in shapes a payload may hold and a reader may not.
 *
 * No name at all, an image named as an object that carries a content address
 * rather than a plain one, an empty list of images, an ingredient list holding
 * something that is not a line, and a rating count written as words.
 */
const recipeUnnamed = recipePage(
  recipePayload({
    name: "",
    image: { "@type": "ImageObject", contentUrl: "https://www.ptitchef.com/imgupl/recipe/c.webp" },
    recipeIngredient: ["2 brindilles", 42, "", "1 oeuf"],
    aggregateRating: { "@type": "AggregateRating", ratingValue: "4", ratingCount: "beaucoup" },
    recipeYield: "6 personnes",
  }),
);

/** A recipe every line of which carries a quantity the arithmetic can move. */
const recipeAllScalable = recipePage(
  recipePayload({
    name: "Brindilles mesurées",
    recipeIngredient: ["200 g de farine", "10 cl de lait"],
  }),
);

/** A recipe the payload names no image for at all. */
const recipeNoImage = recipePage(recipePayload({ name: "Brindilles sans photo", image: [] }));

/** A recipe whose payload lists no ingredient at all. */
const recipeNoIngredients = recipePage(
  recipePayload({ name: "Brindilles sans liste", recipeIngredient: [] }),
);

/**
 * A recipe naming counterparts oddly.
 *
 * One entry names the page itself under another wording of its address, one
 * carries a language and no address, one carries an address and no language,
 * and one is written relative to the page.
 */
const recipeOddAlternates = recipePage(recipePayload({ name: "Brindilles traduites" })).replace(
  alternates,
  `
<link rel="alternate" hreflang="fr" href="https://www.ptitchef.com/recettes/accompagnement/les-vraies-brindilles-fid-101">
<link rel="alternate" hreflang="de">
<link rel="alternate" href="https://www.petitchef.de/rezepte/x-fid-500">
<link rel="alternate" hreflang="pt" href="http://[">
<link rel="alternate" hreflang="it" href="/ricette/contorno/rametti-fid-103">`,
);

/** A page the site served without any recipe payload on it. */
const recipeMissing = `<!doctype html>
<html lang="fr"><head><title>Ptitchef</title>
<script type="application/ld+json">${JSON.stringify({ "@type": "WebSite", name: "Ptitchef" })}</script></head>
<body>${chrome}<main id="page-main"><h1 class="title">Ptitchef</h1></main></body></html>
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
  "listing-guide.html": listingGuide,
  "listing-off-site.html": listingOffSite,
  "listing-counted-unread.html": listingCountedButUnread,
  "listing-guide-no-body-end.html": guideWithoutBodyEnd,
  "listing-odd.html": listingOdd,
  "listing-one-broken-row.html": listingOneBrokenRow,
  "recipe-full.html": recipeFull,
  "recipe-one-block.html": recipeOneBlock,
  "recipe-bare.html": recipeBare,
  "recipe-odd.html": recipeOdd,
  "recipe-missing.html": recipeMissing,
  "recipe-awkward.html": recipeAwkward,
  "recipe-odd-faq.html": recipeOddFaq,
  "recipe-verdicts.html": recipeVerdicts,
  "recipe-unnamed.html": recipeUnnamed,
  "recipe-no-image.html": recipeNoImage,
  "recipe-all-scalable.html": recipeAllScalable,
  "recipe-no-ingredients.html": recipeNoIngredients,
  "recipe-odd-alternates.html": recipeOddAlternates,
};

for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(out, name), body, "utf8");
}

process.stdout.write(`wrote ${Object.keys(files).length} fixtures to ${out}\n`);
