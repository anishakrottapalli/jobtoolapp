-- Application questions as question/answer pairs, and tailored resumes with an uploaded file.
alter table public.applications add column if not exists questions jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists resume_tailored boolean not null default false;
alter table public.applications add column if not exists resume_file_path text;
alter table public.applications add column if not exists resume_file_name text;

-- Private file storage. Each user's files live under a folder named with their user id.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_select_own') then
    create policy documents_select_own on storage.objects for select to authenticated
      using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_insert_own') then
    create policy documents_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_update_own') then
    create policy documents_update_own on storage.objects for update to authenticated
      using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_delete_own') then
    create policy documents_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
