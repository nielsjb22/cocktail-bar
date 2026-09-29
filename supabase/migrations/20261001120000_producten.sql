-- Goedgekeurde flessen per ingrediënt voor de boodschappenlijst ("Fles kiezen").
-- De app zoekt nooit zelf op productnaam: alleen rijen hierin met status
-- 'goedgekeurd' worden getoond, met hun exacte productpagina.
create table if not exists public.producten (
  id uuid primary key default gen_random_uuid(),
  ingredient_id text not null,               -- id uit src/recipes.js (bijv. 'grand_marnier')
  winkel text not null default 'drankdozijn' check (winkel in ('drankdozijn')),
  productnaam text not null,
  variant text,                              -- bijv. 'Cordon Rouge'
  inhoud_ml integer check (inhoud_ml > 0),
  url text not null check (url ~ '^https://(www\.)?drankdozijn\.nl/'),
  ean text,
  prijs numeric(8,2) check (prijs >= 0),
  op_voorraad boolean not null default true,
  prijs_gecontroleerd_op date,
  status text not null default 'te_beoordelen' check (status in ('goedgekeurd', 'te_beoordelen', 'afgekeurd')),
  notitie text,                              -- waarom deze fles geschikt is
  beoordeling_reden text,                    -- waarom hij (weer) beoordeeld moet worden
  bijgewerkt_op timestamptz not null default now(),
  unique (winkel, url)
);
create index if not exists producten_ingredient_idx on public.producten (ingredient_id) where status = 'goedgekeurd';

alter table public.producten enable row level security;

-- Iedereen (ook zonder account) mag goedgekeurde flessen lezen. Er zijn
-- bewust geen insert/update/delete-policies: schrijven kan alleen met de
-- service role (Supabase-dashboard / SQL-editor / een eigen server-taak).
drop policy if exists "producten: goedgekeurd lezen" on public.producten;
create policy "producten: goedgekeurd lezen" on public.producten
  for select using (status = 'goedgekeurd');

-- Overzicht voor beheer (in het dashboard): alles wat nog nagekeken moet worden.
create or replace view public.producten_te_beoordelen
  with (security_invoker = true) as
  select * from public.producten where status = 'te_beoordelen' order by ingredient_id, productnaam;
revoke all on public.producten_te_beoordelen from anon, authenticated;
