-- Offer signed: when the offer was officially accepted/signed.
alter table public.applications add column if not exists offer_signed_date date;
