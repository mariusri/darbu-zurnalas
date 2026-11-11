-- CRM 3 dalis: garantinės užklausos (tik administratoriams)
create table if not exists public.object_warranty (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects(id) on delete cascade,
  date date not null default current_date,
  problem text not null default '',
  status text not null default 'gauta' check (status in ('gauta','sprendziama','isspresta')),
  notes text not null default '',
  solved_date date,
  created_at timestamptz not null default now()
);
create index if not exists object_warranty_obj on public.object_warranty(object_id);
alter table public.object_warranty enable row level security;
drop policy if exists "warranty admin" on public.object_warranty;
create policy "warranty admin" on public.object_warranty for all to authenticated using (public.is_admin()) with check (public.is_admin());
