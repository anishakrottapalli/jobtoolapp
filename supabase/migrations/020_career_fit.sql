-- A place on each application to paste a career fit analysis.
alter table public.applications add column if not exists career_fit text;
