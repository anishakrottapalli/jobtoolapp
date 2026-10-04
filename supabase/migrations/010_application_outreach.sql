-- Outreach log on each application: who you've reached out to for that job, in three groups.
-- Plain text only; not linked to the Contacts table.

create table if not exists public.application_outreach (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  group_key      text not null check (group_key in ('active', 'no_response', 'direct')),
  name           text not null,
  title_company  text,
  update_text    text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists application_outreach_app_idx on public.application_outreach (application_id);

-- "Last updated" only moves when the entry's text or group changes, not when it is just reordered.
create or replace function public.touch_outreach_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.group_key, new.name, new.title_company, new.update_text)
     is distinct from (old.group_key, old.name, old.title_company, old.update_text) then
    new.updated_at = now();
  end if;
  return new;
end $$;

create or replace trigger application_outreach_touch before update on public.application_outreach
  for each row execute function public.touch_outreach_updated_at();

alter table public.application_outreach enable row level security;

create policy "own application outreach" on public.application_outreach
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Starting entries for the Paramount+ "Associate Product Manager, Content Discovery" application.
-- Skipped if that application isn't found or already has outreach entries.
insert into public.application_outreach (user_id, application_id, group_key, name, title_company, update_text, sort_order)
select a.user_id, a.id, v.group_key, v.name, v.title_company, v.update_text, v.sort_order
from (
  select id, user_id from public.applications
  where company ilike '%paramount%' and position_title ilike '%associate product manager%content discovery%'
  order by created_at limit 1
) a
cross join (values
  ('active', 'Phil Ranta', 'CEO, Stealth Talent', 'sent a quick note to Will Gurman (SVP, Content Partnerships & Programming, Pluto TV) and Mike Drath (COO & CFO, Pluto TV)', 0),
  ('active', 'Miguel Oliveira', null, 'pinging Mike Sweeney for his ok before making intro', 1),
  ('active', 'Rich Kearney', 'Sr. Director of Product Management, Mediakind; former VP Product Management, Content & Discovery, Paramount', 'confirmed he reached out to a senior contact at Paramount+ on my behalf', 2),
  ('active', 'Lindsey Emerson', 'Senior Product Leader, Paramount', 'referral submitted and confirmed', 3),
  ('active', 'Carrie & Grace', 'BULA Internship Supervisors', 'Sofia Barros (International Publicity Coordinator, Paramount; BU alum) confirmed she will submit a second referral', 4),
  ('no_response', 'Vikash Sharma', null, 'replied (asked if I''d reached out to Lindsey); I confirmed referral + asked for intro to Abhishek Nagaraju or Callie Wachman', 0),
  ('no_response', 'Somesh Sharma', 'Senior Product Manager, Paramount+', 'LinkedIn connection accepted; replied to LinkedIn message', 1),
  ('no_response', 'Abhishek Nagaraju', 'VP of Product, Content Discovery & Core Experience, Paramount+', 'LinkedIn connection accepted; replied to LinkedIn message', 2),
  ('direct', 'Dana Cacciatore', 'Hiring Manager', 'email sent + opened (2 views, 5/5); LinkedIn message sent; LinkedIn connection accepted; replied to LinkedIn message with initial interview invite', 0),
  ('direct', 'Jennifer O''Neill', null, 'LinkedIn message sent', 1),
  ('direct', 'Mariah Ramirez', 'Recruiter', 'email sent, commented on her post, connection request pending', 2),
  ('direct', 'Agness Daszykowski', null, 'LinkedIn connection accepted', 3)
) as v (group_key, name, title_company, update_text, sort_order)
where not exists (select 1 from public.application_outreach o where o.application_id = a.id);
