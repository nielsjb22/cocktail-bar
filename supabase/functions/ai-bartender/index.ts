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
  const actie = body.soort === "scan" || body.soort === "chat" || body.soort === "herken" ? body.soort : null;
  if (!actie) return json({ error: "ongeldig" }, 400);
  // Cocktail herkennen telt mee voor hetzelfde dagtegoed als flessen scannen.
  const soort = actie === "chat" ? "chat" : "scan";

  // Eerst het tegoed van vandaag gebruiken; is het op, dan stoppen we hier.
  const { data: tegoed, error: tegoedError } = await caller.rpc("ai_tegoed_gebruiken", { p_soort: soort });
  if (tegoedError) return json({ error: "limiet_onbekend" }, 500);
  const rij = Array.isArray(tegoed) ? tegoed[0] : tegoed;
  if (!rij?.toegestaan) return json({ error: "limiet", over: 0 }, 429);

  try {
    const result = actie === "chat" ? await chat(body) : actie === "herken" ? await herken(body) : await scan(body);
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
        // waarom = 1-2 zinnen per cocktail: waarom die bij deze gebruiker past.
        properties: { id: { type: "string" }, waarom: { type: "string" } },
        required: ["id", "waarom"],
        additionalProperties: false,
      },
    },
    // Korte antwoordknoppen bij een wedervraag (bijv. "Fris", "Stevig").
    opties: { type: "array", items: { type: "string" } },
  },
  required: ["antwoord", "recepten", "opties"],
  additionalProperties: false,
};

async function chat(body: Record<string, unknown>) {
  const ctx = (body.context || {}) as Record<string, unknown>;
  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const messages: Anthropic.MessageParam[] = rawMessages
    .map((m) => m as Record<string, unknown>)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", content: clip(m.content, m.role === "assistant" ? 2500 : 1000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") throw new InvalidInput();

  const voorraad = (Array.isArray(ctx.voorraad) ? ctx.voorraad : []).slice(0, 250).map((v) => clip(v, 60)).filter(Boolean);
  const kandidaten = (Array.isArray(ctx.kandidaten) ? ctx.kandidaten : []).slice(0, 200).map((v) => clip(v, 360)).filter(Boolean);
  // Wat de bartender de laatste tijd al voorstelde (ook in eerdere gesprekken), om herhaling te voorkomen.
  const eerder = (Array.isArray(ctx.eerderVoorgesteld) ? ctx.eerderVoorgesteld : []).slice(0, 30).map((v) => clip(v, 80)).filter(Boolean);
  const smaak = clip(ctx.smaak, 300);
  // De gebruiker kiest zelf of de bartender naar de voorraad mag kijken.
  const metVoorraad = ctx.voorraadGebruiken !== false;
  const favorieten = (Array.isArray(ctx.favorieten) ? ctx.favorieten : []).slice(0, 12).map((v) => clip(v, 80)).filter(Boolean);
  const nietLekker = (Array.isArray(ctx.nietLekker) ? ctx.nietLekker : []).slice(0, 10).map((v) => clip(v, 80)).filter(Boolean);
  const recent = (Array.isArray(ctx.recent) ? ctx.recent : []).slice(0, 8).map((v) => clip(v, 160)).filter(Boolean);
  const moment = clip(ctx.moment, 80);

  const system = [
    "Je bent de persoonlijke bartender in de app Mijn Thuisbar. Je praat Nederlands, warm en persoonlijk, zoals een goede bartender die zijn vaste gast kent. Geen emoji en geen opsommingstekens in antwoord.",
    "Je raadt ALLEEN recepten aan uit de lijst KANDIDATEN hieronder, met hun exacte id. Verzin nooit zelf recepten, hoeveelheden of bereidingen: die staan al in de app.",
    "",
    "AANTAL: geef standaard 3 recepten. Vraagt de gebruiker om een aantal (bijv. 'geef me 5 voorbeelden'), geef dan precies dat aantal, met een maximum van 8. Vraagt de gebruiker om één tip, geef er één.",
    "UITLEG PER COCKTAIL: geef bij elk recept in waarom 1 of 2 zinnen die echt over deze cocktail en deze gebruiker gaan: hoe hij smaakt (bijv. fris, bitter, kruidig, romig), wat de hoofdingrediënten doen, en waarom hij past bij de smaak, favorieten of de vraag van de gebruiker. Wees concreet en specifiek, geen algemene zinnen als 'een heerlijke cocktail'. Herhaal de uitleg niet in antwoord.",
    "antwoord is een korte inleiding van 1 tot 3 zinnen bij je keuze. Vraagt de gebruiker om uitleg, achtergrond of waarom je iets kiest, dan mag antwoord uitgebreider zijn (tot ongeveer 8 zinnen), in gewone alinea's.",
    "AFWISSELING: kies uit de hele lijst KANDIDATEN, niet alleen de eerste regels (de volgorde is willekeurig). Stel geen cocktails voor die bij EERDER VOORGESTELD staan, tenzij de gebruiker er zelf om vraagt of ze echt het allerbeste passen. Vraagt de gebruiker om iets anders of meer, kies dan andere cocktails dan je in dit gesprek al noemde. Wissel af in stijl (bijv. niet alleen sours of alleen highballs).",
    "",
    "DOORVRAGEN: een goede bartender vraagt eerst even door voordat hij iets inschenkt. Is de vraag nog vaag (bijv. 'wat zal ik nemen?', 'iets lekkers', 'verras me' zonder meer) en weet je nog niet genoeg, stel dan EEN korte wedervraag in plaats van meteen recepten te geven. Vraag naar wat er het meest toe doet: de stemming of het moment (aperitief, bij het eten, na het eten, feestje), fris of stevig, zoet of bitter, een sterke drank waar ze zin in hebben, of juist zonder alcohol. Laat recepten dan leeg en geef 2 tot 4 korte antwoordopties in opties (elk hooguit 3 woorden, bijv. 'Fris en zuur', 'Stevig', 'Iets bitters', 'Zonder alcohol').",
    "Vraag niet eindeloos door: na hooguit twee wedervragen in het gesprek, of zodra de vraag al duidelijk genoeg is, geef je je aanbeveling. Geef je recepten, laat opties dan leeg of geef 2 korte vervolgopties (bijv. 'Iets anders', 'Minder sterk').",
    "",
    "PERSOONLIJK: stem je keuze af op deze gebruiker, niet op wat iedereen drinkt. Gebruik de smaak, favorieten, wat hij of zij niet lekker vond en wat er laatst gedronken is. Kies niet steeds de bekendste klassiekers (Mojito, Margarita, Negroni, Old Fashioned) tenzij die echt het beste passen of erom gevraagd wordt; durf ook een minder bekende cocktail voor te stellen die past. Raad bij voorkeur iets aan dat de gebruiker nog niet geprobeerd heeft (zie 'al geprobeerd' bij KANDIDATEN), tenzij om een favoriet gevraagd wordt. Raad nooit iets aan dat lijkt op wat hij of zij niet lekker vond. Noem in één zin waarom het bij hem of haar past (bijv. 'je houdt van bitter, en dit is een zachtere variant van je Negroni').",
    "Houd rekening met het moment (tijd van de dag en seizoen) als dat helpt, bijvoorbeeld warm of stevig in de winter, licht en fris op een zomerse middag.",
    "",
    ...(metVoorraad ? [
      "Elke regel bij KANDIDATEN is: id | naam | familie | hoofdingrediënten | smaak (zoet/zuur/bitter/sterk, 0-5) | match met de smaak van de gebruiker (0-100) | mist (wat de gebruiker nog niet in huis heeft; leeg = alles in huis) | alcoholvrij, warm of al geprobeerd als dat zo is.",
      "Geef de voorkeur aan recepten waarvoor alles in huis is. Mist er iets, zeg dan wat.",
    ] : [
      "Elke regel bij KANDIDATEN is: id | naam | familie | hoofdingrediënten | smaak (zoet/zuur/bitter/sterk, 0-5) | match met de smaak van de gebruiker (0-100) | alcoholvrij, warm of al geprobeerd als dat zo is.",
      "De gebruiker wil niet dat je naar zijn of haar voorraad kijkt: je weet niet wat er in huis is, dus zeg daar niets over.",
    ]),
    "Vraagt iemand iets dat niets met drankjes, cocktails of de thuisbar te maken heeft, zeg dan vriendelijk dat je daar niet bij kunt helpen en laat recepten leeg. Moedig nooit overmatig drinken aan; bij vragen over veel of snel drinken raad je een alcoholvrije optie of water aan.",
    "Geef je antwoord als JSON: antwoord = je tekst, recepten = de gekozen recepten met id en waarom (leeg bij een wedervraag), opties = korte antwoordknoppen (mag leeg).",
    "",
    `MOMENT: ${moment || "onbekend"}`,
    ...(metVoorraad ? [`VOORRAAD: ${voorraad.join(", ") || "(leeg)"}`] : []),
    `SMAAK VAN DE GEBRUIKER: ${smaak || "nog onbekend"}`,
    `FAVORIETEN (hoog beoordeeld): ${favorieten.join(", ") || "nog geen"}`,
    `NIET LEKKER GEVONDEN: ${nietLekker.join(", ") || "niets bekend"}`,
    `LAATST GEDRONKEN: ${recent.join("; ") || "niets bekend"}`,
    `EERDER VOORGESTELD: ${eerder.join(", ") || "nog niets"}`,
    "KANDIDATEN:",
    ...kandidaten,
  ].join("\n");

  // Eén keer opnieuw proberen bij een tijdelijke storing of een onleesbaar
  // (afgebroken) antwoord; pas daarna een foutmelding in de app.
  let parsed: Record<string, unknown> | null = null;
  for (let poging = 0; poging < 2 && !parsed; poging++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 4000,
        system,
        messages,
        output_config: { format: { type: "json_schema", schema: CHAT_SCHEMA } },
      });
    } catch (e) {
      const tijdelijk = e instanceof Anthropic.APIError && (e.status === 529 || (e.status ?? 0) >= 500);
      if (poging === 0 && tijdelijk) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      throw e;
    }
    if (response.stop_reason === "refusal") {
      return { antwoord: "Daar kan ik je helaas niet mee helpen. Zal ik iets lekkers voor je zoeken?", recepten: [], opties: [] };
    }
    try { parsed = JSON.parse(firstText(response) || ""); }
    catch { console.error("Onleesbaar antwoord", response.stop_reason, response.usage?.output_tokens); }
  }
  if (!parsed) throw new Error("onleesbaar antwoord");
  const toegestaan = new Set(kandidaten.map((k) => k.split("|")[0].trim()));
  const gezien = new Set<string>();
  return {
    antwoord: clip(parsed.antwoord, 3000),
    recepten: (Array.isArray(parsed.recepten) ? parsed.recepten : [])
      .map((r: { id?: string; waarom?: string }) => ({ id: typeof r?.id === "string" ? r.id : "", waarom: clip(r?.waarom, 400).trim() }))
      .filter((r: { id: string }) => toegestaan.has(r.id) && !gezien.has(r.id) && gezien.add(r.id))
      .slice(0, 8),
    opties: (Array.isArray(parsed.opties) ? parsed.opties : [])
      .filter((o: unknown): o is string => typeof o === "string" && o.trim().length > 0)
      .map((o: string) => o.trim().slice(0, 40))
      .slice(0, 4),
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

// ---------- Cocktail herkennen ("Wat drink ik hier?") ----------
const HERKEN_SCHEMA = {
  type: "object",
  properties: {
    // Lege lijst = geen cocktail te zien of niet te herkennen.
    kandidaten: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          zekerheid: { type: "string", enum: ["zeker", "waarschijnlijk", "misschien"] },
        },
        required: ["id", "zekerheid"],
        additionalProperties: false,
      },
    },
    // 1-2 zinnen: wat je ziet (glas, kleur, garnering, ijs) en waarom dat past.
    uitleg: { type: "string" },
  },
  required: ["kandidaten", "uitleg"],
  additionalProperties: false,
};

async function herken(body: Record<string, unknown>) {
  const image = typeof body.image === "string" ? body.image : "";
  if (!image || image.length > 2_800_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) throw new InvalidInput();
  // "id|naam|glas|kleur-hint" per recept, door de app meegestuurd.
  const lijst = (Array.isArray(body.recepten) ? body.recepten : []).slice(0, 600)
    .map((v) => clip(v, 160)).filter(Boolean);
  if (!lijst.length) throw new InvalidInput();

  const system = [
    "Je herkent een cocktail op een foto voor de app Mijn Thuisbar. De gebruiker zit vaak in een bar en wil weten wat hij drinkt.",
    "Kijk naar het glas, de kleur, troebel of helder, schuim, ijs en garnering. Kies hooguit 3 cocktails uit de lijst RECEPTEN (gebruik de exacte id vóór het eerste | teken), de beste eerst.",
    "zekerheid: zeker = herkenbaar aan iets unieks (bijvoorbeeld drie koffiebonen op schuim); waarschijnlijk = past goed maar er zijn lookalikes; misschien = gok.",
    "Staat er geen drankje op de foto, of is het iets dat niet in de lijst past, geef dan een lege lijst en zeg dat eerlijk in uitleg.",
    "uitleg: 1 of 2 korte zinnen in het Nederlands over wat je ziet en waarom dat bij je eerste keuze past. Noem geen personen of merken.",
    "",
    "RECEPTEN:",
    ...lijst,
  ].join("\n");

  const response = await anthropic.messages.create({
    model: SCAN_MODEL,
    max_tokens: 800,
    system,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
        { type: "text", text: "Welke cocktail is dit?" },
      ],
    }],
    output_config: { format: { type: "json_schema", schema: HERKEN_SCHEMA } },
  });
  if (response.stop_reason === "refusal") return { kandidaten: [], uitleg: "" };
  const parsed = JSON.parse(firstText(response) || "{}");
  const ids = new Set(lijst.map((l) => l.split("|")[0].trim()));
  const gezien = new Set<string>();
  const kandidaten = [];
  for (const k of Array.isArray(parsed.kandidaten) ? parsed.kandidaten : []) {
    const id = typeof k?.id === "string" ? k.id : "";
    if (!ids.has(id) || gezien.has(id)) continue;
    gezien.add(id);
    const z = ["zeker", "waarschijnlijk", "misschien"].includes(k.zekerheid) ? k.zekerheid : "misschien";
    kandidaten.push({ id, zekerheid: z });
  }
  return { kandidaten: kandidaten.slice(0, 3), uitleg: clip(parsed.uitleg, 400) };
}
