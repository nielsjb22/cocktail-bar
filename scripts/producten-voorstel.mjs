// Maakt docs/producten-voorstel.csv: per drank uit de groep "Drankwinkel"
// één regel met de specificatie (waar de fles aan moet voldoen), de huidige
// richtprijs en de oude, NIET gecontroleerde link als zoekhulp. De kolommen
// voor de echte fles (productnaam, url, prijs, ...) blijven leeg tot ze op
// drankdozijn.nl zijn nagekeken — nooit invullen op gevoel.
//   node scripts/producten-voorstel.mjs
import { writeFileSync } from "fs";
import { INGREDIENTS, RECIPES, OLD_SHOP_LINKS } from "../src/recipes.js";
import { DRANK_SPECS, shopGroupFor } from "../src/data/drankspecs.js";

const used = new Map();
RECIPES.forEach(r => r.ingredients.forEach(i => { if (!used.has(i.id)) used.set(i.id, []); used.get(i.id).push(r.name); }));
const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ["ingredient_id", "naam", "specificatie", "gebruikt_in", "richtprijs_huidig", "oude_link_niet_gecontroleerd",
  "productnaam", "variant", "inhoud_ml", "url", "ean", "prijs", "op_voorraad", "prijs_gecontroleerd_op", "status", "notitie"];
const rows = INGREDIENTS.filter(i => shopGroupFor(i) === "drankwinkel").map(i => {
  const recipes = used.get(i.id) || [];
  return [i.id, i.name, DRANK_SPECS[i.id]?.eis || "SPECIFICATIE ONTBREEKT", recipes.slice(0, 4).join(", ") + (recipes.length > 4 ? ` +${recipes.length - 4}` : ""),
    i.bottlePrice ? `${i.bottlePrice} (${i.bottleMl} ml, ${"2026-09"})` : "", OLD_SHOP_LINKS[i.id] || "",
    "", "", "", "", "", "", "", "", "te_beoordelen", "Nog op te zoeken op drankdozijn.nl"];
});
writeFileSync(new URL("../docs/producten-voorstel.csv", import.meta.url), [cols, ...rows].map(r => r.map(esc).join(",")).join("\n") + "\n");
console.log(`${rows.length} dranken geschreven naar docs/producten-voorstel.csv`);
