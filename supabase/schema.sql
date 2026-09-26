-- Job Networking App: database schema.
-- Run once in the Supabase SQL editor on a fresh project.

create table if not exists public.contacts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  first_name            text not null,
  middle_name           text,
  last_name             text,
  job_title             text,
  company               text,
  location              text,
  linkedin_url          text,
  linkedin_status       text not null default 'none'
                        check (linkedin_status in ('none', 'following', 'requested', 'connected')),
  personal_email        text,
  personal_email_status text not null default 'unchecked'
                        check (personal_email_status in ('unchecked', 'verified', 'bounced')),
  work_email            text,
  work_email_status     text not null default 'unchecked'
                        check (work_email_status in ('unchecked', 'verified', 'bounced')),
  preferred_email       text check (preferred_email in ('personal', 'work')),
  phone                 text,
  referred_by           text,
  event_met_at          text,
  notes                 text,
  tags                  text[] not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Every outreach you make and every reply you get, one row each.
create table if not exists public.interactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  kind        text not null check (kind in ('outreach', 'reply', 'linkedin')),
  method      text not null,
  happened_on date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists contacts_user_idx on public.contacts (user_id);
create index if not exists interactions_contact_idx on public.interactions (contact_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- Row level security: each signed-in user sees and edits only their own rows.
alter table public.contacts enable row level security;
alter table public.interactions enable row level security;

create policy "own contacts" on public.contacts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own interactions" on public.interactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
  );
