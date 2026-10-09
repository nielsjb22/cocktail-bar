// Genereert het app-icoon (twee klinkende coupes, "Proost") voor iOS en web.
// Het logo zelf komt uit src/brandMark.js; het resultaat staat ook als
// assets/icon/app-icon.svg. Draai: node scripts/generate-app-icon.mjs
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { brandMarkMarkup } from "../src/brandMark.js";

const DEFS = `<defs>
  <radialGradient id="bg" cx="30%" cy="22%" r="95%"><stop offset="0" stop-color="#2C5247"/><stop offset="1" stop-color="#11211C"/></radialGradient>
</defs>`;
const motif = brandMarkMarkup({ idPrefix: "icon" });

// Motief (ongeveer 196..827 x 190..730) schalen rond het midden en
// verticaal centreren. scale 1.2 voor het gewone icoon; kleiner voor
// "maskable" (Android knipt daar tot een cirkel van 80%).
const iconSvg = (scale, rx = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${DEFS}
  <rect width="1024" height="1024" rx="${rx}" fill="url(#bg)"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -460)">${motif}</g>
</svg>`;

mkdirSync("assets/icon", { recursive: true });
const main = iconSvg(1.2);
writeFileSync("assets/icon/app-icon.svg", main);
writeFileSync("public/favicon.svg", iconSvg(1.2, 230));

const png = (svg, size, out, { flatten = false } = {}) => {
  let img = sharp(Buffer.from(svg), { density: 300 }).resize(size, size);
  if (flatten) img = img.flatten({ background: "#132622" }).removeAlpha();
  return img.png().toFile(out);
};
await png(main, 1024, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", { flatten: true });
await png(main, 180, "public/apple-touch-icon.png", { flatten: true });
await png(main, 192, "public/icon-192.png", { flatten: true });
await png(main, 512, "public/icon-512.png", { flatten: true });
await png(iconSvg(1.2, 230), 32, "public/favicon-32.png");
await png(iconSvg(0.95), 512, "public/icon-maskable-512.png", { flatten: true });
await png(iconSvg(0.95), 192, "public/icon-maskable-192.png", { flatten: true });
console.log("App-icoon gegenereerd.");
