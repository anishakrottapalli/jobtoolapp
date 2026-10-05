-- Gmail sync: record "last synced" when a run finishes, not when it starts, so a run that
-- fails partway doesn't look successful. The Apps Script calls gmail_sync_finish at the end.

create or replace function public.gmail_sync_finish(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.sync_token_user(p_token);
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  update public.sync_tokens set last_sync_at = now() where user_id = uid;
end $$;

grant execute on function public.gmail_sync_finish(text) to anon, authenticated;

-- No longer stamps the sync time at the start of a run.
create or replace function public.gmail_sync_contacts(p_token text) returns setof text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.sync_token_user(p_token);
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  return query
    select distinct lower(e) from public.contacts c, unnest(array[c.personal_email, c.work_email]) as e
    where c.user_id = uid and coalesce(e, '') <> '';
end $$;
