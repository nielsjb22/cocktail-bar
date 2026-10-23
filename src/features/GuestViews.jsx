// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { MENU_COLORS, readPartyFromSearch, MENU_SERIF, MENU_SANS, partySubtitle, formatMenuDate, menuCocktailInfo, buildIcs } from "../menuCard";
import { useMemo, useState, useEffect } from "react";
import { emptyAnswers, CUSTOM_PREFIX, legacyFieldsFromAnswers, choiceLabel, SURVEY_STYLES, SURVEY_STRENGTHS, SURVEY_ALLERGIES, SURVEY_SPIRITS, SURVEY_LIQUEURS, SURVEY_MIXERS, SURVEY_TASTES } from "../surveyOptions";
import { supabase } from "../supabaseClient";
import { Check, X, Plus, ChevronLeft, Search, CalendarDays } from "lucide-react";
import { RECIPES, canonicalRecipeId, INGREDIENTS } from "../recipes.js";
import { isNative as isNativeShell } from "../native";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { BrandMark, PUBLIC_WEB_URL, SurveyGlass, getTasteProfile, useMatchBodyBackground } from "../ThuisbarApp.jsx";

// Gedeelde menukaart (de link die gasten krijgen): donker, gecentreerd, zonder
// kaders. Het menu ligt vast; gasten kiezen niets. Feestnaam, host, datum en
// (optioneel) adres staan in de link zelf — zie partyMenuQuery in menuCard.js.
// Alleen ingebouwde recepten kunnen worden gedeeld: eigen recepten van de host
// leven alleen op diens toestel, dus die vallen hier weg.
function GuestMenuView({ recipeIds }) {
  const C = MENU_COLORS;
  useMatchBodyBackground(C.bg);
  const party = useMemo(() => readPartyFromSearch(window.location.search), []);
  const items = useMemo(() => recipeIds
    .map(id => RECIPES.find(r => r.id === canonicalRecipeId(id))).filter(Boolean)
    .map(r => menuCocktailInfo(r, INGREDIENTS, getTasteProfile(r, INGREDIENTS))), [recipeIds]);
  const skipped = recipeIds.length - items.length;
  const subtitle = partySubtitle(party);

  const addToCalendar = async () => {
    const ics = buildIcs({
      title: party.title || "Cocktailavond", startsAt: party.startsAt, address: party.address,
      description: items.length ? `Op de kaart: ${items.map(i => i.name).join(", ")}` : "", url: window.location.href,
    });
    const filename = `${(party.title || "feest").replace(/[^\w-]+/g, "-").toLowerCase()}.ics`;
    if (isNativeShell) {
      try {
        const { uri } = await Filesystem.writeFile({ path: filename, data: ics, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: party.title, files: [uri] });
      } catch { /* geannuleerd of niet beschikbaar */ }
      return;
    }
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: MENU_SANS, textAlign: "center" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 48px) 24px calc(env(safe-area-inset-bottom) + 48px)" }}>
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><BrandMark width={48} /></div>
        <h1 style={{ fontFamily: MENU_SERIF, fontWeight: 500, fontSize: 42, lineHeight: 1.12, margin: "0 0 10px", color: C.text, overflowWrap: "anywhere" }}>
          {party.title || "Het menu van vanavond"}
        </h1>
        {subtitle && (
          <p style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.body, margin: "0 0 6px" }}>{subtitle}</p>
        )}
        {party.address && (
          <p style={{ fontSize: 14, color: C.subtle, margin: "0 0 6px" }}>{party.address}</p>
        )}
        {party.startsAt && (
          <button onClick={addToCalendar} style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 44, marginTop: 18,
            padding: "0 22px", borderRadius: 100, border: `1.5px solid ${C.gold}`, background: "transparent",
            color: C.gold, fontFamily: MENU_SANS, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}>
            <CalendarDays size={17} strokeWidth={1.8} aria-hidden="true" /> Zet in agenda
          </button>
        )}

        <div style={{ height: 1, background: C.gold, opacity: 0.45, margin: "34px 0 16px" }} />
        <div style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.gold, marginBottom: 6 }}>Op de kaart vanavond</div>

        {items.length === 0 && (
          <p style={{ color: C.subtle, fontSize: 15, padding: "28px 0" }}>Dit menu-linkje lijkt niet (meer) geldig.</p>
        )}
        {items.map((it, i) => (
          <div key={it.id} style={{ padding: "26px 0", borderTop: i === 0 ? "none" : `1px solid ${C.divider}` }}>
            <h2 style={{ fontFamily: MENU_SERIF, fontWeight: 500, fontSize: 28, lineHeight: 1.2, color: C.text, margin: "0 0 6px" }}>{it.name}</h2>
            {it.ingredientsLine && (
              <div style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 15.5, color: C.gold, lineHeight: 1.45, margin: "0 0 12px" }}>{it.ingredientsLine}</div>
            )}
            <p style={{ fontSize: 15.5, lineHeight: 1.55, color: C.body, margin: "0 auto 12px", maxWidth: 400 }}>{it.description}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 13.5, color: C.subtle, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", gap: 4 }} aria-hidden="true">
                {[1, 2, 3].map(n => (
                  <span key={n} style={{ width: 7, height: 7, borderRadius: "50%", background: n <= it.strength.level ? C.gold : "#2E423C" }} />
                ))}
              </span>
              <span>{it.strength.label}{it.notes.map(n => ` · ${n}`).join("")}</span>
            </div>
          </div>
        ))}
        {skipped > 0 && (
          <p style={{ color: C.subtle, fontSize: 13, margin: "0 0 10px" }}>
            {skipped} eigen creatie{skipped === 1 ? "" : "s"} van de host {skipped === 1 ? "staat" : "staan"} hier niet bij.
          </p>
        )}

        <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 30, marginTop: 4 }}>
          <div style={{ fontSize: 13.5, color: C.subtle }}>Proef je iets lekkers? Check in met</div>
          <a href={APP_STORE_URL || PUBLIC_WEB_URL || "/"} target="_blank" rel="noreferrer" style={{
            display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 12px",
            fontSize: 14.5, fontWeight: 700, color: C.text, textDecoration: "none",
          }}>Mijn Thuisbar</a>
        </div>
      </div>
    </div>
  );
}

function GuestSurveyView({ surveyId }) {
  const C = MENU_COLORS;
  useMatchBodyBackground(C.bg);
  const party = useMemo(() => readPartyFromSearch(window.location.search), []);
  const [survey, setSurvey] = useState(undefined); // undefined = laden, null = niet gevonden
  const [step, setStep] = useState(0); // 0 = naam, 1..7 = vragen, 8 = bedankt
  const [guestName, setGuestName] = useState("");
  const [answers, setAnswers] = useState(emptyAnswers);
  const [customDrafts, setCustomDrafts] = useState({});
  const [cocktailQuery, setCocktailQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const scrollTop = () => window.scrollTo(0, 0);

  useEffect(() => {
    let cancelled = false;
    supabase.from("party_surveys").select("id, title").eq("id", surveyId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setSurvey(data || null); })
      .catch(() => { if (!cancelled) setSurvey(null); });
    return () => { cancelled = true; };
  }, [surveyId]);

  const QUESTIONS = 7;
  const go = (n) => { setStep(n); scrollTop(); };

  // Drie standen per keuze: neutraal → lekker → liever niet → neutraal.
  // Een zelf toegevoegde keuze verdwijnt bij de derde tik.
  const stateOf = (group, key) => answers[group].like.includes(key) ? "like" : answers[group].dislike.includes(key) ? "dislike" : null;
  const cycle = (group, key) => setAnswers(a => {
    const g = a[group];
    const like = g.like.filter(k => k !== key), dislike = g.dislike.filter(k => k !== key);
    if (g.like.includes(key)) dislike.push(key);
    else if (!g.dislike.includes(key)) like.push(key);
    return { ...a, [group]: { like, dislike } };
  });
  const addCustom = (group) => {
    const text = (customDrafts[group] || "").trim().slice(0, 40);
    if (!text) return;
    const key = CUSTOM_PREFIX + text;
    setAnswers(a => a[group].like.includes(key) || a[group].dislike.includes(key) ? a
      : { ...a, [group]: { like: [...a[group].like, key], dislike: a[group].dislike } });
    setCustomDrafts(d => ({ ...d, [group]: "" }));
  };
  const toggleList = (field, key) => setAnswers(a => ({ ...a, [field]: a[field].includes(key) ? a[field].filter(k => k !== key) : [...a[field], key] }));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const base = { survey_id: surveyId, guest_name: guestName.trim() || null, ...legacyFieldsFromAnswers(answers) };
    let { error: err } = await supabase.from("party_survey_responses").insert({ ...base, answers });
    // Zolang de migratie voor `answers` niet gedraaid is: dan alleen de oude velden.
    if (err && /answers/i.test(err.message || "")) ({ error: err } = await supabase.from("party_survey_responses").insert(base));
    setSubmitting(false);
    if (err) { setError("Versturen is niet gelukt. Probeer het nog eens."); return; }
    go(QUESTIONS + 1);
  };

  const serifH = (size) => ({ fontFamily: MENU_SERIF, fontWeight: 500, fontSize: size, lineHeight: 1.2, color: C.text, margin: 0 });
  const chipStyle = (state) => ({
    display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 16px", borderRadius: 100,
    fontFamily: MENU_SANS, fontSize: 15, cursor: "pointer",
    ...(state === "like" ? { background: "rgba(198,161,91,0.16)", border: `1px solid ${C.gold}`, color: C.text }
      : state === "dislike" ? { background: "transparent", border: "1px dashed #4A5C56", color: C.subtle }
      : { background: "transparent", border: "1px solid #2E423C", color: C.body }),
  });
  const choiceChip = (group, k, label) => {
    const state = stateOf(group, k);
    return (
      <button key={group + k} type="button" onClick={() => cycle(group, k)} aria-pressed={state === "like"} style={chipStyle(state)}
        aria-label={`${label}${state === "like" ? ", lekker" : state === "dislike" ? ", liever niet" : ""}`}>
        {state === "like" && <Check size={15} color={C.gold} strokeWidth={2.4} />}
        {state === "dislike" && <X size={14} color={C.subtle} strokeWidth={2} />}
        <span style={{ textDecoration: state === "dislike" ? "line-through" : "none" }}>{label}</span>
      </button>
    );
  };
  const choiceGroup = (group, options) => {
    const customs = [...answers[group].like, ...answers[group].dislike].filter(k => k.startsWith(CUSTOM_PREFIX));
    return (
      <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.map(o => choiceChip(group, o.key, o.label))}
          {customs.map(k => choiceChip(group, k, k.slice(CUSTOM_PREFIX.length)))}
        </div>
      </>
    );
  };
  const customInput = (group, label) => (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input value={customDrafts[group] || ""} onChange={e => setCustomDrafts(d => ({ ...d, [group]: e.target.value }))}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(group); } }}
          placeholder="Iets anders? Typ het hier" aria-label={label} maxLength={40} enterKeyHint="done"
          style={{ flex: 1, minWidth: 0, height: 46, boxSizing: "border-box", padding: "0 16px", borderRadius: 100, border: "1px solid #2E423C", background: "#142A24", color: C.text, fontSize: 16, fontFamily: MENU_SANS, outline: "none" }} />
        <button type="button" onClick={() => addCustom(group)} aria-label="Toevoegen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, flexShrink: 0, borderRadius: "50%", border: `1px solid ${C.gold}`, background: "transparent", color: C.gold, cursor: "pointer" }}>
          <Plus size={18} />
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: C.subtle, margin: "8px 0 0" }}>Wat je toevoegt, verschijnt als keuze en staat meteen op lekker.</p>
    </>
  );
  const intro = (title, text) => (
    <>
      <h2 style={{ ...serifH(30), marginBottom: 8 }}>{title}</h2>
      {text && <p style={{ fontSize: 14.5, lineHeight: 1.5, color: C.body, margin: "0 0 22px" }}>{text}</p>}
    </>
  );
  const TAP_HINT = "Tik één keer voor lekker, twee keer voor liever niet.";
  const subLabel = { fontSize: 12, letterSpacing: 1, color: C.subtle, margin: "0 0 10px" };

  const cocktailSuggestions = cocktailQuery.trim().length > 0
    ? RECIPES.filter(r => r.name.toLowerCase().includes(cocktailQuery.trim().toLowerCase()) && !answers.favorites.includes(r.id)).slice(0, 6)
    : [];

  const partyTitle = party.title || survey?.title || "Smaaktest";
  const partyLine = partySubtitle(party);

  // Samenvatting voor het bedankscherm.
  const summaryRows = [
    ["Lekker", ["spirits", "liqueurs", "mixers"].flatMap(g => answers[g].like.map(k => choiceLabel(g, k)))],
    ["Liever niet", ["spirits", "liqueurs", "mixers"].flatMap(g => answers[g].dislike.map(k => choiceLabel(g, k)))],
    ["Smaken", answers.tastes.like.map(k => choiceLabel("tastes", k))],
    ["Soort", answers.styles.map(k => SURVEY_STYLES.find(s => s.key === k)?.label.toLowerCase()).filter(Boolean)],
    ["Sterkte", answers.strength ? [SURVEY_STRENGTHS.find(s => s.key === answers.strength)?.label] : []],
    ["Allergie", answers.allergies.map(k => SURVEY_ALLERGIES.find(s => s.key === k)?.label.toLowerCase())],
    ["Favorieten", answers.favorites.map(id => RECIPES.find(r => r.id === canonicalRecipeId(id))?.name).filter(Boolean)],
  ].filter(([, v]) => v.length > 0);

  const primaryBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 54, borderRadius: 100, border: "none", background: C.gold, color: C.bg, fontFamily: MENU_SANS, fontSize: 16, fontWeight: 700, cursor: "pointer" };
  const page = { background: C.bg, minHeight: "100vh", color: C.text, fontFamily: MENU_SANS };
  const column = { maxWidth: 480, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 40px) 24px calc(env(safe-area-inset-bottom) + 28px)", minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" };

  if (survey === undefined || survey === null) {
    return (
      <div style={page}><div style={{ ...column, justifyContent: "center", textAlign: "center" }}>
        <p style={{ color: C.subtle, fontSize: 15 }}>{survey === undefined ? "Bezig met laden…" : "Dit linkje lijkt niet (meer) geldig."}</p>
      </div></div>
    );
  }

  // ---------- Stap 0: naam ----------
  if (step === 0) {
    const canStart = guestName.trim().length > 0;
    return (
      <div style={page}><div style={{ ...column, textAlign: "center", paddingTop: "calc(env(safe-area-inset-top) + 60px)" }}>
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><BrandMark width={48} /></div>
        <h1 style={{ ...serifH(40), lineHeight: 1.12, marginBottom: 10, overflowWrap: "anywhere" }}>{partyTitle}</h1>
        {partyLine && <p style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.body, margin: 0 }}>{partyLine}</p>}
        <div style={{ height: 1, background: C.gold, opacity: 0.45, margin: "30px 0 22px" }} />
        <div style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.gold, marginBottom: 10 }}>Smaaktest</div>
        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: C.body, margin: "0 0 34px" }}>Een paar korte vragen over wat je graag drinkt. Duurt ongeveer een minuut, en je kunt elke vraag overslaan.</p>
        <label htmlFor="survey-naam" style={{ ...serifH(26), marginBottom: 14 }}>Hoe heet je?</label>
        <input id="survey-naam" value={guestName} onChange={e => setGuestName(e.target.value)} autoComplete="given-name" maxLength={40}
          onKeyDown={e => { if (e.key === "Enter" && canStart) go(1); }} enterKeyHint="next"
          style={{ boxSizing: "border-box", width: "100%", height: 56, borderRadius: 14, border: `1px solid ${canStart ? C.gold : "#2E423C"}`, background: "#142A24", color: C.text, fontSize: 19, textAlign: "center", fontFamily: MENU_SANS, outline: "none" }} />
        <p style={{ fontSize: 13, color: C.subtle, margin: "10px 0 0" }}>Zo weet de host wie wat heeft ingevuld.</p>
        <div style={{ flex: 1, minHeight: 30 }} />
        <button onClick={() => go(1)} disabled={!canStart} style={{ ...primaryBtn, opacity: canStart ? 1 : 0.4, cursor: canStart ? "pointer" : "default" }}>Beginnen</button>
      </div></div>
    );
  }

  // ---------- Bedankt ----------
  if (step > QUESTIONS) {
    return (
      <div style={page}><div style={{ ...column, textAlign: "center", paddingTop: "calc(env(safe-area-inset-top) + 70px)" }}>
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><BrandMark width={48} /></div>
        <h1 style={{ ...serifH(38), lineHeight: 1.15, marginBottom: 10 }}>Bedankt, {guestName.trim()}</h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: C.body, margin: 0 }}>
          Je antwoorden zijn naar de host gestuurd.{party.startsAt ? ` Tot ${formatMenuDate(party.startsAt)}.` : ""}
        </p>
        {summaryRows.length > 0 && (
          <>
            <div style={{ height: 1, background: C.gold, opacity: 0.45, margin: "30px 0 20px" }} />
            <div style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.gold, marginBottom: 16 }}>Wat je hebt ingevuld</div>
            <div style={{ textAlign: "left" }}>
              {summaryRows.map(([label, values]) => (
                <div key={label} style={{ display: "flex", gap: 14, padding: "11px 0", borderTop: `1px solid ${C.divider}` }}>
                  <span style={{ width: 96, flexShrink: 0, fontSize: 13.5, color: C.subtle }}>{label}</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.45, color: C.text }}>{values.join(", ")}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ flex: 1, minHeight: 30 }} />
        <button onClick={() => go(1)} style={{ ...primaryBtn, background: "transparent", border: `1.5px solid ${C.gold}`, color: C.gold, height: 50, fontWeight: 600 }}>Antwoorden aanpassen</button>
      </div></div>
    );
  }

  // ---------- Vragen 1..7 ----------
  const isLast = step === QUESTIONS;
  return (
    <div style={page}><div style={column}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, marginBottom: 22 }}>
        <button onClick={() => go(step - 1)} aria-label="Terug" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginLeft: -10, background: "none", border: "none", color: C.body, cursor: "pointer" }}>
          <ChevronLeft size={22} strokeWidth={1.8} />
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} aria-hidden="true">
          {Array.from({ length: QUESTIONS }).map((_, i) => (
            <span key={i} style={i + 1 === step ? { width: 18, height: 6, borderRadius: 3, background: C.gold }
              : { width: 6, height: 6, borderRadius: "50%", background: i + 1 < step ? C.gold : "#2E423C", opacity: i + 1 < step ? 0.55 : 1 }} />
          ))}
        </div>
        <span style={{ width: 44, fontSize: 13, color: C.subtle, textAlign: "right" }}>{step}/{QUESTIONS}</span>
      </div>

      {step === 1 && (<>
        {intro("Welke sterke drank vind je lekker?", TAP_HINT)}
        {choiceGroup("spirits", SURVEY_SPIRITS)}
        {customInput("spirits", "Zelf een sterke drank toevoegen")}
      </>)}

      {step === 2 && (<>
        {intro("En likeuren of aperitieven?", TAP_HINT)}
        {choiceGroup("liqueurs", SURVEY_LIQUEURS)}
        {customInput("liqueurs", "Zelf een likeur toevoegen")}
      </>)}

      {step === 3 && (<>
        {intro("Waar drink je het graag mee?", `Frisdranken, sappen en bubbels. ${TAP_HINT}`)}
        <div style={subLabel}>BRUISEND</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
          {SURVEY_MIXERS.filter(m => m.group === "bruisend").map(o => choiceChip("mixers", o.key, o.label))}
        </div>
        <div style={subLabel}>SAP EN OVERIG</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SURVEY_MIXERS.filter(m => m.group === "sap").map(o => choiceChip("mixers", o.key, o.label))}
          {[...answers.mixers.like, ...answers.mixers.dislike].filter(k => k.startsWith(CUSTOM_PREFIX)).map(k => choiceChip("mixers", k, k.slice(1)))}
        </div>
        {customInput("mixers", "Zelf een mixer toevoegen")}
      </>)}

      {step === 4 && (<>
        {intro("Welke smaken spreken je aan?", TAP_HINT)}
        {choiceGroup("tastes", SURVEY_TASTES)}
        {customInput("tastes", "Zelf een smaak toevoegen")}
      </>)}

      {step === 5 && (<>
        {intro("Wat voor drankje past bij jou?", "Kies er zoveel als je wilt.")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {SURVEY_STYLES.map(s => {
            const on = answers.styles.includes(s.key);
            return (
              <button key={s.key} type="button" onClick={() => toggleList("styles", s.key)} aria-pressed={on} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "18px 10px 14px", borderRadius: 16,
                border: `1px solid ${on ? C.gold : "#2E423C"}`, background: on ? "rgba(198,161,91,0.12)" : "transparent",
                color: C.body, fontFamily: MENU_SANS, cursor: "pointer",
              }}>
                <SurveyGlass kind={s.glass} color={on ? C.gold : C.body} />
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{s.label}</span>
                <span style={{ fontSize: 12.5 }}>{s.example}</span>
              </button>
            );
          })}
        </div>
      </>)}

      {step === 6 && (<>
        <h2 style={{ ...serifH(30), marginBottom: 18 }}>Hoe sterk mag het zijn?</h2>
        {SURVEY_STRENGTHS.map(s => {
          const on = answers.strength === s.key;
          return (
            <button key={s.key} type="button" onClick={() => setAnswers(a => ({ ...a, strength: on ? null : s.key }))} aria-pressed={on} style={{
              display: "flex", alignItems: "center", gap: 12, minHeight: 54, padding: "0 16px", marginBottom: 8, borderRadius: 14,
              border: `1px solid ${on ? C.gold : "#2E423C"}`, background: on ? "rgba(198,161,91,0.12)" : "transparent",
              color: C.text, fontFamily: MENU_SANS, cursor: "pointer", width: "100%",
            }}>
              <span style={{ display: "inline-flex", gap: 4, width: 34 }} aria-hidden="true">
                {[1, 2, 3].map(n => <span key={n} style={{ width: 7, height: 7, borderRadius: "50%", background: n <= s.level ? C.gold : "#2E423C" }} />)}
              </span>
              <span style={{ flex: 1, textAlign: "left", fontSize: 16 }}>{s.label}</span>
              <span style={{ fontSize: 13, color: C.subtle }}>{s.hint}</span>
            </button>
          );
        })}
        <h3 style={{ ...serifH(22), margin: "30px 0 6px" }}>Allergieën of liever niet?</h3>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: C.body, margin: "0 0 14px" }}>De host houdt er rekening mee bij het menu.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SURVEY_ALLERGIES.map(o => {
            const on = answers.allergies.includes(o.key);
            return (
              <button key={o.key} type="button" onClick={() => toggleList("allergies", o.key)} aria-pressed={on} style={chipStyle(on ? "like" : null)}>
                {on && <Check size={15} color={C.gold} strokeWidth={2.4} />}{o.label}
              </button>
            );
          })}
        </div>
      </>)}

      {step === 7 && (<>
        {intro("Heb je favoriete cocktails?", "Zoek en tik aan. Hoeft niet.")}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 50, padding: "0 14px", borderRadius: 14, border: "1px solid #2E423C", background: "#142A24" }}>
            <Search size={18} color={C.subtle} />
            <input value={cocktailQuery} onChange={e => setCocktailQuery(e.target.value)} placeholder="Zoek een cocktail" aria-label="Zoek een cocktail"
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: C.text, fontSize: 16, fontFamily: MENU_SANS, outline: "none" }} />
          </div>
          {cocktailSuggestions.length > 0 && (
            <div style={{ marginTop: 6, borderRadius: 14, border: "1px solid #2E423C", background: "#142A24", overflow: "hidden" }}>
              {cocktailSuggestions.map(r => (
                <button key={r.id} type="button" onClick={() => { setAnswers(a => ({ ...a, favorites: [...a.favorites, r.id] })); setCocktailQuery(""); }} style={{
                  display: "block", width: "100%", minHeight: 44, padding: "10px 14px", textAlign: "left", background: "none", border: "none",
                  borderBottom: `1px solid ${C.divider}`, color: C.text, fontFamily: MENU_SERIF, fontSize: 16, cursor: "pointer",
                }}>{r.name}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 30 }}>
          {answers.favorites.map(id => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 40, padding: "0 4px 0 14px", borderRadius: 100, border: `1px solid ${C.gold}`, background: "rgba(198,161,91,0.16)", fontSize: 15 }}>
              <span style={{ fontFamily: MENU_SERIF, fontWeight: 500 }}>{RECIPES.find(r => r.id === canonicalRecipeId(id))?.name}</span>
              <button type="button" aria-label="Verwijderen" onClick={() => setAnswers(a => ({ ...a, favorites: a.favorites.filter(x => x !== id) }))} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, border: "none", background: "transparent", color: C.body, cursor: "pointer" }}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <label htmlFor="survey-opmerking" style={{ ...serifH(22), marginBottom: 6 }}>Nog iets wat de host moet weten?</label>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: C.body, margin: "0 0 12px" }}>Bijvoorbeeld dat je zwanger bent, rijdt of iets echt niet lust.</p>
        <textarea id="survey-opmerking" rows={4} maxLength={300} value={answers.note} onChange={e => setAnswers(a => ({ ...a, note: e.target.value }))} style={{
          boxSizing: "border-box", width: "100%", padding: 14, borderRadius: 14, border: "1px solid #2E423C", background: "#142A24",
          color: C.text, fontSize: 16, lineHeight: 1.5, fontFamily: MENU_SANS, resize: "none", outline: "none",
        }} />
        {error && <p style={{ color: "#E8A49C", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
      </>)}

      <div style={{ flex: 1, minHeight: 28 }} />
      {isLast ? (
        <button onClick={submit} disabled={submitting} style={primaryBtn}>{submitting ? "Bezig…" : "Versturen"}</button>
      ) : (
        <>
          <button onClick={() => go(step + 1)} style={primaryBtn}>Volgende</button>
          <button onClick={() => go(step + 1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 44, marginTop: 6, background: "none", border: "none", color: C.subtle, fontFamily: MENU_SANS, fontSize: 14.5, cursor: "pointer" }}>Overslaan</button>
        </>
      )}
    </div></div>
  );
}

// Nog geen App Store-pagina: de footer van de menukaart linkt dan naar de webversie.
const APP_STORE_URL = "";

export { GuestSurveyView, GuestMenuView };
