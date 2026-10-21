-- AI-bartender en flessen scannen: daglimiet per gebruiker, zodat de kosten
-- van de Claude API nooit uit de hand lopen. Alleen tellingen per dag; de
-- vragen en foto's zelf worden NIET bewaard.
-- Veilig en herhaalbaar: maakt alleen een tabel en functies aan, verwijdert
-- of wijzigt geen bestaande gegevens.

create table if not exists public.ai_gebruik (
  user_id uuid not null references auth.users(id) on delete cascade,
  dag date not null default current_date,
  soort text not null,
  aantal int not null default 0,
  primary key (user_id, dag, soort)
);
alter table public.ai_gebruik enable row level security;
drop policy if exists "ai_gebruik_lezen_eigen" on public.ai_gebruik;
create policy "ai_gebruik_lezen_eigen" on public.ai_gebruik
  for select to authenticated using (user_id = auth.uid());

-- Limieten per dag. Aanpassen = deze functie opnieuw draaien met andere getallen.
create or replace function public.ai_daglimiet(p_soort text)
returns int
language sql
immutable
as $$
  select case p_soort when 'chat' then 20 when 'scan' then 5 else 0 end;
$$;

-- Eén vraag of scan "gebruiken". Geeft terug of het mag en hoeveel er over is.
create or replace function public.ai_tegoed_gebruiken(p_soort text)
returns table (toegestaan boolean, over int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limiet int := public.ai_daglimiet(p_soort);
  v_aantal int;
begin
  if v_uid is null then
    raise exception 'niet ingelogd';
  end if;
  if v_limiet <= 0 then
    raise exception 'onbekende soort';
  end if;
  insert into public.ai_gebruik (user_id, dag, soort, aantal)
  values (v_uid, current_date, p_soort, 1)
  on conflict (user_id, dag, soort) do update
    set aantal = public.ai_gebruik.aantal + 1
    where public.ai_gebruik.aantal < v_limiet
  returning aantal into v_aantal;
  if v_aantal is null then
    return query select false, 0;
  else
    return query select true, v_limiet - v_aantal;
  end if;
end $$;
revoke all on function public.ai_tegoed_gebruiken(text) from public;
grant execute on function public.ai_tegoed_gebruiken(text) to authenticated;

-- Tegoed teruggeven als de AI-dienst een fout gaf (niet de schuld van de
-- gebruiker). Alleen de server (Edge Function met service role) mag dit,
-- anders zou iemand zijn eigen limiet steeds kunnen terugzetten.
create or replace function public.ai_tegoed_terug(p_user uuid, p_soort text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_gebruik set aantal = greatest(0, aantal - 1)
   where user_id = p_user and dag = current_date and soort = p_soort;
$$;
revoke all on function public.ai_tegoed_terug(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_tegoed_terug(uuid, text) to service_role;

-- Hoeveel er vandaag nog over is (voor de teller in de app).
create or replace function public.ai_tegoed_over()
returns table (chat int, scan int)
language sql
security definer
set search_path = public
stable
as $$
  select
    public.ai_daglimiet('chat') - coalesce((select aantal from public.ai_gebruik where user_id = auth.uid() and dag = current_date and soort = 'chat'), 0),
    public.ai_daglimiet('scan') - coalesce((select aantal from public.ai_gebruik where user_id = auth.uid() and dag = current_date and soort = 'scan'), 0);
$$;
revoke all on function public.ai_tegoed_over() from public;
grant execute on function public.ai_tegoed_over() to authenticated;
