-- Cursus "Van Basis tot Pro" uitgespeeld (alle lessen + eindtoets gehaald):
-- zichtbaar op je eigen profiel én voor vrienden. De cursusvoortgang zelf
-- blijft lokaal op het toestel; alleen dit mijlpaalmoment gaat naar Supabase.
-- Bestaande RLS op profiles (eigen rij bijwerken, profielen van anderen
-- lezen) dekt deze kolommen automatisch.
alter table public.profiles add column if not exists course_completed_at timestamptz;
alter table public.profiles add column if not exists course_exam_score integer; -- percentage 0-100
