-- SEGEMPAT · entrega segura de provas ao Operador
-- O cliente Operador recebe apenas metadados e questões sem chave de correção.

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
  ORDER BY e.created_at DESC;
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
  LIMIT 1;

  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Prova indisponível';
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

REVOKE ALL ON FUNCTION public.list_available_exams() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exam_for_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_available_exams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_for_attempt(uuid) TO authenticated;
