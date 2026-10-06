import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5";

// Pushmeldingen naar iPhones via Apple (APNs).
//
// Wordt aangeroepen door database-triggers (zie migratie push_meldingen) met
// de nieuwe rij van checkin_tags, checkin_reactions, checkin_comments,
// course_milestones, course_milestone_reactions, course_milestone_comments,
// friendships of checkins. Deze functie bepaalt wie de melding krijgt, kijkt
// naar ieders voorkeuren en blokkades, en verstuurt.
//
// Secrets bij de functie:
//   PUSH_SECRET     zelfde waarde als 'push_geheim' in Vault
//   APNS_KEY_ID     Key ID van de .p8-sleutel (10 tekens)
//   APNS_TEAM_ID    Team ID van je Apple Developer-account (10 tekens)
//   APNS_KEY        de volledige inhoud van het .p8-bestand
//   APNS_BUNDLE_ID  optioneel, standaard nl.thuisbar.app
//
// Apple heeft twee servers: production (TestFlight/App Store) en sandbox
// (apps die je vanuit Xcode op je telefoon zet). We proberen eerst
// production; zegt Apple dat het token daar niet bestaat, dan sandbox, en
// dat onthouden we per token.

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const secret = Deno.env.get("PUSH_SECRET") || "";
const keyId = Deno.env.get("APNS_KEY_ID") || "";
const teamId = Deno.env.get("APNS_TEAM_ID") || "";
const p8 = (Deno.env.get("APNS_KEY") || "").replace(/\\n/g, "\n").trim();
const bundleId = Deno.env.get("APNS_BUNDLE_ID") || "nl.thuisbar.app";

const admin = createClient(supabaseUrl, serviceRoleKey);

const HOSTS = { production: "api.push.apple.com", sandbox: "api.sandbox.push.apple.com" } as const;
type Omgeving = keyof typeof HOSTS;

const RANG_NAMEN: Record<string, string> = {
  leerling: "Leerling", barback: "Barback", thuisbartender: "Thuisbartender", bartender: "Bartender", meester: "Meester",
};

type Voorkeur = "tags" | "reacties" | "vriendschap" | "rangen" | "checkins";
type Melding = {
  ontvangers: string[];
  afzender: string;
  voorkeur: Voorkeur;
  tekst: (naam: string) => string;
  doel: string; // waar de app heen gaat bij tikken
  sleutel?: string; // zelfde sleutel binnen 6 uur = niet nog een keer
};

// --- Apple-token (JWT), max. een uur geldig; we vernieuwen na 50 minuten.
let jwtCache: { token: string; tijd: number } | null = null;
async function appleJwt(): Promise<string> {
  if (jwtCache && Date.now() - jwtCache.tijd < 50 * 60 * 1000) return jwtCache.token;
  const key = await importPKCS8(p8, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .sign(key);
  jwtCache = { token, tijd: Date.now() };
  return token;
}

async function naarApple(omgeving: Omgeving, token: string, body: string): Promise<{ status: number; reden: string }> {
  const res = await fetch(`https://${HOSTS[omgeving]}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await appleJwt()}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body,
  });
  let reden = "";
  if (res.status !== 200) {
    try { reden = (await res.json())?.reason || ""; } catch { /* lege body */ }
  } else {
    await res.body?.cancel();
  }
  return { status: res.status, reden };
}

type TokenRij = { token: string; omgeving: Omgeving | null };

// Verstuurt naar één toestel; geeft true terug als het aankwam.
async function verstuur(rij: TokenRij, body: string): Promise<boolean> {
  const volgorde: Omgeving[] = rij.omgeving ? [rij.omgeving] : ["production", "sandbox"];
  for (const omgeving of volgorde) {
    const { status, reden } = await naarApple(omgeving, rij.token, body);
    if (status === 200) {
      if (rij.omgeving !== omgeving) await admin.from("push_tokens").update({ omgeving }).eq("token", rij.token);
      return true;
    }
    if (status === 410 || reden === "Unregistered") {
      await admin.from("push_tokens").delete().eq("token", rij.token);
      return false;
    }
    // BadDeviceToken = verkeerde server voor dit token; probeer de andere.
    if (reden === "BadDeviceToken") continue;
    console.error("APNs", status, reden);
    return false;
  }
  // Op geen van beide servers bekend: weg ermee.
  if (!rij.omgeving) await admin.from("push_tokens").delete().eq("token", rij.token);
  return false;
}

// --- Gegevens ophalen
async function voornaam(userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("name").eq("id", userId).maybeSingle();
  const naam = (data?.name || "").trim();
  return naam ? naam.split(/\s+/)[0] : "Een vriend";
}

async function vriendenVan(userId: string): Promise<string[]> {
  const { data } = await admin.from("friendships").select("requester_id, addressee_id")
    .eq("status", "accepted").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return (data || []).map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id));
}

async function checkin(id: unknown): Promise<{ user_id: string; name: string } | null> {
  const { data } = await admin.from("checkins").select("user_id, name").eq("id", id).maybeSingle();
  return data;
}

async function mijlpaal(id: unknown): Promise<{ user_id: string; rank: string } | null> {
  const { data } = await admin.from("course_milestones").select("user_id, rank").eq("id", id).maybeSingle();
  return data;
}

function kort(tekst: string, max = 90): string {
  const t = (tekst || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

const rangNaam = (id: string) => RANG_NAMEN[id] || id;

// --- Van databaserij naar melding(en)
// deno-lint-ignore no-explicit-any
async function bepaalMelding(tabel: string, actie: string, rij: any, oud: any): Promise<Melding | null> {
  if (tabel === "checkin_tags" && actie === "INSERT") {
    // Een terug-tag bij overnemen is al "overgenomen": geen melding.
    if (rij.adopted_checkin_id) return null;
    const c = await checkin(rij.checkin_id);
    const drank = c?.name || "een cocktail";
    return {
      ontvangers: [rij.tagged_user_id], afzender: rij.tagger_id, voorkeur: "tags", doel: "feed",
      tekst: (n) => `${n} heeft je getagd bij een ${drank}. Tik om ook in te checken.`,
    };
  }
  if (tabel === "checkin_reactions" && actie === "INSERT") {
    const c = await checkin(rij.checkin_id);
    if (!c) return null;
    return {
      ontvangers: [c.user_id], afzender: rij.user_id, voorkeur: "reacties", doel: "feed",
      sleutel: `proost:${rij.checkin_id}:${rij.user_id}`,
      tekst: (n) => `${n} proost op je ${c.name}`,
    };
  }
  if (tabel === "checkin_comments" && actie === "INSERT") {
    const c = await checkin(rij.checkin_id);
    if (!c) return null;
    return {
      ontvangers: [c.user_id], afzender: rij.user_id, voorkeur: "reacties", doel: "feed",
      tekst: (n) => `${n} reageerde op je ${c.name}: "${kort(rij.text)}"`,
    };
  }
  if (tabel === "course_milestone_reactions" && actie === "INSERT") {
    const m = await mijlpaal(rij.milestone_id);
    if (!m) return null;
    return {
      ontvangers: [m.user_id], afzender: rij.user_id, voorkeur: "reacties", doel: "feed",
      sleutel: `proost-rang:${rij.milestone_id}:${rij.user_id}`,
      tekst: (n) => `${n} proost op je nieuwe rang: ${rangNaam(m.rank)}`,
    };
  }
  if (tabel === "course_milestone_comments" && actie === "INSERT") {
    const m = await mijlpaal(rij.milestone_id);
    if (!m) return null;
    return {
      ontvangers: [m.user_id], afzender: rij.user_id, voorkeur: "reacties", doel: "feed",
      tekst: (n) => `${n} reageerde op je rang ${rangNaam(m.rank)}: "${kort(rij.text)}"`,
    };
  }
  if (tabel === "course_milestones" && actie === "INSERT") {
    return {
      ontvangers: await vriendenVan(rij.user_id), afzender: rij.user_id, voorkeur: "rangen", doel: "feed",
      sleutel: `rang:${rij.user_id}:${rij.rank}`,
      tekst: (n) => rij.rank === "meester"
        ? `${n} heeft de cursus afgerond en is nu Meester`
        : `${n} is nu ${rangNaam(rij.rank)} in de cursus`,
    };
  }
  if (tabel === "friendships") {
    if (actie === "INSERT" && rij.status === "pending") {
      return {
        ontvangers: [rij.addressee_id], afzender: rij.requester_id, voorkeur: "vriendschap", doel: "vrienden",
        sleutel: `verzoek:${rij.requester_id}:${rij.addressee_id}`,
        tekst: (n) => `${n} wil vrienden met je worden`,
      };
    }
    if (actie === "UPDATE" && rij.status === "accepted" && oud?.status !== "accepted") {
      return {
        ontvangers: [rij.requester_id], afzender: rij.addressee_id, voorkeur: "vriendschap", doel: "vrienden",
        tekst: (n) => `${n} heeft je vriendschapsverzoek geaccepteerd`,
      };
    }
    return null;
  }
  if (tabel === "checkins" && actie === "INSERT") {
    // Tags worden net na de check-in opgeslagen; even wachten, zodat wie
    // getagd is alleen de tag-melding krijgt en niet twee.
    await new Promise((r) => setTimeout(r, 4000));
    const { data: tags } = await admin.from("checkin_tags").select("tagged_user_id").eq("checkin_id", rij.id);
    const getagd = new Set((tags || []).map((t) => t.tagged_user_id));
    const vrienden = (await vriendenVan(rij.user_id)).filter((id) => !getagd.has(id));
    return {
      ontvangers: vrienden, afzender: rij.user_id, voorkeur: "checkins", doel: "feed",
      tekst: (n) => `${n} checkte net een ${rij.name || "cocktail"} in`,
    };
  }
  return null;
}

Deno.serve(async (req) => {
  if (!secret || req.headers.get("x-push-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Geen toegang" }), { status: 401 });
  }
  if (!keyId || !teamId || !p8) {
    return new Response(JSON.stringify({ error: "APNs-secrets ontbreken" }), { status: 500 });
  }
  try {
    const { tabel, actie, rij, oud } = await req.json();
    const melding = await bepaalMelding(tabel, actie, rij, oud);
    if (!melding) return Response.json({ verstuurd: 0 });

    let ontvangers = [...new Set(melding.ontvangers)].filter((id) => id && id !== melding.afzender);
    if (ontvangers.length === 0) return Response.json({ verstuurd: 0 });

    // Blokkades, in beide richtingen.
    const { data: blokken } = await admin.from("blocked_users").select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${melding.afzender},blocked_id.eq.${melding.afzender}`);
    const geblokkeerd = new Set((blokken || []).map((b) => (b.blocker_id === melding.afzender ? b.blocked_id : b.blocker_id)));
    ontvangers = ontvangers.filter((id) => !geblokkeerd.has(id));

    // Voorkeuren (geen rij = standaard: alles aan behalve check-ins).
    const { data: voorkeuren } = await admin.from("push_voorkeuren").select("*").in("user_id", ontvangers);
    const perGebruiker = new Map((voorkeuren || []).map((v) => [v.user_id, v]));
    ontvangers = ontvangers.filter((id) => {
      const v = perGebruiker.get(id);
      return v ? v[melding.voorkeur] === true : melding.voorkeur !== "checkins";
    });

    // Niet twee keer dezelfde melding binnen 6 uur (proost aan/uit/aan).
    if (melding.sleutel && ontvangers.length > 0) {
      const sinds = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
      const { data: eerder } = await admin.from("push_log").select("ontvanger")
        .eq("sleutel", melding.sleutel).gte("created_at", sinds);
      const al = new Set((eerder || []).map((e) => e.ontvanger));
      ontvangers = ontvangers.filter((id) => !al.has(id));
    }
    if (ontvangers.length === 0) return Response.json({ verstuurd: 0 });

    const { data: tokens } = await admin.from("push_tokens").select("token, user_id, omgeving")
      .in("user_id", ontvangers).eq("platform", "ios");
    const naam = await voornaam(melding.afzender);
    const body = JSON.stringify({
      aps: { alert: { body: melding.tekst(naam) }, sound: "default", "thread-id": melding.voorkeur },
      doel: melding.doel,
    });

    let verstuurd = 0;
    const perOntvanger = new Map<string, number>();
    await Promise.all((tokens || []).map(async (t) => {
      if (await verstuur(t as TokenRij, body)) {
        verstuurd++;
        perOntvanger.set(t.user_id, (perOntvanger.get(t.user_id) || 0) + 1);
      }
    }));
    const soort = `${tabel}:${actie}`.toLowerCase();
    const logRijen = ontvangers.map((id) => ({
      ontvanger: id, soort, sleutel: melding.sleutel || `${soort}:${rij?.id ?? ""}`, verstuurd: perOntvanger.get(id) || 0,
    }));
    if (logRijen.length > 0) await admin.from("push_log").insert(logRijen);

    return Response.json({ verstuurd });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
