-- Maak een account beheerder, zodat het in de app gemelde check-ins ziet
-- (Instellingen → Gemelde check-ins) en een pushmelding krijgt bij een
-- nieuwe melding. Vervang het e-mailadres door het adres waarmee je in de
-- app inlogt. Veilig om vaker te draaien.
insert into public.app_beheerders (user_id)
select id from auth.users where email = 'JOUW-INLOG-EMAIL@voorbeeld.nl'
on conflict (user_id) do nothing;

-- Controle: moet één rij met jouw e-mailadres tonen.
select u.email from public.app_beheerders b join auth.users u on u.id = b.user_id;
