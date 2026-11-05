-- Correspondence you add by hand on an application: LinkedIn messages, calls, emails from people at
-- other companies, anything the Gmail sync can't see. (Synced emails stay in application_emails.)

create table if not exists public.application_correspondence (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  direction      text not null check (direction in ('out', 'in')),
  method         text not null default 'Email',
  counterpart    text,
  contact_id     uuid references public.contacts (id) on delete set null,
  happened_on    date not null,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists application_correspondence_app_idx on public.application_correspondence (application_id);

alter table public.application_correspondence enable row level security;

create policy "own application correspondence" on public.application_correspondence
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
