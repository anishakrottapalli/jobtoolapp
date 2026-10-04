-- Gmail sync for the Jobs folder: emails in it are matched to applications (by company) and
-- listed on each application. Only who/when is stored, never subjects or bodies.

create table if not exists public.application_emails (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  direction      text not null check (direction in ('out', 'in')),
  counterpart    text,
  happened_on    date not null,
  external_id    text not null,
  created_at     timestamptz not null default now()
);

create unique index if not exists application_emails_external_uidx on public.application_emails (user_id, external_id);
create index if not exists application_emails_app_idx on public.application_emails (application_id);

alter table public.application_emails enable row level security;

create policy "own application emails" on public.application_emails
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Called by the Apps Script: the applications to match Jobs emails against.
create or replace function public.gmail_sync_applications(p_token text) returns table (id uuid, company text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.sync_token_user(p_token);
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  return query select a.id, a.company from public.applications a
    where a.user_id = uid and coalesce(a.company, '') <> '';
end $$;

-- Called by the Apps Script: [{id, application_id, email, dir: 'out'|'in', date: 'YYYY-MM-DD'}]. Returns rows added.
create or replace function public.gmail_sync_log_application_emails(p_token text, p_events jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.sync_token_user(p_token); n integer;
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  insert into public.application_emails (user_id, application_id, direction, counterpart, happened_on, external_id)
  select uid, a.id, case when ev->>'dir' = 'out' then 'out' else 'in' end, lower(ev->>'email'),
         (ev->>'date')::date, (ev->>'id') || ':' || a.id
  from jsonb_array_elements(p_events) as ev
  join public.applications a on a.user_id = uid and a.id = (ev->>'application_id')::uuid
  on conflict (user_id, external_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.gmail_sync_applications(text) to anon, authenticated;
grant execute on function public.gmail_sync_log_application_emails(text, jsonb) to anon, authenticated;
