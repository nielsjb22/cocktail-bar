// "Download mijn gegevens" (AVG: inzage en meenemen van je gegevens).
// Verzamelt alles wat bij jou hoort in één JSON-bestand: de rijen uit je
// account (alleen wat je volgens de beveiligingsregels zelf mag lezen) en
// wat de app op deze telefoon bewaart. Op de iPhone opent daarna het
// deelmenu (bewaren in Bestanden, mailen, AirDrop); op het web wordt het
// bestand gedownload.
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { supabase } from "./supabaseClient";
import { isNative } from "./native";

// Per tabel: hoe je je eigen rijen vindt. Een tabel die (nog) niet bestaat of
// niet leesbaar is, wordt overgeslagen en in het bestand vermeld.
const TABELLEN = [
  ["profiel", "profiles", (q, id) => q.eq("id", id)],
  ["check_ins", "checkins", (q, id) => q.eq("user_id", id)],
  ["reacties_op_check_ins", "checkin_comments", (q, id) => q.eq("user_id", id)],
  ["proosts", "checkin_reactions", (q, id) => q.eq("user_id", id)],
  ["tags", "checkin_tags", (q, id) => q.or(`tagger_id.eq.${id},tagged_user_id.eq.${id}`)],
  ["vriendschappen", "friendships", (q, id) => q.or(`requester_id.eq.${id},addressee_id.eq.${id}`)],
  ["geblokkeerd", "blocked_users", (q, id) => q.eq("blocker_id", id)],
  ["feesten", "parties", (q, id) => q.eq("user_id", id)],
  ["smaaktesten", "party_surveys", (q, id) => q.eq("host_user_id", id)],
  ["cursusmomenten", "course_milestones", (q, id) => q.eq("user_id", id)],
  ["reacties_op_cursusmomenten", "course_milestone_comments", (q, id) => q.eq("user_id", id)],
  ["proosts_op_cursusmomenten", "course_milestone_reactions", (q, id) => q.eq("user_id", id)],
  ["opgeslagen_instellingen", "user_state", (q, id) => q.eq("user_id", id)],
  ["meldingsvoorkeuren", "push_voorkeuren", (q, id) => q.eq("user_id", id)],
  ["ai_gebruik_per_dag", "ai_gebruik", (q, id) => q.eq("user_id", id)],
  ["merk_koppelingen", "merk_koppelingen", (q, id) => q.eq("user_id", id)],
  ["zoekopdrachten_zonder_resultaat", "zoek_signalen", (q, id) => q.eq("user_id", id)],
  ["meldingen_die_je_deed", "content_reports", (q, id) => q.eq("reporter_id", id)],
];

async function accountGegevens(userId) {
  const out = {}, overgeslagen = [];
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (user) out.account = { id: user.id, email: user.email, aangemaakt_op: user.created_at, laatst_ingelogd: user.last_sign_in_at };
  for (const [naam, tabel, filter] of TABELLEN) {
    const { data, error } = await filter(supabase.from(tabel).select("*"), userId);
    if (error) overgeslagen.push(naam); else out[naam] = data || [];
  }
  // Antwoorden van gasten op je eigen smaaktesten.
  const ids = (out.smaaktesten || []).map(s => s.id);
  if (ids.length) {
    const { data, error } = await supabase.from("party_survey_responses").select("*").in("survey_id", ids);
    if (error) overgeslagen.push("antwoorden_van_gasten"); else out.antwoorden_van_gasten = data || [];
  }
  return { out, overgeslagen };
}

async function lokaleGegevens() {
  const { keys } = await Preferences.keys();
  const out = {};
  for (const key of keys.filter(k => k.startsWith("thuisbar-")).sort()) {
    const { value } = await Preferences.get({ key });
    try { out[key] = JSON.parse(value); } catch { out[key] = value; }
  }
  return out;
}

export async function exportMyData(userId) {
  const bestand = {
    over_dit_bestand: "Al je gegevens uit Mijn Thuisbar. Foto's staan erin als link (account) of als afbeelding in tekstvorm (op deze telefoon).",
    gemaakt_op: new Date().toISOString(),
  };
  if (userId) {
    const { out, overgeslagen } = await accountGegevens(userId);
    bestand.account = out;
    if (overgeslagen.length) bestand.niet_opgehaald = { onderdelen: overgeslagen, uitleg: "Deze onderdelen konden niet worden opgehaald. Mail ons als je ze toch wilt hebben." };
  }
  bestand.op_deze_telefoon = await lokaleGegevens();

  const json = JSON.stringify(bestand, null, 2);
  const filename = `mijn-thuisbar-gegevens-${new Date().toISOString().slice(0, 10)}.json`;
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try { await Share.share({ title: "Mijn Thuisbar-gegevens", files: [uri], dialogTitle: "Mijn Thuisbar-gegevens" }); }
    catch (e) { if (!/cancel/i.test(String(e?.message || e))) throw e; }
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
