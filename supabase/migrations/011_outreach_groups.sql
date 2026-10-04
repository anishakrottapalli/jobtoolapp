-- Outreach groups become customizable, per application (replaces the three fixed groups).
-- Existing entries are moved into groups named after the old ones.

create table if not exists public.application_outreach_groups (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  name           text not null,
  sort_order     integer not null default 0,
  legacy_key     text,
  created_at     timestamptz not null default now()
);

create index if not exists application_outreach_groups_app_idx on public.application_outreach_groups (application_id);

alter table public.application_outreach_groups enable row level security;

create policy "own outreach groups" on public.application_outreach_groups
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.application_outreach
  add column if not exists group_id uuid references public.application_outreach_groups (id) on delete cascade;

-- Turn each old fixed group that has entries into a real group.
insert into public.application_outreach_groups (user_id, application_id, name, sort_order, legacy_key)
select distinct o.user_id, o.application_id,
  case o.group_key
    when 'active' then 'Warm Outreach — Active Support'
    when 'no_response' then 'Warm Outreach — No Response Yet'
    else 'Direct Outreach to ' || coalesce(nullif(a.company, ''), 'Company') || ' Team'
  end,
  case o.group_key when 'active' then 0 when 'no_response' then 1 else 2 end,
  o.group_key
from public.application_outreach o
join public.applications a on a.id = o.application_id
where o.group_id is null and o.group_key is not null;

update public.application_outreach o set group_id = g.id
from public.application_outreach_groups g
where o.group_id is null and g.application_id = o.application_id and g.legacy_key = o.group_key;

-- The "last updated" trigger now watches the group instead of the old key.
create or replace function public.touch_outreach_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.group_id, new.name, new.title_company, new.update_text)
     is distinct from (old.group_id, old.name, old.title_company, old.update_text) then
    new.updated_at = now();
  end if;
  return new;
end $$;

alter table public.application_outreach drop column if exists group_key;
alter table public.application_outreach_groups drop column if exists legacy_key;
alter table public.application_outreach alter column group_id set not null;
