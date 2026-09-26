-- Gmail sync: a Google Apps Script in the user's own Google account checks Gmail hourly
-- and logs emails to/from known contacts. It authenticates with a random sync token whose
-- SHA-256 hash is stored here; the plain token only ever lives in the user's script.

alter table public.interactions add column if not exists external_id text;
create unique index if not exists interactions_external_uidx on public.interactions (user_id, external_id);

create table if not exists public.sync_tokens (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  token_hash   text not null,
  created_at   timestamptz not null default now(),
  last_sync_at timestamptz
);
alter table public.sync_tokens enable row level security;

create policy "own sync token read" on public.sync_tokens
  for select to authenticated using (user_id = auth.uid());
create policy "own sync token delete" on public.sync_tokens
  for delete to authenticated using (user_id = auth.uid());

-- Called by the signed-in app to create (or replace) the user's sync token.
create or replace function public.register_sync_token(p_token_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.sync_tokens (user_id, token_hash) values (auth.uid(), p_token_hash)
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_sync_at = null;
end $$;

create or replace function public.sync_token_user(p_token text) returns uuid
language sql security definer set search_path = '' stable as $$
  select user_id from public.sync_tokens
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- Called by the Apps Script: the contact email addresses to watch for.
create or replace function public.gmail_sync_contacts(p_token text) returns setof text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.sync_token_user(p_token);
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  update public.sync_tokens set last_sync_at = now() where user_id = uid;
  return query
    select distinct lower(e) from public.contacts c, unnest(array[c.personal_email, c.work_email]) as e
    where c.user_id = uid and coalesce(e, '') <> '';
end $$;

-- Called by the Apps Script: [{id, email, dir: 'out'|'in', date: 'YYYY-MM-DD'}]. Returns rows added.
create or replace function public.gmail_sync_log(p_token text, p_events jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.sync_token_user(p_token); n integer;
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  insert into public.interactions (user_id, contact_id, kind, method, happened_on, note, external_id)
  select uid, c.id, case when ev->>'dir' = 'out' then 'outreach' else 'reply' end, 'Email',
         (ev->>'date')::date, 'Logged from Gmail', (ev->>'id') || ':' || c.id
  from jsonb_array_elements(p_events) as ev
  join public.contacts c on c.user_id = uid
   and lower(ev->>'email') in (lower(c.personal_email), lower(c.work_email))
  on conflict (user_id, external_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.register_sync_token(text) from public, anon;
grant execute on function public.register_sync_token(text) to authenticated;
revoke execute on function public.sync_token_user(text) from public, anon, authenticated;
grant execute on function public.gmail_sync_contacts(text) to anon, authenticated;
grant execute on function public.gmail_sync_log(text, jsonb) to anon, authenticated;
