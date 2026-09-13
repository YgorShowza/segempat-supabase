create or replace function public.current_employee_sector()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.sector
  from public.profiles p
  join public.employees e on e.matricula = p.matricula
  where p.id = auth.uid()
    and e.status = 'Ativo'
  limit 1;
$$;

revoke all on function public.current_employee_sector() from public;
grant execute on function public.current_employee_sector() to authenticated;

drop policy if exists "Exams select by publication" on public.exams;

create policy "Exams select by publication and sector"
on public.exams
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or (
    status = 'Publicada'
    and (
      target_sector = 'Todos'
      or target_sector = public.current_employee_sector()
    )
  )
);
