-- Adds LinkedIn connection status to contacts, and LinkedIn events to the history log.
alter table public.contacts add column if not exists linkedin_status text not null default 'none'
  check (linkedin_status in ('none', 'following', 'requested', 'connected'));

alter table public.interactions drop constraint if exists interactions_kind_check;
alter table public.interactions add constraint interactions_kind_check
  check (kind in ('outreach', 'reply', 'linkedin'));
