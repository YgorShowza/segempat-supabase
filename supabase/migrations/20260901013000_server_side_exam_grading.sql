-- SEGEMPAT: integridade de avaliações.
-- O cliente deixa de definir score/passed. Toda tentativa passa por correção server-side.

create or replace function public.submit_exam_attempt(
  p_exam_id uuid,
  p_answers jsonb default '{}'::jsonb
)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.exams%rowtype;
  v_question jsonb;
  v_answer text;
  v_points numeric;
  v_total numeric := 0;
  v_earned numeric := 0;
  v_percent integer := 0;
  v_score numeric := 0;
  v_passed boolean := false;
  v_matricula text;
  v_attempt public.exam_attempts;
  v_type text;
  v_correct boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.is_active_employee_user() then
    raise exception 'Colaborador inativo ou sem vínculo ativo';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Formato de respostas inválido';
  end if;

  select e.* into v_exam
  from public.exams e
  where e.id = p_exam_id
    and e.status = 'Publicada'
    and (e.target_sector = 'Todos' or e.target_sector = public.current_employee_sector())
  limit 1;

  if v_exam.id is null then
    raise exception 'Prova indisponível ou não autorizada para seu setor';
  end if;

  if v_exam.questions is null
     or jsonb_typeof(v_exam.questions) <> 'array'
     or jsonb_array_length(v_exam.questions) = 0 then
    raise exception 'Prova sem questões válidas';
  end if;

  for v_question in select value from jsonb_array_elements(v_exam.questions)
  loop
    v_points := greatest(1, coalesce(nullif(v_question ->> 'points', '')::numeric, 1));
    v_total := v_total + v_points;
    v_type := coalesce(v_question ->> 'type', 'Múltipla escolha');
    v_answer := p_answers ->> (v_question ->> 'id');
    v_correct := false;

    if v_type = 'Múltipla escolha' then
      v_correct := v_answer is not null
        and v_answer = coalesce(v_question ->> 'correct_index', '');
    else
      v_correct := v_answer is not null
        and nullif(v_question ->> 'model_answer', '') is not null
        and regexp_replace(lower(btrim(v_answer)), '\s+', ' ', 'g')
          = regexp_replace(lower(btrim(v_question ->> 'model_answer')), '\s+', ' ', 'g');
    end if;

    if v_correct then
      v_earned := v_earned + v_points;
    end if;
  end loop;

  if v_total <= 0 then
    raise exception 'Pontuação total inválida';
  end if;

  v_percent := round((v_earned / v_total) * 100)::integer;
  v_score := round(v_percent::numeric / 10, 1);
  v_passed := v_percent >= coalesce(v_exam.min_approval_pct, 70);

  select p.matricula into v_matricula
  from public.profiles p
  where p.id = auth.uid();

  insert into public.exam_attempts (
    exam_id,
    user_id,
    matricula,
    score,
    passed,
    answers
  ) values (
    v_exam.id,
    auth.uid(),
    v_matricula,
    v_score,
    v_passed,
    p_answers
  )
  returning * into v_attempt;

  return v_attempt;
end;
$$;

revoke all on function public.submit_exam_attempt(uuid, jsonb) from public;
grant execute on function public.submit_exam_attempt(uuid, jsonb) to authenticated;

-- Bloqueia fabricação direta de score/passed pelo cliente.
drop policy if exists "Users can insert own attempts" on public.exam_attempts;
revoke insert on public.exam_attempts from authenticated;
