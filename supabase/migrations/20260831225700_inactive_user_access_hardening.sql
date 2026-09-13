-- SEGEMPAT: bloqueia acesso residual de colaboradores inativos.

create or replace function public.is_active_employee_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.employees e on lower(trim(e.matricula)) = lower(trim(p.matricula))
    where p.id = auth.uid()
      and e.status = 'Ativo'
  );
$$;

create or replace function public.is_current_employee(_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.employees e on lower(trim(e.matricula)) = lower(trim(p.matricula))
    where p.id = auth.uid()
      and e.id = _employee_id
      and e.status = 'Ativo'
  );
$$;

drop policy if exists "Users can view own attempts" on public.exam_attempts;
create policy "Users can view own attempts"
on public.exam_attempts for select
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or (auth.uid() = user_id and public.is_active_employee_user())
);

drop policy if exists "Users can insert own attempts" on public.exam_attempts;
create policy "Users can insert own attempts"
on public.exam_attempts for insert
with check (auth.uid() = user_id and public.is_active_employee_user());

drop policy if exists "Training activities select" on public.training_activity_attempts;
create policy "Training activities select"
on public.training_activity_attempts for select
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or (user_id = auth.uid() and public.is_active_employee_user())
);

drop policy if exists "Authenticated create occurrences" on public.occurrences;
create policy "Active users create occurrences"
on public.occurrences for insert
with check (created_by = auth.uid() and public.is_active_employee_user());

drop policy if exists "Occurrences select" on public.occurrences;
create policy "Occurrences select"
on public.occurrences for select
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or ((employee_id is not null) and public.is_current_employee(employee_id))
  or (created_by = auth.uid() and public.is_active_employee_user())
);

create or replace function public.sign_exam_attempt(
  p_attempt_id uuid,
  p_signature_path text,
  p_signature_name text
)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_attempts;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if not public.is_active_employee_user() then raise exception 'Colaborador inativo ou sem vínculo ativo'; end if;
  if p_signature_path is null or btrim(p_signature_path) = '' then raise exception 'Caminho da assinatura inválido'; end if;
  if split_part(p_signature_path,'/',1) <> auth.uid()::text then raise exception 'Assinatura fora do diretório autorizado'; end if;

  update public.exam_attempts
  set signature_path = p_signature_path,
      signature_name = nullif(btrim(p_signature_name),''),
      signed_at = now(),
      signature_agreed = true,
      updated_at = now()
  where id = p_attempt_id and user_id = auth.uid()
  returning * into v_attempt;

  if v_attempt.id is null then raise exception 'Tentativa não encontrada ou não pertence ao usuário'; end if;
  return v_attempt;
end;
$$;

drop policy if exists "Users upload own exam signatures" on storage.objects;
create policy "Active users upload own exam signatures"
on storage.objects for insert
with check (
  bucket_id = 'exam-signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active_employee_user()
);

drop policy if exists "Users read own exam signatures" on storage.objects;
create policy "Active users read own exam signatures"
on storage.objects for select
using (
  bucket_id = 'exam-signatures'
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or ((storage.foldername(name))[1] = auth.uid()::text and public.is_active_employee_user())
  )
);

drop policy if exists "Users update own exam signatures" on storage.objects;
create policy "Active users update own exam signatures"
on storage.objects for update
using (
  bucket_id = 'exam-signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active_employee_user()
)
with check (
  bucket_id = 'exam-signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active_employee_user()
);

drop policy if exists "Users delete own exam signatures" on storage.objects;
create policy "Active users delete own exam signatures"
on storage.objects for delete
using (
  bucket_id = 'exam-signatures'
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or ((storage.foldername(name))[1] = auth.uid()::text and public.is_active_employee_user())
  )
);
