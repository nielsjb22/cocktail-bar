// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useRef, useMemo, useEffect, Fragment } from "react";
import { fetchAiTegoed, askBartender } from "../ai.js";
import { createPortal } from "react-dom";
import { ChevronLeft, Refrigerator, Send, ChevronRight, Check, ShoppingCart } from "lucide-react";
import { menuStrength } from "../menuCard";
import { BORDER, BOTTLE, BOTTLE_DARK, BRASS, BRASS_TEXT, BURGUNDY, CREAM, HEADER_TEXT, INK, MUTED, PAPER, PAPER_DEEP, RecipeCircle, SAGE, SAGE_TEXT, SHADOW_CARD, TASTE_DIMS, TASTE_WORD, cachedTaste, findIngredientMeta, findRecipeFor, myTasteVector, sans, serif, useBodyScrollLock, useStorage } from "../ThuisbarApp.jsx";

// ---------- AI-bartender (idee 6) en flessen scannen (idee 7) ----------
// De bartender kiest alleen uit recepten van de app (met hun eigen,
// gecontroleerde hoeveelheden); de AI verzint zelf niets. Zie src/ai.js en
// de Edge Function ai-bartender.
// useStock: alleen als de gebruiker dat wil kijkt de bartender naar de voorraad.
function bartenderContext({ recipes, allIngredients, isOwned, voorraad, logboek, useStock = true, eerderVoorgesteld = [] }) {
  const metaName = (ing) => findIngredientMeta(ing, allIngredients)?.name || ing.name || ing.id;
  const owned = useStock ? allIngredients.filter(i => voorraad.has(i.id)).map(i => i.name) : [];
  const me = myTasteVector(logboek, recipes, allIngredients);
  const smaak = me ? `${TASTE_DIMS.map(d => `${d} ${me.v[d].toFixed(1)}`).join(", ")} (schaal 0-5)` : "";
  const favs = new Map();
  [...logboek].filter(e => e.rating >= 4).sort((a, b) => b.rating - a.rating).forEach(e => {
    const name = findRecipeFor(e, recipes)?.name || e.name;
    if (name && !favs.has(name)) favs.set(name, e.rating);
  });
  const favorieten = [...favs].slice(0, 12).map(([n, r]) => `${n} (${r}/5)`);
  // Alleen namen en cijfers van cocktails, nooit notities, plekken of foto's.
  const nameOf = (e) => findRecipeFor(e, recipes)?.name || e.name;
  const laag = new Map();
  logboek.filter(e => e.rating > 0 && e.rating <= 2.5).forEach(e => { const n = nameOf(e); if (n && !laag.has(n)) laag.set(n, e.rating); });
  const nietLekker = [...laag].slice(0, 10).map(([n, r]) => `${n} (${r}/5)`);
  const recent = [...logboek].sort((a, b) => String(b.createdAt || b.created_at || b.date || "").localeCompare(String(a.createdAt || a.created_at || a.date || "")))
    .slice(0, 6).map(e => `${nameOf(e)}${e.rating ? ` (${e.rating}/5)` : ""}`).filter(Boolean);
  const tried = new Map();
  logboek.forEach(e => { const r = findRecipeFor(e, recipes); if (r) tried.set(r.id, Math.max(tried.get(r.id) || 0, e.rating || 0)); });
  const now = new Date();
  const dag = now.toLocaleDateString("nl-NL", { weekday: "long" });
  const h = now.getHours();
  const deel = h < 12 ? "ochtend" : h < 18 ? "middag" : h < 24 ? "avond" : "nacht";
  const maand = now.toLocaleDateString("nl-NL", { month: "long" });
  const seizoen = ["winter", "winter", "lente", "lente", "lente", "zomer", "zomer", "zomer", "herfst", "herfst", "herfst", "winter"][now.getMonth()];
  const moment = `${dag}${deel}, ${maand} (${seizoen})`;
  const rows = recipes.map(r => {
    const missing = useStock ? r.ingredients.filter(i => !i.optional && !isOwned(i)).map(metaName) : [];
    const t = cachedTaste(r, allIngredients);
    const dist = me ? Math.sqrt(TASTE_DIMS.reduce((acc, d) => acc + (t[d] - me.v[d]) ** 2, 0)) : 0;
    const ids = r.ingredients.map(i => findIngredientMeta(i, allIngredients)?.id || i.id);
    const free = menuStrength(r, ing => findIngredientMeta(ing, allIngredients)).level === 0;
    const hot = r.family === "Warme dranken" || ids.some(id => ["hot_water", "hot_coffee", "espresso", "hot_chocolate", "black_tea"].includes(id));
    const tr = tried.has(r.id) ? ` | al geprobeerd${tried.get(r.id) ? ` (${tried.get(r.id)}/5)` : ""}` : "";
    // Hoofdingrediënten (zonder garnering/optioneel), zodat de bartender kan uitleggen hoe iets smaakt.
    const hoofd = r.ingredients.filter(i => !i.optional).slice(0, 6).map(metaName).join(", ");
    const match = me ? ` | match ${Math.max(0, Math.min(100, Math.round(100 * (1 - dist / 7))))}` : "";
    const line = `${r.id} | ${r.name} | ${r.family} | ${hoofd} | zoet ${t.zoet} zuur ${t.zuur} bitter ${t.bitter} sterk ${t.sterk}${match}${useStock ? ` | mist: ${missing.join(", ")}` : ""}${free ? " | alcoholvrij" : ""}${hot ? " | warm" : ""}${tr}`;
    return { r, line, n: missing.length, dist, free };
  });
  const sorted = rows.filter(x => x.n <= 2).sort((a, b) => (a.n - b.n) || (a.dist - b.dist));
  // Afwisseling: de 70 best passende, aangevuld met een willekeurige greep uit
  // de rest, en alles in willekeurige volgorde. Zo kiest de bartender niet
  // steeds dezelfde cocktails die toevallig bovenaan de lijst staan.
  const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const picked = sorted.slice(0, 70);
  picked.push(...shuffle(sorted.slice(70)).slice(0, 90));
  const have = new Set(picked.map(x => x.r.id));
  // Altijd een paar alcoholvrije opties erbij, ook als die net niet bovenaan staan.
  picked.push(...sorted.filter(x => x.free && !have.has(x.r.id)).slice(0, 20));
  return { voorraadGebruiken: useStock, voorraad: owned, smaak, favorieten, nietLekker, recent, moment, eerderVoorgesteld, kandidaten: shuffle(picked).map(x => x.line) };
}

const BARTENDER_IDEEEN = ["Iets fris en niet te zoet", "Verras me", "Zonder alcohol", "Iets stevigs voor na het eten"];

function bartenderGroet() {
  const h = new Date().getHours();
  return h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
}

function BartenderRecipeCard({ recipe, allIngredients, isOwned, onOpen, onAddToShoppingList, showStock = true, waarom = "" }) {
  const [added, setAdded] = useState(false);
  const missing = showStock ? recipe.ingredients.filter(i => !i.optional && !isOwned(i)) : [];
  const names = missing.map(i => findIngredientMeta(i, allIngredients)?.name || i.name || i.id);
  return (
    <div style={{ background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD, padding: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button onClick={onOpen} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK }}>
        <span style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}><RecipeCircle recipe={recipe} allIngredients={allIngredients} size={56} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: serif, fontSize: 16.5, fontWeight: 700, color: BOTTLE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{recipe.name}</span>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginTop: 2, color: !showStock ? MUTED : missing.length ? BRASS_TEXT : SAGE_TEXT }}>
            {!showStock ? recipe.family : missing.length ? `Mist: ${names.join(", ")}` : "Alles in huis"}
          </span>
        </span>
        <ChevronRight size={17} color={MUTED} style={{ flexShrink: 0 }} />
      </button>
      {missing.length > 0 && (
        <button onClick={() => { if (added) return; onAddToShoppingList(missing.map(ref => ({ ref, recipeNames: [recipe.name] }))); setAdded(true); }}
          aria-label={added ? "Staat op je boodschappenlijst" : `Zet ${names.join(", ")} op je boodschappenlijst`}
          style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: added ? "rgba(92,122,82,0.16)" : PAPER_DEEP, color: added ? SAGE : BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          {added ? <Check size={18} strokeWidth={2.6} /> : <ShoppingCart size={18} />}
        </button>
      )}
    </div>
    {waarom && <p style={{ margin: "8px 4px 2px", fontSize: 13.5, lineHeight: 1.5, color: INK }}>{waarom}</p>}
    </div>
  );
}

function BartenderScreen({ chat, setChat, onClose, recipes, allIngredients, isOwned, voorraad, logboek, onOpenRecipe, onAddToShoppingList, onSound, useStock = null, setUseStock, initialAsk = null }) {
  useBodyScrollLock();
  const [text, setText] = useState(initialAsk && useStock == null ? initialAsk : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(null);
  // De laatste 30 voorgestelde cocktails (ook uit eerdere gesprekken), zodat de
  // bartender niet steeds met dezelfde komt.
  const [eerder, setEerder] = useStorage("thuisbar-bartender-eerder", []);
  const scrollRef = useRef(null);
  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  const bottleCount = allIngredients.filter(i => voorraad.has(i.id)).length;
  const me = useMemo(() => myTasteVector(logboek, recipes, allIngredients), [logboek, recipes, allIngredients]);
  const smaakWoorden = me ? [...TASTE_DIMS].sort((a, b) => me.v[b] - me.v[a]).filter(d => me.v[d] >= 1.5).slice(0, 2).map(d => TASTE_WORD[d]) : [];

  useEffect(() => { fetchAiTegoed().then(t => t && setOver(t.chat)); }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.length, busy, error]);

  const send = async (raw, base = chat) => {
    const vraag = (raw ?? text).trim();
    if (!vraag || busy || useStock == null) return;
    const next = [...base, { role: "user", content: vraag }];
    setChat(next);
    setText("");
    setError(null);
    setBusy(true);
    onSound?.("tick");
    const eerderNamen = (Array.isArray(eerder) ? eerder : []).map(id => recipeById.get(id)?.name).filter(Boolean);
    const ctx = bartenderContext({ recipes, allIngredients, isOwned, voorraad, logboek, useStock: useStock === "ja", eerderVoorgesteld: eerderNamen });
    // In de geschiedenis staat bij elk antwoord ook welke cocktails er werden
    // voorgesteld, zodat "nog meer" of "iets anders" echt iets anders oplevert.
    const history = next.slice(-12).map(m => ({
      role: m.role,
      content: m.role === "assistant" && m.recepten?.length
        ? `${m.content}\n\n(Voorgesteld: ${m.recepten.map(id => recipeById.get(id)?.name || id).join(", ")})`
        : m.content,
    }));
    const res = await askBartender(history, ctx);
    setBusy(false);
    if (typeof res.over === "number") setOver(res.over);
    if (res.error) { setError({ message: res.message, retry: res.error !== "limiet" }); return; }
    // Nieuwe functie geeft { id, waarom }, een oudere alleen ids.
    const items = (res.recepten || []).map(r => (typeof r === "string" ? { id: r, waarom: "" } : r)).filter(r => r && recipeById.has(r.id));
    const ids = items.map(r => r.id);
    if (ids.length) setEerder([...ids, ...(Array.isArray(eerder) ? eerder : []).filter(id => !ids.includes(id))].slice(0, 30));
    setChat([...next, { role: "assistant", content: res.antwoord || "", recepten: ids, waarom: Object.fromEntries(items.map(r => [r.id, r.waarom || ""])), opties: Array.isArray(res.opties) ? res.opties.slice(0, 4) : [] }]);
  };
  // Geopend met een vraag (bijv. vanuit een recept): als nieuw gesprek meteen
  // stellen. Weet de bartender nog niet of hij je voorraad mag zien, dan
  // staat de vraag klaar in het invoerveld.
  const askedRef = useRef(false);
  useEffect(() => {
    if (!initialAsk || askedRef.current || useStock == null) return;
    askedRef.current = true;
    setText("");
    send(initialAsk, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk, useStock]);
  const retry = () => {
    const last = chat[chat.length - 1];
    if (last?.role !== "user") return;
    setChat(chat.slice(0, -1));
    send(last.content);
  };

  const bubble = (role, children, key) => (
    <div key={key} style={{
      alignSelf: role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", fontSize: 15, lineHeight: 1.45, padding: "10px 14px", whiteSpace: "pre-wrap",
      borderRadius: role === "user" ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
      background: role === "user" ? BOTTLE_DARK : CREAM, color: role === "user" ? HEADER_TEXT : INK,
      boxShadow: role === "user" ? "none" : SHADOW_CARD,
    }}>{children}</div>
  );
  const chip = (label) => (
    <button key={label} onClick={() => send(label)} disabled={busy} style={{
      flexShrink: 0, minHeight: 38, padding: "0 13px", borderRadius: 100, border: `1px solid ${BRASS}`, background: "none", color: BRASS_TEXT,
      fontFamily: sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    }}>{label}</button>
  );

  return createPortal((
    <div className="push-slide-in" style={{ position: "fixed", inset: 0, zIndex: 30, background: PAPER, display: "flex", flexDirection: "column", fontFamily: sans, color: INK }}>
      <div style={{ background: BOTTLE_DARK, borderBottom: `2px solid ${BRASS}`, flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 6px) 12px 8px", display: "flex", alignItems: "center", boxSizing: "border-box", minHeight: 52 }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 2, width: 90, minHeight: 44, border: "none", background: "none", color: "#DDB877", fontSize: 17, fontWeight: 600, cursor: "pointer", fontFamily: sans, padding: 0 }}>
            <ChevronLeft size={22} strokeWidth={2.2} /> Terug
          </button>
          <span style={{ flex: 1, textAlign: "center" }}>
            <span style={{ display: "block", fontWeight: 700, fontSize: 17, color: "#FBF6EA" }}>Bartender</span>
            <span style={{ display: "block", fontSize: 11.5, color: "#A9B8B0" }}>{useStock === "ja" ? "Kent je voorraad en je smaak" : "Kent je smaak"}</span>
          </span>
          <span style={{ width: 90, display: "flex", justifyContent: "flex-end" }}>
            {chat.length > 0 && (
              <button onClick={() => { setChat([]); setError(null); }} style={{ minHeight: 44, border: "none", background: "none", color: "#DDB877", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: sans, padding: 0 }}>Opnieuw</button>
            )}
          </span>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {useStock != null && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => setUseStock(useStock === "ja" ? "nee" : "ja")} aria-pressed={useStock === "ja"} style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, fontSize: 12.5, fontWeight: 600, fontFamily: sans, cursor: "pointer",
                color: useStock === "ja" ? SAGE_TEXT : MUTED, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "0 11px",
              }}>
                <Refrigerator size={14} /> {useStock === "ja" ? `Kijkt naar je voorraad (${bottleCount})` : "Kijkt niet naar je voorraad"}
                <span style={{ color: BRASS_TEXT }}>· {useStock === "ja" ? "uit" : "aan"}</span>
              </button>
              {smaakWoorden.length > 0 && <span style={{ fontSize: 12, color: BOTTLE, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "6px 10px" }}>Jouw smaak: {smaakWoorden.join(", ")}</span>}
            </div>
          )}
          {useStock == null ? (
            <>
              {bubble("assistant", `${bartenderGroet()}! Zal ik kijken welke flessen je in huis hebt? Dan raad ik vooral aan wat je nu meteen kunt maken.`, "vraag")}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => { onSound?.("tick"); setUseStock("ja"); }} className="press-scale" style={{ minHeight: 44, padding: "0 16px", borderRadius: 100, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Ja, kijk in mijn voorraad</button>
                <button onClick={() => { onSound?.("tick"); setUseStock("nee"); }} className="press-scale" style={{ minHeight: 44, padding: "0 16px", borderRadius: 100, border: `1px solid ${BORDER}`, background: CREAM, color: INK, fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>Nee, gewoon advies</button>
              </div>
            </>
          ) : bubble("assistant", useStock === "ja"
            ? `${bartenderGroet()}! Waar heb je zin in? Ik kijk wat je in huis hebt en wat bij je smaak past.`
            : `${bartenderGroet()}! Waar heb je zin in? Ik kijk wat bij je smaak past.`, "groet")}
          {chat.map((m, i) => (
            <Fragment key={i}>
              {m.content ? bubble(m.role, m.content) : null}
              {m.role === "assistant" && m.recepten?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {m.recepten.map(id => (
                    <BartenderRecipeCard key={id} recipe={recipeById.get(id)} allIngredients={allIngredients} isOwned={isOwned} showStock={useStock !== "nee"} waarom={m.waarom?.[id] || ""}
                      onOpen={() => onOpenRecipe(id)} onAddToShoppingList={onAddToShoppingList} />
                  ))}
                </div>
              )}
              {m.role === "assistant" && i === chat.length - 1 && !busy && m.opties?.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{m.opties.map(chip)}</div>
              )}
            </Fragment>
          ))}
          {busy && bubble("assistant", <span style={{ color: MUTED }}>Even denken…</span>, "busy")}
          {error && (
            <div role="alert" style={{ alignSelf: "stretch", fontSize: 13.5, color: BURGUNDY, background: "rgba(122,46,42,0.08)", border: "1px solid rgba(122,46,42,0.25)", borderRadius: 12, padding: "10px 12px", lineHeight: 1.45, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1 }}>{error.message}</span>
              {error.retry && <button onClick={retry} style={{ minHeight: 36, padding: "0 12px", borderRadius: 100, border: "none", background: BURGUNDY, color: CREAM, fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Opnieuw</button>}
            </div>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, background: PAPER_DEEP, borderTop: `1px solid ${BORDER}`, transition: "padding-bottom 0.25s ease", paddingBottom: "calc(max(env(safe-area-inset-bottom), var(--kb-pad, 0px)) + 8px)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {chat.length === 0 && useStock != null && (
            <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px 0", WebkitOverflowScrolling: "touch" }}>
              {BARTENDER_IDEEEN.map(chip)}
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); send(); }} style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 16px 4px" }}>
            <input value={text} onChange={e => setText(e.target.value)} maxLength={500} disabled={useStock == null} placeholder={useStock == null ? "Kies eerst hierboven" : "Vraag de bartender iets…"} aria-label="Vraag aan de bartender" enterKeyHint="send"
              style={{ flex: 1, minWidth: 0, height: 44, border: `1px solid ${BORDER}`, background: CREAM, borderRadius: 22, padding: "0 16px", fontFamily: sans, fontSize: 16, color: INK, outline: "none" }} />
            <button type="submit" disabled={busy || !text.trim() || useStock == null} aria-label="Versturen" style={{
              width: 44, height: 44, borderRadius: "50%", border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0, opacity: busy || !text.trim() ? 0.5 : 1,
            }}><Send size={18} /></button>
          </form>
          <div style={{ fontSize: 11.5, color: MUTED, textAlign: "center", padding: "2px 16px 0" }}>
            {over != null ? `Nog ${over} ${over === 1 ? "vraag" : "vragen"} vandaag · ` : ""}Recepten komen altijd uit de app
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

export { BartenderScreen };
