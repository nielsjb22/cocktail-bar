-- 1) Gemelde content kunnen afhandelen (Apple verwacht reactie binnen 24 uur)
-- 2) Opslag voor check-in-foto's in goede kwaliteit
--
-- Veilig en herhaalbaar: bestaande tabellen en gegevens blijven staan. Er
-- wordt alleen iets verwijderd als een beheerder in de app zelf op
-- "Check-in verwijderen" tikt bij een melding.

-- ---------- Meldingen ----------
create table if not exists public.content_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null default 'checkin',
  target_id text not null,
  created_at timestamptz not null default now()
);
alter table public.content_reports add column if not exists status text not null default 'open';
alter table public.content_reports add column if not exists uitkomst text;
alter table public.content_reports add column if not exists afgehandeld_at timestamptz;
alter table public.content_reports add column if not exists afgehandeld_door uuid;
alter table public.content_reports enable row level security;

drop policy if exists "content_reports_insert_own" on public.content_reports;
create policy "content_reports_insert_own" on public.content_reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- Wie meldingen mag afhandelen. Geen policies: niet leesbaar vanuit de app,
-- alleen via de functies hieronder. Jezelf toevoegen: zie
-- supabase/seed/beheerder_toevoegen.sql.
create table if not exists public.app_beheerders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_beheerders enable row level security;

create or replace function public.ben_ik_beheerder()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.app_beheerders where user_id = auth.uid());
$$;
revoke all on function public.ben_ik_beheerder() from public;
grant execute on function public.ben_ik_beheerder() to authenticated;

-- Open meldingen, één regel per gemelde check-in, met wat er gemeld is.
create or replace function public.beheer_meldingen()
returns table (
  melding_id text,
  target_type text,
  target_id text,
  gemeld_op timestamptz,
  aantal bigint,
  melders text,
  checkin_naam text,
  checkin_notitie text,
  checkin_foto text,
  checkin_eigenaar uuid,
  eigenaar_naam text,
  bestaat_nog boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_beheerders where user_id = auth.uid()) then
    raise exception 'geen beheerder';
  end if;
  return query
    with open_m as (
      select r.target_type, r.target_id::text as target_id, min(r.id::text) as eerste_id, min(r.created_at) as eerste, count(*) as n,
             string_agg(distinct coalesce(p.name, 'Onbekend'), ', ') as namen
      from public.content_reports r
      left join public.profiles p on p.id = r.reporter_id
      where r.status = 'open'
      group by r.target_type, r.target_id::text
    )
    select o.eerste_id, o.target_type, o.target_id, o.eerste, o.n, o.namen,
           c.name, c.notes, c.photo, c.user_id, ep.name, (c.id is not null)
    from open_m o
    left join public.checkins c on o.target_type = 'checkin' and c.id::text = o.target_id
    left join public.profiles ep on ep.id = c.user_id
    order by o.eerste;
end $$;
revoke all on function public.beheer_meldingen() from public;
grant execute on function public.beheer_meldingen() to authenticated;

-- Afhandelen: 'ok' (niets aan de hand) of 'verwijderd' (check-in weghalen).
-- Alle open meldingen over dezelfde check-in worden samen afgehandeld.
create or replace function public.beheer_melding_afhandelen(p_melding_id text, p_uitkomst text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_target text;
begin
  if not exists (select 1 from public.app_beheerders where user_id = auth.uid()) then
    raise exception 'geen beheerder';
  end if;
  if p_uitkomst not in ('ok', 'verwijderd') then
    raise exception 'onbekende uitkomst';
  end if;
  select target_type, target_id::text into v_type, v_target from public.content_reports where id::text = p_melding_id;
  if v_target is null then
    raise exception 'melding niet gevonden';
  end if;
  if p_uitkomst = 'verwijderd' and v_type = 'checkin' then
    delete from public.checkin_reactions where checkin_id::text = v_target;
    delete from public.checkin_comments where checkin_id::text = v_target;
    delete from public.checkin_tags where checkin_id::text = v_target;
    delete from public.checkins where id::text = v_target;
  end if;
  update public.content_reports
     set status = 'afgehandeld', uitkomst = p_uitkomst, afgehandeld_at = now(), afgehandeld_door = auth.uid()
   where target_type = v_type and target_id::text = v_target and status = 'open';
end $$;
revoke all on function public.beheer_melding_afhandelen(text, text) from public;
grant execute on function public.beheer_melding_afhandelen(text, text) to authenticated;

-- Pushmelding naar de beheerder(s) bij een nieuwe melding (via de functie
-- Push, net als de andere meldingen).
drop trigger if exists push_content_reports on public.content_reports;
create trigger push_content_reports after insert on public.content_reports
  for each row execute function public.push_doorsturen();

-- ---------- Check-in-foto's ----------
-- Openbare bucket met willekeurige bestandsnamen; schrijven alleen in je
-- eigen map <user-id>/.
insert into storage.buckets (id, name, public)
values ('checkin-fotos', 'checkin-fotos', true)
on conflict (id) do nothing;

drop policy if exists "checkin_fotos_insert_own" on storage.objects;
create policy "checkin_fotos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'checkin-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "checkin_fotos_delete_own" on storage.objects;
create policy "checkin_fotos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'checkin-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
