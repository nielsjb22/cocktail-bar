import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Stuurt een prompt via de Edge Function `ask-groq` naar Groq; geeft tekst terug.
export async function askGroq(prompt) {
  const { data, error } = await supabase.functions.invoke("ask-groq", { body: { prompt } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.text;
}
