-- Kliento įmonės (asmens) kodas ir PVM kodas – eksportui į „Centą“ (kontrahentai)
-- Supabase → SQL Editor → New query → įklijuokite → Run. Galima paleisti kelis kartus.
alter table public.objects add column if not exists client_code text;
alter table public.objects add column if not exists client_vat text;
