-- Cursusrang als statussymbool: zichtbaar op je profiel, bij vrienden en in
-- de feed. De voortgang per les blijft lokaal; alleen rang + aantal
-- afgeronde delen gaan naar Supabase. Bestaande RLS op profiles (eigen rij
-- bijwerken, profielen lezen) dekt de nieuwe kolommen.
alter table public.profiles add column if not exists course_rank text;
alter table public.profiles add column if not exists course_parts_done smallint not null default 0;

-- Feedmoment bij een nieuwe rang of het diploma ("Sem is nu Thuisbartender").
create table if not exists public.course_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rank text not null,
  parts_done smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists course_milestones_user_idx on public.course_milestones (user_id, created_at desc);
alter table public.course_milestones enable row level security;

drop policy if exists "course_milestones_select" on public.course_milestones;
create policy "course_milestones_select" on public.course_milestones
  for select to authenticated using (true);
drop policy if exists "course_milestones_insert_own" on public.course_milestones;
create policy "course_milestones_insert_own" on public.course_milestones
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "course_milestones_delete_own" on public.course_milestones;
create policy "course_milestones_delete_own" on public.course_milestones
  for delete to authenticated using (auth.uid() = user_id);

-- Proosten op zo'n moment.
create table if not exists public.course_milestone_reactions (
  milestone_id uuid not null references public.course_milestones(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (milestone_id, user_id)
);
alter table public.course_milestone_reactions enable row level security;

drop policy if exists "course_milestone_reactions_select" on public.course_milestone_reactions;
create policy "course_milestone_reactions_select" on public.course_milestone_reactions
  for select to authenticated using (true);
drop policy if exists "course_milestone_reactions_insert_own" on public.course_milestone_reactions;
create policy "course_milestone_reactions_insert_own" on public.course_milestone_reactions
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "course_milestone_reactions_delete_own" on public.course_milestone_reactions;
create policy "course_milestone_reactions_delete_own" on public.course_milestone_reactions
  for delete to authenticated using (auth.uid() = user_id);
