-- Vrienden taggen bij een check-in ("Niels met Lisa en Sem"). Een getagde
-- vriend kan de check-in overnemen als eigen check-in met een eigen cijfer;
-- dat verandert niets aan de oorspronkelijke post (adopted_checkin_id wijst
-- naar de nieuwe, eigen check-in van de getagde).
-- Het id-type van checkins (uuid of bigint) wordt overgenomen.
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
  from pg_attribute a where a.attrelid = 'public.checkins'::regclass and a.attname = 'id';
  execute format($f$
    create table if not exists public.checkin_tags (
      id uuid primary key default gen_random_uuid(),
      checkin_id %1$s not null references public.checkins(id) on delete cascade,
      tagger_id uuid not null references auth.users(id) on delete cascade,
      tagged_user_id uuid not null references auth.users(id) on delete cascade,
      adopted_checkin_id %1$s references public.checkins(id) on delete set null,
      dismissed boolean not null default false,
      created_at timestamptz not null default now(),
      unique (checkin_id, tagged_user_id)
    )$f$, t);
end $$;
create index if not exists checkin_tags_tagged_idx on public.checkin_tags (tagged_user_id, created_at desc);
create index if not exists checkin_tags_checkin_idx on public.checkin_tags (checkin_id);
alter table public.checkin_tags enable row level security;

-- Lezen: wie de check-in zelf mag zien (RLS van checkins geldt ook in deze
-- subquery), en altijd de getagde zelf.
drop policy if exists "checkin_tags_select" on public.checkin_tags;
create policy "checkin_tags_select" on public.checkin_tags
  for select to authenticated using (
    tagged_user_id = auth.uid()
    or tagger_id = auth.uid()
    or exists (select 1 from public.checkins c where c.id = checkin_tags.checkin_id)
  );

-- Taggen: alleen op je eigen check-in, en alleen geaccepteerde vrienden.
drop policy if exists "checkin_tags_insert" on public.checkin_tags;
create policy "checkin_tags_insert" on public.checkin_tags
  for insert to authenticated with check (
    tagger_id = auth.uid()
    and exists (select 1 from public.checkins c where c.id = checkin_id and c.user_id = auth.uid())
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = tagged_user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = tagged_user_id))
    )
  );

-- De getagde mag overnemen (adopted_checkin_id) of negeren (dismissed).
drop policy if exists "checkin_tags_update_tagged" on public.checkin_tags;
create policy "checkin_tags_update_tagged" on public.checkin_tags
  for update to authenticated using (tagged_user_id = auth.uid()) with check (tagged_user_id = auth.uid());

-- Weghalen: de tagger, of de getagde die er niet bij wil staan.
drop policy if exists "checkin_tags_delete" on public.checkin_tags;
create policy "checkin_tags_delete" on public.checkin_tags
  for delete to authenticated using (tagger_id = auth.uid() or tagged_user_id = auth.uid());
