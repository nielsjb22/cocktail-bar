// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { BORDER, CREAM, INK, MUTED, PAPER_DEEP, SHADOW_CARD, sans } from "../ThuisbarApp.jsx";

// Lettertypes (SIL OFL) en open-sourcepakketten met hun licentietekst, uit
// src/data/licenses.json (npm run sync:licenses). Pas geladen als je het
// scherm opent, zodat de app er niet zwaarder van wordt.
function LicensesScreen({ active }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!active || data) return;
    import("../data/licenses.json").then(m => setData(m.default || m));
  }, [active, data]);
  const Pre = ({ children }) => (
    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, lineHeight: 1.5, color: INK, background: PAPER_DEEP, borderRadius: 10, padding: 12, margin: "8px 0 4px" }}>{children}</pre>
  );
  const Row = ({ id, title, sub, children }) => (
    <div style={{ borderTop: `1px solid ${BORDER}` }}>
      <button onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "none", border: "none",
        cursor: "pointer", padding: "12px 16px", fontFamily: sans, color: INK,
      }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{title}</span>
          <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{sub}</span>
        </span>
        {open === id ? <ChevronUp size={16} color={MUTED} /> : <ChevronDown size={16} color={MUTED} />}
      </button>
      {open === id && <div style={{ padding: "0 16px 12px" }}>{children}</div>}
    </div>
  );
  const Card = ({ title, children }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 4px 8px" }}>{title}</div>
      <div style={{ background: CREAM, boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden" }}><div style={{ marginTop: -1 }}>{children}</div></div>
    </div>
  );
  if (!data) return <p style={{ fontSize: 13.5, color: MUTED }}>Laden…</p>;
  return (
    <div>
      <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.65, margin: "0 0 18px" }}>
        Mijn Thuisbar is gebouwd met open-sourcesoftware en vrije lettertypes. Hieronder staan ze met hun licentie. Foto's staan met maker en licentie onder Fotoverantwoording.
      </p>
      <Card title="Lettertypes">
        {data.lettertypes.map(f => (
          <Row key={f.naam} id={`font-${f.naam}`} title={f.naam} sub={f.licentie}>
            <Pre>{f.copyright}{"\n\n"}{data.oflTekst}</Pre>
          </Row>
        ))}
      </Card>
      <Card title="Kaarten">
        <Row id="osm" title="OpenStreetMap" sub="Kaartgegevens © OpenStreetMap-bijdragers, ODbL">
          <p style={{ fontSize: 13, color: INK, lineHeight: 1.6, margin: "4px 0" }}>
            Kaartgegevens en plaatsnamen komen van OpenStreetMap en zijn beschikbaar onder de Open Database License (openstreetmap.org/copyright). De kaart op je profiel gebruikt Apple Maps.
          </p>
        </Row>
      </Card>
      <Card title={`Open-sourcesoftware (${data.pakketten.length})`}>
        {data.pakketten.map(p => (
          <Row key={p.naam} id={`pkg-${p.naam}`} title={p.naam} sub={`${p.versie} · ${p.licentie}`}>
            <Pre>{p.tekst || `Licentie: ${p.licentie}`}</Pre>
          </Row>
        ))}
      </Card>
    </div>
  );
}

export { LicensesScreen };
