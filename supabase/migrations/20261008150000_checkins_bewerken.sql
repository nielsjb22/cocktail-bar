-- Check-ins bewerken: je mag alleen je eigen check-ins aanpassen.
-- Veilig om vaker te draaien.
drop policy if exists "Eigen check-ins bijwerken" on public.checkins;
create policy "Eigen check-ins bijwerken" on public.checkins
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
