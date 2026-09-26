import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

webpush.setVapidDetails(
  "mailto:notificaties@mijnthuisbar.app",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

Deno.serve(async (req) => {
  try {
    const { userId, cocktailName } = await req.json();
    if (!userId || !cocktailName) {
      return new Response(JSON.stringify({ error: "userId en cocktailName zijn verplicht" }), { status: 400 });
    }

    const { data: profile } = await supabaseAdmin.from("profiles").select("name").eq("id", userId).single();
    const friendName = profile?.name || "Een vriend";

    const { data: friendships } = await supabaseAdmin
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    const friendIds = (friendships || []).map((f) =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );
    if (friendIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("user_id", friendIds);

    const payload = JSON.stringify({
      title: "Mijn Thuisbar",
      body: `${friendName} checkte net "${cocktailName}" in`,
      url: "/",
    });

    let sent = 0;
    await Promise.all(
      (subs || []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (err) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      })
    );

    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
