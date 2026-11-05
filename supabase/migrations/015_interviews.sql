-- Interviews: one entry per round with the date and who it was with.
-- interview_dates stays in sync (derived from this) so stages and exports keep working.
alter table public.applications add column if not exists interviews jsonb not null default '[]';
update public.applications
  set interviews = (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'with', '') order by d), '[]'::jsonb) from unnest(interview_dates) d)
  where interviews = '[]'::jsonb and cardinality(interview_dates) > 0;
