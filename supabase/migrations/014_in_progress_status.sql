-- Applications get a third saved status: 'in_progress' (started, not submitted yet).
-- 'completed' keeps meaning "applied", so existing rows are unchanged.
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check check (status in ('to_start', 'in_progress', 'completed'));
