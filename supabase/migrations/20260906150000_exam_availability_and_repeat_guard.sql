-- SEGEMPAT · compatibilidade segura do preview legado.
-- Mantém o Supabase alinhado à API MySQL: prova futura não é liberada e,
-- após aprovação, o mesmo operador não pode repetir a mesma prova no mesmo ano operacional.

CREATE OR REPLACE FUNCTION public.list_available_exams()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  exam_type text,
  target_sector text,
  min_approval_pct integer,
  scheduled_date date,
  status text,
  question_count integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.exam_type,
    e.target_sector,
    e.min_approval_pct,
    e.scheduled_date,
    e.status,
    jsonb_array_length(COALESCE(e.questions, '[]'::jsonb))::integer AS question_count,
    e.created_at
  FROM public.exams e
  WHERE auth.uid() IS NOT NULL
    AND public.is_active_employee_user()
    AND e.status = 'Publicada'
    AND (e.target_sector = 'Todos' OR e.target_sector = public.current_employee_sector())
    AND (e.scheduled_date IS NULL OR e.scheduled_date <= (now() AT TIME ZONE 'America/Maceio')::date)
  ORDER BY e.scheduled_date DESC NULLS LAST, e.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_exam_for_attempt(p_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
  v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_employee_user() THEN
    RAISE EXCEPTION 'Usuário não autorizado';
  END IF;

  SELECT * INTO v_exam
  FROM public.exams e
  WHERE e.id = p_exam_id
    AND e.status = 'Publicada'
    AND (e.target_sector = 'Todos' OR e.target_sector = public.current_employee_sector())
    AND (e.scheduled_date IS NULL OR e.scheduled_date <= (now() AT TIME ZONE 'America/Maceio')::date)
  LIMIT 1;

  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Prova indisponível ou ainda não liberada';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', q->>'id',
      'type', q->>'type',
      'statement', q->>'statement',
      'options', COALESCE(q->'options', '[]'::jsonb),
      'points', COALESCE((q->>'points')::numeric, 1)
    ) ORDER BY ord
  ), '[]'::jsonb)
  INTO v_questions
  FROM jsonb_array_elements(COALESCE(v_exam.questions, '[]'::jsonb)) WITH ORDINALITY AS t(q, ord);

  RETURN jsonb_build_object(
    'id', v_exam.id,
    'title', v_exam.title,
    'description', v_exam.description,
    'exam_type', v_exam.exam_type,
    'target_sector', v_exam.target_sector,
    'min_approval_pct', v_exam.min_approval_pct,
    'scheduled_date', v_exam.scheduled_date,
    'status', v_exam.status,
    'questions', v_questions,
    'created_at', v_exam.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  p_exam_id uuid,
  p_answers jsonb DEFAULT '{}'::jsonb
)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_employee_id uuid;
  v_attempt public.exam_attempts;
  v_type text;
  v_correct boolean;
  v_completion_date date;
  v_year_start date := date_trunc('year', now() AT TIME ZONE 'America/Maceio')::date;
  v_year_end date := (date_trunc('year', now() AT TIME ZONE 'America/Maceio') + interval '1 year')::date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF NOT public.is_active_employee_user() THEN
    RAISE EXCEPTION 'Colaborador inativo ou sem vínculo ativo';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Formato de respostas inválido';
  END IF;

  SELECT e.* INTO v_exam
  FROM public.exams e
  WHERE e.id = p_exam_id
    AND e.status = 'Publicada'
    AND (e.target_sector = 'Todos' OR e.target_sector = public.current_employee_sector())
    AND (e.scheduled_date IS NULL OR e.scheduled_date <= (now() AT TIME ZONE 'America/Maceio')::date)
  LIMIT 1;

  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Prova indisponível, não autorizada ou ainda não liberada';
  END IF;

  -- Serializa submissões concorrentes do mesmo usuário/prova para impedir dupla aprovação.
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(v_exam.id::text));

  IF EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    WHERE a.user_id = auth.uid()
      AND a.exam_id = v_exam.id
      AND a.passed = true
      AND (a.finished_at AT TIME ZONE 'America/Maceio')::date >= v_year_start
      AND (a.finished_at AT TIME ZONE 'America/Maceio')::date < v_year_end
  ) THEN
    RAISE EXCEPTION 'Esta prova já foi aprovada neste ano operacional';
  END IF;

  IF v_exam.questions IS NULL
     OR jsonb_typeof(v_exam.questions) <> 'array'
     OR jsonb_array_length(v_exam.questions) = 0 THEN
    RAISE EXCEPTION 'Prova sem questões válidas';
  END IF;

  FOR v_question IN SELECT value FROM jsonb_array_elements(v_exam.questions)
  LOOP
    v_points := greatest(1, coalesce(nullif(v_question ->> 'points', '')::numeric, 1));
    v_total := v_total + v_points;
    v_type := coalesce(v_question ->> 'type', 'Múltipla escolha');
    v_answer := p_answers ->> (v_question ->> 'id');
    v_correct := false;

    IF v_type = 'Múltipla escolha' THEN
      v_correct := v_answer IS NOT NULL
        AND v_answer = coalesce(v_question ->> 'correct_index', '');
    ELSE
      v_correct := v_answer IS NOT NULL
        AND nullif(v_question ->> 'model_answer', '') IS NOT NULL
        AND regexp_replace(lower(btrim(v_answer)), '\s+', ' ', 'g')
          = regexp_replace(lower(btrim(v_question ->> 'model_answer')), '\s+', ' ', 'g');
    END IF;

    IF v_correct THEN
      v_earned := v_earned + v_points;
    END IF;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Pontuação total inválida';
  END IF;

  v_percent := round((v_earned / v_total) * 100)::integer;
  v_score := round(v_percent::numeric / 10, 1);
  v_passed := v_percent >= coalesce(v_exam.min_approval_pct, 70);

  SELECT p.matricula, emp.id
  INTO v_matricula, v_employee_id
  FROM public.profiles p
  LEFT JOIN public.employees emp ON lower(btrim(emp.matricula)) = lower(btrim(p.matricula))
  WHERE p.id = auth.uid();

  INSERT INTO public.exam_attempts (
    exam_id,
    user_id,
    matricula,
    score,
    passed,
    answers
  ) VALUES (
    v_exam.id,
    auth.uid(),
    v_matricula,
    v_score,
    v_passed,
    p_answers
  )
  RETURNING * INTO v_attempt;

  IF v_passed AND v_matricula IS NOT NULL THEN
    v_completion_date := (coalesce(v_attempt.finished_at, v_attempt.created_at, now()) AT TIME ZONE 'America/Maceio')::date;
    UPDATE public.cronograma_entries ce
       SET status = 'Realizado',
           type = 'Realizado',
           completion_date = v_completion_date,
           justification = NULL
     WHERE ce.exam_id = v_exam.id
       AND (
         lower(btrim(ce.employee_matricula)) = lower(btrim(v_matricula))
         OR (v_employee_id IS NOT NULL AND ce.employee_id = v_employee_id)
       )
       AND ce.status <> 'Realizado';
  END IF;

  RETURN v_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.list_available_exams() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exam_for_attempt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_available_exams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_for_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) TO authenticated;
