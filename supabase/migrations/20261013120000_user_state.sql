-- Voorraad, favorieten, boodschappenlijst, cursusvoortgang en eigen
-- recepten bij je account, zodat browser en iPhone hetzelfde tonen
-- (src/cloudState.js). Eén rij per gebruiker per onderdeel.
-- Veilig en herhaalbaar: maakt alleen aan, verwijdert niets.
create table if not exists public.user_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_state enable row level security;

drop policy if exists "user_state_own" on public.user_state;
create policy "user_state_own" on public.user_state
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
