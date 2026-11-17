-- ESO prijungimo sąlygas gali matyti visi patvirtinti vartotojai (sutartys, aktai, pasiūlymai – tik administratoriams)
-- Supabase → SQL Editor → New query → įklijuokite → Run. Galima paleisti kelis kartus.
drop policy if exists "docs eso read" on public.object_docs;
create policy "docs eso read" on public.object_docs for select to authenticated
  using (type = 'eso' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'patvirtintas'));

-- Patikrinimas: visos object_docs taisyklės
select policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'object_docs';
