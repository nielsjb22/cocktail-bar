// Genereert/ververst src/data/images.json met precies één entry per cocktail
// (RECIPES) en per drank/ingrediënt (INGREDIENTS) uit src/recipes.js.
// Draai dit opnieuw als er nieuwe recepten/ingrediënten bijkomen — bestaande
// entries (bestand/bron/maker/licentie/niveau die al zijn ingevuld) blijven
// staan, alleen ontbrekende ids worden toegevoegd en niet meer bestaande
// ids worden verwijderd.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { RECIPES, INGREDIENTS } = await import(path.join(root, "src/recipes.js"));

const catalogPath = path.join(root, "src/data/images.json");
const existing = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : [];
const existingByKey = new Map(existing.map((e) => [`${e.type}:${e.id}`, e]));

const next = [];

for (const r of RECIPES) {
  const key = `cocktail:${r.id}`;
  const prev = existingByKey.get(key);
  next.push(
    prev || {
      id: r.id,
      type: "cocktail",
      bestand: null,
      bronUrl: r.image || null, // bestaande (externe) foto-URL uit recipes.js, puur als startpunt voor de zoekfase
      maker: null,
      licentie: null,
      niveau: null,
    }
  );
}

for (const i of INGREDIENTS) {
  const key = `drank:${i.id}`;
  const prev = existingByKey.get(key);
  next.push(
    prev || {
      id: i.id,
      type: "drank",
      bestand: null,
      bronUrl: null,
      maker: null,
      licentie: null,
      niveau: null,
    }
  );
}

next.sort((a, b) => (a.type === b.type ? a.id.localeCompare(b.id) : a.type.localeCompare(b.type)));
writeFileSync(catalogPath, JSON.stringify(next, null, 2) + "\n");

const added = next.length - existing.length;
console.log(`images.json bijgewerkt: ${next.length} entries (${RECIPES.length} cocktails, ${INGREDIENTS.length} dranken)${added !== 0 ? `, ${added > 0 ? "+" : ""}${added} t.o.v. vorige versie` : ""}.`);
