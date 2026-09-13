-- SEGEMPAT: reconcilia perfis funcionais de colaboradores com user_roles.
-- Contas administrativas técnicas sem vínculo em employees não são alteradas.

insert into public.user_roles (user_id, role)
select p.id, 'admin'::public.app_role
from public.profiles p
join public.employees e
  on lower(trim(e.matricula)) = lower(trim(p.matricula))
where e.status = 'Ativo'
  and e.access_profile = 'Inspetor'
on conflict (user_id, role) do nothing;

delete from public.user_roles ur
using public.profiles p
join public.employees e
  on lower(trim(e.matricula)) = lower(trim(p.matricula))
where ur.user_id = p.id
  and ur.role = 'admin'::public.app_role
  and not (e.status = 'Ativo' and e.access_profile = 'Inspetor');
