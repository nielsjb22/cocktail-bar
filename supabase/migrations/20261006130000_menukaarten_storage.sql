-- Openbare opslag voor de linkvoorbeeld-afbeelding van een gedeeld feestmenu
-- (og:image in WhatsApp/iMessage). Iedereen mag lezen (de link is openbaar),
-- alleen de ingelogde host mag schrijven, en alleen in de eigen map <user-id>/.
insert into storage.buckets (id, name, public)
values ('menukaarten', 'menukaarten', true)
on conflict (id) do nothing;

create policy "menukaarten_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menukaarten' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "menukaarten_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'menukaarten' and (storage.foldername(name))[1] = auth.uid()::text);
