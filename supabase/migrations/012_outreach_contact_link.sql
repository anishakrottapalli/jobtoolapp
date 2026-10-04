-- Link an outreach entry to a contact in the networking tracker (set when you "Save to Contacts").
-- The entry keeps its own copy of the title/company as they were when it was added.
alter table public.application_outreach
  add column if not exists contact_id uuid references public.contacts (id) on delete set null;

create index if not exists application_outreach_contact_idx on public.application_outreach (contact_id);
