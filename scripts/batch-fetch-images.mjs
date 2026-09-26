#!/usr/bin/env node
// Verwerkt een batch ontbrekende cocktail/drank-foto's in één keer: zoekt
// (Pexels eerst, dan Pixabay als fallback), pakt het eerste resultaat,
// converteert naar WebP ≤800px en zet 'm in images.json — bewust
// geautomatiseerd or "passend" niveau (niet "exact"), omdat elk resultaat
// hier NIET stuk voor stuk visueel gecontroleerd wordt zoals bij een losse
// fetch-image.mjs save. Bedoeld om daarna met een steekproef te verifiëren.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { RECIPES, INGREDIENTS } = await import(path.join(root, "src/recipes.js"));
const env = {};
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const limit = Number(args.limit || 20);
const onlyType = args.type; // optioneel: "cocktail" of "drank"

async function searchPexels(query) {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`, { headers: { Authorization: env.PEXELS_API_KEY } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.photos || []).map((p) => ({ full: p.src.large2x || p.src.original, maker: p.photographer, pageUrl: p.url, licentie: "Pexels License" }));
}
async function searchPixabay(query) {
  const res = await fetch(`https://pixabay.com/api/?key=${env.PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&image_type=photo&per_page=5`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.hits || []).map((h) => ({ full: h.largeImageURL, maker: h.user, pageUrl: h.pageURL, licentie: "Pixabay License" }));
}

// Nederlandse ingrediënt-namen bevatten vaak een verklarend deel tussen
// haakjes ("Verse gember (schijfje)") dat de zoekresultaten alleen maar
// ruist — dat strippen we voor een schonere query.
function cleanIngredientQuery(name) {
  return name.replace(/\([^)]*\)/g, "").trim();
}

async function searchWithFallback(queries) {
  for (const q of queries) {
    let results = await searchPexels(q);
    if (results.length > 0) return { results, query: q };
    results = await searchPixabay(q);
    if (results.length > 0) return { results, query: q };
  }
  return { results: [], query: queries[0] };
}

const catalogPath = path.join(root, "src/data/images.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

let toProcess = catalog.filter((e) => !e.bestand);
if (onlyType) toProcess = toProcess.filter((e) => e.type === onlyType);
toProcess = toProcess.slice(0, limit);

if (toProcess.length === 0) {
  console.log("Niets te doen — geen entries zonder bestand (binnen het opgegeven type/limiet).");
  process.exit(0);
}

console.log(`Batch van ${toProcess.length} item(s)...\n`);
let ok = 0, failed = 0;

for (const entry of toProcess) {
  const isCocktail = entry.type === "cocktail";
  const item = isCocktail ? RECIPES.find((r) => r.id === entry.id) : INGREDIENTS.find((i) => i.id === entry.id);
  if (!item) { console.log(`[skip] ${entry.type}:${entry.id} — niet meer in recipes.js`); continue; }

  const queries = isCocktail
    ? [`${item.name} cocktail`, item.name]
    : [`${cleanIngredientQuery(item.name)} bottle`, cleanIngredientQuery(item.name)];

  try {
    const { results, query } = await searchWithFallback(queries);
    if (results.length === 0) {
      console.log(`[geen resultaat] ${entry.type}:${entry.id} (${item.name}) — query "${query}"`);
      failed++;
      continue;
    }
    const pick = results[0];
    const folder = isCocktail ? "cocktails" : "dranken";
    const destDir = path.join(root, "src/assets/images", folder);
    mkdirSync(destDir, { recursive: true });
    const filename = `${entry.id}.webp`;
    const destPath = path.join(destDir, filename);

    const imgRes = await fetch(pick.full);
    if (!imgRes.ok) { console.log(`[download mislukt] ${entry.type}:${entry.id} (${imgRes.status})`); failed++; continue; }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    await sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 76 }).toFile(destPath);

    entry.bestand = filename;
    entry.bronUrl = pick.pageUrl;
    entry.maker = pick.maker;
    entry.licentie = pick.licentie;
    entry.niveau = "passend"; // geautomatiseerd gekozen, niet stuk voor stuk visueel bevestigd als "exact"

    console.log(`[ok] ${entry.type}:${entry.id} (${item.name}) — "${query}" → ${pick.maker} / ${pick.licentie}`);
    ok++;
  } catch (err) {
    console.log(`[fout] ${entry.type}:${entry.id} — ${err.message}`);
    failed++;
  }
}

writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`\nKlaar: ${ok} opgeslagen, ${failed} mislukt/geen resultaat, van ${toProcess.length} geprobeerd.`);
