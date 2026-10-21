// Slim zoeken in ingrediënten: op naam, merk, Engelse naam en spreektaal
// (src/data/ingredientAliases.js), tolerant voor tikfouten ("spirte",
// "bacardie"), accenten en apostroffen.

import { INGREDIENT_ALIASES, NEAR_ALIASES, UNUSED_TERMS } from "./data/ingredientAliases.js";

export function normalizeTerm(s) {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Damerau-Levenshtein (met verwisselde buren), afgekapt op max.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
const allowedTypos = (len) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

// Hoe goed past zoekterm q bij term t (beide genormaliseerd)? 0 = niet.
function scoreTerm(q, t) {
  if (!q || !t) return 0;
  if (q === t) return 100;
  if (t.startsWith(q) && q.length >= 2) return 88 - Math.min(8, t.length - q.length);
  const words = t.split(" ");
  if (q.length >= 2 && words.some(w => w.startsWith(q))) return 72;
  // Zoekterm langer dan de term: "bacardi carta blanca 1 liter" → "bacardi".
  if (t.length >= 4 && (` ${q} `).includes(` ${t} `)) return 78;
  // Tikfouten: hele term, of het begin van de term even lang als q.
  const max = allowedTypos(q.length);
  if (max > 0) {
    let best = Infinity;
    best = Math.min(best, editDistance(q, t, max));
    if (t.length > q.length) best = Math.min(best, editDistance(q, t.slice(0, q.length), max));
    words.forEach(w => { if (w.length >= 3) best = Math.min(best, editDistance(q, w, max)); });
    if (best <= max) return 58 - best * 8;
  }
  return 0;
}

// Index: per ingrediënt alle termen met hun weergave.
export function buildIngredientIndex(ingredients, learned = []) {
  const nearById = new Map();
  NEAR_ALIASES.forEach(n => n.terms.forEach(t => {
    if (!nearById.has(n.id)) nearById.set(n.id, []);
    nearById.get(n.id).push({ display: t, norm: normalizeTerm(t), note: n.note });
  }));
  return ingredients.map(ing => {
    const terms = [{ display: ing.name, norm: normalizeTerm(ing.name), isName: true }];
    (INGREDIENT_ALIASES[ing.id] || []).forEach(a => terms.push({ display: a, norm: normalizeTerm(a) }));
    learned.filter(l => l.id === ing.id).forEach(l => terms.push({ display: l.term, norm: normalizeTerm(l.term), learned: !l.shared, shared: !!l.shared }));
    return { ing, terms, near: nearById.get(ing.id) || [] };
  });
}

// Resultaat: [{ ing, score, via, near, note, fuzzy }], beste eerst.
export function searchIngredients(query, index) {
  const q = normalizeTerm(query);
  if (!q) return [];
  const qWords = q.split(" ").filter(w => w.length >= 4);
  const out = [];
  index.forEach(({ ing, terms, near }) => {
    let best = { score: 0 };
    const consider = (t, kind) => {
      let s = scoreTerm(q, t.norm);
      // Meerdere woorden ("sprite zero 1,5 liter"): ook per woord, iets lager.
      if (s < 50 && qWords.length > 1) qWords.forEach(w => { s = Math.max(s, scoreTerm(w, t.norm) - 8); });
      if (kind === "near") s -= 12;
      // Bij een tikfout liever het merk tonen ("Sprite") dan de lange naam.
      if (s > best.score || (s > 0 && s === best.score && s < 60 && best.term?.isName && !t.isName)) best = { score: s, term: t, kind };
    };
    terms.forEach(t => consider(t, "term"));
    near.forEach(t => consider(t, "near"));
    if (best.score >= 42) {
      const t = best.term;
      out.push({
        ing, score: best.score,
        via: t.isName ? null : t.display,
        near: best.kind === "near",
        note: best.kind === "near" ? t.note : null,
        fuzzy: best.score < 60,
        matchedName: t.isName ? t.display.replace(/\s*\(.*\)\s*$/, "") : null,
        learned: !!t.learned,
        shared: !!t.shared,
      });
    }
  });
  out.sort((a, b) => b.score - a.score);
  // Bij een sterke treffer geen ruis van verre tikfout-treffers eronder.
  const top = out[0]?.score || 0;
  return out.filter(r => r.score >= Math.max(42, top - 35));
}

// Herkend maar nergens gebruikt (Red Bull, ijsthee…): uitleg in plaats van niets.
export function unusedHint(query) {
  const q = normalizeTerm(query);
  if (q.length < 3) return null;
  for (const u of UNUSED_TERMS) {
    for (const t of u.terms) {
      const n = normalizeTerm(t);
      if (n === q || (q.length >= 4 && n.startsWith(q)) || (n.length >= 4 && (` ${q} `).includes(` ${n} `)) || editDistance(q, n, allowedTypos(q.length)) <= allowedTypos(q.length)) {
        return { term: t, note: u.note };
      }
    }
  }
  return null;
}
