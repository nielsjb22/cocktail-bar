#!/usr/bin/env node
// Tekent per cocktail een illustratie in de app-stijl (goud glas op
// flessengroen, zoals het app-icoon). Alles komt uit het recept zelf:
// - glas uit recipe.glass
// - kleur door de ingrediënten te mengen naar hoeveelheid (zie COLORS)
// - ijs, schuim, slagroom en zout-/suikerrand uit glas, ingrediënten en bereiding
// - garnering uit de garneringstekst (recipe.garnish)
// Niveau "illustratie" uit CLAUDE.md: voor cocktails zonder exacte foto.
//
// Gebruik:
//   node scripts/generate-cocktail-illustrations.mjs --out <map> [--ids a,b,c]
//   node scripts/generate-cocktail-illustrations.mjs --write --ids a,b,c
//     (--write: naar src/assets/images/cocktails/{id}.webp + images.json)
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { RECIPES } = await import(path.join(root, "src/recipes.js"));

// ---------- Kleuren per ingrediënt: [kleur, kleurkracht, troebelheid 0-1] ----------
const CLEAR = ["#F1EEE2", 0.25, 0];
const COLORS = {
  vodka: CLEAR, gin: CLEAR, white_rum: CLEAR, tequila_blanco: CLEAR, mezcal: CLEAR, pisco: CLEAR, cachaca: CLEAR,
  grappa: CLEAR, vanilla_vodka: CLEAR, coconut_rum: CLEAR, sake: CLEAR, triple_sec: CLEAR, maraschino_liqueur: CLEAR,
  lychee_liqueur: CLEAR, peach_schnapps: CLEAR, elderflower_liqueur: CLEAR, hot_water: ["#F4F1E8", 0.1, 0],
  genever: ["#EDE3C0", 0.4, 0],
  bourbon: ["#B5651F", 1.2, 0], rye: ["#A65A1E", 1.2, 0], scotch: ["#C08A3E", 1.1, 0], irish_whiskey: ["#C99545", 1.1, 0],
  dark_rum: ["#5C2C10", 1.6, 0], spiced_rum: ["#9A5A22", 1.3, 0], cognac: ["#9A4C18", 1.3, 0], calvados: ["#C2843A", 1.1, 0],
  grand_marnier: ["#D08A2E", 1, 0], sweet_vermouth: ["#6A2214", 1.6, 0], dry_vermouth: ["#ECE4B6", 0.4, 0],
  campari: ["#C8102E", 3, 0], aperol: ["#F26A1B", 4, 0], amaro_nonino: ["#B3622A", 1.4, 0], cynar: ["#4A2A14", 2, 0],
  suze: ["#F0D040", 1.5, 0], fernet_branca: ["#2E2214", 3, 0], yellow_chartreuse: ["#E6C83A", 1.6, 0],
  green_chartreuse: ["#86B02E", 1.8, 0], coffee_liqueur: ["#2B170D", 3.5, 0], creme_de_mure: ["#4B1030", 5, 0],
  creme_de_cassis: ["#6A0E2E", 6, 0], creme_de_cacao: ["#7A4422", 1.4, 0], creme_de_menthe: ["#1FA34A", 3, 0],
  creme_de_violette: ["#8E6BB8", 3, 0], chambord: ["#5A0F2E", 5, 0], amaretto: ["#B35A1E", 1.3, 0], frangelico: ["#C38A3E", 1, 0],
  galliano: ["#F2D22E", 2, 0], sour_apple_liqueur: ["#8CCB3A", 2.5, 0], blue_curacao: ["#1E74C8", 4, 0],
  sloe_gin: ["#9E1C3A", 2.5, 0], pimms: ["#7A3A1C", 1.5, 0], advocaat: ["#F3D35A", 3, 1], ginger_wine: ["#C9862E", 1.2, 0],
  drambuie: ["#C98A2A", 1.2, 0], apricot_brandy: ["#D9822E", 1.5, 0], cherry_brandy: ["#7A0E1E", 2.5, 0],
  benedictine: ["#C8862A", 1.2, 0], falernum: ["#EFE6C4", 0.5, 0.3], allspice_liqueur: ["#5A2A14", 2, 0],
  passion_fruit_liqueur: ["#E8A21E", 2, 0], port: ["#5A0E1E", 2.5, 0], sherry: ["#C9A24A", 1, 0], lillet_blanc: ["#EBCB6A", 0.8, 0],
  absinthe: ["#B6CC6A", 1.2, 0.3], angostura: ["#5A1408", 6, 0], peychauds: ["#C8102E", 6, 0], orange_bitters: ["#C8702A", 4, 0],
  tonic: ["#F4F4EE", 0.3, 0], cola: ["#2A1208", 2.5, 0], ginger_beer: ["#E6D7A8", 0.6, 0.5], ginger_ale: ["#E8C878", 0.6, 0],
  grapefruit_soda: ["#F2E6C8", 0.5, 0.3], soda_water: ["#F4F6F2", 0.15, 0], prosecco: ["#EEDC8A", 0.6, 0],
  white_wine: ["#EAD98A", 0.6, 0], red_wine: ["#5A0A1E", 2.5, 0], beer: ["#D8A230", 1, 0], stout: ["#1E120A", 3, 0.6],
  coconut_cream: ["#F6F1E6", 2, 1], pineapple_juice: ["#F3D45A", 1, 0.8], cranberry_juice: ["#B0122E", 1.6, 0],
  orange_juice: ["#F5A21E", 1.4, 0.9], grapefruit_juice: ["#F2B79A", 1, 0.8], tomato_juice: ["#B8281C", 2.5, 1],
  peach_puree: ["#F4A65A", 1.5, 1], passion_fruit_puree: ["#E8A81E", 1.6, 0.9], passion_fruit_juice: ["#E8A81E", 1.4, 0.8],
  espresso: ["#2A160C", 3, 0.6], hot_coffee: ["#3A1E10", 2.5, 0.3], heavy_cream: ["#F5EEDD", 2, 1], milk: ["#F7F3EA", 2, 1],
  egg_yolk: ["#F3C84A", 2, 1], lemon_juice: ["#F2EDB0", 0.4, 0.6], lime_juice: ["#D9E8A0", 0.4, 0.6],
  sugar_syrup: ["#F4F1E8", 0.1, 0], honey_syrup: ["#E3A93A", 0.6, 0.1], honey_ginger_syrup: ["#E0A040", 0.6, 0.2],
  raspberry_syrup: ["#B0123A", 3, 0], grenadine: ["#B0102A", 3.5, 0], orgeat: ["#F1E9D8", 0.6, 0.8], agave_nectar: ["#E0B050", 0.4, 0],
  elderflower_cordial: ["#F0E6B0", 0.3, 0], vanilla_syrup: ["#E8D2A0", 0.3, 0], brown_sugar: ["#A0622A", 0.8, 0],
  worcestershire: ["#3A1A0A", 4, 0], tabasco: ["#C8281C", 4, 0], strawberry: ["#D8203A", 1.6, 0.6], frozen_strawberries: ["#D8203A", 1.6, 0.6], pear_syrup: ["#E8DFA0", 0.4, 0.1], watermelon: ["#F0506A", 1.4, 0.6],
  kiwi: ["#8CB83A", 1.2, 0.6], cucumber: ["#C8E0A0", 0.3, 0.3], irish_cream: ["#C9A27A", 2, 1], creme_de_noyaux: ["#E8506A", 2.5, 0],
  banana_liqueur: ["#F2D84A", 1.5, 0], melon_liqueur: ["#7ACB3A", 3, 0], lemonade: ["#F4EEC0", 0.4, 0.5], limoncello: ["#EAD43A", 1.6, 0.6],
  licor_43: ["#E8B83A", 1.4, 0], bitter_lemon: ["#F2EDC0", 0.4, 0.6], energy_drink: ["#E8D86A", 0.8, 0], pisang_ambon: ["#5ABF3A", 3, 0],
  white_port: ["#E9D9A0", 0.8, 0], rose_wine: ["#F2A0A0", 0.8, 0], cider: ["#E8C060", 0.8, 0], apple_juice: ["#E8B84A", 1, 0.4],
  ice_tea: ["#B8661E", 1.2, 0], black_tea: ["#8A3E10", 1.4, 0], hot_chocolate: ["#4A2412", 3, 1], marmalade: ["#E8822A", 1.5, 0.5],
  olive_brine: ["#D8D6A8", 0.5, 0.3], orange_flower_water: CLEAR, chamomile: ["#E8D48A", 0.4, 0],
};
// Telt niet mee voor de kleur (blaadjes, kruiden, ei-wit gaat naar schuim).
const NO_COLOR = new Set(["mint", "basil", "egg_white", "cherry", "cloves", "chili", "ginger_root", "lemongrass", "cinnamon_stick", "butter", "whipped_cream"]);

const hex = (h) => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
const toHex = (c) => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const unlin = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
// Iets meer verzadiging, zodat een bleke drank niet grijs oogt op het groen.
function saturate(h, f) {
  const [r, g, b] = hex(h); const avg = (r + g + b) / 3;
  return toHex([r, g, b].map(v => avg + (v - avg) * f));
}

function liquid(recipe) {
  let wSum = 0, mlSum = 0, cloud = 0; const acc = [0, 0, 0];
  for (const ing of recipe.ingredients) {
    if (NO_COLOR.has(ing.id)) continue;
    let c = COLORS[ing.id] || CLEAR;
    // Eén ingrediënt voor witte én groene crème de menthe: groen alleen als het recept dat zegt.
    if (ing.id === "creme_de_menthe" && !/groen|green|grasshopper/i.test(`${recipe.name} ${recipe.garnish || ""} ${recipe.method || ""}`)) c = ["#F1EEE2", 0.3, 0];
    const ml = ing.unit === "ml" ? ing.amount : ing.unit === "dash" ? 0.8 * ing.amount : 10 * (ing.amount || 1);
    const w = ml * c[1];
    // Subtractief mengen (gewogen log-gemiddelde): een scheut cassis kleurt witte wijn echt rood.
    hex(c[0]).forEach((v, i) => { acc[i] += Math.log(Math.max(1e-3, lin(v))) * w; });
    wSum += w; mlSum += ml; cloud += ml * c[2];
  }
  if (!wSum) return { color: "#E9E4CF", opacity: 0.5 };
  const color = saturate(toHex(acc.map(v => unlin(Math.exp(v / wSum)))), 1.22);
  const density = Math.min(1, wSum / mlSum / 1.1);
  const cl = Math.min(1, (cloud / mlSum) * 3);
  return { color, opacity: Math.min(0.96, 0.58 + 0.4 * Math.max(cl, density)) };
}

// ---------- Glazen (coördinaten in een 800-raster, voet rond y=620) ----------
const GLASSES = {
  coupe: { outline: `M250 330 Q400 486 550 330 M246 330 L554 330 M400 448 L400 616 M332 624 Q400 610 468 624`, inside: `M262 336 Q400 468 538 336 Z`, level: 343, rim: { l: 250, r: 550, y: 330 }, ice: "none" },
  martini: { outline: `M236 306 L400 474 L564 306 Z M400 474 L400 616 M332 624 Q400 610 468 624`, inside: `M256 314 L400 461 L544 314 Z`, level: 334, rim: { l: 236, r: 564, y: 306 }, ice: "none" },
  rocks: { outline: `M286 408 L296 626 Q400 640 504 626 L514 408 M296 600 L504 600`, inside: `M294 414 L302 598 L498 598 L506 414 Z`, level: 452, rim: { l: 286, r: 514, y: 408 }, ice: "rocks" },
  highball: { outline: `M316 236 L324 626 Q400 638 476 626 L484 236 M324 604 L476 604`, inside: `M323 242 L330 602 L470 602 L477 242 Z`, level: 282, rim: { l: 316, r: 484, y: 236 }, ice: "tall" },
  hurricane: { outline: `M318 222 C300 300 360 340 350 420 C340 500 300 530 334 572 Q400 598 466 572 C500 530 460 500 450 420 C440 340 500 300 482 222 M400 590 L400 616 M340 624 Q400 610 460 624`, inside: `M326 230 C310 300 368 340 358 420 C348 498 310 528 340 564 Q400 588 460 564 C490 528 452 498 442 420 C432 340 490 300 474 230 Z`, level: 262, rim: { l: 318, r: 482, y: 222 }, ice: "crushed" },
  wine: { outline: `M276 262 C276 446 336 476 400 476 C464 476 524 446 524 262 M400 476 L400 616 M330 624 Q400 610 470 624`, inside: `M284 270 C284 432 342 464 400 464 C458 464 516 432 516 270 Z`, level: 318, rim: { l: 276, r: 524, y: 262 }, ice: "wine" },
  flute: { outline: `M352 200 C346 330 360 430 400 452 C440 430 454 330 448 200 M400 452 L400 616 M344 624 Q400 612 456 624`, inside: `M358 206 C353 326 366 422 400 441 C434 422 447 326 442 206 Z`, level: 236, rim: { l: 352, r: 448, y: 200 }, ice: "none" },
  mug: { outline: `M300 360 L306 600 Q400 616 494 600 L500 360 M500 410 C566 410 570 540 498 548 M330 640 L470 640`, inside: `M307 366 L313 596 L487 596 L493 366 Z`, level: 392, rim: { l: 300, r: 500, y: 360 }, ice: "none", handle: true, foot: true },
};

// ---------- Recept lezen ----------
const glassOf = (r) => {
  const g = (r.glass || "").toLowerCase();
  if (g.includes("martiniglas")) return "martini";
  if (g.startsWith("coupe")) return "coupe";
  if (g.startsWith("highball")) return "highball";
  if (g.startsWith("rocks")) return "rocks";
  if (g.startsWith("hurricane")) return "hurricane";
  if (g.startsWith("champagneflute")) return "flute";
  if (g.startsWith("wijnglas")) return "wine";
  if (g.startsWith("glazen mok")) return "mug";
  if (g.startsWith("koperen beker")) return "copper";
  if (g.startsWith("julep")) return "julep";
  return "coupe";
};
const has = (r, ...ids) => r.ingredients.some(i => ids.includes(i.id));

function iceOf(r, glass) {
  const m = (r.method || "").toLowerCase();
  const warm = has(r, "hot_water", "hot_coffee", "hot_chocolate", "black_tea") || glass === "mug";
  if (warm) return "none";
  if (/crushed|gecrusht|gemalen ijs|fijn ijs|ijsgruis|geschaafd/.test(m) || glass === "hurricane" || glass === "julep") return "crushed";
  if (glass === "rocks") {
    const over = /(over|op) .{0,25}ijs|ijsblok|ijsklont|grote klont|ongezeefd|vul .{0,25}ijs|met ijs gevuld|on the rocks/.test(m);
    if (!over && /gekoeld glas|shotglas|puur|kamertemperatuur|zonder ijs|geen ijs|giet de likeuren/.test(m)) return "none";
    return /groot ijsblok|grote ijsklont|ijsblok|grote klont/.test(m) ? "block" : "cubes";
  }
  if (glass === "highball" || glass === "copper") return /zonder ijs|geen ijs/.test(m) ? "none" : "tall";
  if (glass === "wine") return /ijs/.test(m) && !/zonder ijs/.test(m) ? "wine" : "none";
  return "none";
}
function topOf(r) {
  const g = (r.garnish || "").toLowerCase(), m = (r.method || "").toLowerCase();
  if (has(r, "whipped_cream") || /slagroom/.test(g)) return { kind: "cream", color: "#F8F3E8", h: 46 };
  if (has(r, "red_wine", "port") && /drijven|float|laag|over de bolle kant/.test(m)) return { kind: "foam", color: "#6A0E22", h: 30 };
  if (has(r, "egg_white")) return { kind: "foam", color: "#F3EEDF", h: 30 };
  if (has(r, "heavy_cream") && /laag|float|drijven|bovenop|over de bolle kant/.test(m)) return { kind: "foam", color: "#F5EEDD", h: 34 };
  if (has(r, "espresso") && has(r, "tonic")) return { kind: "foam", color: "#4A2614", h: 70 };
  if (has(r, "espresso")) return { kind: "foam", color: "#C49A6C", h: 22 };
  if (has(r, "stout")) return { kind: "foam", color: "#E8DCC4", h: 26 };
  if (has(r, "pineapple_juice") && /schuim/.test(m)) return { kind: "foam", color: "#F6E7A8", h: 18 };
  return null;
}
function rimOf(r) {
  const g = ((r.glass || "") + " " + (r.garnish || "")).toLowerCase();
  if (/zoutrand|rand van zout|zout op de rand|zoutkorst/.test(g)) return "salt";
  if (/suikerrand|rand van suiker|suiker op de rand/.test(g)) return "sugar";
  if (/chocolade.*rand|rand.*chocolade|cacaorand/.test(g)) return "cocoa";
  return null;
}
// Garnering uit de tekst, in volgorde van wat het meest beeldbepalend is. Max 2.
function garnishOf(r) {
  const g = (r.garnish || "").toLowerCase();
  if (!g || /^geen garnering|geen garnering nodig/.test(g)) return [];
  const out = [];
  const add = (k) => { if (!out.includes(k) && out.length < 2) out.push(k); };
  if (/olijf|olijven/.test(g)) add("olive");
  if (/zilveruitje|cocktailui|uitjes/.test(g)) add("onion");
  if (/koffiebon/.test(g)) add("beans");
  if (/kers/.test(g)) add("cherry");
  if (/munt/.test(g)) add("mint");
  if (/ananas/.test(g)) add("pineapple");
  if (/aardbei/.test(g)) add("strawberry");
  if (/braam|bramen|bosvrucht|blauwe bes/.test(g)) add("blackberries");
  else if (/framboz|framboos/.test(g)) add("berries");
  if (/komkommer/.test(g)) add("cucumber");
  if (/passievrucht/.test(g)) add("passion");
  // Schil alleen als die echt genoemd wordt ("limoenschil", "schilletje
  // citroen"), niet bij "geen schil erin".
  const peelOf = (f) => new RegExp(`${f}(schil|zest|twist)|(schil|schilletje|zestje|twist) (van )?(een )?${f}`).test(g) && !new RegExp(`geen (${f})?schil`).test(g);
  const fruit = (f) => new RegExp(`(^|[^a-z])${f}`).test(g);
  if (peelOf("limoen")) add("limePeel");
  else if (fruit("limoen")) add(/limoenpartje|partje limoen|partjes limoen/.test(g) ? "limeWedge" : "limeWheel");
  if (fruit("grapefruit")) add(peelOf("grapefruit") ? "grapefruitPeel" : "grapefruitWedge");
  if (peelOf("sinaasappel")) add("orangePeel");
  else if (/halve sinaasappel|halve plak sinaasappel|halve schijf sinaasappel/.test(g)) add("orangeHalf");
  else if (fruit("sinaasappel")) add("orangeWheel");
  if (peelOf("citroen")) add("lemonPeel");
  else if (fruit("citroen")) add(/citroenpartje|partje citroen/.test(g) ? "lemonWedge" : "lemonWheel");
  if (fruit("appel")) add("apple");
  if (/chili|peper/.test(g)) add("chili");
  if (/selderij/.test(g)) add("celery");
  if (/banaan/.test(g)) add("banana");
  if (/kiwi/.test(g)) add("kiwi");
  if (/perzik/.test(g)) add("peach");
  if (/kaneelstok/.test(g)) add("cinnamon");
  if (/rozemarijn|tijm|basilicum|salie/.test(g)) add("herb");
  if (/nootmuskaat|geraspte|kaneel|cacao|chocolade/.test(g)) add("dust");
  if (/steranijs/.test(g)) add("anise");
  if (/bloem|viooltje/.test(g)) add("flower");
  if (/angostura/.test(g) && has(r, "egg_white")) add("bitterDots");
  return out;
}

// ---------- Tekenen ----------
const GOLD = `<linearGradient id="gold" x1="0" y1="200" x2="0" y2="640" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F2DAA4"/><stop offset="0.55" stop-color="#DDB877"/><stop offset="1" stop-color="#B8862E"/></linearGradient>`;
const BG = `<radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#2F584C"/><stop offset="1" stop-color="#0F1E1A"/></radialGradient>`;
const cube = (x, y, s, rot = 0) => `<g transform="rotate(${rot} ${x + s / 2} ${y + s / 2})"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.16}" fill="#FFFFFF" fill-opacity="0.12" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="2.5"/><path d="M${x + s * 0.18} ${y + s * 0.25} L${x + s * 0.18} ${y + s * 0.6}" stroke="#fff" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round"/></g>`;
function iceSvg(kind, g) {
  const { l, r } = g.rim, w = r - l;
  if (kind === "block") return cube(l + w * 0.2, 440, w * 0.6, 4);
  if (kind === "cubes") return cube(l + w * 0.12, 470, w * 0.36, 8) + cube(l + w * 0.5, 476, w * 0.34, -8);
  if (kind === "tall") return [[0.1, 300, 8], [0.48, 352, -10], [0.12, 420, 14], [0.5, 488, -6], [0.18, 540, 6]].map(([f, y, a]) => cube(l + w * f, y, w * 0.36, a)).join("");
  if (kind === "wine") return cube(l + w * 0.18, 340, w * 0.26, 10) + cube(l + w * 0.5, 332, w * 0.26, -12) + cube(l + w * 0.34, 392, w * 0.24, 4);
  if (kind === "crushed") {
    // Gemalen ijs: verspreide, onregelmatige brokjes (vaste "toevalsreeks", zodat elke run gelijk is).
    let s = "", seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const depth = Math.min(320, 600 - g.level);
    for (let i = 0; i < 70; i++) {
      const x = l + 6 + rnd() * (w - 24), y = g.level + 2 + rnd() * depth, sz = 10 + rnd() * 14;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${sz.toFixed(1)}" height="${(sz * (0.6 + rnd() * 0.4)).toFixed(1)}" rx="3" transform="rotate(${Math.round(rnd() * 90 - 45)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#fff" fill-opacity="0.18" stroke="#fff" stroke-opacity="0.32" stroke-width="1.5"/>`;
    }
    return s;
  }
  return "";
}
const wheel = (x, y, r, c, e) => `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${e}"/><circle cx="${x}" cy="${y}" r="${r * 0.86}" fill="#F4F2D6"/><circle cx="${x}" cy="${y}" r="${r * 0.78}" fill="${c}"/>${[0, 45, 90, 135].map(a => { const dx = Math.cos(a * Math.PI / 180) * r * 0.78, dy = Math.sin(a * Math.PI / 180) * r * 0.78; return `<line x1="${x - dx}" y1="${y - dy}" x2="${x + dx}" y2="${y + dy}" stroke="#F4F2D6" stroke-width="2.5"/>`; }).join("")}</g>`;
const wedge = (x, y, c, e) => `<g transform="rotate(-20 ${x} ${y})"><path d="M${x - 40} ${y} A40 40 0 0 0 ${x + 40} ${y} Z" fill="${e}"/><path d="M${x - 33} ${y} A33 33 0 0 0 ${x + 33} ${y} Z" fill="${c}"/><path d="M${x - 33} ${y} L${x + 33} ${y}" stroke="#F4F2D6" stroke-width="4"/></g>`;
const peel = (x, y, c, e, rot = -28) => `<g transform="rotate(${rot} ${x} ${y})"><path d="M${x - 46} ${y} C${x - 20} ${y - 20} ${x + 20} ${y - 20} ${x + 46} ${y} C${x + 20} ${y + 12} ${x - 20} ${y + 12} ${x - 46} ${y} Z" fill="${c}" stroke="${e}" stroke-width="2.5"/><path d="M${x - 30} ${y - 4} C${x - 10} ${y - 12} ${x + 10} ${y - 12} ${x + 30} ${y - 4}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/></g>`;
const leaf = (x, y, rot, c = "#4F8F3E") => `<ellipse cx="${x}" cy="${y}" rx="13" ry="24" transform="rotate(${rot} ${x} ${y})" fill="${c}" stroke="#346B28" stroke-width="2"/>`;
const GARNISH = {
  olive: (g) => { const x = (g.rim.l + g.rim.r) / 2 + 10, y = g.level + 30; return `<g><line x1="${x - 60}" y1="${y - 70}" x2="${x + 30}" y2="${y + 22}" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/><ellipse cx="${x}" cy="${y}" rx="17" ry="13" transform="rotate(40 ${x} ${y})" fill="#7D8C35"/><circle cx="${x + 5}" cy="${y + 3}" r="4.5" fill="#B5432E"/></g>`; },
  onion: (g) => { const x = (g.rim.l + g.rim.r) / 2 + 10, y = g.level + 30; return `<g><line x1="${x - 60}" y1="${y - 70}" x2="${x + 40}" y2="${y + 30}" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/>${[0, 26].map(d => `<circle cx="${x - 14 + d}" cy="${y - 14 + d}" r="13" fill="#F2EEE0" stroke="#D8D2BC" stroke-width="2"/><circle cx="${x - 18 + d}" cy="${y - 18 + d}" r="3.5" fill="#fff"/>`).join("")}</g>`; },
  beans: (g) => { const x = (g.rim.l + g.rim.r) / 2, y = g.level + 8; return [[-26, 0], [0, -6], [26, 0]].map(([dx, dy]) => `<g transform="rotate(${dx} ${x + dx} ${y + dy})"><ellipse cx="${x + dx}" cy="${y + dy}" rx="10" ry="14" fill="#3A2416"/><path d="M${x + dx} ${y + dy - 11} q-4 11 0 22" stroke="#7A5232" stroke-width="2.5" fill="none"/></g>`).join(""); },
  cherry: (g, slot) => { const x = slot ? g.rim.l + 40 : (g.rim.l + g.rim.r) / 2 - 20, y = g.level + (g.ice === "none" ? 40 : 10); return `<g><path d="M${x + 4} ${y - 14} C${x + 10} ${y - 50} ${x + 34} ${y - 64} ${x + 52} ${y - 70}" fill="none" stroke="#6B4423" stroke-width="5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="19" fill="#8E1A22"/><circle cx="${x - 6}" cy="${y - 6}" r="5" fill="#fff" fill-opacity="0.5"/></g>`; },
  mint: (g) => { const x = (g.rim.l + g.rim.r) / 2 + 20, y = g.rim.y - 8; return `<g>${[[-24, 0, -35], [0, -14, 0], [24, 0, 35], [-10, 16, -15], [12, 16, 18]].map(([dx, dy, a]) => leaf(x + dx, y + dy, a)).join("")}</g>`; },
  herb: (g) => { const x = (g.rim.l + g.rim.r) / 2 + 30, y = g.rim.y - 40; return `<g><path d="M${x} ${y + 70} L${x + 10} ${y - 40}" stroke="#3F6B30" stroke-width="4"/>${[-30, -10, 10, 30, 50].map((dy, i) => leaf(x + 4 + dy * 0.1 + (i % 2 ? 12 : -12), y + dy, i % 2 ? 50 : -50, "#5E8F4E").replace(/rx="13" ry="24"/, 'rx="6" ry="14"')).join("")}</g>`; },
  pineapple: (g) => { const x = g.rim.r - 6, y = g.rim.y; return `<g><path d="M${x - 40} ${y} L${x + 40} ${y} L${x + 20} ${y + 44} L${x - 20} ${y + 44} Z" fill="#F2C94A" stroke="#C99A2A" stroke-width="3"/><path d="M${x - 10} ${y} L${x - 26} ${y - 56} M${x} ${y} L${x} ${y - 64} M${x + 10} ${y} L${x + 26} ${y - 56}" stroke="#4F8F3E" stroke-width="9" stroke-linecap="round"/></g>`; },
  strawberry: (g) => { const x = g.rim.r - 8, y = g.rim.y - 10; return `<g><path d="M${x} ${y + 40} C${x - 34} ${y + 10} ${x - 26} ${y - 22} ${x} ${y - 18} C${x + 26} ${y - 22} ${x + 34} ${y + 10} ${x} ${y + 40} Z" fill="#D8203A"/><path d="M${x - 16} ${y - 18} L${x} ${y - 32} L${x + 16} ${y - 18}" fill="#4F8F3E"/>${[[-8, 0], [8, 6], [-2, 16], [10, -6]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="2.2" fill="#F7E08A"/>`).join("")}</g>`; },
  berries: (g) => { const x = g.rim.r - 30, y = g.rim.y - 18; return `<g><line x1="${x - 60}" y1="${y + 20}" x2="${x + 50}" y2="${y - 6}" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/>${[-30, 0, 30].map(d => `<circle cx="${x + d}" cy="${y + 12 - d * 0.22}" r="15" fill="#B01E3A"/><circle cx="${x + d - 4}" cy="${y + 8 - d * 0.22}" r="4" fill="#fff" fill-opacity="0.3"/>`).join("")}</g>`; },
  blackberries: (g) => GARNISH.berries(g).replace(/#B01E3A/g, "#3A1030"),
  cucumber: (g) => { const x = g.rim.r - 10, y = g.rim.y + 6; return `<g>${wheel(x, y, 34, "#CFE6A8", "#3E7A2E").replace(/#F4F2D6/g, "#E8F2D0")}</g>`; },
  passion: (g) => { const x = g.rim.r - 10, y = g.level + 6; return `<g><circle cx="${x}" cy="${y}" r="32" fill="#5A2A4A"/><circle cx="${x}" cy="${y}" r="26" fill="#F2B21E"/>${[[-8, -6], [8, -2], [0, 8], [-10, 8], [10, 10]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="3" fill="#2A1A10"/>`).join("")}</g>`; },
  limeWheel: (g) => wheel(g.rim.r - 12, g.rim.y - 8, 34, "#C7D96A", "#7E9A2C"),
  limeWedge: (g) => wedge(g.rim.r - 10, g.rim.y - 4, "#C7D96A", "#7E9A2C"),
  limePeel: (g) => peel(g.rim.r - 20, g.rim.y - 14, "#8FB43A", "#5E7E22"),
  lemonWheel: (g) => wheel(g.rim.r - 12, g.rim.y - 8, 34, "#F2DC5A", "#D9B82A"),
  lemonWedge: (g) => wedge(g.rim.r - 10, g.rim.y - 4, "#F2DC5A", "#D9B82A"),
  lemonPeel: (g) => peel(g.rim.r - 20, g.rim.y - 14, "#F2D44A", "#C9A62A"),
  orangeWheel: (g) => wheel(g.rim.r - 14, g.rim.y - 10, 40, "#F29A3A", "#D9701E"),
  orangeHalf: (g) => { const x = g.rim.r - 30, y = g.rim.y + 20, r = 46; return `<g><path d="M${x - r} ${y} A${r} ${r} 0 0 0 ${x + r} ${y} Z" fill="#D9701E"/><path d="M${x - r * 0.86} ${y} A${r * 0.86} ${r * 0.86} 0 0 0 ${x + r * 0.86} ${y} Z" fill="#F7E7C4"/><path d="M${x - r * 0.78} ${y} A${r * 0.78} ${r * 0.78} 0 0 0 ${x + r * 0.78} ${y} Z" fill="#F29A3A"/></g>`; },
  orangePeel: (g) => peel(g.rim.r - 20, g.rim.y - 14, "#E8862A", "#B85E14"),
  grapefruitWedge: (g) => wedge(g.rim.r - 10, g.rim.y - 4, "#F08A7A", "#E8A23A"),
  grapefruitPeel: (g) => peel(g.rim.r - 20, g.rim.y - 14, "#F2A04A", "#C9702A"),
  apple: (g) => { const x = g.rim.r - 16, y = g.rim.y - 6; return `<g transform="rotate(-15 ${x} ${y})"><path d="M${x - 40} ${y} A40 40 0 0 1 ${x + 40} ${y} Z" fill="#B8D46A" stroke="#7FA232" stroke-width="4"/><path d="M${x - 34} ${y} A34 34 0 0 1 ${x + 34} ${y} Z" fill="#F4EFD2"/><circle cx="${x - 8}" cy="${y - 12}" r="3" fill="#5A3A1E"/><circle cx="${x + 8}" cy="${y - 12}" r="3" fill="#5A3A1E"/></g>`; },
  cinnamon: (g) => { const x = (g.rim.l + g.rim.r) / 2 + 30, y = g.rim.y; return `<g transform="rotate(18 ${x} ${y})"><rect x="${x - 9}" y="${y - 90}" width="18" height="150" rx="8" fill="#8A4A22" stroke="#5E2E12" stroke-width="3"/></g>`; },
  banana: (g) => { const x = g.rim.r - 12, y = g.rim.y - 6; return `<g><circle cx="${x}" cy="${y}" r="30" fill="#E8D58A"/><circle cx="${x}" cy="${y}" r="25" fill="#F7EDC2"/>${[0, 120, 240].map(a => `<circle cx="${x + Math.cos(a * Math.PI / 180) * 7}" cy="${y + Math.sin(a * Math.PI / 180) * 7}" r="2.5" fill="#B8A060"/>`).join("")}</g>`; },
  kiwi: (g) => { const x = g.rim.r - 12, y = g.rim.y - 8; let seeds = ""; for (let a = 0; a < 360; a += 30) seeds += `<ellipse cx="${x + Math.cos(a * Math.PI / 180) * 14}" cy="${y + Math.sin(a * Math.PI / 180) * 14}" rx="1.8" ry="3.5" transform="rotate(${a + 90} ${x + Math.cos(a * Math.PI / 180) * 14} ${y + Math.sin(a * Math.PI / 180) * 14})" fill="#2A1A10"/>`; return `<g><circle cx="${x}" cy="${y}" r="34" fill="#7A5A2E"/><circle cx="${x}" cy="${y}" r="30" fill="#8CC43A"/><circle cx="${x}" cy="${y}" r="9" fill="#E8F2C0"/>${seeds}</g>`; },
  peach: (g) => { const x = g.rim.r - 14, y = g.rim.y - 4; return `<g transform="rotate(-20 ${x} ${y})"><path d="M${x - 40} ${y} A40 40 0 0 0 ${x + 40} ${y} Z" fill="#E86A3A"/><path d="M${x - 33} ${y} A33 33 0 0 0 ${x + 33} ${y} Z" fill="#F7B860"/></g>`; },
  celery: (g) => { const x = (g.rim.l + g.rim.r) / 2 + 26, y = g.rim.y; return `<g transform="rotate(14 ${x} ${y})"><rect x="${x - 9}" y="${y - 110}" width="18" height="190" rx="9" fill="#9CC46A" stroke="#6E9A3E" stroke-width="3"/>${[-30, 0, 30].map(d => leaf(x + d * 0.6, y - 120 + Math.abs(d) * 0.5, d, "#6FA84A").replace(/rx="13" ry="24"/, 'rx="11" ry="20"')).join("")}</g>`; },
  chili: (g) => { const x = g.rim.r - 10, y = g.rim.y - 6; return `<g transform="rotate(-25 ${x} ${y})"><path d="M${x - 8} ${y - 30} C${x + 24} ${y - 20} ${x + 18} ${y + 30} ${x - 4} ${y + 44} C${x + 2} ${y + 20} ${x - 14} ${y - 10} ${x - 8} ${y - 30} Z" fill="#C8281C"/><path d="M${x - 8} ${y - 30} l-6 -14" stroke="#4F8F3E" stroke-width="6" stroke-linecap="round"/></g>`; },
  dust: (g) => { const cx = (g.rim.l + g.rim.r) / 2; let s = ""; for (let i = 0; i < 26; i++) s += `<circle cx="${cx - 60 + ((i * 41) % 120)}" cy="${g.level + 6 + ((i * 17) % 10)}" r="2.6" fill="#6B3A1E" fill-opacity="0.8"/>`; return s; },
  anise: (g) => { const x = (g.rim.l + g.rim.r) / 2, y = g.level + 10; return `<g>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<ellipse cx="${x + Math.cos(a * Math.PI / 180) * 14}" cy="${y + Math.sin(a * Math.PI / 180) * 7}" rx="9" ry="5" transform="rotate(${a} ${x + Math.cos(a * Math.PI / 180) * 14} ${y + Math.sin(a * Math.PI / 180) * 7})" fill="#7A4022"/>`).join("")}</g>`; },
  flower: (g) => { const x = (g.rim.l + g.rim.r) / 2 + 10, y = g.level + 8; return `<g>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="${x + Math.cos(a * Math.PI / 180) * 12}" cy="${y + Math.sin(a * Math.PI / 180) * 6}" rx="11" ry="6" transform="rotate(${a} ${x + Math.cos(a * Math.PI / 180) * 12} ${y + Math.sin(a * Math.PI / 180) * 6})" fill="#C88AD8"/>`).join("")}<circle cx="${x}" cy="${y}" r="5" fill="#F2D44A"/></g>`; },
  bitterDots: (g) => { const cx = (g.rim.l + g.rim.r) / 2; return [-30, 0, 30].map(d => `<ellipse cx="${cx + d}" cy="${g.level + 8}" rx="7" ry="3.5" fill="#7A1E12"/>`).join(""); },
};

function body(r) {
  const kind = glassOf(r);
  const liq = liquid(r);
  const top = mix(liq.color, "#FFFFFF", 0.22), bottom = mix(liq.color, "#000000", 0.28);
  const t = topOf(r), rim = rimOf(r), garn = garnishOf(r);
  if (kind === "copper" || kind === "julep") {
    const metal = kind === "copper" ? ["#7E3E1C", "#D98A4E", "#8A4622"] : ["#8E9294", "#E6E8E8", "#9A9EA0"];
    const g = { rim: { l: 290, r: 510, y: 402 }, level: 402, ice: "tall" };
    const crushedTop = kind === "julep" ? `<path d="M296 402 C320 360 480 360 504 402 Z" fill="#fff" fill-opacity="0.75" stroke="#fff" stroke-opacity="0.9" stroke-width="2"/>` : "";
    const handle = kind === "copper" ? `<path d="M500 450 C560 450 572 560 500 572" fill="none" stroke="url(#metal)" stroke-width="22" stroke-linecap="round"/>` : "";
    return `<defs><linearGradient id="metal" x1="0" x2="1"><stop offset="0" stop-color="${metal[0]}"/><stop offset="0.45" stop-color="${metal[1]}"/><stop offset="1" stop-color="${metal[2]}"/></linearGradient></defs>
      ${handle}<path d="M290 402 L300 624 Q400 640 500 624 L510 402 Z" fill="url(#metal)"/>${crushedTop}
      <path d="M290 402 L510 402" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>
      <path d="M318 430 L326 600" stroke="#fff" stroke-opacity="0.22" stroke-width="10" stroke-linecap="round"/>
      ${garn.map((k, i) => GARNISH[k]?.({ ...g, rim: { ...g.rim, y: kind === "julep" ? 380 : 402 } }, i) || "").join("")}`;
  }
  const g = GLASSES[kind];
  const ice = iceOf(r, kind);
  const level = t?.kind === "cream" ? g.level + 30 : g.level;
  const gg = { ...g, level, ice };
  const steam = kind === "mug" ? [0, 1, 2].map(i => `<path d="M${370 + i * 30} ${g.rim.y - 30} c-14 -24 14 -40 0 -66" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="5" stroke-linecap="round"/>`).join("") : "";
  const rimDots = rim ? (() => { let s = ""; const col = rim === "cocoa" ? "#4A2A18" : "#F4F1EA"; for (let x = g.rim.l + 6; x < g.rim.r - 4; x += 9) s += `<circle cx="${x}" cy="${g.rim.y - 4 + ((x * 7) % 5)}" r="${2.8 + ((x * 3) % 3) * 0.6}" fill="${col}"/>`; return s; })() : "";
  const cream = t?.kind === "cream" ? `<path d="M${g.rim.l + 10} ${g.rim.y + 34} C${g.rim.l + 20} ${g.rim.y - 30} ${g.rim.r - 20} ${g.rim.y - 30} ${g.rim.r - 10} ${g.rim.y + 34} Z" fill="${t.color}"/>` : "";
  return `<defs><clipPath id="in"><path d="${g.inside}"/></clipPath>
      <linearGradient id="liq" x1="0" y1="${level}" x2="0" y2="630" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
      ${steam}
      <path d="${g.inside}" fill="#FFFFFF" fill-opacity="0.05"/>
      <g clip-path="url(#in)">
        <rect x="0" y="${level}" width="800" height="800" fill="#F3EDDC" fill-opacity="0.22"/>
        <rect x="0" y="${level}" width="800" height="800" fill="url(#liq)" fill-opacity="${liq.opacity.toFixed(2)}"/>
        ${t && t.kind === "foam" ? `<rect x="0" y="${level - 4}" width="800" height="${t.h}" fill="${t.color}"/>` : ""}
        ${iceSvg(ice, gg)}
        <path d="M${g.rim.l + 22} ${g.rim.y + 18} L${g.rim.l + 34} ${g.rim.y + 150}" stroke="#fff" stroke-opacity="0.16" stroke-width="12" stroke-linecap="round"/>
      </g>
      ${cream}
      <path d="${g.outline}" fill="none" stroke="url(#gold)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      ${rimDots}
      ${garn.map((k, i) => GARNISH[k]?.(gg, i) || "").join("")}`;
}

export function cocktailSvg(r) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>${BG}${GOLD}</defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <ellipse cx="400" cy="670" rx="220" ry="18" fill="#000" fill-opacity="0.32"/>
  <line x1="70" y1="672" x2="730" y2="672" stroke="url(#gold)" stroke-opacity="0.28" stroke-width="2"/>
  <g transform="translate(400 430) scale(1.3) translate(-400 -430)">${body(r)}</g>
</svg>`;
}
export function describe(r) {
  const kind = glassOf(r);
  return { glass: kind, ice: kind === "copper" || kind === "julep" ? "tall" : iceOf(r, kind), top: topOf(r)?.kind || null, rim: rimOf(r), garnish: garnishOf(r), ...liquid(r) };
}

// ---------- CLI ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith("--")) args[process.argv[i].slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
  const ids = args.ids ? new Set(String(args.ids).split(",")) : null;
  const list = RECIPES.filter(r => !ids || ids.has(r.id));
  const outDir = args.write ? path.join(root, "src/assets/images/cocktails") : path.resolve(args.out || "illustraties");
  mkdirSync(outDir, { recursive: true });
  const catPath = path.join(root, "src/data/images.json");
  const catalog = args.write ? JSON.parse(readFileSync(catPath, "utf8")) : null;
  for (const r of list) {
    await sharp(Buffer.from(cocktailSvg(r))).resize(800, 800).webp({ quality: 82 }).toFile(path.join(outDir, `${r.id}.webp`));
    if (catalog) {
      const entry = { id: r.id, type: "cocktail", bestand: `${r.id}.webp`, bronUrl: "", maker: "", licentie: "", niveau: "illustratie" };
      const i = catalog.findIndex(e => e.type === "cocktail" && e.id === r.id);
      if (i >= 0) catalog[i] = entry; else catalog.push(entry);
    }
  }
  if (catalog) writeFileSync(catPath, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`${list.length} illustraties → ${outDir}`);
}
