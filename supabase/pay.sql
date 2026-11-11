-- CRM 2 dalis: sąskaitos ir mokėjimai prie objekto (tik administratoriams)
create table if not exists public.object_invoices (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects(id) on delete cascade,
  no text not null default '',
  amount numeric not null default 0,
  issue_date date,
  due_date date,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.object_payments (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects(id) on delete cascade,
  amount numeric not null default 0,
  date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists object_invoices_obj on public.object_invoices(object_id);
create index if not exists object_payments_obj on public.object_payments(object_id);
alter table public.object_invoices enable row level security;
alter table public.object_payments enable row level security;
drop policy if exists "invoices admin" on public.object_invoices;
create policy "invoices admin" on public.object_invoices for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "payments admin" on public.object_payments;
create policy "payments admin" on public.object_payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
