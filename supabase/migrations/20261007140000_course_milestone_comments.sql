-- Reageren op een cursusmoment in de feed ("Sem is nu Thuisbartender").
create table if not exists public.course_milestone_comments (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.course_milestones(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists course_milestone_comments_idx on public.course_milestone_comments (milestone_id, created_at);
alter table public.course_milestone_comments enable row level security;

drop policy if exists "course_milestone_comments_select" on public.course_milestone_comments;
create policy "course_milestone_comments_select" on public.course_milestone_comments
  for select to authenticated using (true);
drop policy if exists "course_milestone_comments_insert_own" on public.course_milestone_comments;
create policy "course_milestone_comments_insert_own" on public.course_milestone_comments
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "course_milestone_comments_delete_own" on public.course_milestone_comments;
create policy "course_milestone_comments_delete_own" on public.course_milestone_comments
  for delete to authenticated using (auth.uid() = user_id);
