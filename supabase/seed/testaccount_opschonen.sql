-- Haalt ALLEEN bij het review-testaccount de overgenomen voorraad,
-- favorieten, cursus, boodschappenlijst enz. weg (tabel user_state).
-- Check-ins, vrienden en alle andere accounts blijven onaangeroerd.
-- Vervang het e-mailadres als je testaccount een ander adres heeft.
delete from public.user_state
where user_id = (select id from auth.users where email = 'review@mijnthuisbar.nl');

-- Controle: moet 0 tonen.
select count(*) from public.user_state
where user_id = (select id from auth.users where email = 'review@mijnthuisbar.nl');
