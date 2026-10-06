-- Flessen per drank (drie niveaus) en waar je ze koopt. Vervangt op termijn
-- `producten` (één winkel, alleen handmatig). Prijzen van winkels die het
-- toestaan worden wekelijks automatisch bijgewerkt door de Edge Function
-- `prijscheck`; Drankdozijn en Gall & Gall blokkeren dat en worden met de
-- hand bijgehouden (automatisch = false).
create table if not exists public.flessen (
  id uuid primary key default gen_random_uuid(),
  ingredient_id text not null,                 -- id uit src/recipes.js
  niveau text not null check (niveau in ('voordelig', 'goed', 'klassieker')),
  naam text not null,                          -- bv. 'Tanqueray London Dry Gin'
  notitie text,                                -- waarom deze fles (kort)
  status text not null default 'te_beoordelen' check (status in ('goedgekeurd', 'te_beoordelen', 'afgekeurd')),
  bijgewerkt_op timestamptz not null default now(),
  unique (ingredient_id, niveau)
);

create table if not exists public.fles_aanbiedingen (
  id uuid primary key default gen_random_uuid(),
  fles_id uuid not null references public.flessen(id) on delete cascade,
  winkel text not null check (winkel in ('drankdozijn', 'gall', 'mitra', 'dirckiii', 'drankgigant')),
  url text not null check (url ~ '^https://(www\.)?(drankdozijn\.nl|gall\.nl|mitra\.nl|dirckiii\.nl|drankgigant\.nl)/'),
  inhoud_ml integer check (inhoud_ml > 0),
  prijs numeric(8,2) check (prijs >= 0),
  op_voorraad boolean not null default true,
  automatisch boolean not null default true,   -- false = handmatig bijhouden
  prijs_gecontroleerd_op timestamptz,
  mislukte_checks integer not null default 0,
  laatste_fout text,
  actief boolean not null default true,
  unique (winkel, url)
);
create index if not exists fles_aanbiedingen_fles_idx on public.fles_aanbiedingen (fles_id);
create index if not exists fles_aanbiedingen_check_idx on public.fles_aanbiedingen (prijs_gecontroleerd_op nulls first) where automatisch and actief;

alter table public.flessen enable row level security;
alter table public.fles_aanbiedingen enable row level security;

-- Lezen mag iedereen (ook zonder account), alleen goedgekeurde flessen en
-- actieve aanbiedingen. Schrijven alleen met de service role.
drop policy if exists "flessen lezen" on public.flessen;
create policy "flessen lezen" on public.flessen for select using (status = 'goedgekeurd');
drop policy if exists "aanbiedingen lezen" on public.fles_aanbiedingen;
create policy "aanbiedingen lezen" on public.fles_aanbiedingen for select using (
  actief and exists (select 1 from public.flessen f where f.id = fles_id and f.status = 'goedgekeurd')
);
