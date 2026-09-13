create or replace function public.get_exam_attempt_evidence_admin(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_exam public.exams%rowtype;
  v_question jsonb;
  v_answers jsonb;
  v_items jsonb := '[]'::jsonb;
  v_answer text;
  v_answer_text text;
  v_statement text;
  v_type text;
  v_correct boolean;
  v_selected integer;
  v_correct_index integer;
  v_total integer := 0;
  v_correct_count integer := 0;
  v_employee_name text;
  v_employee_sector text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Acesso restrito à Inspetoria';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id limit 1;
  if v_attempt.id is null then raise exception 'Evidência da avaliação não encontrada'; end if;
  select * into v_exam from public.exams where id = v_attempt.exam_id limit 1;
  if v_exam.id is null then raise exception 'Prova não encontrada'; end if;

  select e.full_name, e.sector into v_employee_name, v_employee_sector
  from public.employees e where lower(trim(e.matricula)) = lower(trim(v_attempt.matricula)) limit 1;

  v_answers := coalesce(v_attempt.answers, '{}'::jsonb);
  for v_question in select value from jsonb_array_elements(coalesce(v_exam.questions, '[]'::jsonb)) loop
    v_total := v_total + 1;
    v_type := coalesce(v_question->>'type', 'Múltipla escolha');
    v_statement := coalesce(nullif(v_question->>'statement',''), nullif(v_question->>'question',''), 'Questão ' || v_total::text);
    v_answer := v_answers ->> coalesce(v_question->>'id', '');
    v_correct := false;
    if v_type = 'Múltipla escolha' then
      begin v_selected := v_answer::integer; exception when others then v_selected := null; end;
      begin v_correct_index := (v_question->>'correct_index')::integer; exception when others then v_correct_index := null; end;
      if v_selected is not null and jsonb_typeof(v_question->'options') = 'array' and v_selected >= 0 and v_selected < jsonb_array_length(v_question->'options') then
        v_answer_text := v_question->'options'->>v_selected;
      else
        v_answer_text := coalesce(v_answer, 'Não respondida');
      end if;
      v_correct := v_selected is not null and v_correct_index is not null and v_selected = v_correct_index;
    else
      v_answer_text := coalesce(nullif(v_answer,''), 'Não respondida');
      v_correct := nullif(regexp_replace(lower(btrim(v_answer_text)), '\s+', ' ', 'g'),'') is not null
        and nullif(v_question->>'model_answer','') is not null
        and regexp_replace(lower(btrim(v_answer_text)), '\s+', ' ', 'g') = regexp_replace(lower(btrim(v_question->>'model_answer')), '\s+', ' ', 'g');
    end if;
    if v_correct then v_correct_count := v_correct_count + 1; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', coalesce(v_question->>'id', 'q-' || v_total::text), 'order', v_total, 'type', v_type,
      'statement', v_statement, 'answer', v_answer_text, 'correct', v_correct
    ));
  end loop;

  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'exam_id', v_attempt.exam_id, 'exam_title', v_exam.title,
    'employee_name', coalesce(v_employee_name, v_attempt.signature_name, v_attempt.matricula, 'Colaborador'),
    'matricula', v_attempt.matricula, 'sector', coalesce(v_employee_sector, '—'),
    'score', v_attempt.score, 'passed', v_attempt.passed, 'certificate_code', v_attempt.certificate_code,
    'finished_at', v_attempt.finished_at, 'signed_at', v_attempt.signed_at, 'signature_name', v_attempt.signature_name,
    'total_questions', v_total, 'correct_count', v_correct_count,
    'accuracy_pct', case when v_total > 0 then round((v_correct_count::numeric / v_total::numeric) * 100)::integer else 0 end,
    'questions', v_items
  );
end;
$$;

revoke all on function public.get_exam_attempt_evidence_admin(uuid) from public;
grant execute on function public.get_exam_attempt_evidence_admin(uuid) to authenticated;
