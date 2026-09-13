-- SEGEMPAT: integridade de score/XP das atividades rápidas.
-- O cliente envia apenas os IDs e escolhas. Score e aprovação são recalculados
-- usando question_bank; campos de correção vindos do navegador são ignorados.

create or replace function public.submit_training_activity(
  p_activity_type text,
  p_activity_title text,
  p_answers jsonb default '[]'::jsonb,
  p_score numeric default 0 -- mantido apenas para compatibilidade de assinatura; ignorado
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_matricula text;
  v_nome text;
  v_employee public.employees%rowtype;
  v_score numeric := 0;
  v_passed boolean := false;
  v_points integer := 0;
  v_new_points integer;
  v_level integer;
  v_attempt_id uuid;
  v_activity_day date := (now() at time zone 'America/Maceio')::date;
  v_already_rewarded boolean := false;
  v_item jsonb;
  v_question_id uuid;
  v_question_id_text text;
  v_selected_text text;
  v_selected_index integer;
  v_correct_index integer;
  v_answer_count integer := 0;
  v_correct_count integer := 0;
  v_expected_count integer := 0;
  v_seen_ids uuid[] := array[]::uuid[];
  v_difficulty text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_activity_type not in ('Simulador','Stress Test','Desafio Diário','Teste Rápido') then
    raise exception 'Tipo de atividade inválido';
  end if;

  if not public.is_active_employee_user() then
    raise exception 'Colaborador inativo ou sem vínculo ativo';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Formato de respostas inválido';
  end if;

  select p.matricula, p.nome
    into v_matricula, v_nome
  from public.profiles p
  where p.id = v_user_id;

  if v_matricula is null then
    raise exception 'Perfil sem matrícula vinculada';
  end if;

  select e.* into v_employee
  from public.employees e
  where lower(trim(e.matricula)) = lower(trim(v_matricula))
    and e.status = 'Ativo'
  limit 1;

  if v_employee.id is null then
    raise exception 'Colaborador ativo não encontrado';
  end if;

  if p_activity_type = 'Desafio Diário' and exists (
    select 1 from public.training_activity_attempts a
    where a.user_id = v_user_id
      and a.activity_type = 'Desafio Diário'
      and a.activity_day = v_activity_day
  ) then
    raise exception 'Desafio Diário já realizado hoje';
  end if;

  if p_activity_type in ('Teste Rápido','Simulador','Stress Test') then
    select exists (
      select 1 from public.training_activity_attempts a
      where a.user_id = v_user_id
        and a.activity_type = p_activity_type
        and a.activity_day = v_activity_day
        and a.points_earned > 0
    ) into v_already_rewarded;
  end if;

  -- A quantidade esperada replica as regras das telas, mas é calculada com dados confiáveis.
  if p_activity_type = 'Teste Rápido' then
    v_expected_count := 5;
  elsif p_activity_type = 'Desafio Diário' then
    v_expected_count := 3;
  elsif p_activity_type = 'Simulador' then
    v_difficulty := nullif(btrim(regexp_replace(coalesce(p_activity_title,''), '^Simulador\s*', '', 'i')), '');
    if v_difficulty not in ('Básico','Intermediário','Avançado') then
      raise exception 'Dificuldade do simulador inválida';
    end if;
    select least(4, count(*))::integer into v_expected_count
    from public.question_bank q
    where q.active = true
      and q.bank_type = 'simulacoes'
      and q.difficulty = v_difficulty
      and (q.target_sector = 'Todos' or q.target_sector = v_employee.sector);
  else -- Stress Test
    select least(5, count(*))::integer into v_expected_count
    from public.question_bank q
    where q.active = true
      and q.bank_type = 'simulacoes'
      and (q.target_sector = 'Todos' or q.target_sector = v_employee.sector);
  end if;

  if v_expected_count <= 0 then
    raise exception 'Não há questões ativas suficientes para esta atividade';
  end if;

  for v_item in select value from jsonb_array_elements(p_answers)
  loop
    v_question_id_text := coalesce(v_item ->> 'question_id', v_item ->> 'scenario_id', v_item ->> 'scenarioId');
    v_selected_text := coalesce(v_item ->> 'selected_index', v_item ->> 'selectedIndex');

    if v_question_id_text is null or v_question_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Questão inválida na atividade';
    end if;

    if v_selected_text is null or v_selected_text !~ '^-?[0-9]+$' then
      raise exception 'Resposta inválida na atividade';
    end if;

    v_question_id := v_question_id_text::uuid;
    v_selected_index := v_selected_text::integer;

    if v_question_id = any(v_seen_ids) then
      raise exception 'Questão duplicada na atividade';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_question_id);

    select q.correct_index into v_correct_index
    from public.question_bank q
    where q.id = v_question_id
      and q.active = true
      and (q.target_sector = 'Todos' or q.target_sector = v_employee.sector)
      and (
        p_activity_type = 'Teste Rápido'
        or (p_activity_type = 'Desafio Diário' and q.bank_type = 'treinamento_dinamico')
        or (p_activity_type = 'Simulador' and q.bank_type = 'simulacoes' and q.difficulty = v_difficulty)
        or (p_activity_type = 'Stress Test' and q.bank_type = 'simulacoes')
      )
    limit 1;

    if v_correct_index is null then
      raise exception 'Questão não autorizada para esta atividade/setor';
    end if;

    v_answer_count := v_answer_count + 1;
    if v_selected_index = v_correct_index then
      v_correct_count := v_correct_count + 1;
    end if;
  end loop;

  if v_answer_count <> v_expected_count then
    raise exception 'Quantidade de respostas inválida: esperado %, recebido %', v_expected_count, v_answer_count;
  end if;

  v_score := round((v_correct_count::numeric / v_expected_count::numeric) * 10, 1);
  v_passed := v_score >= 7;

  v_points := case p_activity_type
    when 'Teste Rápido' then 10
    when 'Desafio Diário' then 15
    when 'Simulador' then 20
    when 'Stress Test' then 25
    else 0
  end;

  if v_already_rewarded then
    v_points := 0;
  end if;

  insert into public.training_activity_attempts(
    user_id, employee_id, employee_name, employee_matricula, employee_sector,
    activity_type, activity_title, answers, score, max_score, passed, points_earned, activity_day
  ) values(
    v_user_id, v_employee.id, coalesce(v_employee.full_name,v_nome,'Colaborador'), v_employee.matricula, v_employee.sector,
    p_activity_type, coalesce(nullif(btrim(p_activity_title),''),p_activity_type), p_answers,
    v_score, 10, v_passed, v_points, v_activity_day
  ) returning id into v_attempt_id;

  v_new_points := coalesce(v_employee.points,0) + v_points;
  v_level := case
    when v_new_points >= 2000 then 5
    when v_new_points >= 1000 then 4
    when v_new_points >= 500 then 3
    when v_new_points >= 200 then 2
    else 1
  end;

  update public.employees
  set points = v_new_points,
      level = v_level
  where id = v_employee.id;

  return jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'score', v_score,
    'passed', v_passed,
    'points_earned', v_points,
    'new_points', v_new_points,
    'level', v_level,
    'activity_day', v_activity_day,
    'already_rewarded_today', v_already_rewarded,
    'correct_count', v_correct_count,
    'question_count', v_expected_count
  );
exception
  when unique_violation then
    if p_activity_type = 'Desafio Diário' then
      raise exception 'Desafio Diário já realizado hoje';
    end if;
    raise;
end;
$$;

revoke all on function public.submit_training_activity(text,text,jsonb,numeric) from public;
grant execute on function public.submit_training_activity(text,text,jsonb,numeric) to authenticated;

-- RPCs operacionais exigem sessão; anon não precisa nem de EXECUTE.
revoke execute on function public.generate_registration_code(uuid) from anon;
revoke execute on function public.revoke_registration_code(uuid) from anon;
revoke execute on function public.sign_exam_attempt(uuid,text,text) from anon;
revoke execute on function public.submit_exam_attempt(uuid,jsonb) from anon;
revoke execute on function public.submit_training_activity(text,text,jsonb,numeric) from anon;
revoke execute on function public.current_employee_sector() from anon;
revoke execute on function public.is_active_employee_user() from anon;
revoke execute on function public.is_current_employee(uuid) from anon;
