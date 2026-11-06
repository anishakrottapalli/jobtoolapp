-- One record for "I emailed / they replied / we spoke": a contact-history entry that can optionally be
-- about a job. Entries with an application_id also show in that application's Correspondence.
alter table public.interactions
  add column if not exists application_id uuid references public.applications (id) on delete set null;
create index if not exists interactions_application_idx on public.interactions (application_id);

-- A new kind of entry for interviews ("meeting"), written from the Interviews box on an application.
alter table public.interactions drop constraint if exists interactions_kind_check;
alter table public.interactions
  add constraint interactions_kind_check check (kind in ('outreach', 'reply', 'linkedin', 'meeting'));

-- Gmail sync: events may say which application an email is about, and an email you already logged by hand
-- (same contact, day, direction, Email) isn't added a second time.
create or replace function public.gmail_sync_log(p_token text, p_events jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.sync_token_user(p_token); n integer;
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  insert into public.interactions (user_id, contact_id, kind, method, happened_on, note, external_id, application_id)
  select uid, c.id, x.k, 'Email', x.d, 'Logged from Gmail', (ev->>'id') || ':' || c.id, a.id
  from jsonb_array_elements(p_events) as ev
  join public.contacts c on c.user_id = uid
   and lower(ev->>'email') in (lower(c.personal_email), lower(c.work_email))
  cross join lateral (select case when ev->>'dir' = 'out' then 'outreach' else 'reply' end as k,
                             (ev->>'date')::date as d,
                             nullif(ev->>'application_id', '')::uuid as aid) x
  left join public.applications a on a.id = x.aid and a.user_id = uid
  where not exists (
    select 1 from public.interactions i
    where i.user_id = uid and i.contact_id = c.id and i.happened_on = x.d and i.kind = x.k
      and i.method = 'Email' and i.external_id is null)
  on conflict (user_id, external_id) do update set application_id = excluded.application_id
    where public.interactions.application_id is null and excluded.application_id is not null;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.gmail_sync_log(text, jsonb) to anon, authenticated;
