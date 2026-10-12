// Voorraad, favorieten, boodschappenlijst, cursusvoortgang en eigen
// recepten/ingrediënten bij je account bewaren (tabel user_state), zodat
// ze in de browser en op de iPhone hetzelfde zijn.
//
// Werking:
// - Lokaal blijft alles in Preferences staan (werkt ook offline en als gast).
// - Bij inloggen met hetzelfde account als de vorige keer: de nieuwste
//   versie wint.
// - Bij een ander of nog onbekend account terwijl er al iets op het toestel
//   staat: eerst vragen of dat bij dit account hoort (zie startSync).
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

// Vraag aan de gebruiker (in de app: window.confirm). Te vervangen in tests.
let askUser = (text) => (typeof window !== "undefined" && window.confirm ? window.confirm(text) : false);
export function setAsk(fn) { askUser = fn; }

const STASH_KEY = "thuisbar-sync-stash"; // { [ownerId]: { [key]: value } }

function describe(values) {
  const parts = [];
  const n = (k) => (Array.isArray(values[k]) ? values[k].length : 0);
  if (n("thuisbar-voorraad")) parts.push(`${n("thuisbar-voorraad")} flessen in je voorraad`);
  if (n("thuisbar-favoriete-recepten")) parts.push(`${n("thuisbar-favoriete-recepten")} favoriete recepten`);
  if (n("thuisbar-shopping-list")) parts.push(`${n("thuisbar-shopping-list")} dingen op je boodschappenlijst`);
  const lessen = Object.values(values["thuisbar-cursus-voortgang"] || {}).filter((l) => l?.completed).length;
  if (lessen) parts.push(`${lessen} afgeronde lessen`);
  if (n("thuisbar-custom-recipes")) parts.push(`${n("thuisbar-custom-recipes")} eigen recepten`);
  return parts.length ? parts.join(", ") : "gegevens";
}

async function readStash() {
  try { return JSON.parse((await Preferences.get({ key: STASH_KEY })).value || "{}") || {}; } catch { return {}; }
}

// Bij inloggen (en bij terugkomen in de app): lokaal en account bijwerken.
// - Zelfde account als de vorige keer op dit toestel: de nieuwste versie wint.
// - Ander of onbekend account, en er staat iets op het toestel: eerst VRAGEN
//   of dat bij dit account hoort. Ja = samenvoegen (niets gaat verloren).
//   Nee = het toestel toont alleen dit account; wat er stond wordt apart
//   bewaard en komt terug als de eigenaar weer inlogt.
export async function startSync(uid) {
  if (!uid) { userId = null; return; }
  userId = uid;
  await loadMeta();
  const { data: rows, error } = await supabase.from("user_state").select("key, value, updated_at").eq("user_id", uid);
  if (error) { console.warn("Synchroniseren niet beschikbaar:", error.message); return; }
  if (userId !== uid) return;
  const remote = new Map((rows || []).map((r) => [r.key, r]));
  const sameUser = meta.userId === uid;

  const local = {};
  for (const key of Object.keys(SYNC_KEYS)) {
    try { const raw = (await Preferences.get({ key })).value; local[key] = raw == null ? null : JSON.parse(raw); } catch { local[key] = null; }
  }
  const localHasData = Object.values(local).some((v) => !isEmpty(v));
  const stash = await readStash();

  // Voegt het toestel iets toe aan wat al in het account staat?
  const addsSomething = Object.entries(SYNC_KEYS).some(([key, kind]) => {
    const r = remote.get(key)?.value ?? null;
    return JSON.stringify(mergeValues(kind, local[key], r)) !== JSON.stringify(r) && !isEmpty(local[key]);
  });

  let mode = "newest";
  if (!sameUser) {
    if (localHasData && addsSomething) {
      const wat = describe(local) + (meta.userId ? " van een ander account" : "");
      const vraag = remote.size === 0
        ? `Op deze telefoon staat al ${wat}.\n\nHoort dit bij dit account? Kies OK om het aan dit account te koppelen, of Annuleren om met een leeg account te beginnen.`
        : `Op deze telefoon staat ook ${wat}, dat nog niet in dit account zit.\n\nKies OK om het samen te voegen met dit account, of Annuleren om alleen te gebruiken wat al in dit account staat.`;
      mode = askUser(vraag) ? "merge" : "account";
    } else {
      mode = "account";
    }
    if (mode === "account" && localHasData) {
      // Niet weggooien: apart bewaren voor de vorige eigenaar.
      const owner = meta.userId || "onbekend";
      stash[owner] = { ...(stash[owner] || {}), ...Object.fromEntries(Object.entries(local).filter(([, v]) => !isEmpty(v))) };
      await Preferences.set({ key: STASH_KEY, value: JSON.stringify(stash) });
    }
  }
  const mine = stash[uid] || null;

  for (const [key, kind] of Object.entries(SYNC_KEYS)) {
    const r = remote.get(key);
    const l = local[key];
    let next;
    let push = false;
    if (mode === "merge") {
      next = mergeValues(kind, l, r?.value ?? null);
      push = !isEmpty(next) && JSON.stringify(next) !== JSON.stringify(r?.value ?? null);
    } else if (mode === "account") {
      if (r) next = r.value;
      else if (mine && !isEmpty(mine[key])) { next = mine[key]; push = true; }
      else next = Array.isArray(l) ? [] : (l && typeof l === "object" ? {} : l);
    } else if (!r) {
      next = l;
      push = !isEmpty(l);
    } else {
      const localAt = meta.keys[key] || 0;
      const remoteAt = Date.parse(r.updated_at) || 0;
      if (localAt > remoteAt) { next = l; push = JSON.stringify(l) !== JSON.stringify(r.value); }
      else next = r.value;
    }
    if (next != null && JSON.stringify(next) !== JSON.stringify(l)) {
      await Preferences.set({ key, value: JSON.stringify(next) });
      emit(key, next);
    }
    if (push) await upload(key, next);
    meta.keys[key] = push ? Date.now() : (r ? Date.parse(r.updated_at) || Date.now() : meta.keys[key] || 0);
  }
  if (mine && mode === "account") {
    delete stash[uid];
    await Preferences.set({ key: STASH_KEY, value: JSON.stringify(stash) });
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
