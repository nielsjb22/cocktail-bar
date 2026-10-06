import { createClient } from "npm:@supabase/supabase-js@2";

// Prijscheck: haalt de goedgekeurde productpagina's op van winkels die
// automatisch ophalen toestaan (Mitra, Dirck III, Drankgigant) en leest de
// prijs en voorraad uit de gestructureerde productgegevens (schema.org
// Product/Offer in JSON-LD) die de winkel zelf in de pagina zet.
//
// - Draait dagelijks (pg_cron), pakt per keer de aanbiedingen die het langst
//   niet gecontroleerd zijn en ouder zijn dan 6 dagen: zo is elke prijs
//   ongeveer wekelijks vers, zonder de winkels in één keer te belasten.
// - Rustig: per winkel één verzoek tegelijk met pauze; bij een 429 (te veel
//   verzoeken) of 403 stopt hij voor die winkel tot de volgende dag.
// - Nooit een andere fles: alleen de url die in fles_aanbiedingen staat.
// - Vangnet: wijkt een prijs meer dan 60% af van de vorige, dan wordt hij
//   niet overgenomen maar gemarkeerd om na te kijken.
//
// Aanroepen alleen met de geheime header x-prijscheck-secret (env
// PRIJSCHECK_SECRET), zodat niet iedereen de check kan starten.

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const secret = Deno.env.get("PRIJSCHECK_SECRET") || "";

const USER_AGENT = "Mozilla/5.0 (compatible; MijnThuisbarPrijscheck/1.0; +https://beautiful-pasca-793e77.netlify.app)";
const AUTO_WINKELS = ["mitra", "dirckiii", "drankgigant"];
const PAUZE_MS: Record<string, number> = { mitra: 2000, dirckiii: 2000, drankgigant: 4000 };
const MAX_PER_RUN = 120;
const MIN_LEEFTIJD_DAGEN = 6;

type Aanbieding = { id: string; winkel: string; url: string; prijs: number | null; mislukte_checks: number };
type Uitkomst = { prijs: number; opVoorraad: boolean } | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Zoekt een Product met offers in alle JSON-LD-blokken van de pagina.
function leesPrijs(html: string): Uitkomst {
  const blokken = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const ruw of blokken) {
    let data: unknown;
    try { data = JSON.parse(ruw.trim().replace(/[\u0000-\u001F]+/g, " ")); } catch { continue; }
    const stapel: unknown[] = [data];
    while (stapel.length) {
      const o = stapel.pop();
      if (Array.isArray(o)) { stapel.push(...o); continue; }
      if (!o || typeof o !== "object") continue;
      const obj = o as Record<string, unknown>;
      const type = obj["@type"];
      const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
      if (isProduct && obj.offers) {
        let offer = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
        if (offer && typeof offer === "object") {
          const of = offer as Record<string, unknown>;
          const prijs = Number(String(of.price ?? of.lowPrice ?? "").replace(",", "."));
          if (Number.isFinite(prijs) && prijs > 0) {
            const beschikbaar = String(of.availability ?? "");
            return { prijs, opVoorraad: !/OutOfStock|SoldOut|Discontinued/i.test(beschikbaar) };
          }
        }
      }
      stapel.push(...Object.values(obj));
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (!secret || req.headers.get("x-prijscheck-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Geen toegang" }), { status: 401 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const grens = new Date(Date.now() - MIN_LEEFTIJD_DAGEN * 86400000).toISOString();
  const { data, error } = await admin
    .from("fles_aanbiedingen")
    .select("id, winkel, url, prijs, mislukte_checks")
    .eq("automatisch", true).eq("actief", true).in("winkel", AUTO_WINKELS)
    .or(`prijs_gecontroleerd_op.is.null,prijs_gecontroleerd_op.lt.${grens}`)
    .order("prijs_gecontroleerd_op", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const perWinkel = new Map<string, Aanbieding[]>();
  for (const a of (data || []) as Aanbieding[]) {
    if (!perWinkel.has(a.winkel)) perWinkel.set(a.winkel, []);
    perWinkel.get(a.winkel)!.push(a);
  }

  const verslag: Record<string, { bijgewerkt: number; mislukt: number; afwijkend: number; gestopt?: string }> = {};

  // Winkels naast elkaar, binnen een winkel netjes na elkaar.
  await Promise.all([...perWinkel.entries()].map(async ([winkel, lijst]) => {
    const v = (verslag[winkel] = { bijgewerkt: 0, mislukt: 0, afwijkend: 0 });
    for (const a of lijst) {
      let status = 0;
      let html = "";
      try {
        const res = await fetch(a.url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "nl-NL,nl;q=0.9" }, redirect: "follow" });
        status = res.status;
        html = status === 200 ? await res.text() : "";
      } catch (e) {
        status = -1;
        html = String(e);
      }

      if (status === 429 || status === 403) {
        v.gestopt = `${status}: winkel vraagt om te stoppen; morgen verder`;
        break;
      }

      const uitkomst = status === 200 ? leesPrijs(html) : null;
      const nu = new Date().toISOString();
      if (uitkomst) {
        const vorige = a.prijs != null ? Number(a.prijs) : null;
        if (vorige && Math.abs(uitkomst.prijs - vorige) / vorige > 0.6) {
          v.afwijkend++;
          await admin.from("fles_aanbiedingen").update({
            laatste_fout: `Prijs wijkt sterk af: was ${vorige}, nu ${uitkomst.prijs}. Niet overgenomen, graag nakijken.`,
            mislukte_checks: a.mislukte_checks + 1,
          }).eq("id", a.id);
        } else {
          v.bijgewerkt++;
          await admin.from("fles_aanbiedingen").update({
            prijs: uitkomst.prijs, op_voorraad: uitkomst.opVoorraad, prijs_gecontroleerd_op: nu,
            mislukte_checks: 0, laatste_fout: null,
          }).eq("id", a.id);
        }
      } else {
        v.mislukt++;
        const fout = status === 404 || status === 410 ? "Pagina bestaat niet meer" : status === 200 ? "Geen prijs gevonden op de pagina" : `HTTP ${status}`;
        await admin.from("fles_aanbiedingen").update({
          laatste_fout: fout,
          mislukte_checks: a.mislukte_checks + 1,
          // Een verdwenen pagina telt als niet leverbaar; de app kiest dan een andere winkel.
          ...(status === 404 || status === 410 ? { op_voorraad: false } : {}),
        }).eq("id", a.id);
      }
      await sleep(PAUZE_MS[winkel] ?? 3000);
    }
  }));

  return new Response(JSON.stringify({ gecontroleerd: data?.length ?? 0, verslag }), { headers: { "Content-Type": "application/json" } });
});
