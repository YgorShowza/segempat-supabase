-- SEGEMPAT: hardening do ciclo de vida de contas

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_matricula text;
  v_activation_code text;
  v_employee public.employees%rowtype;
  v_token public.registration_activation_codes%rowtype;
begin
  v_matricula := lower(trim(coalesce(new.raw_user_meta_data ->> 'matricula', split_part(new.email, '@', 1))));
  v_activation_code := trim(coalesce(new.raw_user_meta_data ->> 'activation_code', ''));

  if v_matricula is null or v_matricula = '' then
    raise exception 'Matrícula obrigatória';
  end if;

  if v_activation_code = '' then
    raise exception 'Código de ativação obrigatório';
  end if;

  select * into v_employee
  from public.employees e
  where lower(trim(e.matricula)) = v_matricula
    and e.status = 'Ativo'
  limit 1;

  if v_employee.id is null then
    raise exception 'Matrícula não autorizada para cadastro';
  end if;

  select * into v_token
  from public.registration_activation_codes r
  where r.employee_id = v_employee.id
    and r.used_at is null
    and r.expires_at > now()
    and r.code_hash = encode(digest(v_activation_code, 'sha256'), 'hex')
  for update;

  if v_token.employee_id is null then
    raise exception 'Código de ativação inválido ou expirado';
  end if;

  insert into public.profiles (id, matricula, nome)
  values (new.id, v_matricula, v_employee.full_name);

  if v_employee.access_profile = 'Inspetor' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin'::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;

  update public.registration_activation_codes
  set used_at = now()
  where employee_id = v_employee.id;

  return new;
end;
$$;

create or replace function public.sync_employee_access_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select p.id into v_user_id
  from public.profiles p
  where lower(trim(p.matricula)) = lower(trim(new.matricula))
  limit 1;

  if v_user_id is null then
    return new;
  end if;

  if new.status = 'Ativo' and new.access_profile = 'Inspetor' then
    insert into public.user_roles (user_id, role)
    values (v_user_id, 'admin'::public.app_role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles
    where user_id = v_user_id
      and role = 'admin'::public.app_role;
  end if;

  return new;
end;
$$;

drop trigger if exists employees_sync_access_role on public.employees;
create trigger employees_sync_access_role
after update of access_profile, status on public.employees
for each row
execute function public.sync_employee_access_role();

create or replace function public.protect_linked_employee_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_account boolean;
begin
  select exists (
    select 1 from public.profiles p
    where lower(trim(p.matricula)) = lower(trim(old.matricula))
  ) into v_has_account;

  if not v_has_account then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Colaborador possui conta vinculada. Inative o cadastro em vez de excluir.';
  end if;

  if lower(trim(new.matricula)) is distinct from lower(trim(old.matricula)) then
    raise exception 'Matrícula vinculada a uma conta não pode ser alterada diretamente.';
  end if;

  return new;
end;
$$;

drop trigger if exists employees_protect_linked_identity on public.employees;
create trigger employees_protect_linked_identity
before update of matricula or delete on public.employees
for each row
execute function public.protect_linked_employee_identity();
