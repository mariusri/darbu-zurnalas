-- Kiekvienas vartotojas gali pasikeisti tik savo vardą (rolė ir būsena lieka nekeičiamos)
create or replace function public.set_my_name(new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Neprisijungta'; end if;
  if length(trim(coalesce(new_name, ''))) < 2 then raise exception 'Per trumpas vardas'; end if;
  update public.profiles set name = left(trim(new_name), 80) where id = auth.uid();
end $$;
revoke all on function public.set_my_name(text) from public;
grant execute on function public.set_my_name(text) to authenticated;
