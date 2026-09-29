// Bouwt de web-versie en pakt dist/ in als thuisbar-netlify.zip, klaar om
// op Netlify te slepen (Deploys → "Drag and drop your site output folder").
// Supabase-sleutels komen uit .env of uit omgevingsvariabelen; zonder die
// sleutels start de app niet, dus dan stoppen we meteen met een duidelijke melding.
import { execSync } from "child_process";
import { existsSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv("production", root, "VITE_");
const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter(k => !env[k]);
if (missing.length) {
  console.error(`Ontbrekende omgevingsvariabelen: ${missing.join(", ")}. Zet ze in .env of in de omgeving.`);
  process.exit(1);
}

const dist = join(root, "dist");
const zip = join(root, "thuisbar-netlify.zip");
execSync("npx vite build", { cwd: root, stdio: "inherit" });
// Vangnet voor directe links naar een subpad; de app zelf gebruikt alleen ?query-links.
writeFileSync(join(dist, "_redirects"), "/*    /index.html   200\n");
if (existsSync(zip)) rmSync(zip);
execSync(`zip -r -q "${zip}" .`, { cwd: dist, stdio: "inherit" });
console.log(`Klaar: ${zip}`);
