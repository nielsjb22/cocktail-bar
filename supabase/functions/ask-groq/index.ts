// Stuurt een prompt door naar Groq en geeft een tekstantwoord terug.
// De GROQ_API_KEY staat alleen als Supabase secret; nooit in de app.
const groqKey = Deno.env.get("GROQ_API_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { prompt } = await req.json();
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) {
      return json({ error: "Ongeldige prompt" }, 400);
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        max_tokens: 500,
        messages: [
          { role: "system", content: "Je bent een behulpzame cocktailexpert. Antwoord kort in het Nederlands." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message ?? "Groq-fout" }, 502);

    return json({ text: data.choices?.[0]?.message?.content ?? "" });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
