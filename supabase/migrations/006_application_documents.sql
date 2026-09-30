-- The text submitted with each application: resume, cover letter, answers to application questions.
alter table public.applications add column if not exists resume_text text;
alter table public.applications add column if not exists cover_letter text;
alter table public.applications add column if not exists application_answers text;
