-- Phase 2: Application Tracker. Mirrors the Notion "Application Tracker":
-- status is To Start / Completed; the app derives Applied / Interviewing / Ghosted / Rejected
-- from the dates.

create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position_title   text not null,
  company          text,
  location         text,
  job_url          text,
  status           text not null default 'to_start' check (status in ('to_start', 'completed')),
  date_applied     date,
  rejection_date   date,
  interview_dates  date[] not null default '{}',
  resume_track     text check (resume_track in ('product', 'ea_creative_ops', 'content_media_ops')),
  notes            text,
  notion_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists applications_user_idx on public.applications (user_id);

create or replace trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

alter table public.applications enable row level security;

create policy "own applications" on public.applications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
