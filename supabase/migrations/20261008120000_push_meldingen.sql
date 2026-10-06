-- Native pushmeldingen (iOS via APNs) voor de sociale momenten in de app:
-- getagd worden, proost en reacties op je check-in of rang, vriendschaps-
-- verzoeken, rangen van vrienden en (optioneel) check-ins van vrienden.
--
-- Werking: een trigger op elke tabel stuurt de nieuwe rij via pg_net naar de
-- Edge Function `push`. Die bepaalt wie de melding krijgt, kijkt naar
-- voorkeuren en blokkades, en verstuurt naar Apple. De trigger faalt nooit
-- hard: lukt het versturen niet, dan gaat de check-in/reactie gewoon door.
--
-- De url en het geheim van de functie staan in Supabase Vault (zie
-- supabase/seed/push_setup.sql), niet in deze code.

create extension if not exists pg_net;

-- Apparaten. Eén rij per token; een token hoort altijd bij precies één
-- gebruiker (wie het laatst op dit toestel inlogde).
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  omgeving text check (omgeving in ('production', 'sandbox')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own" on public.push_tokens
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own" on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- Registreren gaat via deze functie: als een ander account eerder op dit
-- toestel was ingelogd, neemt de huidige gebruiker het token over (dat kan
-- RLS zelf niet, want de oude rij is van iemand anders).
create or replace function public.registreer_push_token(p_token text, p_platform text default 'ios')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'ios'), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        omgeving = case when push_tokens.user_id = excluded.user_id then push_tokens.omgeving else null end,
        updated_at = now();
end $$;
revoke all on function public.registreer_push_token(text, text) from public;
grant execute on function public.registreer_push_token(text, text) to authenticated;

-- Welke meldingen je wilt. Geen rij = de standaardwaarden hieronder.
create table if not exists public.push_voorkeuren (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tags boolean not null default true,
  reacties boolean not null default true,
  vriendschap boolean not null default true,
  rangen boolean not null default true,
  checkins boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.push_voorkeuren enable row level security;

drop policy if exists "push_voorkeuren_own" on public.push_voorkeuren;
create policy "push_voorkeuren_own" on public.push_voorkeuren
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Logboek van verstuurde meldingen, alleen voor de functie zelf (geen
-- policies = niet leesbaar vanuit de app). Voorkomt dubbele meldingen als
-- iemand proost, weghaalt en opnieuw proost.
create table if not exists public.push_log (
  id bigint generated always as identity primary key,
  ontvanger uuid not null references auth.users(id) on delete cascade,
  soort text not null,
  sleutel text not null,
  verstuurd smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists push_log_sleutel_idx on public.push_log (sleutel, created_at desc);
alter table public.push_log enable row level security;

-- Triggerfunctie: stuurt de rij door naar de Edge Function.
create or replace function public.push_doorsturen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_geheim text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into v_geheim from vault.decrypted_secrets where name = 'push_geheim';
  if v_url is null or v_geheim is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_geheim),
    body := jsonb_build_object(
      'tabel', tg_table_name,
      'actie', tg_op,
      -- Foto's kunnen groot zijn en zijn voor een melding niet nodig.
      'rij', to_jsonb(new) - 'photo',
      'oud', case when tg_op = 'UPDATE' then to_jsonb(old) - 'photo' else null end
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists push_checkin_tags on public.checkin_tags;
create trigger push_checkin_tags after insert on public.checkin_tags
  for each row execute function public.push_doorsturen();

drop trigger if exists push_checkin_reactions on public.checkin_reactions;
create trigger push_checkin_reactions after insert on public.checkin_reactions
  for each row execute function public.push_doorsturen();

drop trigger if exists push_checkin_comments on public.checkin_comments;
create trigger push_checkin_comments after insert on public.checkin_comments
  for each row execute function public.push_doorsturen();

drop trigger if exists push_course_milestones on public.course_milestones;
create trigger push_course_milestones after insert on public.course_milestones
  for each row execute function public.push_doorsturen();

drop trigger if exists push_course_milestone_reactions on public.course_milestone_reactions;
create trigger push_course_milestone_reactions after insert on public.course_milestone_reactions
  for each row execute function public.push_doorsturen();

drop trigger if exists push_course_milestone_comments on public.course_milestone_comments;
create trigger push_course_milestone_comments after insert on public.course_milestone_comments
  for each row execute function public.push_doorsturen();

drop trigger if exists push_friendships on public.friendships;
create trigger push_friendships after insert or update of status on public.friendships
  for each row execute function public.push_doorsturen();

drop trigger if exists push_checkins on public.checkins;
create trigger push_checkins after insert on public.checkins
  for each row execute function public.push_doorsturen();
