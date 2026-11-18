-- Restore the old Career Vision data into the new "Dream jobs" section.
-- Run once in the Supabase SQL editor (while logged in to the project). Safe to run twice:
-- it never deletes anything and skips rows it already copied.
--
-- Old "Dream job" note      -> one dream job titled "My dream job (from old note)", note text as the description
-- Old "Career roadmap" steps -> one dream job each, with target date, status and details in the description

-- STEP 1 (optional): see what the old data looks like before copying it.
-- select section, data from public.items where section in ('dream_job', 'milestone') order by section, created_at;

-- STEP 2: copy it over.
insert into public.items (user_id, section, data, created_at)
select
  o.user_id,
  'dream_role',
  jsonb_build_object(
    'title', 'My dream job (from old note)',
    'description', o.data->>'text',
    'level', 'Auto',
    'restored_from', o.id::text
  ),
  o.created_at
from public.items o
where o.section = 'dream_job'
  and coalesce(trim(o.data->>'text'), '') <> ''
  and not exists (
    select 1 from public.items n
    where n.section = 'dream_role' and n.data->>'restored_from' = o.id::text
  );

insert into public.items (user_id, section, data, created_at)
select
  o.user_id,
  'dream_role',
  jsonb_build_object(
    'title', o.data->>'title',
    'description', concat_ws(E'\n',
      'Status: ' || coalesce(nullif(o.data->>'status', ''), 'Planned'),
      case when coalesce(o.data->>'target', '') <> '' then 'Target date: ' || (o.data->>'target') end,
      nullif(o.data->>'details', '')
    ),
    'level', 'Auto',
    'restored_from', o.id::text
  ),
  o.created_at
from public.items o
where o.section = 'milestone'
  and coalesce(o.data->>'title', '') <> ''
  and not exists (
    select 1 from public.items n
    where n.section = 'dream_role' and n.data->>'restored_from' = o.id::text
  );

-- STEP 3: check the result (the old rows are left untouched).
select section, data->>'title' as title, left(data->>'description', 60) as description
from public.items
where section = 'dream_role'
order by created_at;
