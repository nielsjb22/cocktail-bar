// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { canonicalRecipeId } from "../recipes.js";
import { ChevronRight } from "lucide-react";
import { BORDER, BOTTLE, BURGUNDY, CREAM, INK, MUTED, PAPER_DEEP, SHADOW_CARD, SectionLabel, formatRating, sans, serif, systemFont } from "../ThuisbarApp.jsx";

// Toont automatisch alle bron/maker/licentie-gegevens uit images.json — geen
// handmatig bij te werken lijst, dus loopt vanzelf mee zodra fetch-image.mjs
// nieuwe foto's toevoegt. Alleen entries met een echt bestand én attributie
// worden getoond (illustraties/eigen werk hebben geen externe bron nodig).
// Beheer: gemelde check-ins bekijken en afhandelen. Apple verwacht dat
// gemelde content binnen 24 uur bekeken wordt; een nieuwe melding geeft de
// beheerder een pushmelding (functie Push).
function ReportsAdminScreen({ active }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = async () => {
    const { data, error: err } = await supabase.rpc("beheer_meldingen");
    if (err) { setError(err.message); setItems([]); return; }
    setError(null);
    setItems(data || []);
  };
  useEffect(() => { if (active) load(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const handle = async (item, uitkomst) => {
    if (uitkomst === "verwijderd" && !window.confirm(`De check-in "${item.checkin_naam || "onbekend"}" van ${item.eigenaar_naam || "deze gebruiker"} definitief verwijderen?`)) return;
    setBusy(item.melding_id);
    const { error: err } = await supabase.rpc("beheer_melding_afhandelen", { p_melding_id: item.melding_id, p_uitkomst: uitkomst });
    setBusy(null);
    if (err) { setError(err.message); return; }
    setItems(cur => (cur || []).filter(x => x.melding_id !== item.melding_id));
  };
  const when = (iso) => {
    const d = new Date(iso);
    const uren = Math.floor((Date.now() - d.getTime()) / 3600000);
    return uren < 1 ? "net gemeld" : uren < 24 ? `${uren} uur geleden` : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
  };
  return (
    <div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 16px" }}>
        Bekijk elke melding binnen 24 uur. Is er niets aan de hand, tik dan op "Niets aan de hand". Hoort de check-in niet in de app, verwijder hem dan.
      </p>
      {error && <div style={{ fontSize: 13, color: BURGUNDY, marginBottom: 12 }}>Laden lukte niet: {error}</div>}
      {items === null ? (
        <p style={{ fontSize: 13.5, color: MUTED, textAlign: "center", padding: "30px 0" }}>Laden...</p>
      ) : items.length === 0 ? (
        <div style={{ background: CREAM, boxShadow: SHADOW_CARD, borderRadius: 16, padding: "26px 20px", textAlign: "center" }}>
          <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 16, color: INK }}>Geen open meldingen</div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Alles is afgehandeld.</p>
        </div>
      ) : items.map(item => (
        <div key={item.melding_id} style={{ background: CREAM, boxShadow: SHADOW_CARD, borderRadius: 16, padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {item.checkin_foto ? (
              <img src={item.checkin_foto} alt="" style={{ width: 84, height: 84, borderRadius: 12, objectFit: "cover", flexShrink: 0, background: PAPER_DEEP }} />
            ) : (
              <div style={{ width: 84, height: 84, borderRadius: 12, background: PAPER_DEEP, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 15.5, color: INK }}>{item.bestaat_nog ? (item.checkin_naam || "Check-in") : "Check-in bestaat niet meer"}</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Van {item.eigenaar_naam || "onbekend"} · {when(item.gemeld_op)}</div>
              <div style={{ fontSize: 12.5, color: BURGUNDY, marginTop: 2, fontWeight: 600 }}>{item.aantal}x gemeld{item.melders ? ` door ${item.melders}` : ""}</div>
            </div>
          </div>
          {item.checkin_notitie && <div style={{ fontSize: 14, color: INK, lineHeight: 1.5, marginTop: 10, whiteSpace: "pre-wrap" }}>{item.checkin_notitie}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button disabled={busy === item.melding_id} onClick={() => handle(item, "ok")} className="press-scale" style={{ flex: 1, minHeight: 42, borderRadius: 12, border: `1.5px solid ${BOTTLE}`, background: "none", color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Niets aan de hand</button>
            {item.bestaat_nog && (
              <button disabled={busy === item.melding_id} onClick={() => handle(item, "verwijderd")} className="press-scale" style={{ flex: 1, minHeight: 42, borderRadius: 12, border: "none", background: BURGUNDY, color: "#FBF6EA", fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Verwijderen</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Beheer: wat de app van gebruikers leert (idee 3 en 4). Niets gaat
// automatisch live; de beheerder beslist.
const SIGNAAL_TEKST = {
  te_zoet: ["te zoet", "Minder suikersiroop of likeur, bijvoorbeeld 5 ml minder, of iets meer citrus."],
  te_zuur: ["te zuur", "Iets meer suikersiroop (5 ml) of iets minder citroen- of limoensap."],
  te_sterk: ["te sterk", "Minder sterke drank of langer shaken/roeren voor meer verdunning; of meer aanvulling."],
  te_slap: ["waterig of flauw", "Korter roeren of shaken, groter ijs, of iets meer sterke drank of likeur."],
  te_bitter: ["te bitter", "Minder bitter (Campari, amaro, bitters) of iets meer zoet."],
};

function InsightsAdminScreen({ active, recipes, onOpenRecipe }) {
  const [missing, setMissing] = useState(null);
  const [signals, setSignals] = useState(null);
  const [error, setError] = useState(null);
  const known = useMemo(() => new Set(recipes.map(r => r.name.trim().toLowerCase())), [recipes]);
  const byId = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  const load = async () => {
    const [m, sg] = await Promise.all([supabase.rpc("beheer_ontbrekende_recepten"), supabase.rpc("beheer_recept_signalen")]);
    if (m.error || sg.error) setError((m.error || sg.error).message);
    setMissing((m.data || []).filter(x => !known.has((x.naam || "").trim().toLowerCase())));
    setSignals((sg.data || []).map(x => {
      const n = Number(x.checkins) || 1;
      const issues = Object.keys(SIGNAAL_TEKST).map(k => ({ k, count: Number(x[k]) || 0 })).filter(i => i.count >= 2 && i.count / n >= 0.25).sort((a, b) => b.count - a.count);
      const low = Number(x.gemiddeld) < 3.5;
      return { ...x, n, issues, low, recipe: byId.get(canonicalRecipeId(x.recipe_id)) };
    }).filter(x => x.recipe && (x.low || x.issues.length > 0)).sort((a, b) => (b.issues[0]?.count || 0) - (a.issues[0]?.count || 0) || a.gemiddeld - b.gemiddeld));
  };
  useEffect(() => { if (active) load(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const ignore = async (soort, sleutel) => {
    await supabase.rpc("beheer_negeren", { p_soort: soort, p_sleutel: sleutel });
    if (soort === "recept") setMissing(cur => (cur || []).filter(x => x.sleutel !== sleutel));
    else setSignals(cur => (cur || []).filter(x => x.recipe_id !== sleutel));
  };
  const card = { background: CREAM, boxShadow: SHADOW_CARD, borderRadius: 16, padding: 14, marginBottom: 10 };
  const smallBtn = { minHeight: 36, padding: "0 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "none", color: MUTED, fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer" };
  return (
    <div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 16px" }}>
        Anonieme signalen van alle gebruikers samen. Alleen dingen die minstens 2 à 3 verschillende mensen deden staan hier. Niets wordt automatisch aangepast: jij beslist.
      </p>
      {error && <div style={{ fontSize: 13, color: BURGUNDY, marginBottom: 12 }}>Laden lukte niet: {error}</div>}

      <SectionLabel>Ontbrekende recepten</SectionLabel>
      {missing === null ? <p style={{ fontSize: 13.5, color: MUTED }}>Laden...</p> : missing.length === 0 ? (
        <div style={{ ...card, fontSize: 13.5, color: MUTED }}>Nog niets: iedereen vindt wat hij zoekt.</div>
      ) : missing.map(x => (
        <div key={x.sleutel} style={card}>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: INK }}>{x.naam}</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
            {x.mensen} mensen · {x.ingecheckt > 0 ? `${x.ingecheckt}x ingecheckt` : ""}{x.ingecheckt > 0 && x.gezocht > 0 ? " · " : ""}{x.gezocht > 0 ? `${x.gezocht}x gezocht` : ""}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { navigator.clipboard?.writeText(x.naam).catch(() => {}); window.alert(`"${x.naam}" is gekopieerd. Stuur het naar Claude om het recept (met verhaal en foto) toe te voegen.`); }} style={{ ...smallBtn, borderColor: BOTTLE, color: BOTTLE }}>Toevoegen aanvragen</button>
            <button onClick={() => ignore("recept", x.sleutel)} style={smallBtn}>Negeren</button>
          </div>
        </div>
      ))}

      <div style={{ height: 14 }} />
      <SectionLabel>Recepten die beter kunnen</SectionLabel>
      {signals === null ? <p style={{ fontSize: 13.5, color: MUTED }}>Laden...</p> : signals.length === 0 ? (
        <div style={{ ...card, fontSize: 13.5, color: MUTED }}>Nog geen signalen. Pas als minstens 3 mensen een recept maakten, telt het mee.</div>
      ) : signals.map(x => (
        <div key={x.recipe_id} style={card}>
          <button onClick={() => onOpenRecipe(x.recipe.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: serif, fontWeight: 700, fontSize: 17, color: INK }}>
            {x.recipe.name} <ChevronRight size={15} color={MUTED} style={{ verticalAlign: "-2px" }} />
          </button>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{x.checkins}x gemaakt door {x.mensen} mensen · gemiddeld {formatRating(Number(x.gemiddeld))} / 5</div>
          {x.issues.map(i => (
            <div key={i.k} style={{ fontSize: 13.5, color: INK, marginTop: 8, lineHeight: 1.45 }}>
              <strong>{i.count} van {x.n}</strong> vonden hem {SIGNAAL_TEKST[i.k][0]}. <span style={{ color: MUTED }}>Voorstel: {SIGNAAL_TEKST[i.k][1]}</span>
            </div>
          ))}
          {x.issues.length === 0 && x.low && <div style={{ fontSize: 13.5, color: INK, marginTop: 8 }}>Lager gemiddeld cijfer dan de meeste recepten. Lees de check-ins voor de reden.</div>}
          <div style={{ marginTop: 10 }}><button onClick={() => ignore("receptsignaal", x.recipe_id)} style={smallBtn}>Gezien, verbergen</button></div>
        </div>
      ))}
    </div>
  );
}

export { InsightsAdminScreen, ReportsAdminScreen };
