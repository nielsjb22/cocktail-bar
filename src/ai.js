// AI-bartender (idee 6) en flessen scannen (idee 7). De app praat nooit
// rechtstreeks met de AI-dienst: alles gaat via de Edge Function
// ai-bartender, die de API-sleutel geheim houdt en de daglimiet bewaakt.
// Wat er meegaat: je vraag of foto, je voorraad, je smaakprofiel en een lijst
// recepten uit de app. Geen naam, e-mail, vrienden of check-ins.

import { supabase } from "./supabaseClient";
import { imageToJpegDataUrl } from "./checkinPhotos.js";

export const AI_CONSENT_KEY = "thuisbar-ai-toestemming"; // null = nog niet gevraagd, "ja", "nee"

// Nette Nederlandse melding bij elke fout die de functie kan geven.
const FOUT_TEKST = {
  limiet: "Je hebt je vragen voor vandaag gebruikt. Morgen kan het weer.",
  limiet_scan: "Je scans voor vandaag zijn op. Morgen kan het weer.",
  niet_ingelogd: "Log opnieuw in om de bartender te gebruiken.",
  druk: "Het is even erg druk. Probeer het over een minuutje opnieuw.",
  ongeldig: "Dat ging niet goed. Probeer het opnieuw.",
  niet_beschikbaar: "De bartender is nog niet beschikbaar. Probeer het later opnieuw.",
  offline: "Geen internet. Probeer het opnieuw als je weer verbinding hebt.",
};
const tekstVoor = (code) => FOUT_TEKST[code] || "De bartender kon even geen antwoord geven. Probeer het opnieuw.";

async function callAi(body) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { error: "offline", message: tekstVoor("offline") };
  const { data, error } = await supabase.functions.invoke("ai-bartender", { body });
  if (!error) return data || {};
  // FunctionsHttpError: de functie gaf zelf een foutcode terug.
  let code = null;
  let over;
  const res = error.context;
  try {
    if (res && typeof res.json === "function") {
      const j = await res.json();
      code = typeof j?.error === "string" ? j.error : null;
      over = j?.over;
    }
  } catch { /* geen JSON */ }
  if (!code && res?.status === 404) code = "niet_beschikbaar";
  if (!code && error.name === "FunctionsFetchError") code = "niet_beschikbaar";
  return { error: code || "fout", message: tekstVoor(code === "limiet" && body.soort !== "chat" ? "limiet_scan" : code), over };
}

export async function fetchAiTegoed() {
  const { data, error } = await supabase.rpc("ai_tegoed_over");
  if (error) return null;
  const rij = Array.isArray(data) ? data[0] : data;
  return rij ? { chat: rij.chat, scan: rij.scan } : null;
}

export function askBartender(messages, context) {
  return callAi({ soort: "chat", messages, context });
}

// Foto verkleinen (langste zijde 1280 px): scherp genoeg voor etiketten,
// en zo klein mogelijk voor snelheid en kosten.
export async function scanBottles(photoSrc, ingredients) {
  const dataUrl = await imageToJpegDataUrl(photoSrc, 1280, 0.8);
  const image = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const ingredienten = ingredients.map(i => `${i.id} | ${i.name} | ${i.cat}`);
  return callAi({ soort: "scan", image, ingredienten });
}

// "Wat drink ik hier?": foto van een cocktail → hooguit 3 recepten uit de app.
// Meegestuurd: de foto (verkleind) en per recept id, naam, glas en familie.
export async function recognizeCocktail(photoSrc, recipes) {
  const dataUrl = await imageToJpegDataUrl(photoSrc, 1024, 0.8);
  const image = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const recepten = recipes.map(r => [r.id, r.name, r.glass, r.family].filter(Boolean).join(" | "));
  return callAi({ soort: "herken", image, recepten });
}
