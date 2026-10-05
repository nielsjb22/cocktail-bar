// Genereert het iOS-app-icoon (ios/App/App/Assets.xcassets/AppIcon.appiconset)
// uit public/favicon.svg, zodat het beginschermicoon gelijk is aan dat van de
// webversie. iOS rondt de hoeken zelf af en weigert transparantie, dus de
// afgeronde hoeken gaan eraf en het plaatje wordt zonder alfakanaal opgeslagen.
//
// Gebruik: node scripts/make-app-icon.mjs && npx cap sync ios
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(path.join(root, "public/favicon.svg"), "utf8").replace(/\srx="[^"]*"/, "");
const out = path.join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");

await sharp(Buffer.from(svg), { density: 72 * (1024 / 512) })
  .resize(1024, 1024)
  .flatten({ background: "#132622" })
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log("AppIcon bijgewerkt (1024×1024, zonder transparantie).");
