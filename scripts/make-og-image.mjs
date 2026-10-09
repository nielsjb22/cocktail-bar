// Genereert het deelplaatje voor WhatsApp e.d. (public/og-menu.png, 1200×630):
// het logo uit src/brandMark.js, "Mijn Thuisbar" en "Het cocktailmenu van
// vanavond". Fonts: Playfair Display als systeemfont (zie make-launch-screen.mjs).
//
// Gebruik: node scripts/make-og-image.mjs
import sharp from "sharp";
import { brandMarkMarkup, BRAND_MARK_VIEWBOX } from "../src/brandMark.js";

const W = 1200, H = 630;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="bg" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="#1F3A33"/><stop offset="1" stop-color="#0F1E1A"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <svg x="${W / 2 - 68}" y="96" width="136" height="119" viewBox="${BRAND_MARK_VIEWBOX}">${brandMarkMarkup({ idPrefix: "og" })}</svg>
  <text x="${W / 2}" y="338" text-anchor="middle" font-family="Playfair Display" font-weight="500" font-size="100" fill="#F3EAD6">Mijn Thuisbar</text>
  <line x1="330" y1="392" x2="870" y2="392" stroke="#B8862E" stroke-opacity="0.55" stroke-width="2"/>
  <text x="${W / 2}" y="458" text-anchor="middle" font-family="Playfair Display" font-style="italic" font-weight="600" font-size="40" fill="#C9A24E">Het cocktailmenu van vanavond</text>
</svg>`;
await sharp(Buffer.from(svg)).flatten({ background: "#0F1E1A" }).png({ compressionLevel: 9 }).toFile("public/og-menu.png");
console.log("public/og-menu.png bijgewerkt (1200×630).");
