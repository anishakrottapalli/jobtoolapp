-- Keep a copy of the job description, since postings disappear.
alter table public.applications add column if not exists job_description text;
