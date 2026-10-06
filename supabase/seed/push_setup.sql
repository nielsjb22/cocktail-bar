-- Eenmalig: vertel de database waar de push-functie staat en met welk
-- geheim. Vervang de twee waarden tussen <...> voordat je dit draait:
--   <PROJECT_REF>  = het stukje vóór .supabase.co in je Supabase-url
--   <GEHEIM>       = dezelfde waarde als het secret PUSH_SECRET bij de functie
-- Opnieuw draaien mag: bestaande waarden worden bijgewerkt.
do $$
declare
  v_url text := 'https://<PROJECT_REF>.supabase.co/functions/v1/push';
  v_geheim text := '<GEHEIM>';
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'push_url';
  if v_id is null then perform vault.create_secret(v_url, 'push_url');
  else perform vault.update_secret(v_id, v_url); end if;

  select id into v_id from vault.secrets where name = 'push_geheim';
  if v_id is null then perform vault.create_secret(v_geheim, 'push_geheim');
  else perform vault.update_secret(v_id, v_geheim); end if;
end $$;
