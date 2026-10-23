// Maakt src/data/licenses.json: de open-sourcepakketten die in de app
// meegaan (dependencies uit package.json en wat zij weer gebruiken), met
// licentie en volledige licentietekst, plus de lettertypes (SIL OFL 1.1).
// Bouwgereedschap (@capacitor/cli, vite, sharp) gaat niet mee in de app en
// staat er dus niet in.
// Gebruik: npm run sync:licenses (na het toevoegen of bijwerken van pakketten).
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const NIET_IN_APP = new Set(["@capacitor/cli"]);

const seen = new Map();
function dirOf(name, fromDir) {
  try {
    return path.dirname(createRequire(path.join(fromDir, "noop.js")).resolve(`${name}/package.json`));
  } catch {
    // Pakketten zonder "exports" voor package.json: zoek de map zelf op.
    for (let d = fromDir; ; d = path.dirname(d)) {
      const p = path.join(d, "node_modules", name);
      if (fs.existsSync(path.join(p, "package.json"))) return p;
      if (d === path.dirname(d)) return null;
    }
  }
}
function licenseText(dir) {
  const f = fs.readdirSync(dir).find(n => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n));
  return f ? fs.readFileSync(path.join(dir, f), "utf8").trim() : "";
}
function walk(name, fromDir) {
  if (NIET_IN_APP.has(name)) return;
  const dir = dirOf(name, fromDir);
  if (!dir || seen.has(dir)) return;
  const p = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const license = typeof p.license === "string" ? p.license : (p.license?.type || (p.licenses || []).map(l => l.type || l).join(" OR ") || "onbekend");
  seen.set(dir, { naam: p.name, versie: p.version, licentie: license, tekst: licenseText(dir) });
  for (const d of Object.keys(p.dependencies || {})) walk(d, dir);
}
for (const d of Object.keys(pkg.dependencies || {})) walk(d, root);

const pakketten = [...seen.values()].sort((a, b) => a.naam.localeCompare(b.naam));
const onbekend = pakketten.filter(p => !/MIT|ISC|BSD|Apache|0BSD|Unlicense|BlueOak/.test(p.licentie));
if (onbekend.length) console.warn("Controleer deze licenties:", onbekend.map(p => `${p.naam} (${p.licentie})`).join(", "));
const zonderTekst = pakketten.filter(p => !p.tekst);
if (zonderTekst.length) console.warn("Geen licentiebestand gevonden bij:", zonderTekst.map(p => p.naam).join(", "));

// De copyrightregels staan per lettertype hieronder; uit OFL.txt alleen de licentie zelf.
const OFLbestand = fs.readFileSync(path.join(root, "src/assets/fonts/OFL.txt"), "utf8");
const OFL = OFLbestand.slice(OFLbestand.indexOf("This Font Software is licensed")).trim();
const lettertypes = [
  { naam: "Inter", copyright: "Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)", licentie: "SIL Open Font License 1.1" },
  { naam: "Playfair Display", copyright: "Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name \"Playfair Display\".", licentie: "SIL Open Font License 1.1" },
];

const out = { lettertypes, oflTekst: OFL, pakketten };
fs.writeFileSync(path.join(root, "src/data/licenses.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${pakketten.length} pakketten, ${lettertypes.length} lettertypes → src/data/licenses.json`);
