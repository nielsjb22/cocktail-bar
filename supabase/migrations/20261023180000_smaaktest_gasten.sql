-- Smaaktest voor gasten zonder account, zeker laten werken.
-- Veilig en herhaalbaar: bestaande tabellen en gegevens blijven staan
-- (alleen "if not exists", "create or replace" en policies die eerst met
-- "drop policy if exists" worden weggehaald en direct opnieuw gemaakt).

create table if not exists public.party_surveys (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.party_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.party_surveys(id) on delete cascade,
  guest_name text,
  created_at timestamptz not null default now()
);
-- Velden die de app instuurt (bestaan ze al, dan gebeurt er niets).
alter table public.party_survey_responses add column if not exists taste_tags text[] default '{}';
alter table public.party_survey_responses add column if not exists dislike_tags text[] default '{}';
alter table public.party_survey_responses add column if not exists strength integer;
alter table public.party_survey_responses add column if not exists alcohol_free boolean default false;
alter table public.party_survey_responses add column if not exists favorite_spirit text;
alter table public.party_survey_responses add column if not exists favorite_cocktail_ids text[] default '{}';
alter table public.party_survey_responses add column if not exists dietary text[] default '{}';
alter table public.party_survey_responses add column if not exists answers jsonb;

-- Een gast mag één smaaktest opvragen via het (niet te raden) id in de link,
-- maar niet de lijst van alle smaaktesten zien.
create or replace function public.smaaktest_ophalen(p_id uuid)
returns table (id uuid, title text)
language sql stable security definer set search_path = public
as $$ select s.id, s.title from public.party_surveys s where s.id = p_id $$;

create or replace function public.smaaktest_bestaat(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.party_surveys s where s.id = p_id) $$;

grant execute on function public.smaaktest_ophalen(uuid) to anon, authenticated;
grant execute on function public.smaaktest_bestaat(uuid) to anon, authenticated;

alter table public.party_surveys enable row level security;
alter table public.party_survey_responses enable row level security;

grant select, insert, update, delete on public.party_surveys to authenticated;
grant insert on public.party_survey_responses to anon, authenticated;
grant select, delete on public.party_survey_responses to authenticated;

-- De host beheert zijn eigen smaaktesten.
drop policy if exists "smaaktest_host_lezen" on public.party_surveys;
create policy "smaaktest_host_lezen" on public.party_surveys
  for select to authenticated using (auth.uid() = host_user_id);
drop policy if exists "smaaktest_host_maken" on public.party_surveys;
create policy "smaaktest_host_maken" on public.party_surveys
  for insert to authenticated with check (auth.uid() = host_user_id);
drop policy if exists "smaaktest_host_wijzigen" on public.party_surveys;
create policy "smaaktest_host_wijzigen" on public.party_surveys
  for update to authenticated using (auth.uid() = host_user_id) with check (auth.uid() = host_user_id);
drop policy if exists "smaaktest_host_verwijderen" on public.party_surveys;
create policy "smaaktest_host_verwijderen" on public.party_surveys
  for delete to authenticated using (auth.uid() = host_user_id);

-- Iedereen met de link mag een antwoord insturen; alleen de host leest ze.
drop policy if exists "smaaktest_antwoord_insturen" on public.party_survey_responses;
create policy "smaaktest_antwoord_insturen" on public.party_survey_responses
  for insert to anon, authenticated with check (public.smaaktest_bestaat(survey_id));
drop policy if exists "smaaktest_antwoorden_host_lezen" on public.party_survey_responses;
create policy "smaaktest_antwoorden_host_lezen" on public.party_survey_responses
  for select to authenticated using (
    exists (select 1 from public.party_surveys s where s.id = survey_id and s.host_user_id = auth.uid())
  );
drop policy if exists "smaaktest_antwoorden_host_verwijderen" on public.party_survey_responses;
create policy "smaaktest_antwoorden_host_verwijderen" on public.party_survey_responses
  for delete to authenticated using (
    exists (select 1 from public.party_surveys s where s.id = survey_id and s.host_user_id = auth.uid())
  );

-- Nieuwe antwoorden live bij de host (Realtime); al aangezet is geen probleem.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'party_survey_responses') then
    execute 'alter publication supabase_realtime add table public.party_survey_responses';
  end if;
end $$;
