// Genereert het iOS-opstartscherm (ios/App/App/Assets.xcassets/Splash.imageset)
// in dezelfde stijl als de intro in de app: het logo (twee klinkende coupes,
// uit src/brandMark.js), "Mijn Thuisbar" en "Welkom in de wereld van de cocktail".
//
// De achtergrondkleur (#0E1917) zit niet in het plaatje maar in
// LaunchScreen.storyboard, zodat het op elk schermformaat naadloos aansluit;
// dit plaatje is transparant en wordt daar gecentreerd (aspect fit) getoond.
//
// Tekst wordt met de lokale Playfair/Inter-fonts gerenderd; die moeten daarvoor
// als systeemfont geïnstalleerd zijn (bv. kopiëren naar ~/.fonts en `fc-cache -f`).
//
// Gebruik: node scripts/make-launch-screen.mjs && npx cap sync ios
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { brandMarkMarkup, BRAND_MARK_VIEWBOX } from "../src/brandMark.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "ios/App/App/Assets.xcassets/Splash.imageset");

// Logische maat in punten; LaunchScreen.storyboard gebruikt dezelfde verhouding.
const W = 360;
const H = 300;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2A4B42" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#2A4B42" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <svg x="${W / 2 - 62}" y="34" width="124" height="109" viewBox="${BRAND_MARK_VIEWBOX}">${brandMarkMarkup({ idPrefix: "ls" })}</svg>

  <text x="${W / 2}" y="196" text-anchor="middle"
        font-family="Playfair Display" font-style="italic" font-weight="600"
        font-size="27" fill="#FBF6EA">Mijn Thuisbar</text>
  <text x="${W / 2}" y="228" text-anchor="middle"
        font-family="Inter" font-weight="600" font-size="11.5" letter-spacing="2"
        fill="#B8862E">WELKOM IN DE WERELD VAN DE COCKTAIL</text>
</svg>`;

const scales = [1, 2, 3];
const images = [];
for (const s of scales) {
  const filename = `splash@${s}x.png`;
  await sharp(Buffer.from(svg), { density: 72 * s })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, filename));
  images.push({ idiom: "universal", filename, scale: `${s}x` });
}

writeFileSync(
  path.join(outDir, "Contents.json"),
  JSON.stringify({ images, info: { version: 1, author: "xcode" } }, null, 2) + "\n",
);
console.log(`Splash.imageset bijgewerkt (${W}×${H} pt, @1x/@2x/@3x).`);
