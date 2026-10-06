-- Eenmalig: vertel de database waar de push-functie staat en met welk
-- geheim. Vervang de twee waarden tussen <...> voordat je dit draait:
--   <PROJECT_REF>  = het stukje vóór .supabase.co in je Supabase-url
--   <GEHEIM>       = dezelfde waarde als het secret PUSH_SECRET bij de functie
-- Opnieuw draaien mag: de oude waarden worden eerst weggehaald.
delete from vault.secrets where name in ('push_url', 'push_geheim');
select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/push', 'push_url');
select vault.create_secret('<GEHEIM>', 'push_geheim');
