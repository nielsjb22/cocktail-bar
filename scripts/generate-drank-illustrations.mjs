#!/usr/bin/env node
// Eigen illustraties (niveau "illustratie") voor dranken zonder goede foto:
// één vaste app-stijl — warm papier, zachte schaduw, flestype + kleur van de
// drank, een leeg etiket (geen tekst, geen merk). Gebruikt waar meerdere
// dranken dezelfde, niet-passende stockfoto hadden (bijv. tequila, wodka en
// pisco met één strandfoto). Opnieuw draaien:
//   node scripts/generate-drank-illustrations.mjs [id ...]
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "src/assets/images/dranken");
const catalogPath = path.join(root, "src/data/images.json");

// shape + kleur per drank. liquid = kleur van de inhoud, glass = tint van de fles.
const SPECS = {
  vodka: { shape: "spirit", liquid: "#E8EEF0", glass: "#DCE6EA", cap: "#9AA7AD" },
  tequila_blanco: { shape: "spirit", liquid: "#F0EBD6", glass: "#E4E6DA", cap: "#6F5B3E" },
  pisco: { shape: "spirit", liquid: "#EEE6CE", glass: "#E2E2D6", cap: "#8A6A3A" },
  bourbon: { shape: "square", liquid: "#B8652A", glass: "#E6D2B8", cap: "#3A2A1E" },
  dark_rum: { shape: "spirit", liquid: "#5A2E14", glass: "#6A4A30", cap: "#2A1A12" },
  absinthe: { shape: "spirit", liquid: "#8DB85A", glass: "#CFE0C0", cap: "#2F3A2A" },
  creme_de_menthe: { shape: "liqueur", liquid: "#3E9A5A", glass: "#CFE3D4", cap: "#1F3A2A" },
  amaro_nonino: { shape: "spirit", liquid: "#A5542A", glass: "#E0CDB8", cap: "#2A1E16" },
  fernet_branca: { shape: "liqueur", liquid: "#2A1A12", glass: "#4A3A2A", cap: "#1A120C" },
  apricot_brandy: { shape: "liqueur", liquid: "#D98A3A", glass: "#EBD6BE", cap: "#6A3A1E" },
  coffee_liqueur: { shape: "liqueur", liquid: "#2B1A10", glass: "#4A3626", cap: "#C9A36A" },
  creme_de_mure: { shape: "liqueur", liquid: "#4A1A3A", glass: "#6A4A5E", cap: "#2A1020" },
  galliano: { shape: "tall", liquid: "#E9C43A", glass: "#F0E4B8", cap: "#B8862E" },
  melon_liqueur: { shape: "liqueur", liquid: "#6CC04A", glass: "#D6EBCB", cap: "#2F4A2A" },
  passion_fruit_liqueur: { shape: "liqueur", liquid: "#C8485A", glass: "#EACFD2", cap: "#3A1A1E" },
  peach_schnapps: { shape: "liqueur", liquid: "#F2D2A0", glass: "#EFE4D2", cap: "#C0703A" },
  pimms: { shape: "spirit", liquid: "#8A3A1E", glass: "#D8C0B0", cap: "#2A1A12" },
  sour_apple_liqueur: { shape: "liqueur", liquid: "#9ED04A", glass: "#DDEBC8", cap: "#3A4A1E" },
  yellow_chartreuse: { shape: "liqueur", liquid: "#E6C83A", glass: "#EFE3B6", cap: "#6A5A1E" },
  port: { shape: "wine", liquid: "#5A1020", glass: "#3A2A24", cap: "#7A1A2A" },
  red_wine: { shape: "wine", liquid: "#5A1020", glass: "#3A2A24", cap: "#7A1A2A" },
  dry_vermouth: { shape: "wine", liquid: "#EDE6C0", glass: "#D8DDC8", cap: "#4A5A3A" },
  ginger_wine: { shape: "wine", liquid: "#C9922E", glass: "#D8C8A8", cap: "#3A2A1E" },
  peychauds: { shape: "dasher", liquid: "#B8202A", glass: "#E0C4C4", cap: "#F3ECDD" },
  ginger_beer: { shape: "soda", liquid: "#D9B96A", glass: "#E8DEC4", cap: "#8A6A2E" },
  grapefruit_soda: { shape: "soda", liquid: "#F2B8A0", glass: "#F0DED4", cap: "#D86A5A" },
  orange_juice: { shape: "carton", liquid: "#F0A040", accent: "#F28C28" },
  grapefruit_juice: { shape: "carton", liquid: "#F2A08A", accent: "#E5705A" },
  pineapple_juice: { shape: "carton", liquid: "#F2D060", accent: "#D8A82E" },
  cranberry_juice: { shape: "carton", liquid: "#B8283A", accent: "#9A1E2E" },
  tomato_juice: { shape: "carton", liquid: "#C8382A", accent: "#A82A1E" },
  passion_fruit_puree: { shape: "carton", liquid: "#E8B830", accent: "#7A3A6A" },
  peach_puree: { shape: "carton", liquid: "#F5B888", accent: "#E88A5A" },
  sugar_syrup: { shape: "syrup", liquid: "#F4EEDC", glass: "#E8E6DA", cap: "#9AA7AD" },
  honey_syrup: { shape: "syrup", liquid: "#D8A030", glass: "#EAD8B0", cap: "#8A5A1E" },
  agave_nectar: { shape: "syrup", liquid: "#C88A2E", glass: "#E6D4B4", cap: "#3A5A3A" },
  elderflower_cordial: { shape: "syrup", liquid: "#E8DCA0", glass: "#E6E4D0", cap: "#5A7A4A" },
  orgeat: { shape: "syrup", liquid: "#F1EAD8", glass: "#E6E2D6", cap: "#A07A4A" },
  raspberry_syrup: { shape: "syrup", liquid: "#C83A5A", glass: "#EAD2D6", cap: "#6A1A2A" },
  orange_flower_water: { shape: "small", liquid: "#EEF0EA", glass: "#D8E4E8", cap: "#3A6A8A" },
  olive_brine: { shape: "jar", liquid: "#C8C890", fruit: "#6A7A2E" },
  tabasco: { shape: "sauce", liquid: "#B8201A", glass: "#E0C0B8", cap: "#2E5A2A" },
  worcestershire: { shape: "sauce", liquid: "#3A1A10", glass: "#5A4030", cap: "#E8DCC0" },
  marmalade: { shape: "jar", liquid: "#E88A2A", fruit: null },
  coconut_cream: { shape: "can", liquid: "#F4F0E6", accent: "#6A4A2E" },
  heavy_cream: { shape: "carton", liquid: "#F8F4EA", accent: "#6A8AB0" },
  whipped_cream: { shape: "spraycan", liquid: "#F8F4EA", accent: "#B8C8D8" },
  lemon_juice: { shape: "citrus", liquid: "#F2D23A", peel: "#E8C020", flesh: "#F8E88A" },
  lime_juice: { shape: "citrus", liquid: "#8AB83A", peel: "#5A8A2A", flesh: "#C8E08A" },
  cherry: { shape: "cherries" },
  strawberry: { shape: "strawberry" },
  chili: { shape: "chili" },
  cucumber: { shape: "cucumber" },
  cinnamon_stick: { shape: "cinnamon" },
  mint: { shape: "mint" },
  egg_yolk: { shape: "egg" },
  // Tweede ronde: foto's die niet klopten (verkeerd onderwerp of merketiket).
  advocaat: { shape: "liqueur", liquid: "#F2D860", glass: "#EFE6C8", cap: "#8A6A1E" },
  allspice_liqueur: { shape: "small", liquid: "#6A2A18", glass: "#8A6A5A", cap: "#2A1A12" },
  amaretto: { shape: "square", liquid: "#A8521E", glass: "#E0C8B0", cap: "#3A2A1E" },
  angostura: { shape: "dasher", liquid: "#5A1E12", glass: "#8A6A5A", cap: "#E8C040" },
  aperol: { shape: "tall", liquid: "#F06A24", glass: "#F2D4C0", cap: "#2A1A12" },
  banana_liqueur: { shape: "liqueur", liquid: "#F2DC60", glass: "#EFE8C8", cap: "#6A5A1E" },
  beer: { shape: "beer", liquid: "#E0A830", glass: "#6A4A1E", cap: "#C8A040" },
  benedictine: { shape: "liqueur", liquid: "#C8862E", glass: "#E6D2B0", cap: "#8A1A1A" },
  blue_curacao: { shape: "liqueur", liquid: "#1E6AB8", glass: "#C8D8E8", cap: "#1A2A4A" },
  brown_sugar: { shape: "sugarbowl", liquid: "#B8783A" },
  butter: { shape: "butter" },
  cachaca: { shape: "spirit", liquid: "#EEE8D2", glass: "#DDE4DA", cap: "#3A6A2A" },
  calvados: { shape: "square", liquid: "#C88A3A", glass: "#E6D6BC", cap: "#6A2A1A" },
  campari: { shape: "spirit", liquid: "#C8182A", glass: "#EAC8C8", cap: "#2A1A12" },
  chambord: { shape: "round", liquid: "#6A1030", glass: "#8A5A6A", cap: "#C8A040" },
  cherry_brandy: { shape: "liqueur", liquid: "#8A1020", glass: "#C8A0A8", cap: "#2A1A12" },
  cloves: { shape: "cloves" },
  cola: { shape: "soda", liquid: "#3A1E10", glass: "#5A3A2A", cap: "#C82A2A" },
  creme_de_cacao: { shape: "liqueur", liquid: "#F2EEE4", glass: "#E6E2DA", cap: "#5A3A22" },
  creme_de_cassis: { shape: "liqueur", liquid: "#3A0A2A", glass: "#6A4A5A", cap: "#6A1A4A" },
  creme_de_noyaux: { shape: "liqueur", liquid: "#E8708A", glass: "#F0D4DA", cap: "#6A2A3A" },
  creme_de_violette: { shape: "small", liquid: "#6A4AA8", glass: "#D8D0E8", cap: "#3A2A5A" },
  cynar: { shape: "spirit", liquid: "#3A2A14", glass: "#5A4A30", cap: "#2A3A1A" },
  drambuie: { shape: "square", liquid: "#B8782A", glass: "#DCC8A8", cap: "#8A1A1A" },
  egg_white: { shape: "eggwhite" },
  espresso: { shape: "cup" },
  falernum: { shape: "spirit", liquid: "#E8D8A8", glass: "#E6E2D0", cap: "#6A4A2A" },
  frangelico: { shape: "tall", liquid: "#B8782A", glass: "#D8C4A0", cap: "#6A4A2A" },
  genever: { shape: "crock" },
  gin: { shape: "spirit", liquid: "#EEF2F2", glass: "#D4E4E0", cap: "#2F4A5A" },
  ginger_ale: { shape: "soda", liquid: "#E0B860", glass: "#E8DEC4", cap: "#3A6A2A" },
  ginger_root: { shape: "ginger" },
  grand_marnier: { shape: "round", liquid: "#D8781E", glass: "#E8C8A0", cap: "#8A1A1A" },
  grappa: { shape: "tall", liquid: "#F2EEE0", glass: "#E4E6E0", cap: "#6A6A6A" },
  green_chartreuse: { shape: "liqueur", liquid: "#6AA83A", glass: "#D4E4C4", cap: "#2A3A1A" },
  grenadine: { shape: "syrup", liquid: "#B8102A", glass: "#E8C8CC", cap: "#6A1A1A" },
  honey_ginger_syrup: { shape: "syrup", liquid: "#D89A2E", glass: "#EAD8B0", cap: "#6A5A2A" },
  hot_coffee: { shape: "mug", liquid: "#4A2A18" },
  hot_water: { shape: "mug", liquid: "#E4ECEE" },
  irish_cream: { shape: "liqueur", liquid: "#D8B894", glass: "#E6D8C6", cap: "#2A1A12" },
  irish_whiskey: { shape: "spirit", liquid: "#C8862E", glass: "#E6D6BC", cap: "#2A4A2A" },
  lillet_blanc: { shape: "wine", liquid: "#E8C860", glass: "#E6E0C4", cap: "#B8862E" },
  lychee_liqueur: { shape: "liqueur", liquid: "#F2E4E0", glass: "#EAE2E0", cap: "#C86A7A" },
  maraschino_liqueur: { shape: "tall", liquid: "#F2F0E8", glass: "#D8E0D0", cap: "#8A1A1A" },
  mezcal: { shape: "spirit", liquid: "#EEE6CC", glass: "#E0E0D4", cap: "#5A3A22" },
  milk: { shape: "carton", liquid: "#F8F6F0", accent: "#4A7AB8" },
  orange_bitters: { shape: "dasher", liquid: "#E07A24", glass: "#EAD4C0", cap: "#F3ECDD" },
  prosecco: { shape: "sparkling", liquid: "#E8D890", glass: "#3A4A2A", cap: "#C8A040" },
  rye: { shape: "square", liquid: "#A8521E", glass: "#E0C8B0", cap: "#1A1A1A" },
  scotch: { shape: "square", liquid: "#C8862E", glass: "#E6D6BC", cap: "#8A1A1A" },
  sherry: { shape: "wine", liquid: "#D8A850", glass: "#4A3A24", cap: "#8A1A1A" },
  sloe_gin: { shape: "spirit", liquid: "#8A1A3A", glass: "#C8A0AE", cap: "#2A1A20" },
  soda_water: { shape: "soda", liquid: "#EEF4F6", glass: "#D8E6EA", cap: "#4A7AB8" },
  stout: { shape: "beer", liquid: "#1A120C", glass: "#2A1E14", cap: "#E8DCC0" },
  sweet_vermouth: { shape: "wine", liquid: "#6A1A12", glass: "#4A3024", cap: "#B8862E" },
  tonic: { shape: "soda", liquid: "#EEF2EA", glass: "#D8E6DC", cap: "#C8A040" },
  triple_sec: { shape: "square", liquid: "#F2EEE4", glass: "#E8DCC8", cap: "#E07A24" },
  white_rum: { shape: "spirit", liquid: "#F2EEE4", glass: "#E0E4DC", cap: "#8A6A3A" },
  white_wine: { shape: "wine", liquid: "#EEDC90", glass: "#D8E0B8", cap: "#B8862E" },
};

const W = 600;
const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="${W}" height="${W}">
  <defs>
    <radialGradient id="bg" cx="40%" cy="30%" r="85%"><stop offset="0" stop-color="#F6EEDC"/><stop offset="1" stop-color="#DCCBA6"/></radialGradient>
    <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <ellipse cx="300" cy="520" rx="170" ry="26" fill="#6B5635" opacity="0.18"/>
  ${inner}
</svg>`;

// Glazen fles: body-pad, vloeistof tot `level` (0..1 vanaf onder), highlight, leeg etiket.
function bottle(bodyPath, { top, bottom, left, right }, s, { label, level = 0.78, neck } = {}) {
  const liquidTop = bottom - (bottom - top) * level;
  return `
  <clipPath id="body"><path d="${bodyPath}"/></clipPath>
  ${neck || ""}
  <path d="${bodyPath}" fill="${s.glass}" opacity="0.55"/>
  <g clip-path="url(#body)">
    <rect x="${left}" y="${liquidTop}" width="${right - left}" height="${bottom - liquidTop}" fill="${s.liquid}" opacity="0.92"/>
    <rect x="${left + (right - left) * 0.14}" y="${top}" width="${(right - left) * 0.12}" height="${bottom - top}" fill="url(#shine)" opacity="0.8"/>
  </g>
  <path d="${bodyPath}" fill="none" stroke="#3A2E22" stroke-opacity="0.35" stroke-width="3"/>
  ${label ? `<rect x="${label.x}" y="${label.y}" width="${label.w}" height="${label.h}" rx="6" fill="#FBF6EA" opacity="0.95"/><rect x="${label.x + 14}" y="${label.y + label.h / 2 - 3}" width="${label.w - 28}" height="6" rx="3" fill="${s.cap}" opacity="0.35"/>` : ""}`;
}

function draw(id, s) {
  switch (s.shape) {
    case "spirit": return frame(`
      <rect x="276" y="92" width="48" height="44" rx="8" fill="${s.cap}"/>
      ${bottle("M282 136 h36 v58 c0 24 58 40 58 92 v214 a16 16 0 0 1 -16 16 h-120 a16 16 0 0 1 -16 -16 v-214 c0 -52 58 -68 58 -92 z", { top: 136, bottom: 516, left: 224, right: 376 }, s, { label: { x: 238, y: 350, w: 124, h: 92 } })}`);
    case "square": return frame(`
      <rect x="274" y="96" width="52" height="46" rx="8" fill="${s.cap}"/>
      ${bottle("M284 142 h32 v48 c0 14 62 16 62 44 v266 a14 14 0 0 1 -14 14 h-128 a14 14 0 0 1 -14 -14 v-266 c0 -28 62 -30 62 -44 z", { top: 142, bottom: 514, left: 222, right: 378 }, s, { label: { x: 236, y: 330, w: 128, h: 100 } })}`);
    case "tall": return frame(`
      <rect x="282" y="60" width="36" height="40" rx="7" fill="${s.cap}"/>
      ${bottle("M288 100 h24 v70 c0 30 40 60 40 110 v220 a14 14 0 0 1 -14 14 h-76 a14 14 0 0 1 -14 -14 v-220 c0 -50 40 -80 40 -110 z", { top: 100, bottom: 514, left: 248, right: 352 }, s, { label: { x: 258, y: 360, w: 84, h: 80 } })}`);
    case "liqueur": return frame(`
      <rect x="278" y="136" width="44" height="40" rx="8" fill="${s.cap}"/>
      ${bottle("M284 176 h32 v34 c0 16 76 36 76 110 v180 a16 16 0 0 1 -16 16 h-152 a16 16 0 0 1 -16 -16 v-180 c0 -74 76 -94 76 -110 z", { top: 176, bottom: 516, left: 208, right: 392 }, s, { label: { x: 226, y: 360, w: 148, h: 86 } })}`);
    case "wine": return frame(`
      <rect x="283" y="62" width="34" height="56" rx="6" fill="${s.cap}"/>
      ${bottle("M287 118 h26 v96 c0 30 43 46 43 88 v200 a14 14 0 0 1 -14 14 h-84 a14 14 0 0 1 -14 -14 v-200 c0 -42 43 -58 43 -88 z", { top: 118, bottom: 516, left: 244, right: 356 }, s, { label: { x: 254, y: 370, w: 92, h: 84 } })}`);
    case "dasher": return frame(`
      <rect x="284" y="176" width="32" height="44" rx="6" fill="#E8DCC0"/><rect x="292" y="160" width="16" height="20" rx="4" fill="#E8DCC0"/>
      ${bottle("M288 220 h24 v30 c0 16 42 30 42 70 v180 a14 14 0 0 1 -14 14 h-80 a14 14 0 0 1 -14 -14 v-180 c0 -40 42 -54 42 -70 z", { top: 220, bottom: 514, left: 246, right: 354 }, s, { label: { x: 234, y: 330, w: 132, h: 150 } })}`);
    case "soda": return frame(`
      <rect x="284" y="96" width="32" height="22" rx="4" fill="${s.cap}"/>
      ${bottle("M288 118 h24 v70 c0 30 40 40 40 90 v222 a14 14 0 0 1 -14 14 h-76 a14 14 0 0 1 -14 -14 v-222 c0 -50 40 -60 40 -90 z", { top: 118, bottom: 514, left: 248, right: 352 }, s, { label: { x: 250, y: 330, w: 100, h: 90 }, level: 0.86 })}`);
    case "syrup": return frame(`
      <path d="M284 150 h32 l6 -30 h-44 z" fill="${s.cap}"/><rect x="292" y="104" width="16" height="18" rx="3" fill="${s.cap}"/>
      ${bottle("M280 150 h40 v20 c0 10 50 14 50 50 v280 a16 16 0 0 1 -16 16 h-108 a16 16 0 0 1 -16 -16 v-280 c0 -36 50 -40 50 -50 z", { top: 150, bottom: 516, left: 230, right: 370 }, s, { label: { x: 244, y: 330, w: 112, h: 96 } })}`);
    case "small": return frame(`
      <rect x="282" y="190" width="36" height="40" rx="7" fill="${s.cap}"/>
      ${bottle("M286 230 h28 v24 c0 12 48 22 48 60 v190 a14 14 0 0 1 -14 14 h-96 a14 14 0 0 1 -14 -14 v-190 c0 -38 48 -48 48 -60 z", { top: 230, bottom: 518, left: 238, right: 362 }, s, { label: { x: 250, y: 360, w: 100, h: 84 } })}`);
    case "sauce": return frame(`
      <rect x="284" y="150" width="32" height="60" rx="6" fill="${s.cap}"/>
      ${bottle("M288 210 h24 v40 c0 18 36 30 36 64 v190 a14 14 0 0 1 -14 14 h-68 a14 14 0 0 1 -14 -14 v-190 c0 -34 36 -46 36 -64 z", { top: 210, bottom: 518, left: 252, right: 348 }, s, { label: { x: 258, y: 350, w: 84, h: 100 }, level: 0.9 })}`);
    case "jar": return frame(`
      <rect x="208" y="206" width="184" height="46" rx="10" fill="#B8862E"/>
      <rect x="200" y="250" width="200" height="266" rx="30" fill="#E6E2D6" opacity="0.6"/>
      <rect x="208" y="286" width="184" height="222" rx="24" fill="${s.liquid}" opacity="0.92"/>
      ${s.fruit ? [0, 1, 2, 3, 4].map(i => `<ellipse cx="${240 + (i % 3) * 58}" cy="${330 + Math.floor(i / 3) * 90 + (i % 2) * 20}" rx="26" ry="20" fill="${s.fruit}"/><circle cx="${250 + (i % 3) * 58}" cy="${326 + Math.floor(i / 3) * 90 + (i % 2) * 20}" r="7" fill="#B8382A"/>`).join("") : `<rect x="228" y="360" width="144" height="80" rx="8" fill="#FBF6EA" opacity="0.95"/>`}
      <rect x="226" y="260" width="16" height="240" rx="8" fill="#fff" opacity="0.35"/>
      <rect x="200" y="250" width="200" height="266" rx="30" fill="none" stroke="#3A2E22" stroke-opacity="0.3" stroke-width="3"/>`);
    case "carton": return frame(`
      <path d="M220 160 l40 -60 h80 l40 60 z" fill="#F4EEE0" stroke="#3A2E22" stroke-opacity="0.25" stroke-width="3"/>
      <rect x="300" y="84" width="34" height="22" rx="5" fill="${s.accent}"/>
      <rect x="220" y="160" width="160" height="356" rx="6" fill="#FBF6EA" stroke="#3A2E22" stroke-opacity="0.25" stroke-width="3"/>
      <rect x="220" y="330" width="160" height="186" rx="6" fill="${s.liquid}"/>
      <circle cx="300" cy="260" r="46" fill="${s.liquid}"/><circle cx="300" cy="260" r="46" fill="none" stroke="${s.accent}" stroke-width="6"/>
      <rect x="244" y="360" width="112" height="10" rx="5" fill="#FBF6EA" opacity="0.7"/>`);
    case "can": return frame(`
      <ellipse cx="300" cy="200" rx="96" ry="22" fill="#C8C2B4"/>
      <rect x="204" y="200" width="192" height="300" fill="#E4DED0"/>
      <ellipse cx="300" cy="500" rx="96" ry="22" fill="#C8C2B4"/>
      <rect x="204" y="260" width="192" height="170" fill="${s.liquid}"/>
      <circle cx="300" cy="345" r="50" fill="${s.accent}"/><circle cx="300" cy="345" r="34" fill="#FBF6EA"/>
      <rect x="220" y="210" width="16" height="280" fill="#fff" opacity="0.4"/>`);
    case "spraycan": return frame(`
      <path d="M288 90 h24 l8 60 h-40 z" fill="#E8E4DA"/><rect x="262" y="146" width="76" height="40" rx="8" fill="${s.accent}"/>
      <rect x="236" y="186" width="128" height="320" rx="22" fill="#E4E6EA"/>
      <rect x="236" y="290" width="128" height="120" fill="#FBF6EA"/>
      <path d="M270 340 q30 -40 60 0 q-30 30 -60 0z" fill="${s.accent}" opacity="0.6"/>
      <rect x="252" y="196" width="14" height="300" rx="7" fill="#fff" opacity="0.5"/>`);
    case "citrus": return frame(`
      <ellipse cx="236" cy="380" rx="112" ry="100" fill="${s.peel}"/>
      <ellipse cx="236" cy="374" rx="112" ry="100" fill="${s.liquid}"/>
      <circle cx="380" cy="352" r="104" fill="${s.peel}"/><circle cx="380" cy="352" r="90" fill="#FBF6E0"/><circle cx="380" cy="352" r="80" fill="${s.flesh}"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i * Math.PI / 4; return `<line x1="380" y1="352" x2="${380 + Math.cos(a) * 80}" y2="${352 + Math.sin(a) * 80}" stroke="#FBF6E0" stroke-width="5"/>`; }).join("")}
      <circle cx="380" cy="352" r="10" fill="#FBF6E0"/>
      <ellipse cx="200" cy="330" rx="30" ry="16" fill="#fff" opacity="0.35"/>`);
    case "cherries": return frame(`
      <path d="M250 380 C260 260 300 190 350 150" stroke="#5A6A2A" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M370 380 C360 280 350 210 350 150" stroke="#5A6A2A" stroke-width="10" fill="none" stroke-linecap="round"/>
      <circle cx="240" cy="420" r="72" fill="#A8182A"/><circle cx="380" cy="420" r="72" fill="#B81E30"/>
      <ellipse cx="218" cy="395" rx="18" ry="12" fill="#fff" opacity="0.45"/><ellipse cx="358" cy="395" rx="18" ry="12" fill="#fff" opacity="0.45"/>`);
    case "strawberry": return frame(`
      <path d="M300 520 C190 450 170 330 220 280 C260 250 340 250 380 280 C430 330 410 450 300 520Z" fill="#D02A36"/>
      <path d="M230 270 l30 -50 l20 40 l20 -50 l20 50 l20 -40 l30 50 z" fill="#4A7A2A"/>
      ${[[260, 330], [300, 320], [340, 330], [250, 380], [290, 380], [330, 385], [370, 370], [270, 430], [310, 440], [345, 420], [300, 480]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="8" fill="#F4D88A"/>`).join("")}`);
    case "chili": return frame(`
      <path d="M170 250 C260 230 380 300 450 470 C360 420 240 360 180 300 Z" fill="#C81E1E"/>
      <path d="M170 250 C150 230 140 200 160 170" stroke="#3E6A2A" stroke-width="14" fill="none" stroke-linecap="round"/>
      <path d="M160 240 c10 -20 30 -22 40 -6 c-10 16 -26 18 -40 6z" fill="#3E6A2A"/>
      <path d="M220 270 C290 270 360 320 410 410" stroke="#fff" stroke-opacity="0.35" stroke-width="10" fill="none" stroke-linecap="round"/>`);
    case "cucumber": return frame(`
      <rect x="120" y="230" width="300" height="120" rx="60" fill="#3E6A2A" transform="rotate(-18 270 290)"/>
      ${[[340, 430], [440, 380], [250, 460]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="62" fill="#3E6A2A"/><circle cx="${x}" cy="${y}" r="54" fill="#CFE3A8"/><circle cx="${x}" cy="${y}" r="26" fill="#E6F0C8"/>`).join("")}`);
    case "cinnamon": return frame(`
      ${[[-14, 0], [0, 24], [14, 48]].map(([r, dy]) => `<g transform="rotate(${r - 20} 300 ${330 + dy})"><rect x="140" y="${306 + dy}" width="320" height="48" rx="24" fill="#8A4A22"/><rect x="140" y="${312 + dy}" width="320" height="10" rx="5" fill="#B87040" opacity="0.7"/><ellipse cx="458" cy="${330 + dy}" rx="12" ry="24" fill="#6A3414"/></g>`).join("")}`);
    case "mint": return frame(`
      <path d="M300 520 C300 420 300 300 300 180" stroke="#3E6A2A" stroke-width="10" fill="none"/>
      ${[[-1, 400, 1], [1, 350, 1], [-1, 290, 0.9], [1, 240, 0.8], [-1, 200, 0.7]].map(([side, y, sc]) => `<path d="M300 ${y} C${300 + side * 60 * sc} ${y - 70 * sc} ${300 + side * 170 * sc} ${y - 40 * sc} ${300 + side * 150 * sc} ${y + 20 * sc} C${300 + side * 110 * sc} ${y + 50 * sc} ${300 + side * 40 * sc} ${y + 30 * sc} 300 ${y} Z" fill="#5A9A3A"/><path d="M300 ${y} L${300 + side * 130 * sc} ${y - 8 * sc}" stroke="#3E6A2A" stroke-width="4"/>`).join("")}`);
    case "egg": return frame(`
      <ellipse cx="220" cy="360" rx="96" ry="124" fill="#F4E8D0" stroke="#C8B48A" stroke-width="3"/>
      <path d="M300 440 C300 340 520 340 520 440 C520 500 300 500 300 440Z" fill="#F4E8D0" stroke="#C8B48A" stroke-width="3"/>
      <ellipse cx="410" cy="430" rx="104" ry="44" fill="#FBF6EA"/><circle cx="410" cy="424" r="40" fill="#F0A020"/>
      <ellipse cx="398" cy="412" rx="12" ry="8" fill="#fff" opacity="0.5"/><ellipse cx="190" cy="300" rx="20" ry="30" fill="#fff" opacity="0.4"/>`);
    case "round": return frame(`
      <rect x="280" y="150" width="40" height="36" rx="8" fill="${s.cap}"/>
      ${bottle("M286 186 h28 v30 c50 12 86 60 86 136 c0 90 -48 164 -100 164 s-100 -74 -100 -164 c0 -76 36 -124 86 -136 z", { top: 186, bottom: 516, left: 200, right: 400 }, s, { label: { x: 236, y: 360, w: 128, h: 76 } })}`);
    case "beer": return frame(`
      <rect x="284" y="92" width="32" height="18" rx="4" fill="${s.cap}"/>
      ${bottle("M288 110 h24 v96 c0 30 34 40 34 84 v210 a14 14 0 0 1 -14 14 h-64 a14 14 0 0 1 -14 -14 v-210 c0 -44 34 -54 34 -84 z", { top: 110, bottom: 514, left: 254, right: 346 }, { ...s, glass: s.glass }, { label: { x: 258, y: 350, w: 84, h: 90 }, level: 0.95 })}`);
    case "sparkling": return frame(`
      <path d="M284 60 h32 l6 80 h-44 z" fill="${s.cap}"/>
      ${bottle("M286 130 h28 v70 c0 36 46 50 46 96 v206 a14 14 0 0 1 -14 14 h-92 a14 14 0 0 1 -14 -14 v-206 c0 -46 46 -60 46 -96 z", { top: 130, bottom: 516, left: 240, right: 360 }, s, { label: { x: 250, y: 360, w: 100, h: 84 } })}`);
    case "crock": return frame(`
      <rect x="284" y="120" width="32" height="30" rx="6" fill="#6A4A2E"/>
      <path d="M286 150 h28 v30 c56 10 80 50 80 110 v200 a16 16 0 0 1 -16 16 h-156 a16 16 0 0 1 -16 -16 v-200 c0 -60 24 -100 80 -110 z" fill="#C8A878"/>
      <path d="M286 150 h28 v30 c56 10 80 50 80 110 v200 a16 16 0 0 1 -16 16 h-156 a16 16 0 0 1 -16 -16 v-200 c0 -60 24 -100 80 -110 z" fill="none" stroke="#3A2E22" stroke-opacity="0.3" stroke-width="3"/>
      <rect x="230" y="200" width="18" height="290" rx="9" fill="#fff" opacity="0.3"/>
      <rect x="232" y="340" width="136" height="80" rx="8" fill="#FBF6EA" opacity="0.95"/>`);
    case "cup": return frame(`
      <ellipse cx="300" cy="470" rx="150" ry="36" fill="#F4EEE0" stroke="#C8B48A" stroke-width="3"/>
      <path d="M200 300 h200 v70 c0 70 -44 110 -100 110 s-100 -40 -100 -110 z" fill="#FBF6EA" stroke="#C8B48A" stroke-width="3"/>
      <path d="M400 320 c50 0 50 70 0 70" fill="none" stroke="#C8B48A" stroke-width="14"/>
      <ellipse cx="300" cy="302" rx="98" ry="20" fill="#5A2E14"/><ellipse cx="300" cy="300" rx="80" ry="14" fill="#B8783A" opacity="0.7"/>`);
    case "mug": return frame(`
      <path d="M270 150 c-20 30 20 50 0 80 M320 140 c-20 30 20 50 0 80" stroke="#A89A80" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.6"/>
      <rect x="196" y="250" width="200" height="250" rx="26" fill="#FBF6EA" stroke="#C8B48A" stroke-width="3"/>
      <path d="M396 300 c70 0 70 120 0 120" fill="none" stroke="#C8B48A" stroke-width="18"/>
      <ellipse cx="296" cy="262" rx="92" ry="16" fill="${s.liquid}"/>`);
    case "sugarbowl": return frame(`
      <path d="M180 330 h240 c0 110 -54 170 -120 170 s-120 -60 -120 -170 z" fill="#FBF6EA" stroke="#C8B48A" stroke-width="3"/>
      <ellipse cx="300" cy="330" rx="120" ry="30" fill="${s.liquid}"/>
      ${[[250, 322], [300, 316], [350, 326], [280, 336], [330, 338]].map(([x, y]) => `<rect x="${x}" y="${y}" width="16" height="12" rx="3" fill="#8A5424" opacity="0.6"/>`).join("")}
      <rect x="330" y="220" width="16" height="120" rx="8" fill="#C8A878" transform="rotate(30 338 280)"/>`);
    case "butter": return frame(`
      <rect x="150" y="420" width="300" height="60" rx="14" fill="#E8E2D4"/>
      <path d="M190 330 l150 -30 l80 40 l-150 34 z" fill="#FCE8A0"/>
      <path d="M190 330 l80 44 v70 l-80 -40 z" fill="#F2D878"/><path d="M270 374 l150 -34 v70 l-150 34 z" fill="#F6DE88"/>`);
    case "cloves": return frame(`
      <path d="M170 380 h260 c0 80 -58 120 -130 120 s-130 -40 -130 -120 z" fill="#FBF6EA" stroke="#C8B48A" stroke-width="3"/>
      <ellipse cx="300" cy="380" rx="130" ry="28" fill="#5A2E18"/>
      ${[[240, 372], [280, 364], [330, 370], [360, 380], [260, 388], [310, 390]].map(([x, y], i) => `<g transform="rotate(${i * 37} ${x} ${y})"><rect x="${x - 4}" y="${y - 22}" width="8" height="30" rx="4" fill="#3A1A0E"/><circle cx="${x}" cy="${y - 24}" r="9" fill="#4A2412"/></g>`).join("")}`);
    case "ginger": return frame(`
      <path d="M160 420 c-10 -60 60 -80 100 -60 c20 -50 90 -60 110 -10 c50 -20 90 30 70 70 c-20 50 -90 40 -120 50 c-50 16 -150 20 -160 -50z" fill="#D8B070" stroke="#A8804A" stroke-width="4"/>
      <circle cx="400" cy="300" r="46" fill="#D8B070" stroke="#A8804A" stroke-width="4"/><circle cx="400" cy="300" r="34" fill="#F2DCA0"/>`);
    case "eggwhite": return frame(`
      <ellipse cx="220" cy="360" rx="96" ry="124" fill="#F4E8D0" stroke="#C8B48A" stroke-width="3"/>
      <path d="M300 440 C300 340 520 340 520 440 C520 500 300 500 300 440Z" fill="#F4E8D0" stroke="#C8B48A" stroke-width="3"/>
      <ellipse cx="410" cy="432" rx="100" ry="40" fill="#FBFBF6" stroke="#E0DCD0" stroke-width="3"/>
      <ellipse cx="190" cy="300" rx="20" ry="30" fill="#fff" opacity="0.4"/>`);
    default: throw new Error(`onbekende vorm ${s.shape}`);
  }
}

const only = process.argv.slice(2);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
let n = 0;
for (const [id, s] of Object.entries(SPECS)) {
  if (only.length && !only.includes(id)) continue;
  const file = `${id}.webp`;
  await sharp(Buffer.from(draw(id, s))).resize(600, 600).webp({ quality: 82 }).toFile(path.join(outDir, file));
  const entry = catalog.find(e => e.type === "drank" && e.id === id);
  const next = { id, type: "drank", bestand: file, bronUrl: "", maker: "", licentie: "", niveau: "illustratie" };
  if (entry) Object.assign(entry, next); else catalog.push(next);
  n++;
}
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`${n} illustraties gemaakt in src/assets/images/dranken en images.json bijgewerkt.`);
