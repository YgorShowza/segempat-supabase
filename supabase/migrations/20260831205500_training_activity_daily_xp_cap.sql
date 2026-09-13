create or replace function public.submit_training_activity(
  p_activity_type text,
  p_activity_title text,
  p_answers jsonb default '[]'::jsonb,
  p_score numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_matricula text;
  v_nome text;
  v_employee public.employees%rowtype;
  v_score numeric;
  v_passed boolean;
  v_points integer;
  v_new_points integer;
  v_level integer;
  v_attempt_id uuid;
  v_activity_day date := (now() at time zone 'America/Maceio')::date;
  v_already_rewarded boolean := false;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado'; end if;
  if p_activity_type not in ('Simulador','Stress Test','Desafio Diário','Teste Rápido','Treinamento') then raise exception 'Tipo de atividade inválido'; end if;

  if p_activity_type = 'Desafio Diário' and exists (
    select 1 from public.training_activity_attempts a
    where a.user_id=v_user_id and a.activity_type='Desafio Diário' and a.activity_day=v_activity_day
  ) then
    raise exception 'Desafio Diário já realizado hoje';
  end if;

  if p_activity_type in ('Teste Rápido','Simulador','Stress Test') then
    select exists (
      select 1 from public.training_activity_attempts a
      where a.user_id=v_user_id and a.activity_type=p_activity_type and a.activity_day=v_activity_day and a.points_earned > 0
    ) into v_already_rewarded;
  end if;

  select p.matricula,p.nome into v_matricula,v_nome from public.profiles p where p.id=v_user_id;
  if v_matricula is null then raise exception 'Perfil sem matrícula vinculada'; end if;
  select e.* into v_employee from public.employees e where e.matricula=v_matricula and e.status='Ativo' limit 1;
  if v_employee.id is null then raise exception 'Colaborador ativo não encontrado'; end if;

  v_score:=greatest(0,least(10,coalesce(p_score,0)));
  v_passed:=v_score>=7;
  v_points:=case p_activity_type
    when 'Teste Rápido' then 10
    when 'Desafio Diário' then 15
    when 'Simulador' then 20
    when 'Stress Test' then 25
    when 'Treinamento' then 10
    else 0 end;

  if v_already_rewarded then v_points := 0; end if;

  insert into public.training_activity_attempts(
    user_id,employee_id,employee_name,employee_matricula,employee_sector,
    activity_type,activity_title,answers,score,max_score,passed,points_earned,activity_day
  ) values(
    v_user_id,v_employee.id,coalesce(v_employee.full_name,v_nome,'Colaborador'),v_employee.matricula,v_employee.sector,
    p_activity_type,coalesce(nullif(btrim(p_activity_title),''),p_activity_type),coalesce(p_answers,'[]'::jsonb),
    v_score,10,v_passed,v_points,v_activity_day
  ) returning id into v_attempt_id;

  v_new_points:=coalesce(v_employee.points,0)+v_points;
  v_level:=case when v_new_points>=2000 then 5 when v_new_points>=1000 then 4 when v_new_points>=500 then 3 when v_new_points>=200 then 2 else 1 end;
  update public.employees set points=v_new_points, level=v_level where id=v_employee.id;

  return jsonb_build_object(
    'success',true,'attempt_id',v_attempt_id,'score',v_score,'passed',v_passed,
    'points_earned',v_points,'new_points',v_new_points,'level',v_level,'activity_day',v_activity_day,
    'already_rewarded_today',v_already_rewarded
  );
exception when unique_violation then
  if p_activity_type='Desafio Diário' then raise exception 'Desafio Diário já realizado hoje'; end if;
  raise;
end;
$function$;
