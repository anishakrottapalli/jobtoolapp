-- Gmail sync: match emails to applications by the sender's / recipient's email address.
-- A contact belongs to an application when they are linked in that application's outreach log
-- or named (and linked) as someone you interviewed with. Returns one row per email address and application.

create or replace function public.gmail_sync_contact_applications(p_token text) returns table (email text, application_id uuid)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.sync_token_user(p_token);
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  return query
    with links as (
      select o.contact_id as cid, o.application_id as aid
        from public.application_outreach o
        where o.user_id = uid and o.contact_id is not null
      union
      select (iv->>'contact_id')::uuid, a.id
        from public.applications a, jsonb_array_elements(a.interviews) iv
        where a.user_id = uid and coalesce(iv->>'contact_id', '') <> ''
    )
    select distinct lower(e), l.aid
      from links l
      join public.contacts c on c.id = l.cid and c.user_id = uid
      cross join lateral unnest(array[c.personal_email, c.work_email]) as e
      where coalesce(e, '') <> '';
end $$;

grant execute on function public.gmail_sync_contact_applications(text) to anon, authenticated;
