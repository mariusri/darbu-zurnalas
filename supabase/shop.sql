-- Elreda.lt parduotuvės prekės su kainomis – TIK administratoriams (darbuotojai mato atskirą medžiagų katalogą „products“).
-- Užpildo / atnaujina funkcija supabase/functions/shop-sync (mygtukas „Atnaujinti iš elreda.lt“).
-- Supabase → SQL Editor → New query → įklijuokite → Run. Galima paleisti kelis kartus.
create table if not exists public.shop_products (
  id bigint primary key,               -- prekės ID elreda.lt parduotuvėje
  sku text,
  name text not null,
  category text,
  price_vat numeric,                   -- kaina parduotuvėje (su PVM)
  price numeric,                       -- be PVM (price_vat / 1,21)
  variable boolean not null default false,  -- prekė su variantais – kaina „nuo“
  in_stock boolean,
  url text,
  image text,
  active boolean not null default true,     -- false – prekės parduotuvėje nebėra
  updated_at timestamptz not null default now()
);
alter table public.shop_products enable row level security;
drop policy if exists "shop products admin" on public.shop_products;
create policy "shop products admin" on public.shop_products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
