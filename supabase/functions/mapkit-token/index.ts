import { SignJWT, importPKCS8 } from "npm:jose@5";

// Geeft de app een kortlevend token voor Apple Maps (MapKit JS). De
// .p8-sleutel zelf blijft hier op de server; de app krijgt alleen een token
// dat na 30 minuten verloopt.
//
// Secrets bij de functie:
//   MAPKIT_KEY_ID   Key ID van de Maps-sleutel (10 tekens)
//   MAPKIT_KEY      de volledige inhoud van het .p8-bestand van die sleutel
//   APNS_TEAM_ID    Team ID (staat er al voor de pushmeldingen)
//
// Verify JWT staat uit: ook gasten zonder account zien de kaart. Alleen
// verzoeken vanuit de app zelf of de eigen websites krijgen een token.

const keyId = Deno.env.get("MAPKIT_KEY_ID") || "";
const teamId = Deno.env.get("MAPKIT_TEAM_ID") || Deno.env.get("APNS_TEAM_ID") || "";
const p8 = (Deno.env.get("MAPKIT_KEY") || "").replace(/\\n/g, "\n").trim();

const GELDIG_SEC = 30 * 60;

function toegestaan(origin: string | null): boolean {
  if (!origin) return true; // native verzoeken sturen niet altijd een Origin mee
  return origin === "capacitor://localhost"
    || origin === "ionic://localhost"
    || /^https?:\/\/localhost(:\d+)?$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(origin)
    || /^https:\/\/([a-z0-9-]+\.)?(thuisbar|mijnthuisbar)\.nl$/.test(origin);
}

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && toegestaan(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

let cache: { token: string; tot: number } | null = null;

async function maakToken(): Promise<{ token: string; tot: number }> {
  const nu = Math.floor(Date.now() / 1000);
  // Hergebruik zolang er nog ruim 10 minuten over zijn.
  if (cache && cache.tot - nu > 10 * 60) return cache;
  const key = await importPKCS8(p8, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(teamId)
    .setIssuedAt(nu)
    .setExpirationTime(nu + GELDIG_SEC)
    .sign(key);
  cache = { token, tot: nu + GELDIG_SEC };
  return cache;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!toegestaan(origin)) {
    return Response.json({ error: "Geen toegang" }, { status: 403, headers });
  }
  if (!keyId || !teamId || !p8) {
    return Response.json({ error: "MapKit-secrets ontbreken" }, { status: 500, headers });
  }
  try {
    const { token, tot } = await maakToken();
    return Response.json({ token, verlooptOp: tot }, { headers: { ...headers, "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500, headers });
  }
});
