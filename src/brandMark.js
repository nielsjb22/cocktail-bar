// Het logo van de app: een martiniglas met olijf in een gouden ring, met
// goudglans (zelfde als het app-icoon, scripts/generate-app-icon.mjs). Eén
// bron voor het iOS-opstartscherm (scripts/make-launch-screen.mjs), het
// deelplaatje, de menukaart en de schermen in de app (intro, leeftijdscheck,
// inloggen, smaaktest) — zodat het logo overal gelijk is.
//
// Coördinaten in het 1024-raster van het app-icoon. BRAND_MARK_VIEWBOX is
// het stuk rond het motief zelf (zonder achtergrond).
export const BRAND_MARK_VIEWBOX = "164 164 696 696";

const RING = { cx: 512, cy: 512, r: 336 };
const BOWL = "M328 336 L512 536 L696 336 Z";
const STEM = "M512 536 L512 720 M400 720 L624 720";
const OLIVE = { cx: 608, cy: 384, r: 18 };
// Drank in de kom (alleen bij de intro-animatie zichtbaar).
const LIQUID = "M362 372 L662 372 L512 536 Z";

// Losse lijnen van het logo, voor tekenen op een canvas (menukaart).
export const BRAND_MARK_LINES = [BOWL, STEM];
export const BRAND_MARK_RING = RING;
export const BRAND_MARK_OLIVE = OLIVE;

// idPrefix: unieke id's per keer dat het logo op een pagina staat.
// animated: de kom loopt vol en daarna verschijnt de olijf
// (klassen brand-liquid en brand-spark, zie index.css).
export function brandMarkMarkup({ idPrefix = "bm", animated = false } = {}) {
  const gold = `${idPrefix}-gold`, ring = `${idPrefix}-ring`, liq = `${idPrefix}-liq`;
  return `<defs>`
    + `<linearGradient id="${gold}" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="740"><stop offset="0" stop-color="#F2DAA4"/><stop offset="0.55" stop-color="#DDB877"/><stop offset="1" stop-color="#B8862E"/></linearGradient>`
    + `<linearGradient id="${ring}" gradientUnits="userSpaceOnUse" x1="0" y1="170" x2="0" y2="854"><stop offset="0" stop-color="#D9B46A"/><stop offset="1" stop-color="#8E6A24"/></linearGradient>`
    + `<linearGradient id="${liq}" gradientUnits="userSpaceOnUse" x1="0" y1="372" x2="0" y2="536"><stop offset="0" stop-color="#C9973F" stop-opacity="0.9"/><stop offset="1" stop-color="#8E6A24" stop-opacity="0.9"/></linearGradient>`
    + `</defs>`
    + `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="url(#${ring})" stroke-width="12" opacity="0.8"/>`
    + (animated ? `<path class="brand-liquid" d="${LIQUID}" fill="url(#${liq})"/>` : "")
    + `<path d="${BOWL}" fill="none" stroke="url(#${gold})" stroke-width="30" stroke-linejoin="round"/>`
    + `<path d="${STEM}" fill="none" stroke="url(#${gold})" stroke-width="30" stroke-linecap="round"/>`
    + `<circle${animated ? ' class="brand-spark"' : ""} cx="${OLIVE.cx}" cy="${OLIVE.cy}" r="${OLIVE.r}" fill="url(#${gold})"/>`;
}

// Los SVG-bestand van alleen het logo (transparant), bv. voor scripts.
export function brandMarkSvg({ width = 696, height = 696 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${BRAND_MARK_VIEWBOX}">${brandMarkMarkup()}</svg>`;
}
