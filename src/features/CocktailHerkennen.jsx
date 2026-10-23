// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// "Wat drink ik hier?": foto van je glas → de app stelt voor welke cocktail
// het is (hooguit drie keuzes) → je checkt hem in met je foto erbij.
import { useState, useRef, useMemo, useEffect } from "react";
import { fetchAiTegoed, recognizeCocktail } from "../ai.js";
import { imageToJpegDataUrl } from "../checkinPhotos.js";
import { Capacitor } from "@capacitor/core";
import { createPortal } from "react-dom";
import { X, Camera, RefreshCw, Search } from "lucide-react";
import { BORDER, BOTTLE, BOTTLE_DARK, BRASS_TEXT, CREAM, HEADER_TEXT, INK, MUTED, PAPER, PAPER_DEEP, RecipeCircle, SAGE_TEXT, sans, serif, useBodyScrollLock } from "../ThuisbarApp.jsx";

const ZEKERHEID = {
  zeker: { label: "Vrij zeker", color: SAGE_TEXT },
  waarschijnlijk: { label: "Waarschijnlijk", color: BRASS_TEXT },
  misschien: { label: "Een gok", color: MUTED },
};

function RecognizeSheet({ recipes, allIngredients, onPick, onSearch, onClose }) {
  useBodyScrollLock();
  const [stap, setStap] = useState("kiezen"); // kiezen | bezig | resultaat
  const [preview, setPreview] = useState(null);
  const [kandidaten, setKandidaten] = useState([]);
  const [uitleg, setUitleg] = useState("");
  const [keuze, setKeuze] = useState(0);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(null);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const byId = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  useEffect(() => { fetchAiTegoed().then(t => t && setOver(t.scan)); }, []);

  const analyse = async (src) => {
    setError(null);
    setStap("bezig");
    // Zelfde formaat als een gewone check-in-foto, zodat hij er zo bij kan.
    try { setPreview(await imageToJpegDataUrl(src, 1440, 0.82)); } catch { setPreview(null); }
    let res;
    try { res = await recognizeCocktail(src, recipes); } catch { res = { error: "fout", message: "Deze foto kon niet gelezen worden. Probeer een andere." }; }
    if (typeof res.over === "number") setOver(res.over);
    if (res.error) { setError(res.message); setStap("kiezen"); return; }
    setKandidaten((res.kandidaten || []).filter(k => byId.has(k.id)));
    setUitleg(res.uitleg || "");
    setKeuze(0);
    setStap("resultaat");
  };
  const pick = async (bron) => {
    if (!Capacitor.isNativePlatform()) { (bron === "camera" ? cameraRef : libraryRef).current?.click(); return; }
    try {
      const { Camera: Cam, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const shot = await Cam.getPhoto({
        resultType: CameraResultType.DataUrl, source: bron === "camera" ? CameraSource.Camera : CameraSource.Photos,
        saveToGallery: bron === "camera", quality: 90, width: 2048, correctOrientation: true,
      });
      if (shot?.dataUrl) analyse(shot.dataUrl);
    } catch (err) {
      if (!/cancel/i.test(String(err?.message || err))) setError("De camera kon niet worden geopend.");
    }
  };
  const onFile = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) analyse(f); };
  const opnieuw = () => { setKandidaten([]); setUitleg(""); setPreview(null); setStap("kiezen"); };

  const gekozen = kandidaten[keuze] ? byId.get(kandidaten[keuze].id) : null;
  const zeker = kandidaten[keuze] ? ZEKERHEID[kandidaten[keuze].zekerheid] || ZEKERHEID.misschien : null;
  const anderen = kandidaten.map((k, i) => ({ ...k, i })).filter(k => k.i !== keuze);
  const disabled = stap === "bezig" || over === 0;

  return createPortal((
    <div className="push-slide-in" style={{ position: "fixed", inset: 0, zIndex: 50, background: "#111312", color: "#F0EDE6", display: "flex", flexDirection: "column", fontFamily: sans }}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
      <input ref={libraryRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
      <div style={{ flexShrink: 0, maxWidth: 720, width: "100%", margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 6px) 12px 8px", display: "flex", alignItems: "center", boxSizing: "border-box", minHeight: 52 }}>
        <button onClick={onClose} aria-label="Sluiten" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.08)", color: "inherit", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={20} /></button>
        <span style={{ flex: 1, textAlign: "center", fontFamily: serif, fontSize: 20, fontWeight: 700 }}>Wat drink ik hier?</span>
        <span style={{ width: 44 }} />
      </div>

      {stap !== "resultaat" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 560, width: "100%", margin: "0 auto", padding: "4px 16px calc(env(safe-area-inset-bottom) + 18px)", boxSizing: "border-box", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, borderRadius: 24, background: "#2A2622", overflow: "hidden", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {preview ? <img src={preview} alt="Je foto" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: stap === "bezig" ? 0.55 : 1 }} />
              : <Camera size={54} strokeWidth={1.3} color="#5A4A3A" />}
            {stap === "bezig" && (
              <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, background: "rgba(17,19,18,0.82)", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                <RefreshCw size={18} className="spin-icon" color="#D4A54A" /> De bartender bekijkt je glas…
              </div>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: "#9C9B95", lineHeight: 1.45, margin: "14px 4px 0" }}>
            Maak een foto van je glas, van dichtbij en met de garnering erop. Je kiest daarna zelf wat je incheckt; de foto wordt alleen bewaard als je hem bij je check-in houdt.
          </div>
          {error && <div role="alert" style={{ marginTop: 10, fontSize: 13.5, color: "#F0B8B0", background: "rgba(213,140,131,0.12)", borderRadius: 12, padding: "10px 12px", lineHeight: 1.45 }}>{error}</div>}
          <button onClick={() => pick("camera")} disabled={disabled} className="press-scale" style={{ marginTop: 14, minHeight: 52, borderRadius: 26, border: "none", background: "#D4A54A", color: "#2B2620", fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: disabled ? 0.5 : 1 }}>
            <Camera size={19} /> {preview ? "Nieuwe foto maken" : "Foto maken"}
          </button>
          <button onClick={() => pick("fotorol")} disabled={disabled} style={{ marginTop: 8, minHeight: 46, borderRadius: 23, border: "1px solid #2A2E2C", background: "none", color: "#F0EDE6", fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer", opacity: disabled ? 0.5 : 1 }}>
            Kies uit je foto's
          </button>
          {over != null && <div style={{ fontSize: 12, color: "#9C9B95", textAlign: "center", marginTop: 10 }}>{over === 0 ? "Je scans voor vandaag zijn op. Morgen kan het weer." : `Nog ${over} ${over === 1 ? "scan" : "scans"} vandaag (samen met flessen scannen)`}</div>}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {preview && <img src={preview} alt="Je foto" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88%", overflowY: "auto", background: PAPER, color: INK, borderRadius: "22px 22px 0 0", boxShadow: "0 -10px 30px rgba(0,0,0,0.3)" }}>
            <div style={{ maxWidth: 560, margin: "0 auto", padding: "10px 18px calc(env(safe-area-inset-bottom) + 18px)" }}>
              <div style={{ width: 40, height: 5, borderRadius: 3, background: BORDER, margin: "0 auto 14px" }} />
              {gekozen ? (
                <>
                  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: BRASS_TEXT }}>Dit lijkt op</div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", margin: "8px 0 12px" }}>
                    <RecipeCircle recipe={gekozen} allIngredients={allIngredients} size={74} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: serif, fontSize: 25, fontWeight: 700, color: BOTTLE, lineHeight: 1.15 }}>{gekozen.name}</div>
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, fontWeight: 700, color: zeker.color, marginTop: 4 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: zeker.color, display: "inline-block" }} />{zeker.label}
                      </div>
                    </div>
                  </div>
                  {uitleg && keuze === 0 && <div style={{ fontSize: 13.5, lineHeight: 1.5, background: PAPER_DEEP, borderRadius: 14, padding: "11px 13px", marginBottom: 12 }}>{uitleg}</div>}
                  {anderen.length > 0 && (
                    <>
                      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: BRASS_TEXT, marginBottom: 8 }}>{keuze === 0 ? "Of misschien" : "Andere keuzes"}</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                        {anderen.map(k => {
                          const r = byId.get(k.id);
                          return (
                            <button key={k.id} onClick={() => setKeuze(k.i)} className="press-scale" style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "center", padding: 8, borderRadius: 12, border: `1px solid ${BORDER}`, background: CREAM, fontFamily: sans, fontSize: 13, fontWeight: 600, color: INK, cursor: "pointer", textAlign: "left" }}>
                              <RecipeCircle recipe={r} allIngredients={allIngredients} size={30} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <button onClick={() => onPick(gekozen.name, preview)} className="press-scale" style={{ width: "100%", minHeight: 52, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                    Inchecken als {gekozen.name}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: serif, fontSize: 23, fontWeight: 700, color: BOTTLE, marginBottom: 8 }}>Geen cocktail herkend</div>
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: INK, marginBottom: 14 }}>
                    {uitleg || "Op deze foto kan ik geen cocktail uit de app herkennen."} Probeer een foto van dichterbij, of zoek hem zelf op.
                  </div>
                  <button onClick={opnieuw} className="press-scale" style={{ width: "100%", minHeight: 52, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Camera size={18} /> Nieuwe foto
                  </button>
                </>
              )}
              <button onClick={onSearch} style={{ width: "100%", minHeight: 46, marginTop: 6, border: "none", background: "none", color: BOTTLE, fontFamily: sans, fontSize: 14.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Search size={16} /> {gekozen ? "Toch iets anders, zelf zoeken" : "Zelf zoeken"}
              </button>
              <div style={{ fontSize: 11.5, color: MUTED, textAlign: "center", lineHeight: 1.4 }}>
                De foto wordt alleen bewaard als je hem bij je check-in houdt.{over != null ? ` Nog ${over} ${over === 1 ? "scan" : "scans"} vandaag.` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  ), document.body);
}

export { RecognizeSheet };
