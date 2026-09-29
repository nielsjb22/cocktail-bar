// Zet een nagekeken docs/producten-voorstel.csv om naar SQL om in de
// Supabase SQL-editor te plakken. Alleen regels MET een url worden
// meegenomen; de status komt uit de CSV (goedgekeurd / te_beoordelen /
// afgekeurd). Controles: url moet een https-pagina op drankdozijn.nl zijn,
// inhoud en prijs moeten getallen zijn. Fout = stoppen, niets half doen.
//   node scripts/producten-csv-naar-sql.mjs > producten.sql
import { readFileSync } from "fs";

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const [head, ...data] = parseCsv(readFileSync(new URL("../docs/producten-voorstel.csv", import.meta.url), "utf8"));
const col = Object.fromEntries(head.map((h, i) => [h, i]));
const sql = (v) => (v === "" || v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const errors = [], values = [];
data.forEach((r, n) => {
  const get = (k) => (r[col[k]] ?? "").trim();
  if (!get("url")) return;
  const line = n + 2;
  if (!/^https:\/\/(www\.)?drankdozijn\.nl\/\S+$/.test(get("url"))) errors.push(`regel ${line}: url is geen drankdozijn.nl-productpagina`);
  if (!["goedgekeurd", "te_beoordelen", "afgekeurd"].includes(get("status"))) errors.push(`regel ${line}: onbekende status "${get("status")}"`);
  if (!get("productnaam")) errors.push(`regel ${line}: productnaam ontbreekt`);
  if (get("inhoud_ml") && !/^\d+$/.test(get("inhoud_ml"))) errors.push(`regel ${line}: inhoud_ml moet een heel getal zijn`);
  const prijs = get("prijs").replace(",", ".");
  if (prijs && !/^\d+(\.\d{1,2})?$/.test(prijs)) errors.push(`regel ${line}: prijs "${get("prijs")}" is geen bedrag`);
  if (get("status") === "goedgekeurd" && prijs && !/^\d{4}-\d{2}-\d{2}$/.test(get("prijs_gecontroleerd_op"))) errors.push(`regel ${line}: prijs zonder controledatum (JJJJ-MM-DD)`);
  values.push(`(${[get("ingredient_id"), get("productnaam"), get("variant"), get("inhoud_ml") || null, get("url"), get("ean"), prijs || null,
    get("op_voorraad") === "nee" ? "false" : "true", get("prijs_gecontroleerd_op"), get("status"), get("notitie")]
    .map((v, i) => (i === 7 ? v : i === 3 || i === 6 ? (v == null ? "null" : v) : sql(v))).join(", ")})`);
});
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
if (!values.length) { console.error("Geen regels met een url gevonden."); process.exit(1); }
console.log(`insert into public.producten (ingredient_id, productnaam, variant, inhoud_ml, url, ean, prijs, op_voorraad, prijs_gecontroleerd_op, status, notitie)
values
  ${values.join(",\n  ")}
on conflict (winkel, url) do update set
  ingredient_id = excluded.ingredient_id, productnaam = excluded.productnaam, variant = excluded.variant,
  inhoud_ml = excluded.inhoud_ml, ean = excluded.ean, prijs = excluded.prijs, op_voorraad = excluded.op_voorraad,
  prijs_gecontroleerd_op = excluded.prijs_gecontroleerd_op, status = excluded.status, notitie = excluded.notitie, bijgewerkt_op = now();`);
