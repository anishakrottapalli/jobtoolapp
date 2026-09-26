-- Gmail sync: people on emails the user labels "Networking" in Gmail become contacts.
-- p_people: [{email, name}]. Skips anyone already saved (by email). Returns contacts added.

create or replace function public.gmail_sync_add_contacts(p_token text, p_people jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.sync_token_user(p_token);
  n integer := 0;
  p jsonb;
  em text;
  nm text;
  first_part text;
  is_personal boolean;
begin
  if uid is null then raise exception 'invalid sync token'; end if;
  for p in select * from jsonb_array_elements(p_people) loop
    em := lower(trim(coalesce(p->>'email', '')));
    continue when em = '' or exists (
      select 1 from public.contacts c
      where c.user_id = uid and em in (lower(c.personal_email), lower(c.work_email)));
    nm := trim(regexp_replace(coalesce(p->>'name', ''), '\s+', ' ', 'g'));
    if nm = '' or nm like '%@%' then nm := split_part(em, '@', 1); end if;
    first_part := split_part(nm, ' ', 1);
    is_personal := em ~ '@(gmail|yahoo|hotmail|outlook|icloud|aol|me|live|msn|protonmail)\.';
    insert into public.contacts (user_id, first_name, last_name, personal_email, work_email, tags)
    values (uid, first_part, trim(substr(nm, length(first_part) + 1)),
            case when is_personal then em else '' end,
            case when is_personal then '' else em end,
            array['Added from Gmail']);
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function public.gmail_sync_add_contacts(text, jsonb) to anon, authenticated;
