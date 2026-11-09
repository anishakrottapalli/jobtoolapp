-- Adds the Eyeline contacts to your account.
-- Run in the Supabase SQL editor (it has no auth.uid(), so the owner is looked up by email).
-- Change the email below if your Supabase login differs.

insert into public.contacts
  (user_id, first_name, last_name, company, personal_email, preferred_email, notes, tags)
select u.id, c.first_name, c.last_name, 'Eyeline', c.email,
       case when c.email is null then null else 'personal' end,
       c.notes, array['eyeline']
from auth.users u
cross join (values
  ('Janet',    'Sohn',     'jtsohn@gmail.com', null),
  ('Mercedes', 'Favre',    null,               'Maiden name Mathers (Mercedes (Mathers) Favre)'),
  ('Kameko',   'Ashley',   null,               null),
  ('Morgan',   'Barazza',  null,               null)
) as c(first_name, last_name, email, notes)
where u.email = 'anisha.krottapalli@gmail.com';
