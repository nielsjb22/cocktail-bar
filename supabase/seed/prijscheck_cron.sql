-- Dagelijkse prijscheck om 04:17 (Nederlandse nacht). Vervang de twee
-- waarden tussen <...> voordat je dit draait:
--   <PROJECT_REF>  = het stukje vóór .supabase.co in je Supabase-url
--   <GEHEIM>       = dezelfde waarde als het secret PRIJSCHECK_SECRET
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('prijscheck-dagelijks') where exists (select 1 from cron.job where jobname = 'prijscheck-dagelijks');
select cron.schedule(
  'prijscheck-dagelijks',
  '17 2 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/prijscheck',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-prijscheck-secret', '<GEHEIM>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
