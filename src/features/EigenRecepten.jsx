// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useRef, useContext, useEffect } from "react";
import { squareJpegDataUrl } from "../checkinPhotos.js";
import { Layers, ChevronRight, Camera, Plus, X, BookOpen, Pencil, ChevronDown, Search, Check } from "lucide-react";
import { hapticFor } from "../native";
import { createPortal } from "react-dom";
import { AutoGrowTextField, BORDER, BOTTLE, BOTTLE_DARK, BRASS, BRASS_TEXT, BURGUNDY, BatchRecipePicker, CREAM, CUSTOM_CAT, GlassArt, INK, ItemArt, MUTED, NavOverrideContext, PAPER, PAPER_DEEP, RecipeCircle, RecipeSheet, SAGE, SHADOW_CARD, SheetGrabber, SwipeToDelete, findIngredientMeta, inferTechniques, ingredientKey, normalizeGlass, sans, serif, splitMethodIntoSteps, useBodyScrollLock, useSheetDismiss } from "../ThuisbarApp.jsx";

// ===== Eigen recepten: nieuw recept =====
// Ingrediënten, stijl en glas worden gekozen uit wat de app kent (i.p.v.
// vrij getypt), zodat een eigen recept altijd meetelt bij "Wat kan ik
// maken", de voorraad en de boodschappenlijst.
const EIGEN_FAMILIES = [
  { value: "Sours", label: "Sours" }, { value: "Highballs", label: "Highballs" },
  { value: "Stirred-down", label: "Stirred-down" }, { value: "Spirit-forward", label: "Spirit-forward" },
  { value: "Fizz / Flip", label: "Fizz / Flip" }, { value: "Modern / Tiki", label: "Tiki" },
  { value: "Moderne klassiekers", label: "Moderne klassiekers" }, { value: "Zuivel & dessert", label: "Dessert" },
  { value: "Warme dranken", label: "Warm" }, { value: "Mocktail / alcoholvrij", label: "Alcoholvrij" },
];

const EIGEN_GLASSES = ["Coupe", "Rocks", "Highball", "Champagneflute", "Wijnglas", "Hurricane", "Koperen beker", "Glazen mok", "Julep beker"];

const EIGEN_GLASS_LABELS = { Champagneflute: "Flute", Wijnglas: "Wijn", "Koperen beker": "Koper", "Glazen mok": "Mok", "Julep beker": "Julep" };

const EIGEN_TECHNIQUES = [
  { key: "geschud", label: "Geschud", steps: (g) => ["Doe alles met ijs in de shaker.", "Shake stevig, ± 12 seconden.", `Zeef in een ${g}.`] },
  { key: "geroerd", label: "Geroerd", steps: (g) => ["Doe alles met ijs in een mengglas.", "Roer rustig 20 tot 30 seconden, tot het goed koud is.", `Zeef in een ${g}.`] },
  { key: "gebouwd", label: "Gebouwd", steps: () => ["Vul het glas met ijs.", "Schenk de ingrediënten in volgorde in het glas.", "Roer kort door."] },
  { key: "geblend", label: "Geblend", steps: (g) => ["Doe alles met een schep crushed ijs in de blender.", "Blend ± 20 seconden tot het glad is.", `Schenk in een ${g}.`] },
];

const EIGEN_GARNISHES = ["Limoenschijfje", "Citroenzeste", "Sinaasappelzeste", "Cocktailkers", "Takje munt", "Olijf"];

const EIGEN_UNITS = [{ key: "ml", label: "ml" }, { key: "dash", label: "dash" }, { key: "stuk", label: "stuk" }, { key: "top", label: "top op" }];

const EIGEN_NEW_CATS = [
  { cat: "Sterke drank", label: "Sterke drank" }, { cat: "Likeuren & versterkte wijnen", label: "Likeur" }, { cat: "Mixers", label: "Mixer" },
  { cat: "Vers", label: "Siroop / vers" }, { cat: "Bitters", label: "Bitters" }, { cat: "Zuivel & room", label: "Zuivel" },
];

const TOP_OP_ML = 60;

// "top op": voor berekeningen ± 60 ml

// Hoe het glas in de laatste stap heet ("Zeef in een gekoelde coupe.").
const EIGEN_GLASS_PHRASES = {
  Coupe: "gekoelde coupe", Rocks: "rocksglas met ijs", Highball: "highballglas met ijs", Champagneflute: "gekoelde flute",
  Wijnglas: "wijnglas met ijs", Hurricane: "hurricaneglas met crushed ijs", "Koperen beker": "koperen beker met ijs",
  "Glazen mok": "glazen mok", "Julep beker": "julepbeker met crushed ijs",
};

function glassWord(glass) { return EIGEN_GLASS_PHRASES[glass] || "gekoeld glas"; }

function techniqueFromMethod(method) {
  const t = inferTechniques(method);
  if (t.includes("blend")) return "geblend";
  if (t.includes("stirred") && !t.includes("shaken")) return "geroerd";
  if (t.includes("build") && !t.includes("shaken")) return "gebouwd";
  return "geschud";
}

function IngredientPickerSheet({ allIngredients, isOwned, onPick, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(null); // { id } | { newName }
  const [newCat, setNewCat] = useState(null);
  const [amount, setAmount] = useState({ amount: 15, unit: "ml" });
  const [custom, setCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const q = query.trim().toLowerCase();
  const results = q ? allIngredients.filter(i => i.name.toLowerCase().includes(q)).slice(0, 12) : [];
  const exact = q && allIngredients.some(i => i.name.toLowerCase() === q);
  const quick = [
    { amount: 10, unit: "ml", label: "10 ml" }, { amount: 15, unit: "ml", label: "15 ml" }, { amount: 22.5, unit: "ml", label: "22,5 ml" },
    { amount: 30, unit: "ml", label: "30 ml" }, { amount: 45, unit: "ml", label: "45 ml" }, { amount: 1, unit: "dash", label: "dash" }, { amount: TOP_OP_ML, unit: "top", label: "top op" },
  ];
  const ready = chosen && (chosen.id || (chosen.newName && newCat)) && (!custom || parseFloat(customAmount.replace(",", ".")) > 0);
  const submit = () => {
    if (!ready) return;
    const amt = custom ? { amount: parseFloat(customAmount.replace(",", ".")), unit: "ml" } : amount;
    onPick({ ...(chosen.id ? { id: chosen.id } : { newName: chosen.newName, newCat }), ...amt });
    close();
  };
  const chip = (on) => ({ minHeight: 40, padding: "0 14px", borderRadius: 100, cursor: "pointer", fontFamily: sans, fontSize: 13.5, fontWeight: 600, border: `1px solid ${on ? BOTTLE : PAPER_DEEP}`, background: on ? BOTTLE : PAPER_DEEP, color: on ? "#FBF6EA" : INK });
  const head = (t) => <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: MUTED, margin: "16px 0 8px" }}>{t}</div>;

  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in sheet-max-92" style={{ position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", height: "88vh", background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 20px 10px", touchAction: "none" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Ingrediënt kiezen</div>
          <button onClick={close} onTouchStart={e => e.stopPropagation()} style={{ minHeight: 44, background: "none", border: "none", color: BOTTLE, fontFamily: sans, fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "0 0 0 10px" }}>Annuleer</button>
        </div>
        <div data-kb-scope style={{ padding: "0 20px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: PAPER_DEEP, borderRadius: 12, padding: "0 12px" }}>
            <Search size={16} color={MUTED} />
            <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setChosen(null); }} placeholder="Zoek een ingrediënt" aria-label="Zoek een ingrediënt" autoCorrect="off"
              style={{ flex: 1, minHeight: 44, border: "none", outline: "none", background: "transparent", fontFamily: sans, fontSize: 16, color: INK }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 20px 16px", WebkitOverflowScrolling: "touch" }}>
          {results.length > 0 && (<>
            {head("Uit de app")}
            <div role="radiogroup" style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, overflow: "hidden" }}>
              {results.map((ing, i) => {
                const on = chosen?.id === ing.id;
                return (
                  <button key={ing.id} role="radio" aria-checked={on} onClick={() => setChosen({ id: ing.id })} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: "6px 14px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, background: on ? "rgba(92,122,82,0.14)" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, overflow: "hidden", flexShrink: 0 }}><ItemArt ing={ing} /></div>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{ing.name}</span>
                      <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{ing.cat === CUSTOM_CAT ? "Eigen ingrediënt" : ing.cat} · {isOwned({ id: ing.id }) ? "in huis" : "niet in huis"}</span>
                    </span>
                    {on && <Check size={17} color={SAGE} strokeWidth={2.6} />}
                  </button>
                );
              })}
            </div>
          </>)}
          {q && !exact && (<>
            {head("Niet gevonden?")}
            <div style={{ background: CREAM, border: `1.5px solid ${chosen?.newName ? BRASS : BORDER}`, borderRadius: 14, padding: "4px 14px 14px" }}>
              <button onClick={() => setChosen({ newName: query.trim() })} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, color: INK, textAlign: "left" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: BOTTLE, color: "#FBF6EA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Plus size={15} /></span>
                <span style={{ fontSize: 14.5 }}>Nieuw ingrediënt: <strong>{query.trim()}</strong></span>
              </button>
              {chosen?.newName && (<>
                <div style={{ fontSize: 12.5, color: MUTED, margin: "2px 0 8px" }}>In welke categorie hoort het?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {EIGEN_NEW_CATS.map(c => <button key={c.cat} onClick={() => setNewCat(c.cat)} aria-pressed={newCat === c.cat} style={chip(newCat === c.cat)}>{newCat === c.cat ? "✓ " : ""}{c.label}</button>)}
                </div>
              </>)}
            </div>
          </>)}
          {head("Hoeveelheid")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {quick.map(o => {
              const on = !custom && amount.amount === o.amount && amount.unit === o.unit;
              return <button key={o.label} onClick={() => { setCustom(false); setAmount({ amount: o.amount, unit: o.unit }); }} aria-pressed={on} style={chip(on)}>{o.label}</button>;
            })}
            <button onClick={() => setCustom(true)} aria-pressed={custom} style={{ ...chip(custom), color: custom ? "#FBF6EA" : BRASS }}>Anders…</button>
          </div>
          {custom && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <input value={customAmount} onChange={e => setCustomAmount(e.target.value)} inputMode="decimal" placeholder="Bijv. 20" aria-label="Hoeveelheid in ml"
                style={{ width: 110, minHeight: 44, borderRadius: 12, border: `1px solid ${BORDER}`, background: CREAM, padding: "0 12px", fontFamily: sans, fontSize: 16, color: INK }} />
              <span style={{ fontSize: 14, color: MUTED }}>ml</span>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px calc(env(safe-area-inset-bottom) + 14px)", borderTop: `1px solid ${BORDER}` }}>
          <button onClick={submit} disabled={!ready} className="press-scale" style={{ width: "100%", minHeight: 52, borderRadius: 14, border: "none", background: ready ? BOTTLE_DARK : BORDER, color: ready ? "#FBF6EA" : MUTED, fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: ready ? "pointer" : "default" }}>Voeg toe aan recept</button>
        </div>
      </div>
    </div>
  ), document.body);
}

// Eén ingrediëntregel: veeg naar links = verwijderen, lang indrukken = verslepen.
function EigenIngredientRow({ row, index, count, meta, owned, onChange, onRemove, onMove, dragState, setDragState }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = null, startY = 0, active = false, rowH = 56;
    const start = (e) => {
      if (e.target.closest("input,select,button")) return;
      startY = e.touches[0].clientY; rowH = el.offsetHeight || 56;
      timer = setTimeout(() => { active = true; hapticFor("tick"); setDragState({ index, dy: 0 }); }, 450);
    };
    const move = (e) => {
      const dy = e.touches[0].clientY - startY;
      if (!active) { if (Math.abs(dy) > 8) clearTimeout(timer); return; }
      e.preventDefault(); e.stopPropagation();
      setDragState({ index, dy });
    };
    const end = (e) => {
      clearTimeout(timer);
      if (!active) return;
      active = false;
      e.stopPropagation();
      const dy = (e.changedTouches?.[0]?.clientY ?? startY) - startY;
      const to = Math.max(0, Math.min(count - 1, index + Math.round(dy / rowH)));
      setDragState(null);
      if (to !== index) onMove(index, to);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => { clearTimeout(timer); el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end); };
  }, [index, count]);
  const dragging = dragState?.index === index;
  const name = meta?.name || row.newName || row.name || "?";
  const isNew = !!row.newName;
  const amountText = row.unit === "top" ? "" : (row.amount === "" || row.amount == null ? "" : String(row.amount).replace(".", ","));
  const content = (
    <div ref={ref} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: CREAM,
      transform: dragging ? `translateY(${dragState.dy}px) scale(1.02)` : "none", boxShadow: dragging ? "0 8px 20px rgba(43,38,32,0.2)" : "none",
      position: "relative", zIndex: dragging ? 2 : 0, transition: dragging ? "none" : "transform 0.15s ease",
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, overflow: "hidden", flexShrink: 0 }}>
        {meta ? <ItemArt ing={meta} /> : <div style={{ width: "100%", height: "100%", background: "rgba(184,134,46,0.18)", color: BRASS, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{name[0]?.toUpperCase()}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 1 }}>
          {isNew ? <span style={{ color: BRASS_TEXT, fontWeight: 600 }}>Nieuw ingrediënt · {EIGEN_NEW_CATS.find(c => c.cat === row.newCat)?.label || row.newCat}</span>
            : owned ? <span style={{ color: SAGE, fontWeight: 600 }}>✓ in huis</span> : <span style={{ color: MUTED }}>niet in huis</span>}
          <button onClick={() => onChange({ optional: !row.optional })} aria-pressed={!!row.optional} style={{ minHeight: 26, padding: "0 8px", borderRadius: 100, border: `1px solid ${row.optional ? BRASS : BORDER}`, background: row.optional ? "rgba(184,134,46,0.16)" : "transparent", color: row.optional ? BRASS_TEXT : MUTED, fontFamily: sans, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>optioneel</button>
        </div>
      </div>
      {row.unit !== "top" && (
        <input value={amountText} onChange={e => onChange({ amount: e.target.value.replace(",", ".") })} inputMode="decimal" aria-label={`Hoeveelheid ${name}`}
          style={{ width: 52, minHeight: 40, borderRadius: 10, border: "none", background: PAPER_DEEP, textAlign: "center", fontFamily: sans, fontSize: 16, fontWeight: 700, color: INK, padding: 0 }} />
      )}
      <label style={{ position: "relative", display: "flex", alignItems: "center", gap: 2, minHeight: 40, padding: "0 10px", borderRadius: 10, background: PAPER_DEEP, fontSize: 13, color: MUTED, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
        {EIGEN_UNITS.find(u => u.key === row.unit)?.label || row.unit} <ChevronDown size={13} />
        <select value={row.unit} aria-label={`Eenheid ${name}`} onChange={e => onChange({ unit: e.target.value, ...(e.target.value === "top" ? { amount: TOP_OP_ML } : {}) })} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", fontSize: 16 }}>
          {EIGEN_UNITS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
        </select>
      </label>
    </div>
  );
  return <SwipeToDelete onDelete={onRemove}>{content}</SwipeToDelete>;
}

function EigenRecepten({ customRecipes, allIngredients, recipes, isOwned, recentRecipeIds = [], favoriteRecipeIds = [], onSaveRecipe, onRemoveRecipe, onAddToShoppingList, shoppingKeys, onOpenRecipe, onSound }) {
  const blank = { name: "", family: "", glass: "", rows: [], technique: "geschud", steps: null, garnishes: [], photo: null, editingId: null };
  const [form, setForm] = useState(blank);
  const [picker, setPicker] = useState(false);
  const [fromExisting, setFromExisting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(null);
  const [customGarnish, setCustomGarnish] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const metaOf = (row) => row.id ? allIngredients.find(i => i.id === row.id) : row.name ? allIngredients.find(i => i.name.toLowerCase() === row.name.toLowerCase()) : null;
  const tech = EIGEN_TECHNIQUES.find(t => t.key === form.technique) || EIGEN_TECHNIQUES[0];
  const steps = form.steps ?? tech.steps(glassWord(form.glass));
  const canSave = form.name.trim().length > 0 && form.rows.length >= 2;

  const buildRecipe = (idMap = {}) => {
    const ingredients = form.rows.map(r => {
      const amount = r.unit === "top" ? TOP_OP_ML : (parseFloat(r.amount) || 0);
      const unit = r.unit === "top" ? "ml" : r.unit;
      const base = r.newName ? (idMap[r.key] ? { id: idMap[r.key] } : { name: r.newName }) : r.id ? { id: r.id } : { name: r.name };
      return { ...base, amount, unit, ...(r.unit === "top" ? { top: true } : {}), ...(r.optional ? { optional: true } : {}) };
    });
    const cleanSteps = steps.map(s => s.trim()).filter(Boolean);
    return {
      id: form.editingId || "custom_" + Date.now().toString(36),
      name: form.name.trim() || "Naamloos recept", family: form.family || "Eigen recept", glass: form.glass || "Naar keuze",
      ingredients, steps: cleanSteps, method: cleanSteps.join(" ") || "—", garnish: form.garnishes.join(", "),
      ...(form.photo ? { image: form.photo } : {}),
    };
  };

  // Navigatiebalk: titel + "Bewaar" rechts.
  const setNavOverride = useContext(NavOverrideContext);
  const saveRef = useRef(null);
  useEffect(() => {
    if (!setNavOverride) return;
    setNavOverride({
      title: form.editingId ? "Recept bewerken" : "Nieuw recept",
      right: <button onClick={() => saveRef.current?.()} disabled={!canSave} style={{ minHeight: 44, background: "none", border: "none", padding: "0 0 0 10px", fontFamily: sans, fontSize: 15.5, fontWeight: 800, color: canSave ? BOTTLE : MUTED, opacity: canSave ? 1 : 0.55, cursor: canSave ? "pointer" : "default" }}>Bewaar</button>,
    });
  }, [setNavOverride, canSave, form.editingId]);
  useEffect(() => () => setNavOverride && setNavOverride(null), [setNavOverride]);

  const save = () => {
    if (!canSave) return;
    const newOnes = form.rows.filter(r => r.newName).map(r => ({ key: r.key, name: r.newName, cat: r.newCat }));
    const recipe = onSaveRecipe(newOnes, (idMap) => buildRecipe(idMap));
    onSound("chime");
    setSaved(recipe);
  };
  saveRef.current = save;

  const startFrom = (id) => {
    const r = recipes.find(x => x.id === id);
    if (!r) return;
    const glass = EIGEN_GLASSES.find(g => normalizeGlass(g) === normalizeGlass(r.glass)) || "";
    setForm({
      ...blank, name: `Mijn ${r.name}`, family: EIGEN_FAMILIES.some(f => f.value === r.family) ? r.family : "", glass,
      rows: r.ingredients.map((ing, i) => ({ key: `r${Date.now()}${i}`, id: findIngredientMeta(ing, allIngredients)?.id || ing.id, name: ing.name, amount: ing.top ? TOP_OP_ML : ing.amount, unit: ing.top ? "top" : ing.unit, optional: !!ing.optional })),
      technique: techniqueFromMethod(r.method), steps: r.steps || splitMethodIntoSteps(r.method),
      garnishes: r.garnish ? [r.garnish.replace(/\.$/, "")] : [],
    });
    window.scrollTo({ top: 0 });
  };
  const editExisting = (r) => { startFrom(r.id); setForm(f => ({ ...f, name: r.name, editingId: r.id, photo: r.image || null })); };

  const addRow = (pick) => set({ rows: [...form.rows, { key: `r${Date.now()}`, ...pick, optional: false }] });
  const updateRow = (i, patch) => set({ rows: form.rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
  const moveRow = (from, to) => { const rows = form.rows.slice(); const [x] = rows.splice(from, 1); rows.splice(to, 0, x); set({ rows }); };
  const setStep = (i, text) => set({ steps: steps.map((s, j) => j === i ? text : s) });

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try { set({ photo: await squareJpegDataUrl(file, 800, 0.8) }); }
    catch (err) { console.warn("Foto laden mislukt:", err); }
    setPhotoBusy(false);
  };

  const draft = buildRecipe();
  const label = (t, extra) => <div style={{ fontSize: 15, fontWeight: 700, color: INK, margin: "22px 0 10px" }}>{t}{extra && <span style={{ fontWeight: 500, color: MUTED }}> {extra}</span>}</div>;
  const chip = (on) => ({ minHeight: 40, padding: "0 14px", borderRadius: 100, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 600, border: `1px solid ${on ? BOTTLE : PAPER_DEEP}`, background: on ? BOTTLE : PAPER_DEEP, color: on ? "#FBF6EA" : INK });
  const ingLabel = (ref) => findIngredientMeta(ref, allIngredients)?.name || ref.name || ref.id;
  const savedMissing = saved ? saved.ingredients.filter(i => !i.optional && !isOwned(i)) : [];

  return (
    <div style={{ fontFamily: sans }}>
      <button onClick={() => setFromExisting(true)} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 60, padding: "8px 14px", borderRadius: 14, border: `1px solid ${BORDER}`, background: CREAM, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK, boxShadow: SHADOW_CARD }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: PAPER_DEEP, color: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Layers size={17} /></span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>Begin vanaf een bestaand recept</span>
          <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>Bijv. de Gimlet overnemen en aanpassen</span>
        </span>
        <ChevronRight size={18} color={MUTED} />
      </button>

      {/* Foto + naam */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 18 }}>
        <button onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Foto maken of kiezen" style={{ position: "relative", width: 92, height: 92, borderRadius: 18, border: "none", padding: 0, overflow: "visible", cursor: "pointer", flexShrink: 0, background: "none" }}>
          <div style={{ width: 92, height: 92, borderRadius: 18, overflow: "hidden" }}>
            {form.photo ? <img src={form.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <RecipeCircle recipe={{ ...draft, image: undefined, id: "__concept__" }} allIngredients={allIngredients} size={92} radius={18} />}
          </div>
          <span style={{ position: "absolute", right: -6, bottom: -6, width: 32, height: 32, borderRadius: "50%", background: BOTTLE_DARK, border: `3px solid ${PAPER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Camera size={14} color="#FBF6EA" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
        <label style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 2 }}>Naam</span>
          <input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Bijv. Rozemarijn Gimlet" autoCapitalize="words" enterKeyHint="done"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 48, border: "none", borderBottom: `2px solid ${BOTTLE}`, background: "transparent", outline: "none", fontFamily: serif, fontSize: 24, fontWeight: 700, color: INK, padding: "4px 0" }} />
        </label>
      </div>

      {label("Stijl")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {EIGEN_FAMILIES.map(f => <button key={f.value} onClick={() => set({ family: form.family === f.value ? "" : f.value })} aria-pressed={form.family === f.value} style={chip(form.family === f.value)}>{f.label}</button>)}
      </div>

      {label("Glas")}
      <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -20px", padding: "0 20px 4px" }}>
        {EIGEN_GLASSES.map(g => {
          const on = form.glass === g;
          return (
            <button key={g} onClick={() => set({ glass: on ? "" : g })} aria-pressed={on} style={{ flexShrink: 0, width: 66, height: 72, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 14, cursor: "pointer", fontFamily: sans, fontSize: 12, fontWeight: 600, background: CREAM, color: on ? INK : MUTED, border: `1.5px solid ${on ? BOTTLE : BORDER}` }}>
              <div style={{ height: 36, display: "flex", alignItems: "flex-end" }}><GlassArt glass={g} mono size={22} /></div>
              {EIGEN_GLASS_LABELS[g] || g}
            </button>
          );
        })}
      </div>

      {label("Ingrediënten")}
      <div style={{ background: CREAM, border: "none", borderRadius: 16, overflow: "hidden", boxShadow: SHADOW_CARD }}>
        {form.rows.map((row, i) => {
          const meta = row.newName ? null : metaOf(row);
          return (
            <div key={row.key || i} style={{ borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
              <EigenIngredientRow row={row} index={i} count={form.rows.length} meta={meta} owned={meta ? isOwned({ id: meta.id }) : false}
                onChange={(p) => updateRow(i, p)} onRemove={() => { onSound("remove"); set({ rows: form.rows.filter((_, j) => j !== i) }); }}
                onMove={moveRow} dragState={dragState} setDragState={setDragState} />
            </div>
          );
        })}
        <button onClick={() => setPicker(true)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 52, padding: "0 14px", border: "none", borderTop: form.rows.length ? `1px solid ${BORDER}` : "none", background: "none", color: BOTTLE, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={18} /> Ingrediënt toevoegen
        </button>
      </div>
      {form.rows.length > 0 && <p style={{ fontSize: 12, color: MUTED, margin: "8px 4px 0" }}>Veeg naar links om te verwijderen · houd vast om te verslepen</p>}

      {label("Techniek")}
      <div role="radiogroup" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 13 }}>
        {EIGEN_TECHNIQUES.map(t => {
          const on = form.technique === t.key;
          return <button key={t.key} role="radio" aria-checked={on} onClick={() => set({ technique: t.key, steps: null })} style={{ flex: 1, minHeight: 40, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700, background: on ? CREAM : "transparent", color: on ? INK : MUTED, boxShadow: on ? "0 1px 4px rgba(43,38,32,0.14)" : "none" }}>{t.label}</button>;
        })}
      </div>
      <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, marginTop: 10, padding: "4px 14px" }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
            <span style={{ width: 24, height: 24, marginTop: 8, borderRadius: "50%", border: `1.5px solid ${BRASS}`, color: BRASS, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box" }}>{i + 1}</span>
            <div style={{ flex: 1 }}><AutoGrowTextField bare value={s} onChange={(v) => setStep(i, v)} placeholder="Beschrijf deze stap" /></div>
            <button onClick={() => set({ steps: steps.filter((_, j) => j !== i) })} aria-label={`Stap ${i + 1} verwijderen`} style={{ width: 36, height: 40, background: "none", border: "none", color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
          </div>
        ))}
        <button onClick={() => set({ steps: [...steps, ""] })} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 44, background: "none", border: "none", padding: 0, color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}><Plus size={16} /> Stap toevoegen</button>
      </div>
      <p style={{ fontSize: 12, color: MUTED, margin: "8px 4px 0" }}>Voorgesteld op basis van de techniek · tik op een stap om aan te passen</p>

      {label("Afwerking", "(optioneel)")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[...new Set([...EIGEN_GARNISHES, ...form.garnishes])].map(g => {
          const on = form.garnishes.includes(g);
          return <button key={g} onClick={() => set({ garnishes: on ? form.garnishes.filter(x => x !== g) : [...form.garnishes, g] })} aria-pressed={on} style={chip(on)}>{on ? "✓ " : ""}{g}</button>;
        })}
        {customGarnish === null ? (
          <button onClick={() => setCustomGarnish("")} style={{ ...chip(false), color: BOTTLE }}>+ Zelf typen</button>
        ) : (
          <form onSubmit={e => { e.preventDefault(); const v = customGarnish.trim(); if (v) set({ garnishes: [...form.garnishes, v] }); setCustomGarnish(null); }} style={{ display: "flex", gap: 6 }}>
            <input autoFocus value={customGarnish} onChange={e => setCustomGarnish(e.target.value)} placeholder="Bijv. takje rozemarijn" enterKeyHint="done"
              style={{ minHeight: 40, borderRadius: 100, border: `1px solid ${BORDER}`, background: CREAM, padding: "0 14px", fontFamily: sans, fontSize: 16, color: INK, width: 200 }} />
            <button type="submit" style={{ ...chip(true), minWidth: 44 }}>OK</button>
          </form>
        )}
      </div>

      <button onClick={() => setPreview(draft)} disabled={form.rows.length === 0} className="press-scale" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, marginTop: 26, borderRadius: 14, border: "none", background: "rgba(184,134,46,0.18)", color: INK, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: form.rows.length ? "pointer" : "default", opacity: form.rows.length ? 1 : 0.5 }}>
        <BookOpen size={17} color={BRASS} /> Voorbeeld bekijken
      </button>
      {!canSave && <p style={{ fontSize: 12.5, color: MUTED, textAlign: "center", margin: "10px 0 0" }}>Geef je recept een naam en minstens 2 ingrediënten om te bewaren.</p>}

      {customRecipes.length > 0 && (<>
        {label(`Jouw eigen recepten (${customRecipes.length})`)}
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden" }}>
          {customRecipes.map((r, i) => (
            <SwipeToDelete key={r.id} onDelete={() => onRemoveRecipe(r.id)}>
              <button onClick={() => editExisting(r)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 58, padding: "6px 14px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, background: CREAM, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK }}>
                <RecipeCircle recipe={r} allIngredients={allIngredients} size={40} radius={10} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: serif, fontSize: 16, fontWeight: 700 }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED }}>{r.family} · {r.glass}</span>
                </span>
                <Pencil size={15} color={MUTED} />
              </button>
            </SwipeToDelete>
          ))}
        </div>
        <p style={{ fontSize: 12, color: MUTED, margin: "8px 4px 0" }}>Tik om te bewerken · veeg naar links om te verwijderen</p>
      </>)}

      {picker && <IngredientPickerSheet allIngredients={allIngredients} isOwned={isOwned} onPick={addRow} onClose={() => setPicker(false)} />}
      {fromExisting && (
        <BatchRecipePicker recipes={recipes} allIngredients={allIngredients} recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds}
          currentId={null} onPick={(id) => { startFrom(id); onSound("pop"); }} onClose={() => setFromExisting(false)} />
      )}
      {preview && (
        <RecipeSheet recipe={preview} missing={preview.ingredients.filter(i => !i.optional && !isOwned(i))} ingredientLabel={ingLabel} allIngredients={allIngredients}
          onAddMissing={() => {}} onSound={onSound} onClose={() => setPreview(null)} />
      )}
      {saved && (
        <EigenSavedSheet recipe={saved} missing={savedMissing} ingLabel={ingLabel} allIngredients={allIngredients} shoppingKeys={shoppingKeys}
          onAddToList={() => onAddToShoppingList(savedMissing.map(ref => ({ ref, recipeNames: [saved.name] })))}
          onView={() => { const id = saved.id; setSaved(null); setForm(blank); setTimeout(() => onOpenRecipe(id), 200); }}
          onAnother={() => { setSaved(null); setForm(blank); window.scrollTo({ top: 0 }); }}
          onClose={() => { setSaved(null); setForm(blank); }} />
      )}
    </div>
  );
}

function EigenSavedSheet({ recipe, missing, ingLabel, allIngredients, shoppingKeys, onAddToList, onView, onAnother, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [added, setAdded] = useState(false);
  const onList = added || (missing.length > 0 && missing.every(m => shoppingKeys?.has(ingredientKey(m))));
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{ position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", padding: "0 20px calc(env(safe-area-inset-bottom) + 16px)" }}>
        <SheetGrabber {...dragHandlers} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 10 }}>
          <div className="success-pop" style={{ position: "relative" }}>
            <div style={{ width: 96, height: 96, borderRadius: 20, overflow: "hidden", boxShadow: SHADOW_CARD }}><RecipeCircle recipe={recipe} allIngredients={allIngredients} size={96} radius={20} /></div>
            <span style={{ position: "absolute", right: -8, bottom: -8, width: 32, height: 32, borderRadius: "50%", background: SAGE, border: `3px solid ${PAPER}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={16} strokeWidth={3} color="#FBF6EA" /></span>
          </div>
          <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 700, marginTop: 16 }}>{recipe.name}</div>
          <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>Opgeslagen · staat nu tussen je recepten</div>
        </div>
        {missing.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, padding: "12px 14px", borderRadius: 14, background: "rgba(122,46,42,0.10)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: BURGUNDY }}>Mist nog: {missing.map(ingLabel).join(", ")}</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Zelf maken of op je lijst zetten</div>
            </div>
            {onList ? <span className={added ? "success-pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 4, color: SAGE, fontSize: 13, fontWeight: 700, flexShrink: 0 }}><Check size={14} strokeWidth={3} /> Op lijst</span>
              : <button onClick={() => { onAddToList(); setAdded(true); }} style={{ minHeight: 40, padding: "0 16px", borderRadius: 100, border: "none", background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Op lijst</button>}
          </div>
        )}
        <button onClick={onView} className="press-scale" style={{ width: "100%", minHeight: 52, marginTop: 22, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>Bekijk recept</button>
        <button onClick={onAnother} className="press-scale" style={{ width: "100%", minHeight: 52, marginTop: 10, borderRadius: 14, border: "none", background: "rgba(184,134,46,0.18)", color: INK, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Nog een recept toevoegen</button>
      </div>
    </div>
  ), document.body);
}

export { EigenRecepten };
