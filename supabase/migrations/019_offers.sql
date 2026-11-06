-- Offer stages: when an offer came in, and when it was turned down.
alter table public.applications add column if not exists offer_date date;
alter table public.applications add column if not exists offer_rejected_date date;
