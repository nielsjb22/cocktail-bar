// Genereert het iOS-app-icoon en het native opstartscherm (Capacitor-splash)
// uit hetzelfde merkbeeld als public/favicon.svg: goudkleurig martiniglas in
// een cirkel op donkergroen. Opnieuw draaien na een ontwerpwijziging:
//   node scripts/generate-app-icons.mjs && npx cap sync ios
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "ios/App/App/Assets.xcassets");

// Het merkteken zelf (cirkel + glas + olijf), op een 512-raster — identiek
// aan public/favicon.svg, alleen zonder achtergrond.
const MARK = `
  <circle cx="256" cy="256" r="168" fill="none" stroke="#B8862E" stroke-width="7" opacity="0.55"/>
  <g stroke="#DDB877" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M164 168 L256 268 L348 168 Z"/>
    <line x1="256" y1="268" x2="256" y2="360"/>
    <line x1="200" y1="360" x2="312" y2="360"/>
  </g>
  <circle cx="304" cy="192" r="9" fill="#DDB877"/>`;

// App-icoon: vierkant en volledig dekkend (Apple weigert transparantie en
// rondt de hoeken zelf af), dus geen rx zoals in de favicon.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="30%" cy="20%" r="90%">
      <stop offset="0%" stop-color="#2A4B42"/>
      <stop offset="100%" stop-color="#132622"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  ${MARK}
</svg>`;

// Opstartscherm: effen #0E1917 (zelfde kleur als capacitor.config.json's
// SplashScreen.backgroundColor, index.html en de in-app intro), zodat de
// overgang naar de web-app naadloos is. LaunchScreen.storyboard schaalt dit
// vierkant met scaleAspectFill, dus het merkteken staat bewust klein in het
// midden — op een iPhone wordt het ongeveer 110pt breed.
const SPLASH = 2732;
const MARK_SIZE = 380;
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPLASH} ${SPLASH}" width="${SPLASH}" height="${SPLASH}">
  <rect width="${SPLASH}" height="${SPLASH}" fill="#0E1917"/>
  <g transform="translate(${(SPLASH - MARK_SIZE) / 2} ${(SPLASH - MARK_SIZE) / 2}) scale(${MARK_SIZE / 512})">${MARK}</g>
</svg>`;

await sharp(Buffer.from(iconSvg)).flatten({ background: "#132622" }).removeAlpha().png()
  .toFile(join(assets, "AppIcon.appiconset/AppIcon-512@2x.png"));

const splash = await sharp(Buffer.from(splashSvg)).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await sharp(splash).toFile(join(assets, "Splash.imageset", name));
}
console.log("App-icoon en opstartscherm gegenereerd.");
