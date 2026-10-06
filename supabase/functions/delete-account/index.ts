import { createClient } from "npm:@supabase/supabase-js@2";

// Verwijdert het account van de AANROEPER zelf — nooit een meegegeven id
// vertrouwen zoals notify-friends dat mag doen (die is niet destructief).
// Hier wordt de identiteit van de gebruiker afgeleid uit hun eigen
// Authorization-header (verify_jwt staat al aan), niet uit de request body.
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet ingelogd" }), { status: 401 });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Ongeldige sessie" }), { status: 401 });
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Eigen data eerst opruimen (voor het geval foreign keys geen cascade
    // hebben ingesteld), dan pas het auth-account zelf.
    await admin.from("push_subscriptions").delete().eq("user_id", userId);
    await admin.from("checkin_reactions").delete().eq("user_id", userId);
    await admin.from("course_milestone_reactions").delete().eq("user_id", userId);
    await admin.from("course_milestones").delete().eq("user_id", userId);
    await admin.from("checkin_comments").delete().eq("user_id", userId);
    await admin.from("checkins").delete().eq("user_id", userId);
    await admin.from("friendships").delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    await admin.from("party_survey_responses").delete().eq("survey_id", userId); // no-op indien geen match, veilig
    const { data: surveys } = await admin.from("party_surveys").select("id").eq("host_user_id", userId);
    if (surveys && surveys.length > 0) {
      const ids = surveys.map((s) => s.id);
      await admin.from("party_survey_responses").delete().in("survey_id", ids);
      await admin.from("party_surveys").delete().eq("host_user_id", userId);
    }
    await admin.from("parties").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);

    const { error: delError } = await admin.auth.admin.deleteUser(userId);
    if (delError) {
      return new Response(JSON.stringify({ error: delError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
