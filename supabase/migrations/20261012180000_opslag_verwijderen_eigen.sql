-- Je eigen menukaart-afbeeldingen mogen weg (nodig bij account verwijderen:
-- Supabase verwijdert geen account dat nog bestanden in de opslag bezit).
-- Veilig en herhaalbaar; raakt geen bestaande gegevens.
drop policy if exists "menukaarten_delete_own" on storage.objects;
create policy "menukaarten_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menukaarten' and (storage.foldername(name))[1] = auth.uid()::text);
