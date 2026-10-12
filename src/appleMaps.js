// Apple Maps (MapKit JS) voor de cocktailkaart.
//
// Het script komt van Apple en het token van onze eigen Supabase-functie
// `mapkit-token` (de .p8-sleutel blijft daar). Lukt één van beide niet
// binnen een paar seconden — geen internet, functie nog niet online, sleutel
// fout — dan geeft loadMapkit() null terug en valt de kaart terug op Leaflet.

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const SCRIPT_URL = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js";
const TIMEOUT_MS = 8000;

let promise = null;

async function fetchToken() {
  const { data, error } = await supabase.functions.invoke("mapkit-token");
  if (error || !data?.token) throw new Error(error?.message || data?.error || "Geen MapKit-token");
  return data.token;
}

function loadScript() {
  return new Promise((resolve, reject) => {
    if (window.mapkit?.loadedLibraries?.length) return resolve(window.mapkit);
    const cb = "__thuisbarMapkitLoaded";
    window[cb] = () => resolve(window.mapkit);
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.dataset.callback = cb;
    s.dataset.libraries = "map,annotations";
    s.onerror = () => reject(new Error("MapKit-script laadt niet"));
    document.head.appendChild(s);
  });
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("MapKit time-out")), ms))]);
}

async function init() {
  // Eerst het token: geen token = geen kaart, dan hoeft het script ook niet.
  const first = await fetchToken();
  const mapkit = await loadScript();
  await new Promise((resolve, reject) => {
    let firstUsed = false;
    const onChange = (e) => {
      if (e.status === "Initialized" || e.status === "Refreshed") { cleanup(); resolve(); }
    };
    const onError = (e) => { cleanup(); reject(new Error("MapKit: " + (e?.status || "fout"))); };
    const cleanup = () => {
      mapkit.removeEventListener("configuration-change", onChange);
      mapkit.removeEventListener("error", onError);
    };
    mapkit.addEventListener("configuration-change", onChange);
    mapkit.addEventListener("error", onError);
    mapkit.init({
      language: "nl",
      authorizationCallback: (done) => {
        if (!firstUsed) { firstUsed = true; done(first); return; }
        fetchToken().then(done).catch(() => {});
      },
    });
  });
  return mapkit;
}

// Eén keer laden voor de hele app; bij mislukken null (en later opnieuw
// proberen, bijvoorbeeld als er weer internet is).
export function loadMapkit() {
  if (!promise) {
    promise = withTimeout(init(), TIMEOUT_MS).catch((err) => {
      console.warn("Apple Maps niet beschikbaar, terug naar OpenStreetMap:", err?.message || err);
      setTimeout(() => { promise = null; }, 60_000);
      return null;
    });
  }
  return promise;
}

// "loading" | "apple" | "leaflet"
export function useMapEngine() {
  const [state, setState] = useState("loading");
  const [mapkit, setMapkit] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadMapkit().then((mk) => {
      if (cancelled) return;
      setMapkit(mk);
      setState(mk ? "apple" : "leaflet");
    });
    return () => { cancelled = true; };
  }, []);
  return { engine: state, mapkit };
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function isDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

// Maakt een Apple-kaart in `el` met een speld per locatie.
// points: [{ key, lat, lon, title, subtitle }]
// Geeft { flyTo(key), destroy() } terug.
export function createAppleMap(mapkit, el, points, { interactive, fallbackCenter }) {
  const map = new mapkit.Map(el, {
    colorScheme: isDark() ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light,
    isScrollEnabled: interactive,
    isZoomEnabled: interactive,
    isRotationEnabled: false,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    showsScale: mapkit.FeatureVisibility.Hidden,
    showsMapTypeControl: false,
    showsZoomControl: interactive,
    showsUserLocationControl: false,
    showsPointsOfInterest: true,
    padding: new mapkit.Padding(8, 8, 8, 8),
  });

  const color = cssVar("--brass", "#B8862E");
  const glyph = cssVar("--bottle-dark", "#132622");
  const byKey = new Map();
  const annotations = points.map((p) => {
    const a = new mapkit.MarkerAnnotation(new mapkit.Coordinate(p.lat, p.lon), {
      color, glyphColor: glyph, title: p.title, subtitle: p.subtitle,
      calloutEnabled: true, animates: false,
    });
    byKey.set(p.key, a);
    return a;
  });

  if (annotations.length > 0) {
    map.showItems(annotations, {
      animate: false,
      padding: new mapkit.Padding(40, 40, 40, 40),
      minimumSpan: new mapkit.CoordinateSpan(0.02, 0.02),
    });
  } else {
    map.region = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(fallbackCenter.lat, fallbackCenter.lon),
      new mapkit.CoordinateSpan(0.12, 0.12),
    );
  }

  // Donkere modus van het toestel volgen terwijl de kaart open is.
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onScheme = () => {
    map.colorScheme = mq.matches ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light;
  };
  mq?.addEventListener?.("change", onScheme);

  return {
    flyTo(key) {
      const a = byKey.get(key);
      if (!a) return;
      map.setRegionAnimated(new mapkit.CoordinateRegion(a.coordinate, new mapkit.CoordinateSpan(0.02, 0.02)), true);
      map.selectedAnnotation = a;
    },
    destroy() {
      mq?.removeEventListener?.("change", onScheme);
      map.destroy();
    },
  };
}
