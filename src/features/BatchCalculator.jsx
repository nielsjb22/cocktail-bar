// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useEffect, useMemo } from "react";
import { canonicalRecipeId } from "../recipes.js";
import { Droplet, Citrus, FlaskRound, CupSoda, Info, Check, ShoppingCart, Share2 } from "lucide-react";
import { isNative as isNativeShell } from "../native";
import { Share } from "@capacitor/share";
import { BORDER, BOTTLE, BOTTLE_DARK, BRASS, BURGUNDY, BatchRecipePicker, CREAM, INK, MUTED, PAPER_DEEP, RecipeCircle, SAGE, SHADOW_CARD, SHADOW_CTA, findIngredientMeta, formatDutchNumber, inferTechniques, ingredientKey, sans, serif, systemFont, unitLabel } from "../ThuisbarApp.jsx";

// ===== Batch-calculator =====
// Vervangt de Schaler: een cocktail groter maken voor een groep (Glazen), in
// een kan voor vandaag (Kan) of vooraf in een fles (Fles), met praktische
// hoeveelheden, voorraadcheck en batch-tips. Glazen ophogen voor jezelf kan
// al in het recept zelf.
const BATCH_BUBBLES = new Set(["tonic", "cola", "ginger_beer", "ginger_ale", "grapefruit_soda", "soda_water", "prosecco", "lemonade", "beer", "stout"]);

const BATCH_DAIRY = new Set(["heavy_cream", "whipped_cream", "milk", "irish_cream", "butter", "egg_yolk", "advocaat", "coconut_cream"]);

const BATCH_EGG = new Set(["egg_white", "egg_yolk"]);

const BATCH_CITRUS = { lemon_juice: { ml: 35, one: "citroen", many: "citroenen" }, lime_juice: { ml: 25, one: "limoen", many: "limoenen" } };

const BATCH_FRESH = new Set(["lemon_juice", "lime_juice", "orange_juice", "grapefruit_juice", "pineapple_juice", "passion_fruit_puree", "peach_puree", "tomato_juice"]);

const BATCH_QUICK = [2, 4, 6, 8, 12, 20];

const BATCH_KAN = [{ ml: 1000, label: "1 L" }, { ml: 1500, label: "1,5 L" }, { ml: 2000, label: "2 L" }];

const BATCH_FLES = [{ ml: 500, label: "50 cl" }, { ml: 700, label: "70 cl" }, { ml: 1000, label: "1 L" }];

// Kanmaat/Flesmaat in woorden, voor stappen en de deeltekst.
function batchVolumeLabel(ml) {
  return ml >= 1000 ? `${String(ml / 1000).replace(".", ",")} L` : `${ml / 10} cl`;
}

// Hele ml, boven de 100 ml op 5 ml.
function roundBatchMl(ml) {
  return ml >= 100 ? Math.round(ml / 5) * 5 : Math.round(ml);
}

function formatBatchAmount(ml, units) {
  if (units === "cl") return `${formatDutchNumber(ml / 10)} cl`;
  if (units === "oz") return `${formatDutchNumber(ml / 29.57)} oz`;
  return `${roundBatchMl(ml)} ml`;
}

function analyzeBatchRecipe(recipe, allIngredients) {
  const rows = recipe.ingredients.map(ing => ({ ing, meta: findIngredientMeta(ing, allIngredients) }));
  const idOf = (r) => r.meta?.id || r.ing.id;
  const techniques = inferTechniques(recipe.method);
  const hasEgg = rows.some(r => BATCH_EGG.has(idOf(r)) && !r.ing.optional);
  const hasEggOptional = rows.some(r => BATCH_EGG.has(idOf(r)));
  const hasDairy = rows.some(r => BATCH_DAIRY.has(idOf(r)));
  const hasBubbles = rows.some(r => BATCH_BUBBLES.has(idOf(r)));
  const hasFresh = rows.some(r => BATCH_FRESH.has(idOf(r)));
  const hot = recipe.family === "Warme dranken" || rows.some(r => ["hot_water", "hot_coffee", "espresso", "hot_chocolate", "black_tea"].includes(idOf(r)));
  const stirred = (techniques.includes("stirred") || ["Spirit-forward", "Stirred-down"].includes(recipe.family)) && !techniques.includes("shaken");
  const shaken = techniques.includes("shaken");
  // Waarom (niet) in een kan/fles — null = het kan.
  const blockReason = hasEgg || hasDairy
    ? "Deze cocktail kun je beter per glas shaken: ei en room horen niet in een batch."
    : hasBubbles
      ? "Deze cocktail maak je beter per glas: bubbels worden plat in een kan of fles."
      : hot ? "Een warme cocktail maak je beter per glas." : null;
  const kanBlock = blockReason;
  const flesBlock = blockReason || (hasFresh ? "Vers sap blijft maar ± 4 uur goed, dus niet vooraf in een fles. Een kan voor vandaag kan wel." : null);
  return { rows, idOf, techniques, hasEgg, hasEggOptional, hasBubbles, hasFresh, stirred, shaken, kanBlock, flesBlock };
}

function BatchCalculatorTab({ recipes, ingredientLabel, allIngredients, isOwned, voorraadAantal = {}, recentRecipeIds = [], favoriteRecipeIds = [],
  shoppingKeys, onAddToShoppingList, onSound, request }) {
  const [recipeId, setRecipeId] = useState(() => request?.id || recentRecipeIds[0] || recipes[0]?.id);
  const [mode, setMode] = useState("glazen");
  const [glasses, setGlasses] = useState(8);
  const [kanMl, setKanMl] = useState(1500);
  const [flesMl, setFlesMl] = useState(700);
  const [units, setUnits] = useState("ml");
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState(false);
  const [shareState, setShareState] = useState(null);

  // "Maak een batch" vanuit een recept: die cocktail meteen gekozen.
  useEffect(() => {
    if (request?.id) { setRecipeId(request.id); setMode("glazen"); window.scrollTo({ top: 0 }); }
  }, [request?.nonce]);
  useEffect(() => { setAdded(false); }, [recipeId, mode, glasses, kanMl, flesMl]);

  const recipe = recipes.find(r => r.id === canonicalRecipeId(recipeId)) || recipes[0];
  const info = useMemo(() => recipe ? analyzeBatchRecipe(recipe, allIngredients) : null, [recipe, allIngredients]);
  if (!recipe || !info) return <p style={{ color: MUTED }}>Nog geen recepten.</p>;

  const blocked = mode === "kan" ? info.kanBlock : mode === "fles" ? info.flesBlock : null;
  const volume = mode === "kan" ? kanMl : flesMl;
  const technique = info.stirred ? "geroerd" : info.shaken ? "geschud" : info.techniques.includes("build") ? "gebouwd" : null;

  // ---- Hoeveelheden ----
  // Glazen: recept × N. Kan/Fles: zo geschaald dat alles (incl. water bij
  // geroerde cocktails, ± 20% verdunning) precies in de kan/fles past.
  const mlRows = info.rows.filter(r => r.ing.unit === "ml" && !r.ing.optional);
  const baseMl = mlRows.reduce((s, r) => s + r.ing.amount, 0) || 1;
  const dilution = mode !== "glazen" && info.stirred ? 0.2 : 0;
  const scale = mode === "glazen" ? glasses : volume / (baseMl * (1 + dilution));
  const servings = mode === "glazen" ? glasses : Math.max(1, Math.round(volume / (baseMl * (1 + dilution))));
  // Per glas schenk je gewoon één portie van het recept (incl. verdunning).
  const pourMl = mode === "glazen" ? null : roundBatchMl(baseMl * (1 + dilution));

  const lines = info.rows
    .filter(r => mode === "glazen" || (!BATCH_EGG.has(info.idOf(r)) && !r.ing.optional))
    .map(r => {
      const id = info.idOf(r);
      const isEgg = BATCH_EGG.has(id);
      const amount = isEgg ? (mode === "glazen" ? glasses : servings) * r.ing.amount : r.ing.amount * scale;
      const owned = isOwned(r.ing);
      const bottleMl = r.meta?.bottleMl || (r.meta && !r.meta.unitPrice ? 700 : null);
      let status, enough, shortMl = 0, practical = null;
      if (isEgg) {
        status = mode === "glazen" ? "Niet in de batch" : "Niet in de batch";
        enough = owned;
      } else if (!owned) {
        status = "Niet op voorraad"; enough = false;
      } else if (r.ing.unit === "ml" && bottleMl && r.meta?.cat !== "Vers") {
        const count = voorraadAantal[id] ?? 1;
        const have = count * bottleMl;
        const countLabel = `${formatDutchNumber(count)} ${count === 1 ? "fles" : "flessen"}`;
        if (have >= amount) { status = `Je hebt ${countLabel} · genoeg`; enough = true; }
        else { shortMl = amount - have; status = `Je hebt ${countLabel} · ${roundBatchMl(shortMl)} ml tekort`; enough = false; }
      } else {
        status = "Op voorraad"; enough = true;
      }
      if (isEgg) practical = mode === "glazen" ? "per glas" : null;
      else if (BATCH_CITRUS[id] && r.ing.unit === "ml") {
        const c = BATCH_CITRUS[id]; const n = Math.max(1, Math.ceil(amount / c.ml));
        practical = `≈ ${n} ${n === 1 ? c.one : c.many}`;
      } else if (id === "sugar_syrup" || id === "honey_syrup") practical = "of zelf maken";
      else if (r.ing.unit === "ml" && bottleMl && r.meta?.cat !== "Vers") {
        const bottles = amount / bottleMl;
        if (bottles >= 0.4) { const b = Math.max(0.5, Math.round(bottles * 2) / 2); practical = `≈ ${formatDutchNumber(b)} ${b <= 1 ? "fles" : "flessen"}`; }
      }
      let amountLabel;
      if (r.ing.unit === "ml") amountLabel = formatBatchAmount(amount, units);
      else { const n = r.ing.unit === "dash" ? Math.round(amount) : Math.ceil(amount); amountLabel = `${n} ${unitLabel(r.ing.unit, n)}`; }
      return { r, id, label: ingredientLabel(r.ing) + (r.ing.optional ? " (optioneel)" : ""), status, enough, practical, amount, amountLabel, isEgg };
    });
  const waterMl = dilution > 0 ? volume - lines.filter(l => l.r.ing.unit === "ml").reduce((s, l) => s + roundBatchMl(l.amount), 0) : 0;

  const missing = lines.filter(l => !l.enough && !(l.r.ing.optional));
  const allOnList = missing.length > 0 && missing.every(l => shoppingKeys?.has(ingredientKey(l.r.ing)));
  const addMissing = () => {
    onAddToShoppingList(missing.map(l => ({ ref: l.r.ing, recipeNames: [recipe.name] })));
    onSound?.("tick");
    setAdded(true);
  };

  // ---- Tips / stappen ----
  const syrup = lines.find(l => l.id === "sugar_syrup" || l.id === "honey_syrup");
  const tips = [
    info.hasEggOptional && { icon: Droplet, strong: "Eiwit niet in de batch.", text: "Meng de rest vooraf en shake per glas met één eiwit." },
    info.hasFresh && { icon: Citrus, strong: "Vers sap", text: "blijft ± 4 uur goed. Pers het op de dag zelf." },
    syrup && (() => { const half = Math.max(5, Math.round(syrup.amount / 2 / 5) * 5); return syrup.id === "honey_syrup"
      ? { icon: FlaskRound, strong: "Honingsiroop zelf maken:", text: `${half} g honing + ${half} ml warm water, roeren tot het is opgelost.` }
      : { icon: FlaskRound, strong: "Suikersiroop zelf maken:", text: `${half} g suiker + ${half} ml heet water, roeren tot het is opgelost.` }; })(),
    info.hasBubbles && { icon: CupSoda, strong: "Bubbels pas bij het inschenken.", text: "Meng de rest vooraf en vul elk glas pas op het laatst aan." },
  ].filter(Boolean);
  const glass = (recipe.glass || "glas").split("(")[0].trim().toLowerCase();
  const steps = mode === "glazen" ? [] : [
    `Giet alles${waterMl > 0 ? ", inclusief het water," : ""} in ${mode === "fles" ? `een schone fles van ${batchVolumeLabel(volume)}` : `een kan van ${batchVolumeLabel(volume)}`}.`,
    mode === "fles"
      ? "Minimaal 2 uur in de vriezer of koelkast. Goed afgesloten houdbaar tot ± 3 maanden."
      : info.hasFresh ? "Zet de kan minimaal 1 uur in de koelkast en schenk binnen ± 4 uur (vers sap)." : "Zet de kan minimaal 1 uur in de koelkast.",
    info.stirred || !info.shaken
      ? `Schenk ${pourMl} ml per glas over ijs in een ${glass}${recipe.garnish ? ` en werk af: ${recipe.garnish.charAt(0).toLowerCase()}${recipe.garnish.slice(1)}` : "."}`
      : `Schud per glas ${pourMl} ml kort met ijs en zeef in een ${glass}${recipe.garnish ? `. Afwerking: ${recipe.garnish.charAt(0).toLowerCase()}${recipe.garnish.slice(1)}` : "."}`,
  ];

  const share = async () => {
    onSound?.("share");
    const head = mode === "glazen" ? `${recipe.name} voor ${glasses} glazen` : `${recipe.name}, ${mode === "fles" ? "fles" : "kan"} van ${batchVolumeLabel(volume)} (± ${servings} glazen van ${pourMl} ml)`;
    const text = [
      `Batchkaart: ${head}`, "",
      ...lines.map(l => `• ${l.label}: ${l.amountLabel}${l.isEgg ? " (per glas, niet in de batch)" : ""}`),
      waterMl > 0 ? `• Water: ${formatBatchAmount(waterMl, units)} (verdunning, vervangt het roeren)` : null,
      "",
      ...(mode === "glazen" ? tips.map(t => `– ${t.strong} ${t.text}`) : steps.map((s, i) => `${i + 1}. ${s}`)),
      "", "Gemaakt met Mijn Thuisbar",
    ].filter(x => x !== null).join("\n");
    let result;
    try {
      if (isNativeShell) { await Share.share({ title: `Batchkaart ${recipe.name}`, text, dialogTitle: "Deel batchkaart" }); result = "shared"; }
      else if (navigator.share) { await navigator.share({ title: `Batchkaart ${recipe.name}`, text }); result = "shared"; }
      else { await navigator.clipboard.writeText(text); result = "copied"; }
    } catch (e) { result = /cancel|abort/i.test(`${e?.name} ${e?.message}`) ? "cancelled" : "failed"; }
    if (result === "cancelled") return;
    setShareState(result);
    setTimeout(() => setShareState(null), 2500);
  };

  // ---- Weergave ----
  const card = { background: CREAM, border: "none", borderRadius: 16, boxShadow: SHADOW_CARD };
  const seg = (active) => ({
    flex: 1, minHeight: 40, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: sans, fontSize: 14.5, fontWeight: 700,
    background: active ? CREAM : "transparent", color: active ? INK : MUTED, boxShadow: active ? "0 1px 4px rgba(43,38,32,0.14)" : "none",
  });
  const pill = (active, dark) => ({
    minWidth: 44, minHeight: 44, padding: "0 14px", borderRadius: 100, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700,
    background: active ? (dark ? "#FBF6EA" : BOTTLE) : (dark ? "rgba(245,239,230,0.14)" : PAPER_DEEP), color: active ? (dark ? "#132622" : "#FBF6EA") : (dark ? "#F3ECDD" : INK),
  });
  const bigRound = (filled) => ({
    width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 24, fontWeight: 600, fontFamily: sans,
    display: "flex", alignItems: "center", justifyContent: "center", background: filled ? BOTTLE : PAPER_DEEP, color: filled ? "#FBF6EA" : INK,
  });
  const heading = (text, right) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "22px 0 10px" }}>
      <div style={{ fontFamily: systemFont, fontSize: 20, fontWeight: 700, color: INK }}>{text}</div>
      {right}
    </div>
  );

  return (
    <div style={{ fontFamily: sans }}>
      {/* Gekozen cocktail */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: 10 }}>
        <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={60} radius={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{recipe.name}</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{[recipe.family, (recipe.glass || "").split("(")[0].trim(), technique].filter(Boolean).join(" · ")}</div>
        </div>
        <button onClick={() => setPicking(true)} className="press-scale" style={{ minHeight: 44, padding: "0 16px", borderRadius: 100, border: "none", background: PAPER_DEEP, color: INK, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Wijzig</button>
      </div>

      {/* Glazen · Kan · Fles */}
      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 13, margin: "14px 0" }}>
        {[["glazen", "Glazen"], ["kan", "Kan"], ["fles", "Fles"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} style={seg(mode === k)}>{l}</button>
        ))}
      </div>

      {mode === "glazen" && (
        <div style={{ ...card, padding: "16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28 }}>
            <button aria-label="Minder glazen" onClick={() => setGlasses(Math.max(1, glasses - 1))} style={bigRound(false)}>−</button>
            <div style={{ textAlign: "center", minWidth: 64 }}>
              <div style={{ fontFamily: serif, fontSize: 44, fontWeight: 700, color: INK, lineHeight: 1 }}>{glasses}</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{glasses === 1 ? "glas" : "glazen"}</div>
            </div>
            <button aria-label="Meer glazen" onClick={() => setGlasses(Math.min(200, glasses + 1))} style={bigRound(true)}>+</button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {BATCH_QUICK.map(n => <button key={n} onClick={() => setGlasses(n)} aria-pressed={glasses === n} style={pill(glasses === n)}>{n}</button>)}
          </div>
        </div>
      )}

      {mode !== "glazen" && blocked && (
        <div style={{ ...card, padding: "16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: PAPER_DEEP, color: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Info size={17} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, color: INK, lineHeight: 1.5 }}>{blocked}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={() => setMode("glazen")} style={{ ...pill(true), minHeight: 44 }}>Reken per glas</button>
              {mode === "fles" && !info.kanBlock && <button onClick={() => setMode("kan")} style={pill(false)}>Maak een kan</button>}
            </div>
          </div>
        </div>
      )}

      {mode !== "glazen" && !blocked && (
        <div style={{ borderRadius: 16, padding: "16px 16px", background: "#1F3A33", color: "#F3ECDD", display: "flex", gap: 14, alignItems: "center", boxShadow: SHADOW_CARD }}>
          <svg width="40" height="64" viewBox="0 0 40 64" aria-hidden style={{ flexShrink: 0 }}>
            {mode === "fles" ? (
              <path d="M15 2h10v12c0 3 9 6 9 16v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V30c0-10 9-13 9-16z" fill="none" stroke="#D8B06A" strokeWidth="2.2" strokeLinejoin="round" />
            ) : (
              <path d="M6 8h24l-2 6c4 2 8 6 8 14s-4 10-8 12v18a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z M30 20c3 1 5 4 5 8s-2 7-5 8" fill="none" stroke="#D8B06A" strokeWidth="2.2" strokeLinejoin="round" />
            )}
            <path d={mode === "fles" ? "M7 36h26v22a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" : "M7 30h21v28a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"} fill="#B8862E" opacity="0.55" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: "#D8B06A" }}>{mode === "fles" ? "Fles vullen" : "Kan vullen"}</div>
            <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
              {(mode === "fles" ? BATCH_FLES : BATCH_KAN).map(o => {
                const active = (mode === "fles" ? flesMl : kanMl) === o.ml;
                return <button key={o.ml} aria-pressed={active} onClick={() => (mode === "fles" ? setFlesMl(o.ml) : setKanMl(o.ml))} style={pill(active, true)}>{o.label}</button>;
              })}
            </div>
            <div style={{ fontSize: 13.5, color: "#F3ECDD" }}>Goed voor <strong>± {servings} glazen</strong> van {pourMl} ml</div>
          </div>
        </div>
      )}

      {!blocked && (
        <>
          {heading(mode === "fles" ? "In de fles" : mode === "kan" ? "In de kan" : "Wat heb je nodig", (
            <div role="radiogroup" aria-label="Eenheid" style={{ display: "flex", gap: 2, padding: 3, background: PAPER_DEEP, borderRadius: 100 }}>
              {["ml", "cl", "oz"].map(u => (
                <button key={u} role="radio" aria-checked={units === u} onClick={() => setUnits(u)} style={{
                  minWidth: 44, minHeight: 36, borderRadius: 100, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 700,
                  background: units === u ? CREAM : "transparent", color: units === u ? INK : MUTED, boxShadow: units === u ? "0 1px 3px rgba(43,38,32,0.14)" : "none",
                }}>{u}</button>
              ))}
            </div>
          ))}
          <div style={{ ...card, overflow: "hidden" }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px" }}>
                <span aria-label={l.enough ? "Genoeg in huis" : "Niet genoeg in huis"} style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
                  background: l.enough ? SAGE : "transparent", border: l.enough ? "none" : `1.5px solid ${BURGUNDY}`,
                }}>{l.enough && <Check size={13} strokeWidth={3} color={CREAM} />}</span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, minHeight: 36 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{l.label}</div>
                    <div style={{ fontSize: 12.5, marginTop: 1, color: l.enough || l.isEgg ? MUTED : BURGUNDY }}>{l.status}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>{l.amountLabel}</div>
                    {l.practical && <div style={{ fontSize: 12, color: MUTED, marginTop: 1, whiteSpace: "nowrap" }}>{l.practical}</div>}
                  </div>
                </div>
              </div>
            ))}
            {waterMl > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px" }}>
                <span aria-hidden style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: BOTTLE, color: CREAM, display: "flex", alignItems: "center", justifyContent: "center" }}><Droplet size={12} /></span>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>Water</div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>Verdunning (± 20%), vervangt het roeren</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>{formatBatchAmount(waterMl, units)}</div>
                </div>
              </div>
            )}
          </div>

          {missing.length > 0 && (
            added || allOnList ? (
              <div className={added ? "success-pop" : undefined} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 52, color: SAGE, fontSize: 14.5, fontWeight: 700, marginTop: 10 }}>
                <Check size={16} strokeWidth={3} /> Op je boodschappenlijst
              </div>
            ) : (
              <button onClick={addMissing} className="press-scale" style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, marginTop: 10, borderRadius: 14, border: "none",
                background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA,
              }}>
                <ShoppingCart size={17} /> {missing.length === 1 ? `${missing[0].label.replace(" (optioneel)", "")} op boodschappenlijst` : "Zet ontbrekende op boodschappenlijst"}
              </button>
            )
          )}

          {mode === "glazen" && tips.length > 0 && (
            <>
              {heading("Tips voor deze batch")}
              <div style={{ ...card, padding: "2px 14px" }}>
                {tips.map((t, i) => {
                  const Icon = t.icon;
                  return (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
                      <span style={{ width: 30, height: 30, borderRadius: "50%", background: PAPER_DEEP, color: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} /></span>
                      <div style={{ fontSize: 14, color: INK, lineHeight: 1.5 }}><strong>{t.strong}</strong> {t.text}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {mode !== "glazen" && (
            <>
              {heading("Zo maak je het")}
              <div style={{ ...card, padding: "2px 14px" }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${BRASS}`, color: BRASS, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box" }}>{i + 1}</span>
                    <div style={{ fontSize: 14, color: INK, lineHeight: 1.5 }}>{s}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <button onClick={share} className="press-scale" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, marginTop: 18, borderRadius: 14, border: "none",
            background: "rgba(184,134,46,0.18)", color: INK, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}>
            <Share2 size={17} color={BRASS} /> {shareState === "copied" ? "Gekopieerd" : shareState === "shared" ? "Gedeeld" : shareState === "failed" ? "Delen lukte niet" : "Deel batchkaart"}
          </button>
        </>
      )}

      {picking && (
        <BatchRecipePicker recipes={recipes} allIngredients={allIngredients} recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds}
          currentId={recipe.id} onPick={(id) => { setRecipeId(id); onSound?.("pop"); }} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

export { BatchCalculatorTab };
