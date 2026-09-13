-- Criação atômica e validada de lançamentos do Cronograma.
-- Evita geração anual/lote parcialmente persistido quando uma linha falha.

CREATE OR REPLACE FUNCTION public.create_cronograma_entries_atomic(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_employee public.employees%rowtype;
  v_month text;
  v_theme text;
  v_type text;
  v_status text;
  v_justification text;
  v_planned_date date;
  v_completion_date date;
  v_exam_id uuid;
  v_exam_title text;
  v_question_ids uuid[];
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas a Inspetoria pode criar lançamentos do Cronograma';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Nenhum lançamento válido foi informado';
  END IF;

  IF jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'Limite máximo de 5000 lançamentos por operação';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_month := btrim(coalesce(v_row->>'month',''));
    v_theme := btrim(coalesce(v_row->>'theme',''));
    v_type := coalesce(nullif(btrim(v_row->>'type'),''),'Planejado');
    v_status := coalesce(nullif(btrim(v_row->>'status'),''),'Pendente');
    v_justification := nullif(btrim(v_row->>'justification'),'');

    IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'Mês inválido no Cronograma: %', v_month;
    END IF;
    IF v_theme = '' THEN RAISE EXCEPTION 'Tema obrigatório no Cronograma'; END IF;
    IF v_type NOT IN ('Planejado','Realizado') THEN RAISE EXCEPTION 'Tipo inválido: %', v_type; END IF;
    IF v_status NOT IN ('Pendente','Realizado','Justificado') THEN RAISE EXCEPTION 'Situação inválida: %', v_status; END IF;
    IF v_status = 'Justificado' AND v_justification IS NULL THEN RAISE EXCEPTION 'Justificativa obrigatória para lançamento justificado'; END IF;

    SELECT e.* INTO v_employee
    FROM public.employees e
    WHERE e.id = nullif(v_row->>'employee_id','')::uuid
      AND e.status = 'Ativo'
      AND e.access_profile <> 'Inspetor'
    LIMIT 1;
    IF v_employee.id IS NULL THEN RAISE EXCEPTION 'Colaborador operacional ativo não encontrado'; END IF;

    BEGIN
      v_planned_date := nullif(v_row->>'planned_date','')::date;
      v_completion_date := nullif(v_row->>'completion_date','')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Data inválida em lançamento do Cronograma';
    END;

    IF v_planned_date IS NOT NULL AND to_char(v_planned_date,'YYYY-MM') <> v_month THEN
      RAISE EXCEPTION 'Data prevista fora do mês do lançamento para %', v_employee.matricula;
    END IF;
    IF v_completion_date IS NOT NULL AND to_char(v_completion_date,'YYYY-MM') <> v_month THEN
      RAISE EXCEPTION 'Data de realização fora do mês do lançamento para %', v_employee.matricula;
    END IF;

    v_exam_id := NULL;
    v_exam_title := NULL;
    IF nullif(v_row->>'exam_id','') IS NOT NULL THEN
      v_exam_id := (v_row->>'exam_id')::uuid;
      SELECT e.title INTO v_exam_title FROM public.exams e WHERE e.id=v_exam_id LIMIT 1;
      IF v_exam_title IS NULL THEN RAISE EXCEPTION 'Prova vinculada não encontrada'; END IF;
    ELSE
      v_exam_title := nullif(btrim(v_row->>'exam_title'),'');
    END IF;

    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_question_ids
    FROM jsonb_array_elements_text(coalesce(v_row->'question_bank_ids','[]'::jsonb));

    INSERT INTO public.cronograma_entries(
      month, employee_id, employee_name, employee_matricula, employee_sector,
      theme, exam_id, exam_title, type, status, justification,
      planned_date, completion_date, notes, question_bank_ids, created_by
    ) VALUES (
      v_month, v_employee.id, v_employee.full_name, v_employee.matricula, v_employee.sector,
      v_theme, v_exam_id, v_exam_title, v_type, v_status, v_justification,
      v_planned_date, v_completion_date, nullif(btrim(v_row->>'notes'),''), v_question_ids, auth.uid()
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('created',v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.create_cronograma_entries_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cronograma_entries_atomic(jsonb) TO authenticated;
