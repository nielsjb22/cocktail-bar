-- Feestplanner Deel B: één rij per feest i.p.v. één losse set voorkeuren op
-- het apparaat. cocktail_ids/bought_items/prep_done zijn tekst-arrays omdat
-- recept-id's, inkoop-regelsleutels en voorbereidingsstap-id's in de app al
-- strings zijn (geen aparte lookup-tabellen).
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  starts_at timestamptz,
  guests integer not null default 8,
  drinks_per_guest integer not null default 2,
  cocktail_ids text[] not null default '{}',
  bought_items text[] not null default '{}',
  prep_done text[] not null default '{}',
  taste_survey_id uuid references public.party_surveys(id) on delete set null,
  reminder_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists parties_user_id_idx on public.parties (user_id);

alter table public.parties enable row level security;

create policy "parties_select_own" on public.parties
  for select using (auth.uid() = user_id);

create policy "parties_insert_own" on public.parties
  for insert with check (auth.uid() = user_id);

create policy "parties_update_own" on public.parties
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "parties_delete_own" on public.parties
  for delete using (auth.uid() = user_id);
