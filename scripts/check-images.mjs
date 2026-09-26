#!/usr/bin/env node
// npm run check:images — controleert voor elke cocktail en elke drank uit
// src/recipes.js of er een volledige, geldige entry in src/data/images.json
// staat. Faalt (exit 1) zolang er nog iets ontbreekt; bedoeld om te draaien
// vóór een release, niet als blokkade tijdens de voorbereidingsfase zelf.
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { RECIPES, INGREDIENTS } = await import(path.join(root, "src/recipes.js"));
const catalog = JSON.parse(readFileSync(path.join(root, "src/data/images.json"), "utf8"));
const byKey = new Map(catalog.map((e) => [`${e.type}:${e.id}`, e]));

const MAX_BYTES = 200 * 1024;
const problems = [];

function checkItem(type, id, label) {
  const key = `${type}:${id}`;
  const entry = byKey.get(key);
  if (!entry) { problems.push(`${key} — geen entry in images.json (${label})`); return; }
  if (!entry.bestand) { problems.push(`${key} — geen bestand ingevuld (${label})`); return; }
  const folder = type === "cocktail" ? "cocktails" : "dranken";
  const filePath = path.join(root, "src/assets/images", folder, entry.bestand);
  let size;
  try {
    size = statSync(filePath).size;
  } catch {
    problems.push(`${key} — bestand ${entry.bestand} bestaat niet op schijf (${label})`);
    return;
  }
  if (size >= MAX_BYTES) {
    problems.push(`${key} — bestand is ${Math.round(size / 1024)} KB, moet < 200 KB (${label})`);
  }
  if ((entry.niveau === "exact" || entry.niveau === "passend") && (!entry.maker || !entry.licentie)) {
    problems.push(`${key} — niveau "${entry.niveau}" mist maker en/of licentie (${label})`);
  }
}

for (const r of RECIPES) checkItem("cocktail", r.id, r.name);
for (const i of INGREDIENTS) checkItem("drank", i.id, i.name);

if (problems.length === 0) {
  console.log(`Alle ${RECIPES.length + INGREDIENTS.length} cocktails/dranken hebben een geldige, lokale foto of illustratie.`);
  console.log("MISSING: 0");
  process.exit(0);
}

problems.forEach((p) => console.log(p));
console.log(`\nMISSING: ${problems.length}`);
process.exit(1);
