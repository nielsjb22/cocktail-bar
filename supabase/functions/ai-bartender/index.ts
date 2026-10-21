import Anthropic from "npm:@anthropic-ai/sdk@0.137.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// AI-bartender (chat) en flessen scannen (foto) via de Claude API.
// - De API-sleutel staat alleen hier (secret ANTHROPIC_API_KEY), nooit in de app.
// - Alleen ingelogde gebruikers; per dag een limiet (zie migratie ai_bartender).
// - Vragen en foto's worden niet bewaard, alleen het aantal per dag.
// - De bartender kiest alleen uit recepten die de app meestuurt; hoeveelheden
//   komen altijd uit de app zelf, nooit van de AI.

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAT_MODEL = Deno.env.get("AI_MODEL_CHAT") || "claude-haiku-5-5";
const SCAN_MODEL = Deno.env.get("AI_MODEL_SCAN") || "claude-haiku-5-5";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const res = await handle(req);
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

async function handle(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "niet_ingelogd" }, 401);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData?.user) return json({ error: "niet_ingelogd" }, 401);
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "ongeldig" }, 400); }
  const soort = body.soort === "scan" ? "scan" : body.soort === "chat" ? "chat" : null;
  if (!soort) return json({ error: "ongeldig" }, 400);

  // Eerst het tegoed van vandaag gebruiken; is het op, dan stoppen we hier.
  const { data: tegoed, error: tegoedError } = await caller.rpc("ai_tegoed_gebruiken", { p_soort: soort });
  if (tegoedError) return json({ error: "limiet_onbekend" }, 500);
  const rij = Array.isArray(tegoed) ? tegoed[0] : tegoed;
  if (!rij?.toegestaan) return json({ error: "limiet", over: 0 }, 429);

  try {
    const result = soort === "chat" ? await chat(body) : await scan(body);
    return json({ ...result, over: rij.over });
  } catch (e) {
    // Fout aan onze kant of bij de AI-dienst: tegoed teruggeven.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    await admin.rpc("ai_tegoed_terug", { p_user: userId, p_soort: soort });
    if (e instanceof InvalidInput) return json({ error: "ongeldig" }, 400);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "druk" }, 503);
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API", e.status, e.message);
      return json({ error: "ai_fout" }, 502);
    }
    console.error(e);
    return json({ error: "ai_fout" }, 500);
  }
}

class InvalidInput extends Error {}

function firstText(msg: Anthropic.Message): string {
  for (const block of msg.content) if (block.type === "text") return block.text;
  return "";
}

// ---------- Chat ----------
const CHAT_SCHEMA = {
  type: "object",
  properties: {
    antwoord: { type: "string" },
    recepten: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  required: ["antwoord", "recepten"],
  additionalProperties: false,
};

async function chat(body: Record<string, unknown>) {
  const ctx = (body.context || {}) as Record<string, unknown>;
  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const messages: Anthropic.MessageParam[] = rawMessages
    .map((m) => m as Record<string, unknown>)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", content: clip(m.content, 1000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") throw new InvalidInput();

  const voorraad = (Array.isArray(ctx.voorraad) ? ctx.voorraad : []).slice(0, 250).map((v) => clip(v, 60)).filter(Boolean);
  const kandidaten = (Array.isArray(ctx.kandidaten) ? ctx.kandidaten : []).slice(0, 160).map((v) => clip(v, 220)).filter(Boolean);
  const smaak = clip(ctx.smaak, 300);
  // De gebruiker kiest zelf of de bartender naar de voorraad mag kijken.
  const metVoorraad = ctx.voorraadGebruiken !== false;
  const favorieten = (Array.isArray(ctx.favorieten) ? ctx.favorieten : []).slice(0, 12).map((v) => clip(v, 80)).filter(Boolean);

  const system = [
    "Je bent de bartender in de app Mijn Thuisbar. Je praat Nederlands, kort en hartelijk, zoals een goede bartender aan de bar: hooguit 3 korte zinnen per antwoord, geen opsommingen, geen emoji.",
    "Je helpt de gebruiker kiezen wat hij of zij thuis kan maken. Je raadt ALLEEN recepten aan uit de lijst KANDIDATEN hieronder, met hun exacte id. Verzin nooit zelf recepten, hoeveelheden of bereidingen: die staan al in de app en de gebruiker opent het recept daar. Noem hooguit 3 recepten.",
    ...(metVoorraad ? [
      "Elke regel bij KANDIDATEN is: id | naam | familie | smaak (zoet/zuur/bitter/sterk, 0-5) | mist (wat de gebruiker nog niet in huis heeft; leeg = alles in huis) | alcoholvrij of warm als dat zo is.",
      "Geef de voorkeur aan recepten waarvoor alles in huis is. Mist er iets, zeg dan wat. Leg kort uit waarom het past, gebruik daarbij gerust de smaak en de favorieten van de gebruiker.",
    ] : [
      "Elke regel bij KANDIDATEN is: id | naam | familie | smaak (zoet/zuur/bitter/sterk, 0-5) | alcoholvrij of warm als dat zo is.",
      "De gebruiker wil niet dat je naar zijn of haar voorraad kijkt: je weet niet wat er in huis is, dus zeg daar niets over. Leg kort uit waarom het past, gebruik daarbij gerust de smaak en de favorieten van de gebruiker.",
    ]),
    "Vraagt iemand iets dat niets met drankjes, cocktails of de thuisbar te maken heeft, zeg dan vriendelijk dat je daar niet bij kunt helpen en laat recepten leeg. Moedig nooit overmatig drinken aan; bij vragen over veel of snel drinken raad je een alcoholvrije optie of water aan.",
    "Geef je antwoord als JSON: antwoord = je tekst, recepten = de gekozen ids (leeg als je er geen aanraadt).",
    "",
    ...(metVoorraad ? [`VOORRAAD: ${voorraad.join(", ") || "(leeg)"}`] : []),
    `SMAAK VAN DE GEBRUIKER: ${smaak || "nog onbekend"}`,
    `FAVORIETEN (hoog beoordeeld): ${favorieten.join(", ") || "nog geen"}`,
    "KANDIDATEN:",
    ...kandidaten,
  ].join("\n");

  const response = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system,
    messages,
    output_config: { format: { type: "json_schema", schema: CHAT_SCHEMA } },
  });
  if (response.stop_reason === "refusal") {
    return { antwoord: "Daar kan ik je helaas niet mee helpen. Zal ik iets lekkers voor je zoeken?", recepten: [] };
  }
  const parsed = JSON.parse(firstText(response) || "{}");
  const toegestaan = new Set(kandidaten.map((k) => k.split("|")[0].trim()));
  return {
    antwoord: clip(parsed.antwoord, 1200),
    recepten: (Array.isArray(parsed.recepten) ? parsed.recepten : [])
      .map((r: { id?: string }) => r?.id)
      .filter((id: unknown): id is string => typeof id === "string" && toegestaan.has(id))
      .slice(0, 3),
  };
}

// ---------- Flessen scannen ----------
const SCAN_SCHEMA = {
  type: "object",
  properties: {
    flessen: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ingredient_id: { type: "string" },
          merk: { type: "string" },
          zeker: { type: "boolean" },
          alternatief_id: { type: "string" },
        },
        required: ["ingredient_id", "merk", "zeker", "alternatief_id"],
        additionalProperties: false,
      },
    },
  },
  required: ["flessen"],
  additionalProperties: false,
};

async function scan(body: Record<string, unknown>) {
  const image = typeof body.image === "string" ? body.image : "";
  // Base64 van een verkleinde JPEG; ruim 2 MB is al veel te groot.
  if (!image || image.length > 2_800_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) throw new InvalidInput();
  const lijst = (Array.isArray(body.ingredienten) ? body.ingredienten : []).slice(0, 400)
    .map((v) => clip(v, 120)).filter(Boolean);
  if (!lijst.length) throw new InvalidInput();

  const system = [
    "Je herkent flessen drank op een foto voor de app Mijn Thuisbar.",
    "Kies voor elke duidelijk zichtbare fles het best passende ingrediënt uit de lijst INGREDIËNTEN (gebruik de exacte id vóór het | teken). Een fles die niet in de lijst past of die je niet kunt herkennen sla je over.",
    "merk = het merk of de naam die je op het etiket leest, of een lege tekst als je dat niet kunt lezen.",
    "zeker = true als je het ingrediënt zeker weet, anders false. Twijfel je tussen twee ingrediënten (bijvoorbeeld zoete of droge vermout), zet dan zeker = false en vul alternatief_id met de tweede keuze; anders is alternatief_id een lege tekst.",
    "Noem elke fles één keer, ook als er twee dezelfde staan. Hooguit 20 flessen.",
    "",
    "INGREDIËNTEN:",
    ...lijst,
  ].join("\n");

  const response = await anthropic.messages.create({
    model: SCAN_MODEL,
    max_tokens: 1500,
    system,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
        { type: "text", text: "Welke flessen staan er op deze foto?" },
      ],
    }],
    output_config: { format: { type: "json_schema", schema: SCAN_SCHEMA } },
  });
  if (response.stop_reason === "refusal") return { flessen: [] };
  const parsed = JSON.parse(firstText(response) || "{}");
  const ids = new Set(lijst.map((l) => l.split("|")[0].trim()));
  const gezien = new Set<string>();
  const flessen = [];
  for (const f of Array.isArray(parsed.flessen) ? parsed.flessen : []) {
    const id = typeof f?.ingredient_id === "string" ? f.ingredient_id : "";
    if (!ids.has(id) || gezien.has(id)) continue;
    gezien.add(id);
    const alt = typeof f.alternatief_id === "string" && ids.has(f.alternatief_id) && f.alternatief_id !== id ? f.alternatief_id : null;
    flessen.push({ id, merk: clip(f.merk, 60).trim() || null, zeker: f.zeker === true && !alt, alternatief: alt });
  }
  return { flessen: flessen.slice(0, 20) };
}
