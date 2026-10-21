-- De app leert van wat gebruikers samen doen. Alles hieronder werkt met
-- ANONIEME tellingen: niemand kan zien wie wat deed, en een uitkomst telt
-- pas mee als meerdere verschillende mensen hetzelfde deden.
-- Veilig en herhaalbaar: maakt alleen tabellen en functies aan, verwijdert
-- of wijzigt geen bestaande gegevens.

-- ---------- 1. Aanbevelingen ("mensen die X lekker vonden, vonden Y ook lekker") ----------
create or replace function public.aanbevelingen_voor_mij(p_limiet int default 12)
returns table (recipe_id text, score numeric, omdat text, mensen bigint)
language sql
security definer
set search_path = public
stable
as $$
  with mijn_top as (
    select recipe_id, max(rating) as cijfer
    from public.checkins
    where user_id = auth.uid() and recipe_id is not null and rating >= 4
    group by recipe_id
  ),
  geprobeerd as (
    select distinct recipe_id from public.checkins where user_id = auth.uid() and recipe_id is not null
  ),
  gelijkgestemd as (
    -- Andere mensen die minstens één van mijn favorieten ook hoog gaven.
    select c.user_id, c.recipe_id as gedeeld
    from public.checkins c
    join mijn_top m on m.recipe_id = c.recipe_id
    where c.user_id <> auth.uid() and c.rating >= 4
    group by c.user_id, c.recipe_id
  ),
  kandidaten as (
    select c.recipe_id, g.gedeeld, c.user_id
    from public.checkins c
    join gelijkgestemd g on g.user_id = c.user_id
    where c.rating >= 4 and c.recipe_id is not null
      and c.recipe_id not in (select recipe_id from geprobeerd)
    group by c.recipe_id, g.gedeeld, c.user_id
  ),
  per_recept as (
    select recipe_id, count(distinct user_id) as mensen,
           (array_agg(gedeeld order by gedeeld))[1] as omdat
    from kandidaten
    group by recipe_id
  )
  select recipe_id, mensen::numeric as score, omdat, mensen
  from per_recept
  where mensen >= 2
  order by mensen desc, recipe_id
  limit greatest(1, least(coalesce(p_limiet, 12), 30));
$$;
revoke all on function public.aanbevelingen_voor_mij(int) from public;
grant execute on function public.aanbevelingen_voor_mij(int) to authenticated;

-- Populair bij iedereen (voor wie nog weinig heeft ingecheckt).
create or replace function public.populaire_recepten(p_limiet int default 12)
returns table (recipe_id text, mensen bigint, gemiddeld numeric)
language sql
security definer
set search_path = public
stable
as $$
  select recipe_id, count(distinct user_id) as mensen, round(avg(rating)::numeric, 1) as gemiddeld
  from public.checkins
  where recipe_id is not null and created_at > now() - interval '90 days'
  group by recipe_id
  having count(distinct user_id) >= 3
  order by count(distinct user_id) desc, avg(rating) desc
  limit greatest(1, least(coalesce(p_limiet, 12), 30));
$$;
revoke all on function public.populaire_recepten(int) from public;
grant execute on function public.populaire_recepten(int) to authenticated;

-- ---------- 2. Merken die gebruikers zelf koppelen ----------
create table if not exists public.merk_koppelingen (
  user_id uuid not null references auth.users(id) on delete cascade,
  term_norm text not null,
  term text not null,
  ingredient_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, term_norm)
);
alter table public.merk_koppelingen enable row level security;
drop policy if exists "merk_koppelingen_own" on public.merk_koppelingen;
create policy "merk_koppelingen_own" on public.merk_koppelingen
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Koppelingen die minstens 3 verschillende mensen hetzelfde maakten.
create or replace function public.geleerde_merken()
returns table (term text, ingredient_id text, mensen bigint)
language sql
security definer
set search_path = public
stable
as $$
  select (array_agg(term order by created_at))[1] as term, ingredient_id, count(*) as mensen
  from public.merk_koppelingen
  group by term_norm, ingredient_id
  having count(*) >= 3
  order by count(*) desc
  limit 500;
$$;
revoke all on function public.geleerde_merken() from public;
grant execute on function public.geleerde_merken() to anon, authenticated;

-- ---------- 3. Zoekopdrachten zonder resultaat ----------
create table if not exists public.zoek_signalen (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  soort text not null default 'recept',
  term_norm text not null,
  term text not null,
  created_at timestamptz not null default now()
);
create index if not exists zoek_signalen_term_idx on public.zoek_signalen (term_norm);
alter table public.zoek_signalen enable row level security;
drop policy if exists "zoek_signalen_insert_own" on public.zoek_signalen;
create policy "zoek_signalen_insert_own" on public.zoek_signalen
  for insert to authenticated with check (user_id = auth.uid());

create table if not exists public.beheer_genegeerd (
  soort text not null,
  sleutel text not null,
  created_at timestamptz not null default now(),
  primary key (soort, sleutel)
);
alter table public.beheer_genegeerd enable row level security;

-- Beheer: cocktails die mensen zoeken of inchecken maar die niet in de app staan.
create or replace function public.beheer_ontbrekende_recepten()
returns table (naam text, sleutel text, mensen bigint, ingecheckt bigint, gezocht bigint, laatst timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_beheerders where user_id = auth.uid()) then
    raise exception 'geen beheerder';
  end if;
  return query
    with alles as (
      select lower(trim(c.name)) as sleutel, trim(c.name) as naam, c.user_id, 'checkin' as bron, c.created_at
      from public.checkins c
      where c.recipe_id is null and length(trim(coalesce(c.name, ''))) >= 3
      union all
      select z.term_norm, z.term, z.user_id, 'zoek', z.created_at
      from public.zoek_signalen z
      where z.soort = 'recept'
    )
    select (array_agg(a.naam order by a.created_at desc))[1], a.sleutel,
           count(distinct a.user_id), count(*) filter (where a.bron = 'checkin'),
           count(*) filter (where a.bron = 'zoek'), max(a.created_at)
    from alles a
    where not exists (select 1 from public.beheer_genegeerd g where g.soort = 'recept' and g.sleutel = a.sleutel)
    group by a.sleutel
    having count(distinct a.user_id) >= 2
    order by count(distinct a.user_id) desc, max(a.created_at) desc
    limit 100;
end $$;
revoke all on function public.beheer_ontbrekende_recepten() from public;
grant execute on function public.beheer_ontbrekende_recepten() to authenticated;

create or replace function public.beheer_negeren(p_soort text, p_sleutel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_beheerders where user_id = auth.uid()) then
    raise exception 'geen beheerder';
  end if;
  insert into public.beheer_genegeerd (soort, sleutel) values (p_soort, p_sleutel)
  on conflict do nothing;
end $$;
revoke all on function public.beheer_negeren(text, text) from public;
grant execute on function public.beheer_negeren(text, text) to authenticated;

-- ---------- 4. Recepten die beter kunnen ----------
-- Per recept: hoe vaak gemaakt, gemiddeld cijfer, en hoe vaak woorden als
-- "zoet" of "zuur" in de notities staan. Alleen voor de beheerder.
create or replace function public.beheer_recept_signalen()
returns table (recipe_id text, checkins bigint, mensen bigint, gemiddeld numeric,
               te_zoet bigint, te_zuur bigint, te_sterk bigint, te_slap bigint, te_bitter bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_beheerders where user_id = auth.uid()) then
    raise exception 'geen beheerder';
  end if;
  return query
    select c.recipe_id, count(*), count(distinct c.user_id), round(avg(c.rating)::numeric, 1),
      count(*) filter (where c.notes ~* '(te|erg|veel|wat|beetje|nogal) (te )?zoet|zoetig'),
      count(*) filter (where c.notes ~* '(te|erg|veel|wat|beetje|nogal) (te )?zuur'),
      count(*) filter (where c.notes ~* '(te|erg|veel|wat|nogal) (te )?sterk|veel alcohol'),
      count(*) filter (where c.notes ~* 'waterig|slap|flauw|te weinig smaak'),
      count(*) filter (where c.notes ~* '(te|erg|veel|wat|nogal) (te )?bitter')
    from public.checkins c
    where c.recipe_id is not null
      and not exists (select 1 from public.beheer_genegeerd g where g.soort = 'receptsignaal' and g.sleutel = c.recipe_id)
    group by c.recipe_id
    having count(distinct c.user_id) >= 3;
end $$;
revoke all on function public.beheer_recept_signalen() from public;
grant execute on function public.beheer_recept_signalen() to authenticated;
