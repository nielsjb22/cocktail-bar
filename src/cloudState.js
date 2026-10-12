// Voorraad, favorieten, boodschappenlijst, cursusvoortgang en eigen
// recepten/ingrediënten bij je account bewaren (tabel user_state), zodat
// ze in de browser en op de iPhone hetzelfde zijn.
//
// Werking:
// - Lokaal blijft alles in Preferences staan (werkt ook offline en als gast).
// - Bij inloggen: per onderdeel lokaal en account samenvoegen.
//   * Nog nooit voor dit account gesynchroniseerd op dit toestel (bijv. je
//     gebruikte de app als gast, of in de browser vóór deze update):
//     SAMENVOEGEN, er gaat niets verloren (lijsten: alles van beide,
//     cursus: per les het beste resultaat).
//   * Wel eerder gesynchroniseerd: de nieuwste versie wint.
//   * Lokale gegevens van een ánder account op dit toestel worden nooit
//     naar jouw account gekopieerd; dan geldt wat in jouw account staat.
// - Elke wijziging gaat na een korte pauze naar je account.

import { Preferences } from "@capacitor/preferences";
import { supabase } from "./supabaseClient";

export const SYNC_KEYS = {
  "thuisbar-voorraad": "ids",
  "thuisbar-voorraad-niveau": "map",
  "thuisbar-voorraad-aantal": "map",
  "thuisbar-favoriete-recepten": "ids",
  "thuisbar-recent-recepten": "ids",
  "thuisbar-shopping-list": "byKey",
  "thuisbar-cursus-voortgang": "course",
  "thuisbar-custom-ingredients": "byId",
  "thuisbar-custom-recipes": "byId",
  "thuisbar-eigen-merken": "byTerm",
  "thuisbar-gekozen-flessen": "map",
};
const META_KEY = "thuisbar-sync-meta"; // { userId, keys: { [key]: updatedAtMs } }

let userId = null;
const listeners = new Map(); // key -> Set<fn(value)>
const pending = new Map(); // key -> timeout
let meta = null;

async function loadMeta() {
  if (meta) return meta;
  try { meta = JSON.parse((await Preferences.get({ key: META_KEY })).value || "null"); } catch { meta = null; }
  if (!meta || typeof meta !== "object") meta = { userId: null, keys: {} };
  if (!meta.keys) meta.keys = {};
  return meta;
}
function saveMeta() {
  Preferences.set({ key: META_KEY, value: JSON.stringify(meta) }).catch(() => {});
}

function isEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function unionBy(a, b, keyOf) {
  const out = [];
  const seen = new Set();
  for (const item of [...(a || []), ...(b || [])]) {
    const k = keyOf(item);
    if (k == null || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function mergeValues(kind, local, remote) {
  if (isEmpty(remote)) return local;
  if (isEmpty(local)) return remote;
  switch (kind) {
    case "ids": return unionBy(local, remote, (x) => (typeof x === "object" ? JSON.stringify(x) : x));
    case "byId": return unionBy(local, remote, (x) => x?.id);
    case "byKey": return unionBy(local, remote, (x) => x?.key);
    case "byTerm": return unionBy(local, remote, (x) => (x?.term || "").toLowerCase());
    case "map": return { ...remote, ...local };
    case "course": {
      const out = { ...remote };
      for (const [lesson, l] of Object.entries(local || {})) {
        const r = out[lesson];
        if (!r) { out[lesson] = l; continue; }
        out[lesson] = {
          ...r, ...l,
          completed: !!(l?.completed || r?.completed),
          bestScore: Math.max(l?.bestScore ?? 0, r?.bestScore ?? 0),
        };
      }
      return out;
    }
    default: return local;
  }
}

function emit(key, value) {
  listeners.get(key)?.forEach((fn) => fn(value));
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

async function upload(key, value) {
  if (!userId) return;
  const { error } = await supabase.from("user_state").upsert(
    { user_id: userId, key, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
  if (error) console.warn("Synchroniseren mislukt:", key, error.message);
}

// Aangeroepen door useStorage bij elke lokale wijziging.
export async function noteLocalChange(key, value) {
  if (!(key in SYNC_KEYS)) return;
  await loadMeta();
  meta.keys[key] = Date.now();
  saveMeta();
  if (!userId) return;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => { pending.delete(key); upload(key, value); }, 1200));
}

// Bij inloggen (en bij terugkomen in de app): samenvoegen met je account.
export async function startSync(uid) {
  if (!uid) { userId = null; return; }
  userId = uid;
  await loadMeta();
  const { data: rows, error } = await supabase.from("user_state").select("key, value, updated_at").eq("user_id", uid);
  if (error) { console.warn("Synchroniseren niet beschikbaar:", error.message); return; }
  const remote = new Map((rows || []).map((r) => [r.key, r]));
  const sameUser = meta.userId === uid;
  const otherUser = meta.userId && meta.userId !== uid;

  for (const [key, kind] of Object.entries(SYNC_KEYS)) {
    let local = null;
    try { const raw = (await Preferences.get({ key })).value; local = raw == null ? null : JSON.parse(raw); } catch { local = null; }
    const r = remote.get(key);
    let next;
    let push = false;
    if (otherUser) {
      // Lokale gegevens zijn van iemand anders: alleen jouw account tonen.
      next = r ? r.value : (Array.isArray(local) ? [] : {});
    } else if (!r) {
      next = local;
      push = !isEmpty(local);
    } else if (!sameUser) {
      next = mergeValues(kind, local, r.value);
      push = JSON.stringify(next) !== JSON.stringify(r.value);
    } else {
      const localAt = meta.keys[key] || 0;
      const remoteAt = Date.parse(r.updated_at) || 0;
      if (localAt > remoteAt) { next = local; push = JSON.stringify(local) !== JSON.stringify(r.value); }
      else next = r.value;
    }
    if (next != null && JSON.stringify(next) !== JSON.stringify(local)) {
      await Preferences.set({ key, value: JSON.stringify(next) });
      emit(key, next);
    }
    if (push) await upload(key, next);
    meta.keys[key] = push ? Date.now() : (r ? Date.parse(r.updated_at) || Date.now() : meta.keys[key] || 0);
  }
  meta.userId = uid;
  saveMeta();
}

export function stopSync() {
  // Openstaande wijzigingen nog snel versturen.
  for (const [key, t] of pending) {
    clearTimeout(t);
    Preferences.get({ key }).then(({ value }) => { try { upload(key, JSON.parse(value)); } catch { /* niets */ } });
  }
  pending.clear();
  userId = null;
}
