// Het logo van de app: twee klinkende coupes ("Proost"). Eén bron voor het
// app-icoon (scripts/generate-app-icon.mjs), het iOS-opstartscherm
// (scripts/make-launch-screen.mjs), het deelplaatje en de schermen in de app
// (intro, leeftijdscheck, inloggen) — zodat het logo overal gelijk is.
//
// Coördinaten in het 1024-raster van het app-icoon. BRAND_MARK_VIEWBOX is
// het stuk rond het motief zelf (zonder achtergrond).
export const BRAND_MARK_VIEWBOX = "170 160 684 600";

// idPrefix: unieke id's per keer dat het logo op een pagina staat.
// animated: vloeistof loopt vol en de "tink"-streepjes verschijnen
// (klassen brand-liquid en brand-spark, zie index.css).
// De losse lijnen van het logo, voor tekenen op een canvas (menukaart):
// per glas de kom en de steel+voet, met de draaiing van dat glas.
export const BRAND_MARK_GLASSES = [[290, 12], [734, -12]].map(([cx, rot]) => {
  const w = 150, top = 330, depth = 230, stem = 250, base = 95, py = top + depth / 2 + stem;
  return {
    rot, ox: cx, oy: py,
    bowl: `M${cx - w} ${top} q${w} ${depth} ${2 * w} 0z`,
    stem: `M${cx} ${top + depth / 2}v${stem}M${cx - base} ${top + depth / 2 + stem + 5}h${2 * base}`,
  };
});
export const BRAND_MARK_SPARK = "M512 200v70M440 226l30 52M584 226l-30 52";

export function brandMarkMarkup({ idPrefix = "bm", animated = false } = {}) {
  const gold = `${idPrefix}-gold`, liq = `${idPrefix}-liq`;
  const coupe = (cx, rot, n) => {
    const w = 150, top = 330, depth = 230, stem = 250, base = 95, py = top + depth / 2 + stem;
    const bowl = `M${cx - w} ${top} q${w} ${depth} ${2 * w} 0z`;
    const clip = `${idPrefix}-bowl${n}`;
    const fill = animated
      ? `<clipPath id="${clip}"><path d="${bowl}"/></clipPath><rect class="brand-liquid" x="${cx - w}" y="${top}" width="${2 * w}" height="${depth / 2 + 4}" fill="url(#${liq})" clip-path="url(#${clip})"/>`
      : `<path d="${bowl}" fill="url(#${liq})"/>`;
    return `<g transform="rotate(${rot} ${cx} ${py})">${fill}`
      + `<path d="${bowl}" fill="none" stroke="url(#${gold})" stroke-width="30" stroke-linejoin="round"/>`
      + `<path d="M${cx} ${top + depth / 2}v${stem}M${cx - base} ${top + depth / 2 + stem + 5}h${2 * base}" stroke="url(#${gold})" stroke-width="30" stroke-linecap="round" fill="none"/></g>`;
  };
  return `<defs>`
    + `<linearGradient id="${gold}" gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="0" y2="820"><stop offset="0" stop-color="#F0D49A"/><stop offset="1" stop-color="#C9973F"/></linearGradient>`
    + `<linearGradient id="${liq}" gradientUnits="userSpaceOnUse" x1="0" y1="290" x2="0" y2="580"><stop offset="0" stop-color="#F3C969"/><stop offset="1" stop-color="#D98A2B"/></linearGradient>`
    + `</defs>`
    + coupe(290, 12, 1) + coupe(734, -12, 2)
    + `<path${animated ? ' class="brand-spark"' : ""} d="M512 200v70M440 226l30 52M584 226l-30 52" stroke="#E6C27F" stroke-width="22" stroke-linecap="round" fill="none"/>`;
}

// Los SVG-bestand van alleen het logo (transparant), bv. voor scripts.
export function brandMarkSvg({ width = 684, height = 600 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${BRAND_MARK_VIEWBOX}">${brandMarkMarkup()}</svg>`;
}
