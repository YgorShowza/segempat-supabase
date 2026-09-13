-- SEGEMPAT: endurece códigos de ativação contra ataque offline em caso de vazamento do banco.
-- Novos códigos usam bcrypt (pgcrypto) com salt individual. O handle_new_user mantém
-- compatibilidade com hashes SHA-256 legados somente enquanto esses códigos não expirarem.

create or replace function public.generate_registration_code(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_employee public.employees%rowtype;
  v_code text;
  v_random bigint;
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso não autorizado';
  end if;

  select * into v_employee
  from public.employees
  where id = p_employee_id
    and status = 'Ativo';

  if v_employee.id is null then
    raise exception 'Colaborador ativo não encontrado';
  end if;

  if exists (
    select 1 from public.profiles p
    where lower(trim(p.matricula)) = lower(trim(v_employee.matricula))
  ) then
    raise exception 'Esta matrícula já possui acesso cadastrado';
  end if;

  v_random := (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint);
  v_code := lpad((v_random % 100000000)::text, 8, '0');

  insert into public.registration_activation_codes (
    employee_id, code_hash, expires_at, used_at, created_by, created_at
  ) values (
    v_employee.id,
    crypt(v_code, gen_salt('bf', 10)),
    v_expires_at,
    null,
    auth.uid(),
    now()
  )
  on conflict (employee_id) do update set
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    used_at = null,
    created_by = excluded.created_by,
    created_at = now();

  return jsonb_build_object(
    'code', v_code,
    'employee_id', v_employee.id,
    'employee_name', v_employee.full_name,
    'matricula', v_employee.matricula,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.generate_registration_code(uuid) from public;
grant execute on function public.generate_registration_code(uuid) to authenticated;

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

  if v_activation_code !~ '^[0-9]{8}$' then
    raise exception 'Código de ativação inválido';
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
    and (
      (r.code_hash like '$2%' and crypt(v_activation_code, r.code_hash) = r.code_hash)
      or
      (length(r.code_hash) = 64 and r.code_hash = encode(digest(v_activation_code, 'sha256'), 'hex'))
    )
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

revoke all on function public.handle_new_user() from public;
