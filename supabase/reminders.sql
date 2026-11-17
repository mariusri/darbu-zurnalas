-- Rytinis priminimas el. paštu su dienos užduotimis (funkcija supabase/functions/task-reminder)
-- Supabase → SQL Editor → New query → įklijuokite → Run. Galima paleisti kelis kartus.

-- Kurią dieną laiškai jau išsiųsti (kad nebūtų siunčiama du kartus)
create table if not exists public.reminder_log (
  day date primary key,
  tasks int not null default 0,
  sent int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.reminder_log enable row level security;   -- be taisyklių: skaito / rašo tik serverio funkcija

-- Laikmatis: kas 15 min. 05:00–06:59 UTC; funkcija pati siunčia, kai Lietuvoje jau 8:00 (vasarą – 05:00 UTC, žiemą – 06:00 UTC)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('task-reminder') where exists (select 1 from cron.job where jobname = 'task-reminder');
select cron.schedule('task-reminder', '*/15 5-6 * * *', $$
  select net.http_post(
    url := 'https://fzrqlqhzqvatpthyflta.supabase.co/functions/v1/task-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);

select jobname, schedule, active from cron.job where jobname = 'task-reminder';
