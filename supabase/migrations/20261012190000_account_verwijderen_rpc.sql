-- Account verwijderen via de database zelf (Instellingen → Account
-- verwijderen). Verwijdert ALLEEN de gegevens van wie het aanroept
-- (auth.uid()), nooit die van iemand anders. Tabellen die (nog) niet
-- bestaan worden overgeslagen. Veilig om deze migratie vaker te draaien:
-- er wordt alleen een functie aangemaakt, er gaat niets weg tot een
-- gebruiker zelf op "Account verwijderen" tikt.
--
-- Bestanden in de opslag (check-in-foto's, menukaarten) haalt de app
-- vooraf zelf weg; Supabase verwijdert geen account dat nog bestanden bezit.

create or replace function public.verwijder_mijn_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'niet ingelogd';
  end if;

  if to_regclass('public.push_subscriptions') is not null then execute 'delete from public.push_subscriptions where user_id = $1' using v_uid; end if;
  if to_regclass('public.push_tokens') is not null then execute 'delete from public.push_tokens where user_id = $1' using v_uid; end if;
  if to_regclass('public.push_voorkeuren') is not null then execute 'delete from public.push_voorkeuren where user_id = $1' using v_uid; end if;
  if to_regclass('public.push_log') is not null then execute 'delete from public.push_log where ontvanger = $1' using v_uid; end if;

  -- Reacties, proosts en tags van anderen op mijn check-ins, en die van mij.
  if to_regclass('public.checkin_reactions') is not null then
    execute 'delete from public.checkin_reactions where user_id = $1 or checkin_id in (select id from public.checkins where user_id = $1)' using v_uid;
  end if;
  if to_regclass('public.checkin_comments') is not null then
    execute 'delete from public.checkin_comments where user_id = $1 or checkin_id in (select id from public.checkins where user_id = $1)' using v_uid;
  end if;
  if to_regclass('public.checkin_tags') is not null then
    execute 'delete from public.checkin_tags where tagger_id = $1 or tagged_user_id = $1 or checkin_id in (select id from public.checkins where user_id = $1)' using v_uid;
  end if;

  if to_regclass('public.course_milestone_comments') is not null then
    execute 'delete from public.course_milestone_comments where user_id = $1' using v_uid;
    if to_regclass('public.course_milestones') is not null then
      execute 'delete from public.course_milestone_comments where milestone_id in (select id from public.course_milestones where user_id = $1)' using v_uid;
    end if;
  end if;
  if to_regclass('public.course_milestone_reactions') is not null then
    execute 'delete from public.course_milestone_reactions where user_id = $1' using v_uid;
    if to_regclass('public.course_milestones') is not null then
      execute 'delete from public.course_milestone_reactions where milestone_id in (select id from public.course_milestones where user_id = $1)' using v_uid;
    end if;
  end if;
  if to_regclass('public.course_milestones') is not null then execute 'delete from public.course_milestones where user_id = $1' using v_uid; end if;

  if to_regclass('public.checkins') is not null then execute 'delete from public.checkins where user_id = $1' using v_uid; end if;
  if to_regclass('public.friendships') is not null then execute 'delete from public.friendships where requester_id = $1 or addressee_id = $1' using v_uid; end if;
  if to_regclass('public.blocked_users') is not null then execute 'delete from public.blocked_users where blocker_id = $1 or blocked_id = $1' using v_uid; end if;

  if to_regclass('public.party_surveys') is not null then
    if to_regclass('public.party_survey_responses') is not null then
      execute 'delete from public.party_survey_responses where survey_id in (select id from public.party_surveys where host_user_id = $1)' using v_uid;
    end if;
    execute 'delete from public.party_surveys where host_user_id = $1' using v_uid;
  end if;
  if to_regclass('public.parties') is not null then execute 'delete from public.parties where user_id = $1' using v_uid; end if;

  -- Meldingen die ik deed blijven bewaard voor de beheerder, maar zonder mijn naam.
  if to_regclass('public.content_reports') is not null then
    begin
      execute 'update public.content_reports set reporter_id = null where reporter_id = $1' using v_uid;
    exception when not_null_violation then
      execute 'delete from public.content_reports where reporter_id = $1' using v_uid;
    end;
  end if;
  if to_regclass('public.app_beheerders') is not null then execute 'delete from public.app_beheerders where user_id = $1' using v_uid; end if;
  if to_regclass('public.profiles') is not null then execute 'delete from public.profiles where id = $1' using v_uid; end if;

  delete from auth.users where id = v_uid;
end $$;

revoke all on function public.verwijder_mijn_account() from public;
grant execute on function public.verwijder_mijn_account() to authenticated;
