// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useContext, useEffect, useMemo, useRef } from "react";
import { Info, PartyPopper, Check, X, Shuffle, Lock, Plus, ShoppingCart, Clock, Users, Share2, Pencil, ListChecks, Sparkles } from "lucide-react";
import { supabase } from "../supabaseClient";
import { tallyChoices, CUSTOM_PREFIX, SURVEY_STYLES, SURVEY_SPIRITS, SURVEY_TASTES } from "../surveyOptions";
import { canonicalRecipeId } from "../recipes.js";
import { menuStrength } from "../menuCard";
import { createPortal } from "react-dom";
import { BORDER, BOTTLE, BOTTLE_DARK, BRASS, BURGUNDY, CREAM, HEADER_ACCENT, INK, MUTED, MenuToggleRow, NavOverrideContext, PAPER, PAPER_DEEP, RecipeCircle, RecipePicker, SAGE, SHADOW_CARD, SHADOW_CTA, SheetGrabber, SurveyGlass, findIngredientMeta, getMenuRole, getTasteProfile, hashString, inferTechniques, ingredientKey, publicAppUrl, sans, serif, shareLink, useBodyScrollLock, useSheetDismiss, useStorage } from "../ThuisbarApp.jsx";

// ===== Menu-assistent =====
// Een optioneel startpunt (eigen cocktails, thema, smaaktest of verras me),
// daarna zeven vragen die elk over te slaan zijn. Het resultaat zijn drie
// menu's naast elkaar (veilig, balans, verrassend); per cocktail staat
// waarom hij gekozen is, en wisselen gebeurt met een keuze uit alternatieven
// i.p.v. willekeurig. Antwoorden blijven bewaard (useStorage → Preferences).
const MA_DEFAULTS = {
  start: null, theme: null, surveyNote: null,
  count: 4, alcoholvrijCount: 1, guests: 8,
  variety: true, styles: [],
  prefs: { spirits: { like: [], dislike: [] }, tastes: { like: [], dislike: [] }, custom: { like: [], dislike: [] } },
  avoidIds: [],
  strengths: [], surprise: 30,
  effort: "werk", gear: { shaker: true, blender: false, crushed: true, eggs: true }, batch: false, noHomemade: false,
  mustHave: [],
  maxBottles: 2, budget: "", useUp: [], noBuy: [],
};

const MA_NO_LIMIT = 10;

// teller op 10 = geen grens aan het aantal flessen
const MA_QUESTION_COUNT = 7;

// Wat telt als "fles" bij bijkopen: sterke drank, likeuren en bitters, plus
// een paar mixers die je los koopt. Sap, frisdrank en citroenen zijn gewone
// boodschappen en tellen niet mee.
const MENU_BOTTLE_CATS = new Set(["Sterke drank", "Likeuren & versterkte wijnen", "Bitters"]);

const MENU_BOTTLE_EXTRA = new Set(["prosecco", "white_wine", "red_wine", "rose_wine", "sake", "peach_schnapps", "beer", "stout", "cider"]);

// Bekende klassiekers (wat de meeste gasten kennen); de rest telt als
// "minder bekend" voor het schuifje bekend/verrassend.
const MENU_CLASSICS = new Set([
  "whiskey_sour", "daiquiri", "margarita", "pisco_sour", "gimlet", "cosmopolitan", "sidecar", "caipirinha",
  "amaretto_sour", "gin_tonic", "cuba_libre", "moscow_mule", "paloma", "dark_n_stormy", "mojito", "long_island",
  "americano", "sex_on_the_beach", "tequila_sunrise", "bloody_mary", "screwdriver", "pimms_cup", "old_fashioned",
  "negroni", "sazerac", "boulevardier", "mint_julep", "martini", "manhattan", "dirty_martini", "tom_collins",
  "french_75", "espresso_martini", "kir_royale", "bellini", "mimosa", "gin_fizz", "porn_star_martini",
  "aperol_spritz", "pina_colada", "mai_tai", "bramble", "zombie", "white_russian", "black_russian",
  "irish_coffee", "hot_toddy", "mulled_wine", "godfather", "rusty_nail", "brandy_alexander", "grasshopper",
  "virgin_mojito", "virgin_pina_colada", "virgin_mule", "shirley_temple", "hugo", "blue_lagoon", "rob_roy",
]);

const MENU_HOMEMADE_SYRUPS = new Set(["honey_syrup", "honey_ginger_syrup", "raspberry_syrup"]);

const MENU_FRESH_JUICES = new Set(["lemon_juice", "lime_juice", "orange_juice", "grapefruit_juice", "pineapple_juice", "passion_fruit_puree", "peach_puree", "tomato_juice"]);

const MENU_CORNER_TITLES = { fris: "Fris en verfrissend", sterk: "Sterk en aromatisch", avontuurlijk: "Avontuurlijk", comfort: "Zacht en romig", alcoholvrij: "Alcoholvrij" };

const MENU_CORNER_COLORS = { fris: "var(--sage)", sterk: "var(--brass)", avontuurlijk: "var(--burgundy)", comfort: "#8A6A4A", alcoholvrij: "var(--sage)" };

const MA_STRENGTH_KEYS = { 1: "licht", 2: "middel", 3: "sterk" };

const MA_THEMES = [
  { key: "gin", label: "Gin-avond", ids: ["gin", "sloe_gin"] },
  { key: "tiki", label: "Tiki en tropisch", styles: ["tropisch"], families: ["Modern / Tiki"] },
  { key: "zomer", label: "Zomer", styles: ["fris_zuur", "lang_bruisend", "bubbels"] },
  { key: "winter", label: "Winter", styles: ["kort_sterk", "romig"], families: ["Warme dranken", "Zuivel & dessert"] },
  { key: "brunch", label: "Brunch", styles: ["bubbels"], ids: ["prosecco", "orange_juice", "tomato_juice"] },
  { key: "aperitief", label: "Aperitief", ids: ["campari", "aperol", "sweet_vermouth", "dry_vermouth", "lillet_blanc", "prosecco"] },
  { key: "na_eten", label: "Na het eten", styles: ["romig"], ids: ["coffee_liqueur", "espresso", "amaretto", "creme_de_cacao"] },
  { key: "bubbels", label: "Bubbels", styles: ["bubbels"] },
];

// Smaken uit de smaaktest (SURVEY_TASTES) vertaald naar receptkenmerken.
const MA_TASTE_IDS = {
  fruitig: ["orange_juice", "pineapple_juice", "cranberry_juice", "passion_fruit_puree", "passion_fruit_juice", "peach_puree", "raspberry_syrup", "strawberry", "chambord", "creme_de_cassis", "creme_de_mure", "cherry_brandy", "apricot_brandy", "lychee_liqueur", "sour_apple_liqueur", "banana_liqueur", "melon_liqueur", "grenadine"],
  kruidig: ["ginger_root", "honey_ginger_syrup", "allspice_liqueur", "benedictine", "green_chartreuse", "yellow_chartreuse", "cinnamon_stick", "cloves", "drambuie", "galliano"],
  rokerig: ["mezcal", "scotch"],
  pittig: ["chili", "tabasco", "ginger_beer", "ginger_root", "honey_ginger_syrup"],
  bloemig: ["elderflower_cordial", "creme_de_violette", "lillet_blanc", "orange_flower_water"],
  citrus: ["lemon_juice", "lime_juice", "grapefruit_juice", "orange_juice"],
  koffie: ["espresso", "hot_coffee", "coffee_liqueur"],
  chocolade: ["creme_de_cacao"],
  munt: ["mint", "creme_de_menthe"],
  gember: ["ginger_beer", "ginger_ale", "ginger_root", "honey_ginger_syrup", "ginger_wine"],
};

function maTasteMatches(f, key) {
  if (key === "fris_zuur") return f.taste.zuur >= 2;
  if (key === "zoet") return f.taste.zoet >= 3;
  if (key === "bitter") return f.taste.bitter >= 2;
  if (key === "romig") return f.styles.has("romig");
  if (key === "tropisch") return f.styles.has("tropisch");
  const ids = MA_TASTE_IDS[key];
  return !!ids && ids.some(id => f.ids.has(id));
}

// Zelf ingetypt ("~Calvados"): zoek in receptnaam en ingrediëntnamen.
function maCustomMatches(f, key) {
  const q = key.replace(/^~/, "").trim().toLowerCase();
  return q.length >= 2 && f.text.includes(q);
}

const MA_ALLERGY_IDS = {
  noten: ["orgeat", "amaretto", "frangelico", "creme_de_noyaux"],
  lactose: ["heavy_cream", "whipped_cream", "milk", "irish_cream", "butter"],
  rauw_ei: ["egg_white", "egg_yolk"],
  vegan: ["heavy_cream", "whipped_cream", "milk", "irish_cream", "butter", "egg_white", "egg_yolk", "honey_syrup", "honey_ginger_syrup"],
};

function maRecipeStyles(recipe, ids, taste, hasDairy) {
  const s = new Set();
  const fam = recipe.family;
  const has = (...list) => list.some(id => ids.has(id));
  if (has("prosecco")) s.add("bubbels");
  if (fam === "Modern / Tiki" || has("coconut_cream", "passion_fruit_puree", "passion_fruit_juice", "falernum", "banana_liqueur") || (has("pineapple_juice") && has("white_rum", "dark_rum"))) s.add("tropisch");
  if (fam === "Zuivel & dessert" || hasDairy || has("espresso", "coffee_liqueur", "creme_de_cacao", "advocaat")) s.add("romig");
  if (fam === "Highballs" || has("soda_water", "tonic", "ginger_beer", "ginger_ale", "cola", "lemonade", "grapefruit_soda", "beer")) s.add("lang_bruisend");
  if (fam === "Sours" || (taste.zuur >= 2 && !s.has("lang_bruisend"))) s.add("fris_zuur");
  if (fam === "Spirit-forward" || fam === "Stirred-down" || (taste.sterk >= 4 && taste.zuur <= 1)) s.add("kort_sterk");
  if (s.size === 0) s.add(taste.zuur >= 2 ? "fris_zuur" : "kort_sterk");
  return s;
}

function menuRecipeFacts(recipe, allIngredients, isOwned) {
  const required = recipe.ingredients.filter(i => !i.optional);
  const metas = recipe.ingredients.map(ing => ({ ing, meta: findIngredientMeta(ing, allIngredients) }));
  const ids = new Set(metas.map(({ ing, meta }) => meta?.id || ing.id).filter(Boolean));
  const requiredIds = new Set(required.map(ing => findIngredientMeta(ing, allIngredients)?.id || ing.id));
  const missing = required.filter(ing => !isOwned(ing));
  const bottleOf = (ing) => { const m = findIngredientMeta(ing, allIngredients); return m && (MENU_BOTTLE_CATS.has(m.cat) || MENU_BOTTLE_EXTRA.has(m.id)) ? m.id : null; };
  const bottles = [...new Set(required.map(bottleOf).filter(Boolean))];
  const missingBottles = [...new Set(missing.map(bottleOf).filter(Boolean))];
  const techniques = inferTechniques(recipe.method);
  const hasEgg = requiredIds.has("egg_white") || requiredIds.has("egg_yolk");
  const hasDairy = [...ids].some(id => ["heavy_cream", "whipped_cream", "milk", "egg_yolk", "irish_cream", "butter"].includes(id));
  const hasHomemade = [...ids].some(id => MENU_HOMEMADE_SYRUPS.has(id));
  const hasFreshJuice = required.some(ing => MENU_FRESH_JUICES.has(findIngredientMeta(ing, allIngredients)?.id || ing.id));
  const hot = [...ids].some(id => ["hot_water", "hot_coffee", "espresso", "hot_chocolate", "black_tea"].includes(id)) || recipe.family === "Warme dranken";
  // Vooraf te batchen: geen vers sap, ei, room of koffie en niets om te
  // muddelen/laagjes te gieten. Bruis (tonic, soda) mag: dat gaat er bij
  // het serveren pas bij.
  const batchable = !hasFreshJuice && !hasEgg && !hasDairy && !hot && !techniques.some(t => ["muddle", "float_layer", "blend", "dry_shake"].includes(t));
  const taste = getTasteProfile(recipe, allIngredients);
  const level = menuStrength(recipe, ing => findIngredientMeta(ing, allIngredients)).level;
  const styles = maRecipeStyles(recipe, ids, taste, hasDairy);
  const text = [recipe.name, ...metas.map(({ ing, meta }) => meta?.name || ing.name || "")].join(" ").toLowerCase();
  const priceOf = (id) => findIngredientMeta({ id }, allIngredients)?.bottlePrice || 20;
  const missingCost = missingBottles.reduce((s, id) => s + priceOf(id), 0);
  const baseSpirit = metas.find(({ meta }) => meta?.cat === "Sterke drank")?.meta?.id || null;
  return {
    recipe, required, ids, missing, bottles, missingBottles, missingCost, techniques, hasEgg, hasHomemade, batchable,
    taste, level, alcoholFree: level === 0, styles, text, baseSpirit, classic: MENU_CLASSICS.has(recipe.id),
    crushed: /crushed/i.test(recipe.method || ""),
  };
}

function menuCornerOf(recipe, taste) {
  const role = getMenuRole(recipe);
  if (role !== "overig") return role;
  return taste.sterk >= 4 ? "sterk" : "fris";
}

// Plekken op het menu. Met variatie: verdeeld over de smaakhoeken; zonder
// variatie (en met gekozen stijlen): verdeeld over die stijlen.
const MA_CORNER_ORDER = ["fris", "sterk", "avontuurlijk", "fris", "comfort", "sterk", "avontuurlijk", "fris", "sterk", "comfort"];

function maSlots(a) {
  const total = Math.max(1, Math.min(10, a.count));
  const free = Math.min(a.alcoholvrijCount, total);
  const n = total - free;
  const slots = [];
  const byStyle = !a.variety && a.styles.length > 0;
  for (let i = 0; i < n; i++) {
    slots.push(byStyle
      ? { key: `s${i}`, kind: "style", style: a.styles[i % a.styles.length] }
      : { key: `s${i}`, kind: "corner", corner: MA_CORNER_ORDER[i % MA_CORNER_ORDER.length] });
  }
  for (let i = 0; i < free; i++) slots.push({ key: `af${i}`, kind: "alcoholvrij" });
  return slots;
}

function maSlotMatches(f, slot) {
  if (slot.kind === "alcoholvrij") return f.alcoholFree;
  if (f.alcoholFree) return false;
  if (slot.kind === "style") return f.styles.has(slot.style);
  if (slot.kind === "corner") return f.corner === slot.corner;
  return true; // "extra": alles mag
}

function maSlotTitle(slot) {
  if (slot.kind === "alcoholvrij") return "Alcoholvrij";
  if (slot.kind === "style") return SURVEY_STYLES.find(s => s.key === slot.style)?.label || "";
  if (slot.kind === "corner") return MENU_CORNER_TITLES[slot.corner] || "";
  return "Eigen keuze";
}

// Harde filters: dingen die echt niet mogen of niet kunnen.
function maPasses(f, a) {
  const p = a.prefs;
  const spiritIds = (keys) => keys.flatMap(k => SURVEY_SPIRITS.find(o => o.key === k)?.ids || []);
  if (spiritIds(p.spirits.dislike).some(id => f.ids.has(id))) return false;
  if (p.tastes.dislike.some(k => maTasteMatches(f, k))) return false;
  if (p.custom.dislike.some(k => maCustomMatches(f, k))) return false;
  if (a.avoidIds.some(id => f.ids.has(id))) return false;
  if (a.effort === "snel" && (f.required.length > 3 || f.hasEgg || f.hasHomemade || f.techniques.includes("dry_shake") || f.techniques.includes("float_layer"))) return false;
  if (a.effort === "werk" && (f.required.length > 5 || f.techniques.includes("float_layer"))) return false;
  if (!a.gear.shaker && f.techniques.some(t => t === "shaken" || t === "dry_shake")) return false;
  if (!a.gear.blender && f.techniques.includes("blend")) return false;
  if (!a.gear.crushed && f.crushed) return false;
  if (!a.gear.eggs && f.hasEgg) return false;
  if (a.noHomemade && f.hasHomemade) return false;
  if (!f.alcoholFree && a.strengths.length > 0 && !a.strengths.includes(MA_STRENGTH_KEYS[f.level])) return false;
  if (f.missingBottles.some(id => a.noBuy.includes(id))) return false;
  return true;
}

// Score + korte uitleg ("gin-avond · fris en zuur · in huis").
function maScore(f, a, ctx) {
  const reasons = [];
  const add = (w, t) => reasons.push({ w, t });
  let score = 0;
  const p = a.prefs;
  // Voorraad: ontbrekende flessen kosten geld, ontbrekende boodschappen veel minder.
  score -= f.missingBottles.length * (ctx.profile === "veilig" ? 3.4 : 2.2);
  score -= (f.missing.length - f.missingBottles.length) * 0.6;
  if (f.missing.length === 0) { score += 1.5; add(1, "in huis"); }
  else if (f.missingBottles.length > 0) add(1.1, `${f.missingBottles.length} fles${f.missingBottles.length === 1 ? "" : "sen"} kopen`);
  // Voorkeuren.
  const likedSpirit = p.spirits.like.find(k => (SURVEY_SPIRITS.find(o => o.key === k)?.ids || []).some(id => f.ids.has(id)));
  if (likedSpirit) { score += 2.5; add(2.6, SURVEY_SPIRITS.find(o => o.key === likedSpirit).label.toLowerCase()); }
  const likedTastes = p.tastes.like.filter(k => maTasteMatches(f, k));
  if (likedTastes.length) { score += 1.2 * likedTastes.length; add(1.8, SURVEY_TASTES.find(t => t.key === likedTastes[0])?.label.toLowerCase()); }
  const likedCustom = p.custom.like.find(k => maCustomMatches(f, k));
  if (likedCustom) { score += 2.8; add(2.9, likedCustom.replace(/^~/, "").toLowerCase()); }
  // Thema.
  const theme = MA_THEMES.find(t => t.key === a.theme);
  if (theme && ((theme.ids || []).some(id => f.ids.has(id)) || (theme.styles || []).some(s => f.styles.has(s)) || (theme.families || []).includes(f.recipe.family))) {
    score += 3; add(3, theme.label.toLowerCase());
  }
  // Flessen opmaken.
  const usesUp = a.useUp.find(id => f.ids.has(id));
  if (usesUp) { score += 3; add(3.2, `maakt de ${(ctx.nameOf(usesUp) || usesUp).toLowerCase()} op`); }
  // Vooraf te maken.
  if (a.batch) { if (f.batchable) { score += 2.5; add(2.4, "vooraf te maken"); } else score -= 1; }
  // Bekend of verrassend.
  if (ctx.wantUnknown) { if (!f.classic) { score += 2.2; add(1.4, "minder bekend"); } else score -= 0.6; }
  else if (f.classic) { score += 1.6; add(1.2, "klassieker"); }
  if (ctx.profile === "veilig" && f.classic) score += 2;
  if (ctx.profile === "verrassend") { if (!f.classic) score += 2.5; score += (hashString(f.recipe.id + "v") % 100) / 60; }
  // Afwisseling in sterkte en basisdrank.
  if (!f.alcoholFree && a.strengths.length > 1 && !ctx.levels.has(f.level)) score += 0.6;
  score -= f.bottles.filter(b => ctx.menuBottles.has(b)).length * 0.5;
  // Eigen smaak uit je check-ins.
  if (ctx.tasteLikes) {
    const fit = ["zoet", "zuur", "bitter", "sterk"].reduce((s, k) => s + ((ctx.tasteLikes[k] || 0) / 100) * (f.taste[k] / 5), 0);
    score += fit * 0.8;
  }
  // Vaste tie-breaker zodat het menu niet bij elke render verspringt.
  score += (hashString(f.recipe.id) % 100) / 1000;
  const why = reasons.sort((x, y) => y.w - x.w).slice(0, 3).map(r => r.t).filter(Boolean).join(" · ");
  return { score, why };
}

// Stelt één menu samen. `locks` = slotKey → recept-id (vastgezet, gewisseld
// of "moet erop"); de rest wordt per plek met de hoogste score gevuld.
function maBuildMenu({ facts, a, slots, locks, profile, tasteLikes, nameOf, priceOf }) {
  const byId = new Map(facts.map(f => [f.recipe.id, f]));
  const chosen = new Map();
  const used = new Set();
  const menuBottles = new Set();
  const missing = new Set();
  const levels = new Set();
  const take = (slotKey, f, extra) => {
    chosen.set(slotKey, { f, ...extra });
    used.add(f.recipe.id);
    f.bottles.forEach(b => menuBottles.add(b));
    f.missingBottles.forEach(b => missing.add(b));
    levels.add(f.level);
  };
  slots.forEach(slot => {
    const f = locks[slot.key] && byId.get(locks[slot.key]);
    if (f) take(slot.key, f, { locked: true, why: a.mustHave.includes(f.recipe.id) ? "jij koos hem" : "vastgezet" });
  });
  const alcoholic = slots.filter(s => s.kind !== "alcoholvrij").length;
  const wantUnknownTotal = Math.round(alcoholic * (profile === "veilig" ? 0 : profile === "verrassend" ? Math.max(0.6, a.surprise / 100) : a.surprise / 100));
  const budget = parseFloat(String(a.budget).replace(",", ".")) || null;
  const costOf = (set) => [...set].reduce((sum, id) => sum + priceOf(id), 0);
  slots.forEach(slot => {
    if (chosen.has(slot.key)) return;
    const unknownSoFar = [...chosen.values()].filter(c => c.f && !c.f.classic && !c.f.alcoholFree).length;
    const ctx = { profile, wantUnknown: unknownSoFar < wantUnknownTotal, menuBottles, levels, tasteLikes, nameOf };
    const fitsBudget = (f) => {
      const next = new Set([...missing, ...f.missingBottles]);
      if (a.maxBottles < MA_NO_LIMIT && next.size > a.maxBottles) return false;
      if (budget != null && costOf(next) > budget) return false;
      return true;
    };
    const pool = facts.filter(f => !used.has(f.recipe.id) && maPasses(f, a) && fitsBudget(f));
    let candidates = pool.filter(f => maSlotMatches(f, slot));
    // Niets in deze hoek? Dan iets anders dat wel past (zelfde soort: met of zonder alcohol).
    if (candidates.length === 0 && slot.kind !== "alcoholvrij") candidates = pool.filter(f => !f.alcoholFree);
    if (candidates.length === 0) { chosen.set(slot.key, { f: null }); return; }
    const best = candidates.map(f => ({ f, ...maScore(f, a, ctx) })).sort((x, y) => y.score - x.score)[0];
    take(slot.key, best.f, { why: best.why });
  });
  const items = slots.map(slot => ({ slot, ...(chosen.get(slot.key) || { f: null }) }));
  return { items, missingBottles: [...missing], cost: costOf(missing) };
}

// Alternatieven voor één plek (het wisselvenster), met filters.
function maAlternatives({ facts, a, slot, current, usedIds, filters, tasteLikes, nameOf }) {
  const ctx = { profile: "balans", wantUnknown: false, menuBottles: new Set(), levels: new Set(), tasteLikes, nameOf };
  return facts
    .filter(f => !usedIds.has(f.recipe.id) && maPasses(f, a))
    .filter(f => slot.kind === "alcoholvrij" ? f.alcoholFree : !f.alcoholFree)
    .filter(f => !filters.same || maSlotMatches(f, slot))
    .filter(f => !filters.inHouse || f.missing.length === 0)
    .filter(f => !filters.otherBase || !current || f.baseSpirit !== current.baseSpirit)
    .filter(f => !filters.lighter || !current || f.level < current.level)
    .map(f => ({ f, ...maScore(f, a, ctx) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 5);
}

function MenuOptionCard({ selected, onClick, icon, title, subtitle }) {
  return (
    <button onClick={onClick} role="radio" aria-checked={selected} className="press-scale" style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 64, boxSizing: "border-box",
      padding: "12px 14px", marginBottom: 10, textAlign: "left", cursor: "pointer", fontFamily: sans,
      background: CREAM, borderRadius: 14, border: `1.5px solid ${selected ? BOTTLE : BORDER}`,
      boxShadow: selected ? "none" : SHADOW_CARD, transition: "border-color 0.15s ease",
    }}>
      <span style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: selected ? BOTTLE : PAPER_DEEP, color: selected ? "#F1D9A6" : BRASS, fontFamily: serif, fontWeight: 700, fontSize: 16,
      }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: INK }}>{title}</span>
        {subtitle && <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{subtitle}</span>}
      </span>
      <span aria-hidden style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box",
        border: `2px solid ${selected ? BOTTLE : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {selected && <span style={{ width: 10, height: 10, borderRadius: "50%", background: BOTTLE }} />}
      </span>
    </button>
  );
}

function MenuBalanceInfo() {
  return (
    <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px", margin: "4px 0 16px" }}>
      <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.6, margin: "0 0 8px" }}>
        Bars bouwen een menu op vier smaakhoeken: <strong>fris &amp; verfrissend</strong>, <strong>sterk &amp; aromatisch</strong>,
        {" "}<strong>avontuurlijk</strong> en <strong>comfort</strong>, met daarnaast een volwaardige <strong>alcoholvrije</strong> optie.
        Zo vindt elke gast iets en voelt het menu niet eenzijdig.
      </p>
      <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.6, margin: 0 }}>
        Vuistregels: reken op 2 drankjes per gast het eerste uur en daarna 1 per uur. Geroerde cocktails zonder vers sap of ei
        kun je vooraf batchen, dan sta je tijdens het feest minder achter de bar.
      </p>
    </div>
  );
}

// Wisselvenster: vijf alternatieven voor één plek (of, bij "Cocktail
// toevoegen", voor een extra plek), met filters en zelf zoeken.
function MaSwapSheet({ title, subtitle, alternatives, filters, setFilters, showFilters, recipes, allIngredients, onPick, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const chip = (key, label) => {
    const on = filters[key];
    return (
      <button key={key} type="button" aria-pressed={on} onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))} style={{
        minHeight: 36, padding: "0 12px", borderRadius: 100, fontFamily: sans, fontSize: 13, cursor: "pointer",
        background: on ? BOTTLE : PAPER_DEEP, color: on ? "#FBF6EA" : INK, border: `1px solid ${on ? BOTTLE : PAPER_DEEP}`,
      }}>{label}</button>
    );
  };
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", maxHeight: "88vh", background: PAPER,
        borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: sans,
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "0 18px 8px", touchAction: "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={close} aria-label="Sluiten" onTouchStart={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginTop: -8, marginRight: -10, background: "none", border: "none", color: INK, cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ overflowY: "auto", overflowX: "hidden", padding: "0 18px calc(env(safe-area-inset-bottom) + 20px)" }}>
          {showFilters && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "4px 0 12px" }}>
              {chip("same", "Zelfde soort")}{chip("inHouse", "Alles in huis")}{chip("otherBase", "Andere drank")}{chip("lighter", "Lichter")}
            </div>
          )}
          {alternatives.length === 0 ? (
            <p style={{ fontSize: 13.5, color: MUTED, margin: "8px 0 14px" }}>Geen alternatieven met deze filters. Zet een filter uit of zoek zelf.</p>
          ) : (
            <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, padding: "0 10px 0 12px", marginBottom: 12 }}>
              {alternatives.map(({ f, why }, i) => (
                <div key={f.recipe.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 68, borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <RecipeCircle recipe={f.recipe} allIngredients={allIngredients} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 15.5, color: INK }}>{f.recipe.name}</div>
                    {why && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{why}</div>}
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: f.missingBottles.length ? BURGUNDY : SAGE }}>
                      {f.missingBottles.length ? `+${f.missingBottles.length} fles${f.missingBottles.length === 1 ? "" : "sen"} · ± €${Math.round(f.missingCost)}` : f.missing.length ? "Alleen boodschappen" : "Alles in huis"}
                    </div>
                  </div>
                  <button onClick={() => onPick(f.recipe.id)} style={{ minWidth: 56, minHeight: 40, borderRadius: 10, border: "none", background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Kies</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, margin: "4px 0 6px" }}>Zelf zoeken in alle recepten</div>
          <RecipePicker recipes={recipes} value={null} listId="menu-assistent-zoek" onChange={id => id && onPick(id)} style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
      </div>
    </div>
  ), document.body);
}

function MenuAssistentTab({ recipes, isOwned, allIngredients, ingredientLabel, favoriteRecipeIds = [], recentRecipeIds = [], tasteLikes, parties = [], onAddToShoppingList, onUseInFeestplanner, onSound,
  linkedParty = null, partyAnswers = null, onPartyAnswers, onApplyToParty, onUnlink }) {
  // Los gebruikt: één set antwoorden. Gekoppeld aan een feest: eigen
  // antwoorden per feest (bewaard in de app), zodat je gewone instellingen
  // niet overschreven worden door de smaaktest van een feest.
  const [globalStored, setGlobalStored] = useStorage("thuisbar-menu-assistent-v2", MA_DEFAULTS);
  const stored = linkedParty ? (partyAnswers || MA_DEFAULTS) : globalStored;
  const setStored = linkedParty ? onPartyAnswers : setGlobalStored;
  const a = {
    ...MA_DEFAULTS, ...stored,
    prefs: { ...MA_DEFAULTS.prefs, ...(stored?.prefs || {}) },
    gear: { ...MA_DEFAULTS.gear, ...(stored?.gear || {}) },
  };
  const setAnswer = (patch) => setStored({ ...a, ...patch });
  const order = a.start === "eigen" ? [6, 1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 5, 6, 7];
  // Gekoppeld aan een feest sla je het startscherm over (het startpunt is het feest).
  const [pos, setPos] = useState(linkedParty ? 1 : 0); // 0 = startpunt, 1..7 = vragen, 8 = resultaat
  const step = pos >= 1 && pos <= MA_QUESTION_COUNT ? order[pos - 1] : null;
  const showResult = pos > MA_QUESTION_COUNT;
  const [tab, setTab] = useState("balans");
  const [locks, setLocks] = useState({});
  const [extras, setExtras] = useState([]);
  const [sheet, setSheet] = useState(null); // slotKey | "__add"
  const [sheetFilters, setSheetFilters] = useState({ same: true, inHouse: false, otherBase: false, lighter: false });
  const [customDraft, setCustomDraft] = useState("");
  const [listAdded, setListAdded] = useState(false);
  const [shareState, setShareState] = useState(null);
  const [surveyBusy, setSurveyBusy] = useState(null);
  const [showAllUseUp, setShowAllUseUp] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const goTo = (next) => { setPos(next); setShowInfo(false); window.scrollTo({ top: 0 }); };

  const setNavOverride = useContext(NavOverrideContext);
  useEffect(() => {
    if (!setNavOverride) return;
    if (showResult) {
      setNavOverride({
        label: "Vragen", title: "Menu-assistent", onBack: () => goTo(MA_QUESTION_COUNT),
        right: (
          <button onClick={() => setShowInfo(v => !v)} aria-label="Hoe werkt een gebalanceerd menu?" style={{ background: "none", border: "none", cursor: "pointer", color: HEADER_ACCENT, display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 44, minHeight: 44 }}>
            <Info size={18} />
          </button>
        ),
      });
    } else if (pos >= 1 && !(linkedParty && pos === 1)) {
      // Bij de vragen: terug (knop of vegen) = de vorige vraag, niet meteen
      // het hele scherm uit.
      setNavOverride({ label: "Vorige", title: "Menu-assistent", onBack: () => goTo(pos - 1) });
    } else {
      setNavOverride(null);
    }
  }, [setNavOverride, showResult, pos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setNavOverride && setNavOverride(null), [setNavOverride]);

  const facts = useMemo(() => recipes.map(r => {
    const f = menuRecipeFacts(r, allIngredients, isOwned);
    return { ...f, corner: menuCornerOf(r, f.taste) };
  }), [recipes, allIngredients, isOwned]);
  const factsById = useMemo(() => new Map(facts.map(f => [f.recipe.id, f])), [facts]);
  const nameOf = (id) => (findIngredientMeta({ id }, allIngredients)?.name || id).split(" (")[0].split(" / ")[0];
  const priceOf = (id) => findIngredientMeta({ id }, allIngredients)?.bottlePrice || 20;

  // Plekken + wat er vast op staat (moet erop, vastgezet/gewisseld, toegevoegd).
  const { slots, allLocks } = useMemo(() => {
    const s = maSlots(a);
    const mustLocks = {};
    a.mustHave.forEach(id => {
      const f = factsById.get(id);
      if (!f) return;
      const free = s.filter(x => !mustLocks[x.key]);
      const target = free.find(x => maSlotMatches(f, x)) || free.find(x => (x.kind === "alcoholvrij") === f.alcoholFree);
      if (target) mustLocks[target.key] = id;
      else { const key = `m-${id}`; s.push({ key, kind: "extra" }); mustLocks[key] = id; }
    });
    extras.forEach((id, i) => { const key = `x${i}`; s.push({ key, kind: "extra" }); mustLocks[key] = id; });
    return { slots: s, allLocks: { ...mustLocks, ...locks } };
  }, [stored, factsById, extras, locks]);

  const menus = useMemo(() => {
    if (!showResult) return null;
    const out = {};
    ["veilig", "balans", "verrassend"].forEach(profile => {
      out[profile] = maBuildMenu({ facts, a, slots, locks: allLocks, profile, tasteLikes, nameOf, priceOf });
    });
    return out;
  }, [showResult, facts, stored, slots, allLocks, tasteLikes]);
  const current = menus?.[tab];
  const picked = current ? current.items.filter(m => m.f) : [];

  const missingRows = useMemo(() => {
    const map = new Map();
    picked.forEach(m => m.f.missing.forEach(ing => {
      const key = ingredientKey(ing);
      if (!map.has(key)) map.set(key, { ref: ing, label: ingredientLabel(ing), recipeNames: [] });
      map.get(key).recipeNames.push(m.f.recipe.name);
    }));
    return [...map.values()];
  }, [current]);
  useEffect(() => { setListAdded(false); }, [tab, missingRows.length]);

  // Flessen uit de voorraad (om op te maken) en flessen die vaak ontbreken.
  const ownedBottles = useMemo(() => {
    const used = new Set(facts.flatMap(f => f.bottles));
    return allIngredients.filter(i => (MENU_BOTTLE_CATS.has(i.cat) || MENU_BOTTLE_EXTRA.has(i.id)) && used.has(i.id) && isOwned({ id: i.id }));
  }, [facts, allIngredients, isOwned]);
  const commonMissing = useMemo(() => {
    const count = {};
    facts.forEach(f => f.missingBottles.forEach(id => { count[id] = (count[id] || 0) + 1; }));
    return Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([id]) => id);
  }, [facts]);
  const surveyParties = parties.filter(p => p.taste_survey_id);

  // Smaaktest als startpunt: de antwoorden van de gasten vullen de vragen alvast in.
  const applySurvey = async (party, base = a) => {
    const startKey = base.start === "feest" ? "feest" : "smaaktest";
    setSurveyBusy(party.id);
    const { data } = await supabase.from("party_survey_responses").select("*").eq("survey_id", party.taste_survey_id).order("created_at", { ascending: false });
    setSurveyBusy(null);
    const seen = new Set();
    const rs = (data || []).filter(r => { const n = (r.guest_name || "").trim().toLowerCase(); if (!n) return true; if (seen.has(n)) return false; seen.add(n); return true; });
    const n = rs.length;
    if (n === 0) { setStored({ ...base, start: startKey, surveyNote: `${party.name}: nog geen reacties`, surveyPartyId: party.id, surveyCount: 0 }); return; }
    const pick = (group) => {
      const t = tallyChoices(rs, group);
      const min = Math.max(1, n / 3);
      return {
        like: t.filter(x => x.like >= min && x.like > x.dislike).map(x => x.key).filter(k => !k.startsWith(CUSTOM_PREFIX)),
        dislike: t.filter(x => x.dislike >= min && x.dislike > x.like).map(x => x.key).filter(k => !k.startsWith(CUSTOM_PREFIX)),
      };
    };
    const styleCount = {}, strengthCount = {};
    rs.forEach(r => {
      (r.answers?.styles || []).forEach(k => { styleCount[k] = (styleCount[k] || 0) + 1; });
      if (r.answers?.strength) strengthCount[r.answers.strength] = (strengthCount[r.answers.strength] || 0) + 1;
    });
    const avoid = new Set();
    rs.forEach(r => (r.answers?.allergies || r.dietary || []).forEach(k => (MA_ALLERGY_IDS[k] || []).forEach(id => avoid.add(id))));
    setStored({
      ...base,
      start: startKey,
      surveyNote: `${party.name} · ${n} reactie${n === 1 ? "" : "s"}`,
      surveyPartyId: party.id, surveyCount: n,
      guests: party.guests || base.guests,
      prefs: { spirits: pick("spirits"), tastes: pick("tastes"), custom: base.prefs.custom },
      styles: Object.entries(styleCount).filter(([, c]) => c >= n / 3).map(([k]) => k),
      strengths: ["licht", "middel", "sterk"].filter(k => (strengthCount[k] || 0) >= n / 4),
      alcoholvrijCount: strengthCount.alcoholvrij ? Math.max(1, base.alcoholvrijCount) : base.alcoholvrijCount,
      avoidIds: [...avoid],
    });
  };

  // Gekoppeld openen: gasten en het huidige menu van het feest gaan mee (de
  // cocktails die er al op staan worden vaste keuzes), en de smaaktest wordt
  // telkens opnieuw ingelezen zodat nieuwe reacties meetellen. Je eigen
  // antwoorden over moeite, gereedschap en budget blijven bewaard.
  const linkedInitRef = useRef(false);
  useEffect(() => {
    if (!linkedParty || linkedInitRef.current) return;
    linkedInitRef.current = true;
    const ids = linkedParty.cocktail_ids || [];
    const base = { ...a, start: "feest", theme: null, guests: linkedParty.guests || a.guests, mustHave: ids, count: Math.min(10, Math.max(a.count, ids.length)) };
    if (linkedParty.taste_survey_id) applySurvey(linkedParty, base);
    else setStored({ ...base, surveyNote: null, surveyPartyId: null, surveyCount: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedParty]);
  const linkedBanner = linkedParty && (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: CREAM, borderRadius: 14, boxShadow: SHADOW_CARD, padding: "10px 12px", marginBottom: 16 }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, background: PAPER_DEEP, color: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><PartyPopper size={16} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.35, color: INK }}>
        Voor <strong>{linkedParty.name || "je feest"}</strong>
        <span style={{ display: "block", fontSize: 12, color: MUTED }}>
          {surveyBusy ? "Smaaktest inlezen…" : a.surveyCount > 0 ? `${a.surveyCount} reactie${a.surveyCount === 1 ? "" : "s"} uit de smaaktest verwerkt` : linkedParty.taste_survey_id ? "Nog geen reacties op de smaaktest" : "Zonder smaaktest"}
        </span>
      </span>
      <button onClick={onUnlink} style={{ background: "none", border: "none", color: BOTTLE, fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "8px 0 8px 6px", flexShrink: 0 }}>Losmaken</button>
    </div>
  );

  const startResult = () => {
    onSound?.("chime");
    setLocks({});
    setTab("balans");
    goTo(MA_QUESTION_COUNT + 1);
  };

  // ---------- Kleine bouwstenen (functies, geen componenten: zo houdt
  // een invoerveld zijn focus tijdens het typen) ----------
  const stepperRow = (title, sub, value, onMinus, onPlus, label, display) => (
    <div key={title} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 72, borderTop: `1px solid ${BORDER}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: INK }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
      </div>
      <button aria-label={`Minder ${label}`} onClick={onMinus} style={stepBtn}>−</button>
      <span style={{ minWidth: 40, textAlign: "center", fontSize: display ? 14 : 20, fontWeight: 700, color: BOTTLE }}>{display || value}</span>
      <button aria-label={`Meer ${label}`} onClick={onPlus} style={stepBtn}>+</button>
    </div>
  );
  const prefState = (group, key) => a.prefs[group].like.includes(key) ? "like" : a.prefs[group].dislike.includes(key) ? "dislike" : null;
  const cyclePref = (group, key) => {
    const g = a.prefs[group];
    const like = g.like.filter(k => k !== key), dislike = g.dislike.filter(k => k !== key);
    if (g.like.includes(key)) dislike.push(key); else if (!g.dislike.includes(key)) like.push(key);
    setAnswer({ prefs: { ...a.prefs, [group]: { like, dislike } } });
  };
  const prefChip = (group, key, label) => {
    const st = prefState(group, key);
    return (
      <button key={group + key} type="button" onClick={() => cyclePref(group, key)}
        aria-label={`${label}${st === "like" ? ", wel" : st === "dislike" ? ", liever niet" : ""}`} style={{
          display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 100, fontFamily: sans, fontSize: 14.5, cursor: "pointer",
          ...(st === "like" ? { background: BOTTLE, border: `1px solid ${BOTTLE}`, color: "#FBF6EA" }
            : st === "dislike" ? { background: "transparent", border: `1px dashed ${MUTED}`, color: MUTED }
            : { background: CREAM, border: `1px solid ${BORDER}`, color: INK }),
        }}>
        {st === "like" && <Check size={14} color="#F1D9A6" strokeWidth={2.6} />}
        {st === "dislike" && <X size={13} strokeWidth={2.2} />}
        <span style={{ textDecoration: st === "dislike" ? "line-through" : "none" }}>{label}</span>
      </button>
    );
  };
  const toggleChip = (key, label, on, onClick) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 100, fontFamily: sans, fontSize: 14.5, cursor: "pointer",
      background: on ? BOTTLE : PAPER_DEEP, color: on ? "#FBF6EA" : INK, border: `1px solid ${on ? BOTTLE : PAPER_DEEP}`,
    }}>
      {on && <Check size={14} color="#F1D9A6" strokeWidth={2.6} />}{label}
    </button>
  );
  const sectionLabel = (t) => <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: MUTED, margin: "0 0 8px" }}>{t}</div>;
  const segmented = (options, value, onChange, label) => (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", padding: 3, borderRadius: 12, background: PAPER_DEEP }}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} style={{
          flex: 1, minHeight: 42, border: "none", borderRadius: 9, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer",
          background: value === v ? CREAM : "transparent", color: value === v ? INK : MUTED, boxShadow: value === v ? "0 1px 3px rgba(43,38,32,0.15)" : "none",
        }}>{l}</button>
      ))}
    </div>
  );

  // ---------- Resultaat ----------
  if (showResult && current) {
    const budget = parseFloat(String(a.budget).replace(",", ".")) || null;
    const makeable = picked.filter(m => m.f.missing.length === 0).length;
    const batchCount = picked.filter(m => m.f.batchable).length;
    const drinks = Math.round(a.guests * 2.5);
    const usedIds = new Set(picked.map(m => m.f.recipe.id));
    const sheetSlot = sheet === "__add" ? { key: "__add", kind: "extra" } : slots.find(s => s.key === sheet);
    const sheetCurrent = sheet && sheet !== "__add" ? current.items.find(m => m.slot.key === sheet)?.f : null;
    const alternatives = sheetSlot ? maAlternatives({ facts, a, slot: sheetSlot, current: sheetCurrent, usedIds, filters: sheet === "__add" ? { same: false } : sheetFilters, tasteLikes, nameOf }) : [];
    const pickFromSheet = (id) => {
      onSound?.("pop");
      if (sheet === "__add") setExtras(x => [...x, id]);
      else setLocks(l => ({ ...l, [sheet]: id }));
      setSheet(null);
    };
    const toggleLock = (m) => {
      onSound?.("tick");
      const id = m.f.recipe.id;
      if (a.mustHave.includes(id) && allLocks[m.slot.key] === id && !locks[m.slot.key]) { setAnswer({ mustHave: a.mustHave.filter(x => x !== id) }); return; }
      setLocks(l => { const next = { ...l }; if (next[m.slot.key]) delete next[m.slot.key]; else next[m.slot.key] = id; return next; });
    };
    const removeExtra = (slotKey) => {
      const idx = Number(slotKey.slice(1));
      setExtras(x => x.filter((_, i) => i !== idx));
    };
    const shareMenu = async () => {
      const names = picked.map(m => m.f.recipe.name);
      if (names.length === 0) return;
      onSound?.("share");
      const text = `Het cocktailmenu voor vanavond:\n${names.map(n => `• ${n}`).join("\n")}`;
      const url = publicAppUrl(`menu=${picked.map(m => m.f.recipe.id).join(",")}`);
      const result = await shareLink({ title: "Mijn Thuisbar: menu", text: "Bekijk het cocktailmenu voor vanavond!", url, fallbackText: text });
      if (result === "cancelled") return;
      setShareState(result === "no-url" ? "failed" : result);
      setTimeout(() => setShareState(null), 2500);
    };
    const iconBtn = (active) => ({ width: 40, height: 44, border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: active ? BRASS : MUTED, padding: 0 });

    return (
      <div style={{ fontFamily: sans }}>
        {linkedBanner}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <h1 style={{ fontFamily: serif, fontSize: 30, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.15 }}>Jouw menu</h1>
          <button onClick={() => goTo(0)} style={{ background: "none", border: "none", color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 44, padding: "0 0 0 8px" }}>Opnieuw</button>
        </div>
        {showInfo && <MenuBalanceInfo />}
        <div style={{ marginBottom: 12 }}>
          {segmented([["veilig", "Veilig"], ["balans", "Balans"], ["verrassend", "Verrassend"]], tab, v => { onSound?.("tick"); setTab(v); }, "Kies een menu")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, background: BOTTLE_DARK, color: "#FBF6EA", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {picked.length} cocktail{picked.length === 1 ? "" : "s"} · {current.missingBottles.length === 0 ? "niets kopen" : `${current.missingBottles.length} fles${current.missingBottles.length === 1 ? "" : "sen"} kopen`}
            </div>
            {current.missingBottles.length > 0 && (
              <div style={{ fontSize: 12.5, color: "#C9D2CB", marginTop: 2 }}>{current.missingBottles.map(id => nameOf(id).toLowerCase()).join(", ")} · ongeveer €{Math.round(current.cost)}</div>
            )}
          </div>
          {budget != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#F1D9A6", border: "1px solid #F1D9A6", borderRadius: 100, padding: "4px 10px", whiteSpace: "nowrap" }}>
              {current.cost <= budget ? "binnen budget" : "boven budget"}
            </span>
          )}
        </div>

        <div style={{ background: CREAM, border: "none", borderRadius: 16, boxShadow: SHADOW_CARD, padding: "0 4px 0 10px" }}>
          {current.items.map((m, i) => {
            const { slot, f, why } = m;
            if (!f) {
              return (
                <div key={slot.key} style={{ padding: "12px 4px", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>{maSlotTitle(slot)}</div>
                  <div style={{ fontSize: 13.5, color: INK, marginTop: 3, lineHeight: 1.45 }}>Niets gevonden dat bij je antwoorden past. Zet een filter ruimer, verhoog het aantal flessen of kies zelf.</div>
                  <button onClick={() => setSheet(slot.key)} style={{ marginTop: 4, background: "none", border: "none", color: BOTTLE, fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: 0, minHeight: 44, fontFamily: sans }}>Zelf kiezen</button>
                </div>
              );
            }
            const isLocked = !!allLocks[slot.key];
            const isExtra = slot.kind === "extra" && slot.key.startsWith("x");
            return (
              <div key={slot.key} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 72, padding: "8px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                <RecipeCircle recipe={f.recipe} allIngredients={allIngredients} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: slot.kind === "corner" ? MENU_CORNER_COLORS[slot.corner] : MUTED }}>{maSlotTitle(slot)}</div>
                  <div style={{ fontFamily: serif, fontSize: 16.5, fontWeight: 700, color: INK, lineHeight: 1.2, marginTop: 1 }}>{f.recipe.name}</div>
                  {why && <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>{why}</div>}
                  {f.missing.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: BURGUNDY, marginTop: 1 }}>Mist: {f.missing.map(ing => ingredientLabel(ing)).join(", ")}</div>}
                </div>
                <button onClick={() => { setSheetFilters({ same: true, inHouse: false, otherBase: false, lighter: false }); setSheet(slot.key); }} aria-label={`Wissel ${f.recipe.name}`} style={iconBtn(false)}><Shuffle size={18} /></button>
                {isExtra ? (
                  <button onClick={() => removeExtra(slot.key)} aria-label={`${f.recipe.name} weghalen`} style={iconBtn(false)}><X size={18} /></button>
                ) : (
                  <button onClick={() => toggleLock(m)} aria-label={isLocked ? `Maak ${f.recipe.name} los` : `Zet ${f.recipe.name} vast`} aria-pressed={isLocked} style={iconBtn(isLocked)}>
                    <Lock size={17} strokeWidth={isLocked ? 2.4 : 1.8} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={() => setSheet("__add")} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", minHeight: 46, marginTop: 10, marginBottom: 16,
          border: "1px dashed #B8A98A", borderRadius: 12, background: "transparent", color: BOTTLE, fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer",
        }}><Plus size={15} /> Cocktail toevoegen</button>

        <div style={{ background: CREAM, border: "none", borderRadius: 16, boxShadow: SHADOW_CARD, padding: "4px 14px", marginBottom: 16 }}>
          {[
            { icon: <Check size={16} strokeWidth={2.4} />, content: <span><strong>{makeable} van {picked.length}</strong> kun je nu maken</span> },
            missingRows.length > 0 && {
              icon: <ShoppingCart size={16} />, color: BURGUNDY,
              content: <span><span style={{ display: "block" }}>Nog nodig</span><span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{missingRows.map(r => r.label).join(", ")}</span></span>,
              action: listAdded ? (
                <span className="success-pop" style={{ display: "flex", alignItems: "center", gap: 4, color: SAGE, fontSize: 13, fontWeight: 700, minHeight: 36 }}><Check size={14} strokeWidth={3} /> Op lijst</span>
              ) : (
                <button onClick={() => { onAddToShoppingList(missingRows.map(r => ({ ref: r.ref, recipeNames: r.recipeNames }))); onSound?.("tick"); setListAdded(true); }}
                  style={{ background: BOTTLE, color: "#FBF6EA", border: "none", borderRadius: 100, padding: "0 14px", minHeight: 36, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: sans, flexShrink: 0 }}>
                  Op lijst
                </button>
              ),
            },
            { icon: <Clock size={16} />, content: <span><strong>{batchCount} van {picked.length}</strong> kun je vooraf maken</span> },
            { icon: <Users size={16} />, content: <span>Voor {a.guests} {a.guests === 1 ? "gast" : "gasten"}: <strong>± {drinks} drankjes</strong></span> },
          ].filter(Boolean).map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, fontSize: 14, color: INK }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: PAPER_DEEP, color: row.color || SAGE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{row.icon}</span>
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>{row.content}</div>
              {row.action}
            </div>
          ))}
        </div>

        <button onClick={() => {
          onSound?.("chime");
          const ids = picked.map(m => m.f.recipe.id);
          if (linkedParty) onApplyToParty(ids, a.surveyCount || 0);
          else onUseInFeestplanner(ids, a.guests, a.start === "smaaktest" ? a.surveyPartyId : null);
        }} disabled={picked.length === 0} className="press-scale" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, borderRadius: 14,
          background: BOTTLE_DARK, color: "#FBF6EA", border: "none", fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA, marginBottom: 10,
        }}>
          <PartyPopper size={17} /> {linkedParty ? `Zet op het menu van ${linkedParty.name || "je feest"}` : "Naar de feestplanner"}
        </button>
        <button onClick={shareMenu} disabled={picked.length === 0} className="press-scale" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, borderRadius: 14,
          background: PAPER_DEEP, color: INK, border: "none", fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}>
          <Share2 size={17} color={BOTTLE} /> {shareState === "copied" ? "Gekopieerd" : shareState === "shared" ? "Gedeeld" : shareState === "failed" ? "Delen lukte niet" : "Deel menu"}
        </button>

        {sheet && sheetSlot && (
          <MaSwapSheet
            title={sheet === "__add" ? "Cocktail toevoegen" : `Wissel ${sheetCurrent?.recipe.name || ""}`}
            subtitle={sheet === "__add" ? "Passend bij je antwoorden" : `Plek: ${maSlotTitle(sheetSlot).toLowerCase()}`}
            alternatives={alternatives} filters={sheetFilters} setFilters={setSheetFilters} showFilters={sheet !== "__add"}
            recipes={recipes} allIngredients={allIngredients} onPick={pickFromSheet} onClose={() => setSheet(null)} />
        )}
      </div>
    );
  }

  // ---------- Startpunt en vragen ----------
  const stepBtn = { width: 44, height: 44, borderRadius: 12, border: `1px solid ${BORDER}`, background: PAPER, color: BOTTLE, fontSize: 20, fontWeight: 700, fontFamily: sans, cursor: "pointer" };
  let title = "", sub = "", body = null;

  if (pos === 0) {
    title = "Waar wil je beginnen?";
    sub = "Niet verplicht. Je kunt dit overslaan en meteen de vragen doen.";
    const startOpt = (key, icon, t, s) => (
      <MenuOptionCard key={key} selected={a.start === key} onClick={() => setAnswer({ start: a.start === key ? null : key, ...(key === "verras" && a.start !== key ? { surprise: Math.max(a.surprise, 70), variety: true } : {}) })} icon={icon} title={t} subtitle={s} />
    );
    body = (
      <>
        {startOpt("eigen", <Pencil size={17} />, "Ik heb al cocktails in gedachten", "Kies er een paar, de assistent vult aan")}
        {startOpt("thema", <ListChecks size={17} />, "Bouw rond een thema", "Bijvoorbeeld een gin-avond of een zomerse borrel")}
        {a.start === "thema" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "-2px 0 12px" }}>
            {MA_THEMES.map(t => toggleChip(t.key, t.label, a.theme === t.key, () => setAnswer({ theme: a.theme === t.key ? null : t.key })))}
          </div>
        )}
        {startOpt("smaaktest", <Users size={17} />, "Gebruik de smaaktest", surveyParties.length ? "De antwoorden van je gasten vullen de vragen in" : "Maak eerst een smaaktest aan bij een feest")}
        {a.start === "smaaktest" && surveyParties.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "-2px 0 12px" }}>
            {surveyParties.map(p => toggleChip(p.id, surveyBusy === p.id ? "Bezig…" : p.name, (a.surveyNote || "").startsWith(p.name), () => applySurvey(p)))}
          </div>
        )}
        {a.start === "smaaktest" && a.surveyNote && <p style={{ fontSize: 12.5, color: SAGE, fontWeight: 600, margin: "-4px 0 12px" }}>Ingevuld uit de smaaktest: {a.surveyNote}</p>}
        {startOpt("verras", <Sparkles size={17} />, "Verras me", "Een gevarieerd menu met minder bekende cocktails")}
      </>
    );
  } else if (step === 1) {
    title = "Hoeveel cocktails?";
    sub = "Kies vrij tussen 1 en 10. De alcoholvrije tellen mee.";
    const advice = a.guests <= 6 ? "3 tot 4" : a.guests <= 15 ? "4 tot 6" : "5 tot 7";
    body = (
      <>
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, padding: "0 14px", marginTop: -1 }}>
          <div style={{ marginTop: -1 }}>
            {stepperRow("Cocktails", "tussen 1 en 10", a.count, () => setAnswer({ count: Math.max(1, a.count - 1), alcoholvrijCount: Math.min(a.alcoholvrijCount, Math.max(1, a.count - 1)) }), () => setAnswer({ count: Math.min(10, a.count + 1) }), "cocktails")}
            {stepperRow("Waarvan alcoholvrij", "0 tot 3", a.alcoholvrijCount, () => setAnswer({ alcoholvrijCount: Math.max(0, a.alcoholvrijCount - 1) }), () => setAnswer({ alcoholvrijCount: Math.min(3, a.count, a.alcoholvrijCount + 1) }), "alcoholvrij")}
            {stepperRow("Gasten", "voor de hoeveelheden", a.guests, () => setAnswer({ guests: Math.max(1, a.guests - 1) }), () => setAnswer({ guests: Math.min(100, a.guests + 1) }), "gasten")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, padding: "12px 14px", borderRadius: 12, background: PAPER_DEEP, fontSize: 13.5, lineHeight: 1.45, color: INK }}>
          <Info size={17} color={BRASS} style={{ flexShrink: 0 }} />
          <span>Voor {a.guests} {a.guests === 1 ? "gast" : "gasten"} raden we {advice} cocktails aan. Je schenkt er zo'n {Math.round(a.guests * 2.5)}.</span>
        </div>
      </>
    );
  } else if (step === 2) {
    title = "Wat voor menu wordt het?";
    sub = "Variatie verdeelt het menu over fris, sterk, verrassend en zacht. Liever één richting? Zet het uit en kies zelf.";
    body = (
      <>
        <MenuToggleRow title="Zorg voor variatie" subtitle="Van elke soort iets" checked={a.variety} onChange={v => setAnswer({ variety: v })} />
        {!a.variety && (
          <>
            <div style={{ height: 14 }} />
            {sectionLabel("KIES DE STIJLEN")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {SURVEY_STYLES.map(s => {
                const on = a.styles.includes(s.key);
                return (
                  <button key={s.key} type="button" aria-pressed={on} onClick={() => setAnswer({ styles: on ? a.styles.filter(k => k !== s.key) : [...a.styles, s.key] })} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px 12px", borderRadius: 14,
                    background: CREAM, border: `1.5px solid ${on ? BOTTLE : BORDER}`, fontFamily: sans, cursor: "pointer",
                  }}>
                    <SurveyGlass kind={s.glass} color={on ? "#1F3D36" : "#8A8171"} />
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{s.label}</span>
                    <span style={{ fontSize: 12, color: MUTED }}>{s.example.replace(/^zoals een /, "")}</span>
                  </button>
                );
              })}
            </div>
            {a.styles.length === 0 && <p style={{ fontSize: 12.5, color: MUTED, margin: "10px 0 0" }}>Geen stijl gekozen? Dan zorgt de assistent toch voor variatie.</p>}
          </>
        )}
      </>
    );
  } else if (step === 3) {
    title = "Drank en smaken";
    sub = "Tik één keer voor wel, twee keer voor liever niet. Niets aangetikt is ook goed.";
    const addCustom = () => {
      const t = customDraft.trim().slice(0, 40);
      if (!t) return;
      const key = CUSTOM_PREFIX + t;
      if (!a.prefs.custom.like.includes(key) && !a.prefs.custom.dislike.includes(key)) {
        setAnswer({ prefs: { ...a.prefs, custom: { like: [...a.prefs.custom.like, key], dislike: a.prefs.custom.dislike } } });
      }
      setCustomDraft("");
    };
    const customs = [...a.prefs.custom.like, ...a.prefs.custom.dislike];
    body = (
      <>
        {a.surveyNote && (a.start === "smaaktest" || a.start === "feest") && <p style={{ fontSize: 12.5, color: SAGE, fontWeight: 600, margin: "-8px 0 12px" }}>Ingevuld uit de smaaktest: {a.surveyNote}</p>}
        {sectionLabel("STERKE DRANK")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
          {SURVEY_SPIRITS.map(o => prefChip("spirits", o.key, o.label))}
        </div>
        {sectionLabel("SMAKEN")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {SURVEY_TASTES.map(o => prefChip("tastes", o.key, o.label))}
          {customs.map(k => prefChip("custom", k, k.slice(CUSTOM_PREFIX.length)))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input value={customDraft} onChange={e => setCustomDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Iets anders? Bijv. Calvados of lychee" aria-label="Zelf een drank of smaak toevoegen" maxLength={40} enterKeyHint="done"
            style={{ flex: 1, minWidth: 0, height: 46, boxSizing: "border-box", padding: "0 16px", borderRadius: 100, border: `1px solid ${BORDER}`, background: CREAM, color: INK, fontSize: 16, fontFamily: sans, outline: "none" }} />
          <button type="button" onClick={addCustom} aria-label="Toevoegen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, flexShrink: 0, borderRadius: "50%", border: "none", background: BOTTLE, color: "#FBF6EA", cursor: "pointer" }}><Plus size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, margin: "8px 0 0" }}>De assistent zoekt recepten met wat je toevoegt.</p>
        {a.avoidIds.length > 0 && (
          <p style={{ fontSize: 12.5, color: INK, margin: "12px 0 0" }}>
            Vermeden vanwege allergieën: {[...new Set(a.avoidIds.map(id => nameOf(id).toLowerCase()))].join(", ")}.{" "}
            <button onClick={() => setAnswer({ avoidIds: [] })} style={{ background: "none", border: "none", color: BOTTLE, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: sans, fontSize: 12.5 }}>Wissen</button>
          </p>
        )}
      </>
    );
  } else if (step === 4) {
    title = "Hoe sterk mag het zijn?";
    sub = "Meerdere kiezen mag: dan komt er van elk iets op het menu. Niets gekozen = alles mag.";
    const levels = [["licht", "Licht", "Gin-Tonic", 1], ["middel", "Middel", "Margarita", 2], ["sterk", "Sterk", "Martini", 3]];
    const unknown = Math.round((a.count - a.alcoholvrijCount) * a.surprise / 100);
    body = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 26 }}>
          {levels.map(([k, l, ex, lv]) => {
            const on = a.strengths.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => setAnswer({ strengths: on ? a.strengths.filter(x => x !== k) : [...a.strengths, k] })} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px 12px", borderRadius: 14,
                background: CREAM, border: `1.5px solid ${on ? BOTTLE : BORDER}`, fontFamily: sans, cursor: "pointer", color: INK,
              }}>
                <span style={{ display: "inline-flex", gap: 4 }} aria-hidden="true">{[1, 2, 3].map(n => <span key={n} style={{ width: 7, height: 7, borderRadius: "50%", background: n <= lv ? BRASS : BORDER }} />)}</span>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>{l}</span>
                <span style={{ fontSize: 11.5, color: MUTED }}>{ex}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, color: INK, marginBottom: 6 }}>Bekend of verrassend?</div>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: MUTED, margin: "0 0 12px" }}>Hoeveel van het menu mag onbekend zijn voor je gasten?</p>
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, padding: "14px 14px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: INK, marginBottom: 4 }}><span>Alles bekend</span><span>Alles nieuw</span></div>
          <input type="range" min={0} max={100} step={10} value={a.surprise} onChange={e => setAnswer({ surprise: Number(e.target.value) })} aria-label="Hoeveel van het menu mag onbekend zijn"
            style={{ width: "100%", accentColor: "#1F3D36", minHeight: 36 }} />
          <div style={{ fontSize: 13.5, color: INK, marginTop: 2 }}>Ongeveer {unknown} van de {Math.max(0, a.count - a.alcoholvrijCount)} cocktails {unknown === 1 ? "is" : "zijn"} minder bekend.</div>
        </div>
      </>
    );
  } else if (step === 5) {
    title = "Hoeveel werk mag het zijn?";
    sub = "Op een feest sta je liever niet de hele avond te shaken.";
    const gear = [["shaker", "Shaker"], ["blender", "Blender"], ["crushed", "Crushed ijs"], ["eggs", "Eieren voor schuim"]];
    body = (
      <>
        {segmented([["snel", "Snel"], ["werk", "Mag wat werk"], ["bar", "Achter de bar"]], a.effort, v => setAnswer({ effort: v }), "Moeite")}
        <div style={{ fontSize: 19, fontWeight: 700, color: INK, margin: "22px 0 10px" }}>Wat heb je in huis?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
          {gear.map(([k, l]) => toggleChip(k, l, a.gear[k], () => setAnswer({ gear: { ...a.gear, [k]: !a.gear[k] } })))}
        </div>
        <MenuToggleRow title="Vooraf te maken in een kan" subtitle="Cocktails die je van tevoren mengt en koud zet" checked={a.batch} onChange={v => setAnswer({ batch: v })} />
        <MenuToggleRow title="Geen zelfgemaakte siropen" subtitle="Alleen wat je kant-en-klaar kunt kopen" checked={a.noHomemade} onChange={v => setAnswer({ noHomemade: v })} />
      </>
    );
  } else if (step === 6) {
    title = "Moeten er cocktails op?";
    sub = "Zoveel als je wilt, uit alle recepten. De assistent vult de rest aan.";
    const favs = [...new Set([...favoriteRecipeIds, ...recentRecipeIds])].filter(id => !a.mustHave.includes(id)).map(id => recipes.find(r => r.id === canonicalRecipeId(id))).filter(Boolean).slice(0, 6);
    body = (
      <>
        <RecipePicker recipes={recipes.filter(r => !a.mustHave.includes(r.id))} value={null} listId="menu-assistent-must"
          onChange={id => id && !a.mustHave.includes(id) && setAnswer({ mustHave: [...a.mustHave, id] })} style={{ width: "100%", boxSizing: "border-box" }} />
        {a.mustHave.length > 0 && (
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, padding: "0 4px 0 12px", marginTop: 12 }}>
            {a.mustHave.map((id, i) => {
              const f = factsById.get(id);
              if (!f) return null;
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <RecipeCircle recipe={f.recipe} allIngredients={allIngredients} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: INK }}>{f.recipe.name}</div>
                    <div style={{ fontSize: 12.5, color: f.missingBottles.length ? BURGUNDY : MUTED, marginTop: 1 }}>
                      {f.missingBottles.length ? `${f.missingBottles.length} fles kopen: ${f.missingBottles.map(b => nameOf(b).toLowerCase()).join(", ")}` : f.missing.length ? "Alleen boodschappen" : "Alles in huis"}
                    </div>
                  </div>
                  <button onClick={() => setAnswer({ mustHave: a.mustHave.filter(x => x !== id) })} aria-label={`${f.recipe.name} verwijderen`} style={{ width: 44, height: 44, border: "none", background: "none", color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
                </div>
              );
            })}
          </div>
        )}
        {favs.length > 0 && (
          <>
            <div style={{ height: 16 }} />
            {sectionLabel("SNEL TOEVOEGEN UIT JE FAVORIETEN")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {favs.map(r => (
                <button key={r.id} onClick={() => setAnswer({ mustHave: [...a.mustHave, r.id] })} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 100, background: CREAM, border: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14, color: INK, cursor: "pointer" }}>
                  <Plus size={13} color={BRASS} /> {r.name}
                </button>
              ))}
            </div>
          </>
        )}
      </>
    );
  } else if (step === 7) {
    title = "Wat wil je bijkopen?";
    sub = "Alleen flessen tellen mee. Sap, citroenen en frisdrank zijn gewone boodschappen.";
    const useUpList = showAllUseUp ? ownedBottles : ownedBottles.slice(0, 10);
    body = (
      <>
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, padding: "0 14px", marginBottom: 18 }}>
          <div style={{ marginTop: -1 }}>
            {stepperRow("Maximaal flessen", a.maxBottles >= MA_NO_LIMIT ? "geen grens" : "0 = alleen wat je in huis hebt", a.maxBottles,
              () => setAnswer({ maxBottles: Math.max(0, a.maxBottles - 1) }), () => setAnswer({ maxBottles: Math.min(MA_NO_LIMIT, a.maxBottles + 1) }), "flessen",
              a.maxBottles >= MA_NO_LIMIT ? "geen" : null)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 72, borderTop: `1px solid ${BORDER}` }}>
            <label htmlFor="ma-budget" style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 15.5, fontWeight: 700, color: INK }}>Budget (optioneel)</span>
              <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2 }}>voor de flessen samen</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 4, height: 44, padding: "0 12px", borderRadius: 12, border: `1px solid ${BORDER}`, background: PAPER, width: 100, boxSizing: "border-box" }}>
              <span style={{ fontSize: 16, color: MUTED }}>€</span>
              <input id="ma-budget" value={a.budget} onChange={e => setAnswer({ budget: e.target.value.replace(/[^\d,.]/g, "").slice(0, 5) })} inputMode="decimal" placeholder="geen"
                style={{ width: "100%", border: "none", background: "transparent", fontSize: 17, fontWeight: 700, color: BOTTLE, fontFamily: sans, outline: "none" }} />
            </div>
          </div>
        </div>
        {ownedBottles.length > 0 && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: INK, marginBottom: 4 }}>Flessen om op te maken</div>
            <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 10px" }}>Deze krijgen voorrang op het menu.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 6 }}>
              {useUpList.map(i => toggleChip(i.id, i.name.split(" (")[0], a.useUp.includes(i.id), () => setAnswer({ useUp: a.useUp.includes(i.id) ? a.useUp.filter(x => x !== i.id) : [...a.useUp, i.id] })))}
            </div>
            {ownedBottles.length > 10 && (
              <button onClick={() => setShowAllUseUp(v => !v)} style={{ background: "none", border: "none", color: BOTTLE, fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: 0, minHeight: 40 }}>
                {showAllUseUp ? "Minder tonen" : `Alle ${ownedBottles.length} flessen tonen`}
              </button>
            )}
            <div style={{ height: 12 }} />
          </>
        )}
        {commonMissing.length > 0 && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: INK, marginBottom: 4 }}>Liever niet kopen</div>
            <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 10px" }}>Flessen die je niet hebt en vaak in recepten zitten.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {commonMissing.map(id => {
                const on = a.noBuy.includes(id);
                return (
                  <button key={id} type="button" aria-pressed={on} onClick={() => setAnswer({ noBuy: on ? a.noBuy.filter(x => x !== id) : [...a.noBuy, id] })} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 100, fontFamily: sans, fontSize: 14.5, cursor: "pointer",
                    ...(on ? { background: "transparent", border: `1px dashed ${MUTED}`, color: MUTED } : { background: CREAM, border: `1px solid ${BORDER}`, color: INK }),
                  }}>
                    {on && <X size={13} strokeWidth={2.2} />}<span style={{ textDecoration: on ? "line-through" : "none" }}>{nameOf(id)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  const isLast = pos === MA_QUESTION_COUNT;
  return (
    <div style={{ fontFamily: sans, display: "flex", flexDirection: "column", minHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 154px)", marginBottom: -62 }}>
      {linkedBanner}
      {pos > 0 && (
        <>
          <div style={{ display: "flex", gap: 5, marginBottom: 14 }} aria-hidden>
            {Array.from({ length: MA_QUESTION_COUNT }, (_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < pos ? BOTTLE : BORDER, transition: "background 0.2s ease" }} />
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Vraag {pos} van {MA_QUESTION_COUNT}</div>
        </>
      )}
      <h1 style={{ fontFamily: serif, fontSize: 27, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.2 }}>{title}</h1>
      <p style={{ fontSize: 14, color: MUTED, margin: "6px 0 20px", lineHeight: 1.45 }}>{sub}</p>
      <div key={`${pos}-${step}`} className="tab-fade">{body}</div>

      <div className="menu-assist-footer" style={{
        marginTop: "auto", padding: "18px 0 8px", display: "flex", flexDirection: "column", gap: 4,
        position: "sticky", bottom: "calc(env(safe-area-inset-bottom) + 80px)", zIndex: 5,
        background: `linear-gradient(180deg, transparent 0, ${PAPER} 16px)`,
      }}>
        <div style={{ display: "flex", gap: 10 }}>
          {pos > (linkedParty ? 1 : 0) && (
            <button onClick={() => goTo(pos - 1)} className="press-scale" style={{
              flex: "0 0 32%", minHeight: 52, borderRadius: 14, border: "none", background: PAPER_DEEP, color: INK,
              fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>Terug</button>
          )}
          <button onClick={() => (isLast ? startResult() : goTo(pos + 1))} className="press-scale" style={{
            flex: 1, minHeight: 52, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: "#FBF6EA",
            fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA,
          }}>
            {isLast ? "Stel menu's samen" : "Volgende"}
          </button>
        </div>
        {pos === 0 && (
          <button onClick={() => { setAnswer({ start: null, theme: null }); goTo(1); }} style={{ minHeight: 44, background: "none", border: "none", color: MUTED, fontFamily: sans, fontSize: 14.5, cursor: "pointer" }}>Overslaan, gewoon beginnen</button>
        )}
        {pos > 0 && !isLast && (
          <button onClick={() => goTo(pos + 1)} style={{ minHeight: 44, background: "none", border: "none", color: MUTED, fontFamily: sans, fontSize: 14.5, cursor: "pointer" }}>Overslaan</button>
        )}
      </div>
    </div>
  );
}

export { MenuAssistentTab };
