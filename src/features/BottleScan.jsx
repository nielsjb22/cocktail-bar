// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useRef, useMemo, useEffect } from "react";
import { fetchAiTegoed, scanBottles } from "../ai.js";
import { imageToJpegDataUrl } from "../checkinPhotos.js";
import { Capacitor } from "@capacitor/core";
import { createPortal } from "react-dom";
import { X, Camera, RefreshCw, Check, Search } from "lucide-react";
import { BORDER, BOTTLE, BOTTLE_DARK, BRASS, BRASS_TEXT, CREAM, FILL_LEVELS, HEADER_TEXT, INK, ItemArt, MUTED, PAPER, PAPER_DEEP, SAGE, SAGE_TEXT, SHADOW_CARD, sans, serif, useBodyScrollLock } from "../ThuisbarApp.jsx";

// Foto van je flessen → lijst om te controleren → in je voorraad.
function BottleScanSheet({ allIngredients, voorraad, onAdd, onClose, onSearchManual }) {
  useBodyScrollLock();
  const [stap, setStap] = useState("kiezen"); // kiezen | bezig | resultaat
  const [preview, setPreview] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(null);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const byId = useMemo(() => new Map(allIngredients.map(i => [i.id, i])), [allIngredients]);
  useEffect(() => { fetchAiTegoed().then(t => t && setOver(t.scan)); }, []);

  const analyse = async (src) => {
    setError(null);
    setStap("bezig");
    try { setPreview(await imageToJpegDataUrl(src, 900, 0.75)); } catch { setPreview(null); }
    let res;
    try { res = await scanBottles(src, allIngredients); } catch { res = { error: "fout", message: "Deze foto kon niet gelezen worden. Probeer een andere." }; }
    if (typeof res.over === "number") setOver(res.over);
    if (res.error) { setError(res.message); setStap("kiezen"); return; }
    const found = (res.flessen || []).filter(f => byId.has(f.id));
    setItems(found.map(f => ({ ...f, keuze: f.id, on: !voorraad.has(f.id), aantal: 1, niveau: "vol" })));
    setStap("resultaat");
  };
  const pick = async (bron) => {
    if (!Capacitor.isNativePlatform()) { (bron === "camera" ? cameraRef : libraryRef).current?.click(); return; }
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const shot = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl, source: bron === "camera" ? CameraSource.Camera : CameraSource.Photos,
        saveToGallery: false, quality: 90, width: 2048, correctOrientation: true,
      });
      if (shot?.dataUrl) analyse(shot.dataUrl);
    } catch (err) {
      if (!/cancel/i.test(String(err?.message || err))) setError("De camera kon niet worden geopend.");
    }
  };
  const onFile = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) analyse(f); };

  const rows = items.map(it => {
    const ing = byId.get(it.keuze);
    const al = voorraad.has(it.keuze);
    return { ...it, ing, al };
  });
  const toAdd = rows.filter(r => r.on);
  const nNieuw = toAdd.filter(r => !r.al).length, nBij = toAdd.length - nNieuw;
  const ctaTekst = toAdd.length === 0 ? "Niets geselecteerd"
    : nBij === 0 ? `${nNieuw} ${nNieuw === 1 ? "fles" : "flessen"} toevoegen aan voorraad`
    : nNieuw === 0 ? `${nBij} ${nBij === 1 ? "fles" : "flessen"} bijwerken`
    : `${nNieuw} toevoegen, ${nBij} bijwerken`;
  const update = (idx, patch) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const badge = (label, bg, color) => <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 100, background: bg, color }}>{label}</span>;
  const dark = stap !== "resultaat";

  return createPortal((
    <div className="push-slide-in" style={{ position: "fixed", inset: 0, zIndex: 40, background: dark ? "#111312" : PAPER, color: dark ? "#F0EDE6" : INK, display: "flex", flexDirection: "column", fontFamily: sans }}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
      <input ref={libraryRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
      <div style={{ flexShrink: 0, maxWidth: 720, width: "100%", margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 6px) 12px 8px", display: "flex", alignItems: "center", boxSizing: "border-box", minHeight: 52 }}>
        <button onClick={onClose} aria-label="Sluiten" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: dark ? "rgba(255,255,255,0.08)" : PAPER_DEEP, color: "inherit", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={20} /></button>
        <span style={{ flex: 1, textAlign: "center", fontFamily: serif, fontSize: 20, fontWeight: 700, color: dark ? "inherit" : BOTTLE }}>{stap === "resultaat" ? "Gevonden flessen" : "Flessen scannen"}</span>
        <span style={{ width: 44 }} />
      </div>

      {stap !== "resultaat" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 560, width: "100%", margin: "0 auto", padding: "4px 16px calc(env(safe-area-inset-bottom) + 18px)", boxSizing: "border-box", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, borderRadius: 24, background: "#2A2622", overflow: "hidden", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {preview ? <img src={preview} alt="Je foto" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: stap === "bezig" ? 0.55 : 1 }} />
              : <Camera size={54} strokeWidth={1.3} color="#5A4A3A" />}
            {stap === "bezig" && (
              <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, background: "rgba(17,19,18,0.82)", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                <RefreshCw size={18} className="spin-icon" color="#D4A54A" /> De bartender bekijkt je flessen…
              </div>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: "#9C9B95", lineHeight: 1.45, margin: "14px 4px 0" }}>
            Zet de flessen naast elkaar met het etiket naar voren. Je controleert daarna zelf wat erbij komt; de foto wordt niet bewaard.
          </div>
          {error && <div role="alert" style={{ marginTop: 10, fontSize: 13.5, color: "#F0B8B0", background: "rgba(213,140,131,0.12)", borderRadius: 12, padding: "10px 12px", lineHeight: 1.45 }}>{error}</div>}
          <button onClick={() => pick("camera")} disabled={stap === "bezig" || over === 0} className="press-scale" style={{ marginTop: 14, minHeight: 52, borderRadius: 26, border: "none", background: "#D4A54A", color: "#2B2620", fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: stap === "bezig" || over === 0 ? 0.5 : 1 }}>
            <Camera size={19} /> {preview ? "Nieuwe foto maken" : "Foto maken"}
          </button>
          <button onClick={() => pick("fotorol")} disabled={stap === "bezig" || over === 0} style={{ marginTop: 8, minHeight: 46, borderRadius: 23, border: "1px solid #2A2E2C", background: "none", color: "#F0EDE6", fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer", opacity: stap === "bezig" || over === 0 ? 0.5 : 1 }}>
            Kies uit je foto's
          </button>
          {over != null && <div style={{ fontSize: 12, color: "#9C9B95", textAlign: "center", marginTop: 10 }}>{over === 0 ? "Je scans voor vandaag zijn op. Morgen kan het weer." : `Nog ${over} ${over === 1 ? "scan" : "scans"} vandaag`}</div>}
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
            <div style={{ maxWidth: 560, margin: "0 auto", padding: "6px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 14, color: MUTED, margin: "0 4px 2px" }}>{rows.length ? "Tik aan wat klopt en vul in hoeveel je hebt." : "Er is geen fles herkend. Probeer een foto van dichterbij, met de etiketten naar voren."}</div>
              {rows.map((r, idx) => (
                <div key={r.id} style={{ background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD, overflow: "hidden", outline: r.on ? `2px solid ${SAGE}` : "none", outlineOffset: -2 }}>
                  <button onClick={() => update(idx, { on: !r.on })} aria-pressed={r.on} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 12, border: "none", background: "none",
                    cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
                  }}>
                    <span style={{ width: 46, height: 46, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}><ItemArt ing={r.ing} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15.5, fontWeight: 600 }}>{r.ing.name}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.merk ? `Etiket: ${r.merk}` : "Etiket niet leesbaar"}</span>
                      <span style={{ display: "inline-block", marginTop: 5 }}>
                        {r.al ? badge("Al in voorraad", PAPER_DEEP, MUTED) : r.zeker ? badge("Zeker", "rgba(92,122,82,0.16)", SAGE_TEXT) : badge("Twijfel", "rgba(184,134,46,0.18)", BRASS_TEXT)}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", boxSizing: "border-box", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: r.on ? SAGE : "transparent", border: r.on ? "none" : `1.5px solid ${BORDER}` }}>
                      {r.on && <Check size={17} strokeWidth={3} color={CREAM} />}
                    </span>
                  </button>
                  {r.alternatief && byId.has(r.alternatief) && (
                    <div style={{ padding: "0 12px 12px" }}>
                      <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>Welke is het?</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[r.id, r.alternatief].map(opt => {
                          const on = r.keuze === opt;
                          return (
                            <button key={opt} onClick={() => update(idx, { keuze: opt, on: true })} aria-pressed={on} style={{
                              flex: 1, minHeight: 42, borderRadius: 21, fontFamily: sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                              border: `1px solid ${on ? BOTTLE : BORDER}`, background: on ? BOTTLE : PAPER, color: on ? CREAM : INK,
                            }}>{byId.get(opt).name}</button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {r.on && (
                    <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Aantal flessen</span>
                        <button onClick={() => update(idx, { aantal: Math.max(1, r.aantal - 1) })} disabled={r.aantal <= 1} aria-label={`Eén ${r.ing.name} minder`} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: PAPER_DEEP, color: INK, fontSize: 20, fontWeight: 600, cursor: "pointer", opacity: r.aantal <= 1 ? 0.4 : 1 }}>−</button>
                        <span aria-live="polite" style={{ minWidth: 26, textAlign: "center", fontSize: 17, fontWeight: 700 }}>{r.aantal}</span>
                        <button onClick={() => update(idx, { aantal: Math.min(20, r.aantal + 1) })} aria-label={`Eén ${r.ing.name} meer`} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: PAPER_DEEP, color: INK, fontSize: 20, fontWeight: 600, cursor: "pointer" }}>+</button>
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Hoe vol?</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {FILL_LEVELS.filter(l => l.key !== "op").map(l => {
                            const on = r.niveau === l.key;
                            return (
                              <button key={l.key} onClick={() => update(idx, { niveau: l.key })} aria-pressed={on} style={{
                                flex: 1, minHeight: 42, borderRadius: 21, fontFamily: sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                                border: `1px solid ${on ? BOTTLE : BORDER}`, background: on ? BOTTLE : PAPER, color: on ? CREAM : INK,
                              }}>{l.label}</button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 16, padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 46, height: 46, borderRadius: 12, background: PAPER_DEEP, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Search size={20} /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>Fles gemist?</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED }}>Zoek hem zelf op in je voorraad</span>
                </span>
                <button onClick={onSearchManual} style={{ minHeight: 40, padding: "0 14px", borderRadius: 20, border: `1px solid ${BRASS}`, background: "none", color: BRASS_TEXT, fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Zoeken</button>
              </div>
              <button onClick={() => { setItems([]); setPreview(null); setStap("kiezen"); }} style={{ minHeight: 44, border: "none", background: "none", color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Nog een foto scannen</button>
            </div>
          </div>
          <div style={{ flexShrink: 0, background: PAPER_DEEP, borderTop: `1px solid ${BORDER}`, padding: "12px 16px calc(env(safe-area-inset-bottom) + 12px)" }}>
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <button disabled={toAdd.length === 0} onClick={() => onAdd(toAdd.map(r => ({ id: r.keuze, merk: r.zeker && r.keuze === r.id ? r.merk : null, aantal: r.aantal, niveau: r.niveau })))} className="press-scale" style={{
                width: "100%", minHeight: 52, borderRadius: 26, border: "none", fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: toAdd.length ? "pointer" : "default",
                background: toAdd.length ? BOTTLE_DARK : BORDER, color: toAdd.length ? HEADER_TEXT : MUTED,
              }}>{ctaTekst}</button>
              <div style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 8 }}>Je foto wordt niet bewaard{over != null ? ` · Nog ${over} ${over === 1 ? "scan" : "scans"} vandaag` : ""}</div>
            </div>
          </div>
        </>
      )}
    </div>
  ), document.body);
}

export { BottleScanSheet };
