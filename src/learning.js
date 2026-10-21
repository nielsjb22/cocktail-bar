// De app leert van wat gebruikers samen doen (zie migratie lerende_app):
// aanbevelingen, zelf gekoppelde merken en zoekopdrachten zonder resultaat.
// Alles anoniem: de database geeft alleen tellingen terug, nooit wie wat deed.

import { useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { normalizeTerm } from "./ingredientSearch.js";

async function myUserId() {
  try { return (await supabase.auth.getSession()).data.session?.user?.id || null; } catch { return null; }
}

// ---------- Merken ----------
let learnedBrandsPromise = null;
export function fetchLearnedBrands() {
  if (!learnedBrandsPromise) {
    learnedBrandsPromise = supabase.rpc("geleerde_merken").then(({ data, error }) => {
      if (error) { learnedBrandsPromise = null; return []; }
      return (data || []).map((m) => ({ term: m.term, id: m.ingredient_id, shared: true }));
    }).catch(() => { learnedBrandsPromise = null; return []; });
  }
  return learnedBrandsPromise;
}

export async function recordBrandLink(term, ingredientId) {
  const uid = await myUserId();
  const norm = normalizeTerm(term);
  if (!uid || !norm || !ingredientId) return;
  await supabase.from("merk_koppelingen").upsert(
    { user_id: uid, term_norm: norm, term: term.trim(), ingredient_id: ingredientId },
    { onConflict: "user_id,term_norm" },
  ).then(() => {}, () => {});
}

// ---------- Zoeken zonder resultaat ----------
const alGemeld = new Set();
export function useSearchMiss(query, resultCount, soort = "recept") {
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    const term = (query || "").trim();
    const norm = normalizeTerm(term);
    if (resultCount !== 0 || norm.length < 3 || alGemeld.has(`${soort}:${norm}`)) return;
    // Pas melden als iemand even stopt met typen.
    timer.current = setTimeout(async () => {
      const uid = await myUserId();
      if (!uid || alGemeld.has(`${soort}:${norm}`)) return;
      alGemeld.add(`${soort}:${norm}`);
      supabase.from("zoek_signalen").insert({ user_id: uid, soort, term_norm: norm, term }).then(() => {}, () => {});
    }, 2500);
    return () => clearTimeout(timer.current);
  }, [query, resultCount, soort]);
}

// ---------- Aanbevelingen ----------
export async function fetchRecommendations() {
  const [{ data: recs }, { data: pop }] = await Promise.all([
    supabase.rpc("aanbevelingen_voor_mij", { p_limiet: 12 }).then((r) => r, () => ({ data: [] })),
    supabase.rpc("populaire_recepten", { p_limiet: 12 }).then((r) => r, () => ({ data: [] })),
  ]);
  return { similar: recs || [], popular: pop || [] };
}
