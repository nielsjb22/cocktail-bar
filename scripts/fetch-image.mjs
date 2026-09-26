#!/usr/bin/env node
// Lokaal hulpscript om foto's te zoeken en binnen te halen voor
// src/data/images.json — draait NOOIT mee in de app, alleen op je eigen
// computer. Zie CLAUDE.md "## Afbeeldingen" voor de toegestane bronnen en
// de exact/passend/illustratie-regels; dit script automatiseert alleen het
// zoeken/downloaden/converteren, de keuze zelf (klopt glas, kleur, geen
// tekst/watermerk/logo/herkenbare personen) blijft een mensen-oordeel.
//
// Gebruik:
//   node scripts/fetch-image.mjs search --source pexels --query "negroni cocktail"
//   node scripts/fetch-image.mjs search --source pixabay --query "gin bottle"
//   node scripts/fetch-image.mjs search --source openverse --query "martini glass"
//   node scripts/fetch-image.mjs search --source wikimedia --query "old fashioned cocktail"
//
//   node scripts/fetch-image.mjs save --type cocktail --id negroni --source pexels \
//     --query "negroni cocktail" --index 1 --niveau exact
//
// --index verwijst naar het regelnummer uit de laatste "search" met diezelfde
// --source/--query. --niveau is exact | passend | illustratie.

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env");
const env = {};
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  console.error(".env niet gevonden in de project-root.");
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    } else {
      out._.push(a);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

async function searchPexels(query) {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10`, {
    headers: { Authorization: env.PEXELS_API_KEY },
  });
  const data = await res.json();
  return (data.photos || []).map((p) => ({
    thumb: p.src.small,
    full: p.src.large2x || p.src.original,
    maker: p.photographer,
    makerUrl: p.photographer_url,
    pageUrl: p.url,
    licentie: "Pexels License",
  }));
}

async function searchPixabay(query) {
  const res = await fetch(`https://pixabay.com/api/?key=${env.PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&image_type=photo&per_page=10`);
  const data = await res.json();
  return (data.hits || []).map((h) => ({
    thumb: h.previewURL,
    full: h.largeImageURL,
    maker: h.user,
    makerUrl: `https://pixabay.com/users/${h.user}-${h.user_id}/`,
    pageUrl: h.pageURL,
    licentie: "Pixabay License",
  }));
}

async function searchOpenverse(query) {
  const res = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license=cc0,by,by-sa&page_size=10`
  );
  const data = await res.json();
  return (data.results || []).map((r) => ({
    thumb: r.thumbnail,
    full: r.url,
    maker: r.creator || "onbekend",
    makerUrl: r.creator_url || r.foreign_landing_url,
    pageUrl: r.foreign_landing_url,
    licentie: (r.license || "").toUpperCase() + (r.license_version ? ` ${r.license_version}` : ""),
  }));
}

async function searchWikimedia(query) {
  const searchRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=10&format=json&srsearch=${encodeURIComponent(query)}`
  );
  const searchData = await searchRes.json();
  const titles = (searchData.query?.search || []).map((s) => s.title);
  if (titles.length === 0) return [];
  const infoRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.join("|"))}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1200&format=json`
  );
  const infoData = await infoRes.json();
  const pages = Object.values(infoData.query?.pages || {});
  return pages
    .filter((p) => p.imageinfo?.[0])
    .map((p) => {
      const info = p.imageinfo[0];
      const meta = info.extmetadata || {};
      return {
        thumb: info.thumburl || info.url,
        full: info.url,
        maker: (meta.Artist?.value || "onbekend").replace(/<[^>]+>/g, ""),
        makerUrl: info.descriptionurl,
        pageUrl: info.descriptionurl,
        licentie: meta.LicenseShortName?.value || "zie Wikimedia Commons",
      };
    });
}

const SOURCES = { pexels: searchPexels, pixabay: searchPixabay, openverse: searchOpenverse, wikimedia: searchWikimedia };

async function cmdSearch() {
  const { source, query } = args;
  if (!source || !SOURCES[source]) {
    console.error(`Onbekende --source. Kies uit: ${Object.keys(SOURCES).join(", ")}`);
    process.exit(1);
  }
  if (!query) { console.error("Geef --query mee."); process.exit(1); }
  const results = await SOURCES[source](query);
  if (results.length === 0) { console.log("Geen resultaten."); return; }
  results.forEach((r, i) => {
    console.log(`[${i}] ${r.maker} · ${r.licentie}`);
    console.log(`    bekijken: ${r.pageUrl}`);
    console.log(`    volledig: ${r.full}`);
  });
  console.log(`\n${results.length} resultaten voor "${query}" via ${source}. Bekijk elke link zelf (kloppend glas/kleur, geen tekst/watermerk/logo/personen) voor je met --index kiest.`);
}

async function cmdSave() {
  const { type, id, source, query, index, niveau } = args;
  if (!type || !["cocktail", "drank"].includes(type)) { console.error("Geef --type cocktail of --type drank mee."); process.exit(1); }
  if (!id) { console.error("Geef --id mee (het cocktail/drank-id uit recipes.js)."); process.exit(1); }
  if (!source || !SOURCES[source]) { console.error(`Onbekende --source. Kies uit: ${Object.keys(SOURCES).join(", ")}`); process.exit(1); }
  if (!query) { console.error("Geef --query mee (dezelfde als bij search, voor consistente resultaten)."); process.exit(1); }
  if (index === undefined) { console.error("Geef --index mee (regelnummer uit de search-uitvoer)."); process.exit(1); }
  if (!niveau || !["exact", "passend", "illustratie"].includes(niveau)) { console.error("Geef --niveau exact, --niveau passend of --niveau illustratie mee."); process.exit(1); }

  const results = await SOURCES[source](query);
  const pick = results[Number(index)];
  if (!pick) { console.error(`Geen resultaat op index ${index} (er zijn er ${results.length}).`); process.exit(1); }

  const folder = type === "cocktail" ? "cocktails" : "dranken";
  const destDir = path.join(root, "src/assets/images", folder);
  mkdirSync(destDir, { recursive: true });
  const filename = `${id}.webp`;
  const destPath = path.join(destDir, filename);

  console.log(`Downloaden: ${pick.full}`);
  const imgRes = await fetch(pick.full);
  if (!imgRes.ok) { console.error(`Download mislukt (${imgRes.status}).`); process.exit(1); }
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  await sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(destPath);

  const sizeKb = Math.round(readFileSync(destPath).length / 1024);
  console.log(`Opgeslagen: src/assets/images/${folder}/${filename} (${sizeKb} KB)`);
  if (sizeKb >= 120) {
    console.log(`Let op: groter dan de gewenste 120 KB-richtlijn (nog wel onder de harde 200 KB-grens van check:images als het < 200 KB is).`);
  }

  const catalogPath = path.join(root, "src/data/images.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const entry = catalog.find((e) => e.type === type && e.id === id);
  if (!entry) { console.error(`Geen entry voor ${type}:${id} in images.json — draai eerst scripts/sync-images-catalog.mjs.`); process.exit(1); }
  entry.bestand = filename;
  entry.bronUrl = pick.pageUrl;
  entry.maker = pick.maker;
  entry.licentie = pick.licentie;
  entry.niveau = niveau;
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`images.json bijgewerkt voor ${type}:${id} (niveau: ${niveau}, bron: ${pick.maker} / ${pick.licentie}).`);
}

if (command === "search") await cmdSearch();
else if (command === "save") await cmdSave();
else {
  console.log("Gebruik: node scripts/fetch-image.mjs search --source <pexels|pixabay|openverse|wikimedia> --query \"...\"");
  console.log("     of: node scripts/fetch-image.mjs save --type <cocktail|drank> --id <id> --source <bron> --query \"...\" --index <n> --niveau <exact|passend|illustratie>");
  process.exit(1);
}
