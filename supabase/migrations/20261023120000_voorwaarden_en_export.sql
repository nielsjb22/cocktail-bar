-- Gebruiksvoorwaarden en "Download mijn gegevens".
-- Veilig en herhaalbaar: voegt alleen kolommen en leesrechten toe, verwijdert
-- of wijzigt geen bestaande gegevens.

-- 1. Akkoord met de gebruiksvoorwaarden: welke versie en wanneer. Bestaande
--    profielen krijgen null en zien bij de volgende start het akkoordscherm.
alter table public.profiles add column if not exists voorwaarden_versie text;
alter table public.profiles add column if not exists voorwaarden_akkoord_op timestamptz;

-- 2. Je eigen rijen mogen lezen, zodat ze in de export komen. Anderen zien
--    nog steeds niets (alleen tellingen via de bestaande functies).
drop policy if exists "zoek_signalen_select_own" on public.zoek_signalen;
create policy "zoek_signalen_select_own" on public.zoek_signalen
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "content_reports_select_own" on public.content_reports;
create policy "content_reports_select_own" on public.content_reports
  for select to authenticated using (reporter_id = auth.uid());
