-- Profile, Resources, Career Vision: small personal records (skills, references, job boards,
-- networking templates, the dream job description, roadmap milestones). One table, one row per
-- record, grouped by "section"; the fields live in "data".

create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section    text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_user_section_idx on public.items (user_id, section);

create or replace trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

alter table public.items enable row level security;

create policy "own items" on public.items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
