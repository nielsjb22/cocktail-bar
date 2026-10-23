// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useRef, useState, useMemo, useEffect } from "react";
import { useMapEngine, createAppleMap } from "../appleMaps";
import L from "leaflet";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { BORDER, BOTTLE, BOTTLE_DARK, BRASS, CREAM, GRONINGEN_VIEWBOX, INK, MUTED, PAPER, PAPER_DEEP, systemFont, useBodyScrollLock } from "../ThuisbarApp.jsx";

// Vrij ingetypte locatienamen ("Cocktailbar Groningen") hebben geen
// coördinaten — die zoeken we één keer op via Nominatim (OpenStreetMap) en
// bewaren we daarna in localStorage, zodat we niet bij elke render (of voor
// dezelfde plek twee keer) opnieuw het netwerk op hoeven.
const GEOCODE_CACHE_KEY = "thuisbar-geocode-cache";

function readGeocodeCache() {
  try { return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || "{}"); } catch { return {}; }
}

function writeGeocodeCache(cache) {
  try { localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch { /* niet kritiek */ }
}

// Groningen als "thuisbasis" van de kaart: default middelpunt én een zachte
// voorkeur (geen harde begrenzing) bij het zoeken, zodat een kale bar-naam
// als "De Kroeg" eerder de Groningse tent oplevert dan een gelijknamige
// ergens anders — een stad erbij typen ("Bar X, Barcelona") werkt gewoon.
const GRONINGEN = { lat: 53.2194, lon: 6.5665 };

async function geocodeLocation(name) {
  const key = name.trim().toLowerCase();
  const cache = readGeocodeCache();
  if (key in cache) return cache[key];
  try {
    const params = new URLSearchParams({ format: "jsonv2", limit: "1", viewbox: GRONINGEN_VIEWBOX, bounded: "0", q: name });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    const data = await res.json();
    const result = data && data[0] ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
    cache[key] = result;
    writeGeocodeCache(cache);
    return result;
  } catch (e) {
    return null; // netwerkfout: niet cachen, gewoon nog eens proberen bij de volgende keer openen
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

// Pinnen voor de kaart: alleen locaties waarvan de coördinaten bekend zijn.
function mapPoints(locations, coords) {
  return locations.map(loc => {
    const key = loc.name.trim().toLowerCase();
    const c = loc.lat != null ? { lat: loc.lat, lon: loc.lon } : coords[key];
    if (!c) return null;
    return { key, lat: c.lat, lon: c.lon, title: loc.name, subtitle: `${loc.count} check-in${loc.count === 1 ? "" : "s"}` };
  }).filter(Boolean);
}

// Echte, interactieve kaart i.p.v. een gestileerd plaatje — "Thuis" wordt
// overgeslagen (geen adres om op te zoeken), de rest krijgt een echte pin
// zodra de coördinaten binnen zijn. Apple Maps (MapKit JS) als dat lukt,
// anders Leaflet + OpenStreetMap-tegels als terugval.
function CocktailMap({ locations }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const appleRef = useRef(null);
  const markersRef = useRef(new Map());
  const [coords, setCoords] = useState({});
  const { engine, mapkit } = useMapEngine();
  const points = useMemo(() => mapPoints(locations, coords), [locations, coords]);
  const pointsKey = points.map(p => `${p.key}:${p.lat}:${p.lon}:${p.subtitle}`).join("|");

  // Alleen nog opzoeken wat geen coördinaten al meekreeg vanuit de plek-
  // kiezer bij het inchecken (die levert lat/lon meteen mee, net als Maps).
  const geocodable = useMemo(() => locations.filter(l => l.name.trim().toLowerCase() !== "thuis" && l.lat == null), [locations]);
  const namesKey = geocodable.map(l => l.name.trim().toLowerCase()).join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const loc of geocodable) {
        const key = loc.name.trim().toLowerCase();
        if (coords[key] !== undefined) continue;
        const result = await geocodeLocation(loc.name);
        if (cancelled) return;
        setCoords(prev => (prev[key] !== undefined ? prev : { ...prev, [key]: result }));
        await new Promise(r => setTimeout(r, 350));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  const [expanded, setExpanded] = useState(false);

  // Apple Maps: bij elke wijziging in de pinnen opnieuw opbouwen (goedkoop,
  // en zo zit de uitsnede altijd om alle pinnen heen).
  useEffect(() => {
    if (engine !== "apple" || !mapElRef.current) return;
    appleRef.current = createAppleMap(mapkit, mapElRef.current, points, { interactive: false, fallbackCenter: GRONINGEN });
    return () => { appleRef.current?.destroy(); appleRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, mapkit, pointsKey]);

  useEffect(() => {
    if (engine !== "leaflet" || !mapElRef.current || mapRef.current) return;
    // Dit is alleen nog een niet-interactieve voorvertoning — pinchen/slepen
    // op deze kleine kaart ving voorheen de scroll-gestiek van de hele pagina
    // af (Leaflet claimt touch-events zodra 'm interactief is). Alle
    // gebruikersinteractie staat daarom uit; tikken opent de schermvullende,
    // wél volledig interactieve kaart hieronder (MapFullscreenSheet).
    mapRef.current = L.map(mapElRef.current, {
      attributionControl: true,
      dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, tap: false, zoomControl: false,
    }).setView([GRONINGEN.lat, GRONINGEN.lon], 12);
    // CARTO's gratis raster-tegels blijken inmiddels achter een verplichte
    // API-sleutel te zitten (watermark "API KEY REQUIRED" eroverheen, ook op
    // Voyager) en Esri's gratis alternatieven zijn óf te grijs/kaal (Light
    // Gray Canvas) óf te druk/topografisch (Street Map) om nog op Apple/
    // Google Maps te lijken. OpenStreetMap's standaardtegels hebben zelf al
    // het juiste kleurenregister (blauw water, groene parken, crème wegen)
    // en zijn nog gewoon gratis zonder sleutel — vrijwel geen filter overheen
    // nodig, in tegenstelling tot eerst, wat precies het "vage" gevoel gaf.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-bijdragers',
    }).addTo(mapRef.current);
    // De omliggende kaart (prestaties, statistieken) laadt boven dit kaartje
    // en kan de layout nog laten schuiven ná deze eerste render, waardoor
    // Leaflet met een verouderde breedte rekent en grijze vlakken toont.
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(mapElRef.current);
    setTimeout(() => mapRef.current?.invalidateSize(), 250);
    return () => { ro.disconnect(); mapRef.current?.remove(); mapRef.current = null; };
  }, [engine]);

  useEffect(() => {
    if (engine !== "leaflet" || !mapRef.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current.clear();
    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));"><svg viewBox="0 0 16 20" width="26" height="32"><path d="M8 0C3.6 0 0 3.6 0 8c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8z" fill="${BRASS}"/><circle cx="8" cy="8" r="3" fill="${BOTTLE_DARK}"/></svg></div>`,
      iconSize: [26, 32], iconAnchor: [13, 32], popupAnchor: [0, -30],
    });
    locations.forEach(loc => {
      const key = loc.name.trim().toLowerCase();
      const c = loc.lat != null ? { lat: loc.lat, lon: loc.lon } : coords[key];
      if (!c) return;
      const marker = L.marker([c.lat, c.lon], { icon: pinIcon }).addTo(mapRef.current)
        .bindPopup(`<strong>${escapeHtml(loc.name)}</strong><br/>${loc.count} check-in${loc.count === 1 ? "" : "s"}`);
      markersRef.current.set(key, marker);
    });
  }, [locations, coords, engine]);

  const flyToLocation = (name) => {
    if (appleRef.current) { appleRef.current.flyTo(name.trim().toLowerCase()); return; }
    const marker = markersRef.current.get(name.trim().toLowerCase());
    if (!marker || !mapRef.current) return;
    mapRef.current.flyTo(marker.getLatLng(), 14, { duration: 0.8 });
    marker.openPopup();
  };

  const pending = geocodable.some(l => coords[l.name.trim().toLowerCase()] === undefined);

  return (
    <div>
      <button onClick={() => setExpanded(true)} aria-label="Kaart vergroten" style={{
        display: "block", width: "100%", border: "none", padding: 0, margin: 0, cursor: "pointer", background: "none",
      }}>
        {/* key per engine: Leaflet en MapKit krijgen elk een schoon element. */}
        <div key={engine} ref={mapElRef} className="thuisbar-map" style={{
          height: 190, borderRadius: "14px 14px 0 0", overflow: "hidden", touchAction: "pan-y", background: PAPER_DEEP,
          // Apple-voorvertoning: tikken gaat naar de knop (schermvullend openen).
          pointerEvents: engine === "leaflet" ? undefined : "none",
        }} />
      </button>
      {pending && <div style={{ fontSize: 10.5, color: MUTED, padding: "6px 15px 0" }}>Locaties opzoeken op de kaart…</div>}
      <div style={{ padding: "13px 15px" }}>
        {locations.map(loc => {
          const hasPin = loc.lat != null || !!coords[loc.name.trim().toLowerCase()];
          return (
            <button key={loc.name} onClick={() => flyToLocation(loc.name)} disabled={!hasPin} style={{
              display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
              padding: "6px 0", borderTop: "none", borderLeft: "none", borderRight: "none",
              borderBottom: `1px dotted ${BORDER}`, background: "none", font: "inherit",
              cursor: hasPin ? "pointer" : "default", textAlign: "left",
            }}>
              <span style={{ fontSize: 12, color: hasPin ? BOTTLE : "#5C5548", fontWeight: hasPin ? 700 : 400, textDecoration: hasPin ? "underline" : "none", textDecorationColor: BORDER, textUnderlineOffset: 3 }}>{loc.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{loc.count}</span>
            </button>
          );
        })}
        <div style={{ marginTop: 11, fontSize: 11, color: MUTED }}>{locations.length} {locations.length === 1 ? "locatie" : "locaties"} bijgehouden</div>
      </div>
      {expanded && <MapFullscreenSheet locations={locations} coords={coords} engine={engine} mapkit={mapkit} onClose={() => setExpanded(false)} />}
    </div>
  );
}

// Losse, wél volledig interactieve Leaflet-instantie voor de schermvullende
// kaart — eigen mount/unmount i.p.v. de niet-interactieve voorvertoning
// hierboven toggelen, want Leaflet's interactiviteit kun je niet na init
// meer aan-/uitzetten zonder de hele kaart opnieuw op te bouwen.
function MapFullscreenSheet({ locations, coords, engine, mapkit, onClose }) {
  useBodyScrollLock();
  const elRef = useRef(null);
  useEffect(() => {
    if (!elRef.current || engine === "loading") return;
    if (engine === "apple") {
      const m = createAppleMap(mapkit, elRef.current, mapPoints(locations, coords), { interactive: true, fallbackCenter: GRONINGEN });
      return () => m.destroy();
    }
    const map = L.map(elRef.current, { attributionControl: true, zoomControl: true }).setView([GRONINGEN.lat, GRONINGEN.lon], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-bijdragers',
    }).addTo(map);
    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));"><svg viewBox="0 0 16 20" width="26" height="32"><path d="M8 0C3.6 0 0 3.6 0 8c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8z" fill="${BRASS}"/><circle cx="8" cy="8" r="3" fill="${BOTTLE_DARK}"/></svg></div>`,
      iconSize: [26, 32], iconAnchor: [13, 32], popupAnchor: [0, -30],
    });
    const bounds = [];
    locations.forEach(loc => {
      const key = loc.name.trim().toLowerCase();
      const c = loc.lat != null ? { lat: loc.lat, lon: loc.lon } : coords[key];
      if (!c) return;
      L.marker([c.lat, c.lon], { icon: pinIcon }).addTo(map)
        .bindPopup(`<strong>${escapeHtml(loc.name)}</strong><br/>${loc.count} check-in${loc.count === 1 ? "" : "s"}`);
      bounds.push([c.lat, c.lon]);
    });
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    setTimeout(() => map.invalidateSize(), 60);
    return () => map.remove();
  }, [locations, coords, engine, mapkit]);

  return createPortal((
    <div className="tab-fade" style={{ position: "fixed", inset: 0, zIndex: 40, background: PAPER, display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "calc(env(safe-area-inset-top) + 14px) 16px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
      }}>
        <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: INK }}>Jouw cocktailkaart</div>
        <button onClick={onClose} aria-label="Sluiten" className="press-scale" style={{
          display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%",
          border: `1px solid ${BORDER}`, background: CREAM, color: INK, cursor: "pointer",
        }}>
          <X size={17} />
        </button>
      </div>
      <div ref={elRef} className="thuisbar-map" style={{ flex: 1 }} />
    </div>
  ), document.body);
}

export { CocktailMap };
