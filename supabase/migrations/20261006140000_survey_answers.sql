-- Smaaktest, nieuwe opzet: alle antwoorden van een gast (sterke drank,
-- likeuren, mixers en smaken met lekker/liever niet, eigen invoer, soort
-- drankje, sterkte, allergieën, favorieten en een opmerking voor de host)
-- in één jsonb-kolom. De bestaande kolommen blijven gevuld voor de
-- menusuggesties.
alter table public.party_survey_responses add column if not exists answers jsonb;
