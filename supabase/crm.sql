-- CRM 1 dalis: objekto etapas ir kitas veiksmas (tik administratoriams)
alter table public.objects drop constraint if exists objects_status_check;
alter table public.objects add constraint objects_status_check
  check (status in ('uzklausa','pasiulymas','sutartis','montavimas','prijungimas','aptarnavimas','baigta','atsaukta'));

create table if not exists public.object_crm (
  object_id uuid primary key references public.objects(id) on delete cascade,
  stage text not null default 'uzklausa' check (stage in ('uzklausa','pasiulymas','montavimas','apmokejimas','uzbaigta','atsaukta')),
  source text,
  next_action text,
  next_owner text,
  next_due date,
  cancel_reason text,
  stage_at date default current_date,
  updated_at timestamptz not null default now()
);
alter table public.object_crm enable row level security;
drop policy if exists "crm admin" on public.object_crm;
create policy "crm admin" on public.object_crm for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
