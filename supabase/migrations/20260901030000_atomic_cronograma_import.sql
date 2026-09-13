-- Importação de resultados do Cronograma em uma única transação lógica.
-- Qualquer erro aborta a chamada inteira, evitando importações parciais.

CREATE OR REPLACE FUNCTION public.cronograma_import_norm(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    lower(translate(coalesce(p_value,''),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc')),
    '[^a-z0-9]+', '', 'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.import_cronograma_results(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_employee public.employees%rowtype;
  v_pending public.cronograma_entries%rowtype;
  v_month text;
  v_matricula text;
  v_theme text;
  v_completion date;
  v_score numeric;
  v_note text;
  v_created int := 0;
  v_updated int := 0;
  v_ignored int := 0;
  v_seen text[] := ARRAY[]::text[];
  v_key text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas a Inspetoria pode importar resultados';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Nenhum registro válido foi enviado para importação';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_matricula := trim(coalesce(v_row->>'matricula',''));
    v_theme := trim(coalesce(v_row->>'tema',''));
    v_month := trim(coalesce(v_row->>'month',''));

    IF v_matricula = '' THEN RAISE EXCEPTION 'Matrícula ausente na importação'; END IF;
    IF v_theme = '' THEN RAISE EXCEPTION 'Tema ausente na importação'; END IF;
    IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Mês inválido para a matrícula %', v_matricula; END IF;

    BEGIN
      v_score := (v_row->>'nota')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Nota inválida para a matrícula %', v_matricula;
    END;
    IF v_score < 0 OR v_score > 10 THEN RAISE EXCEPTION 'Nota fora do intervalo 0–10 para a matrícula %', v_matricula; END IF;

    BEGIN
      v_completion := (v_row->>'completion_date')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Data de conclusão inválida para a matrícula %', v_matricula;
    END;
    IF to_char(v_completion, 'YYYY-MM') <> v_month THEN
      RAISE EXCEPTION 'Data de conclusão não pertence ao mês informado para a matrícula %', v_matricula;
    END IF;

    SELECT * INTO v_employee
    FROM public.employees e
    WHERE public.cronograma_import_norm(e.matricula) = public.cronograma_import_norm(v_matricula)
      AND e.status = 'Ativo'
      AND e.access_profile <> 'Inspetor'
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula % não corresponde a colaborador operacional ativo', v_matricula; END IF;

    v_key := public.cronograma_import_norm(v_matricula) || '|' || public.cronograma_import_norm(v_theme) || '|' || v_month;
    IF v_key = ANY(v_seen) THEN
      v_ignored := v_ignored + 1;
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_key);

    v_note := format('Importado da planilha · Nota %s', trim(to_char(v_score, 'FM990D0')));

    SELECT * INTO v_pending
    FROM public.cronograma_entries ce
    WHERE ce.month = v_month
      AND ce.employee_id = v_employee.id
      AND public.cronograma_import_norm(ce.theme) = public.cronograma_import_norm(v_theme)
      AND ce.status = 'Pendente'
    ORDER BY ce.planned_date NULLS LAST, ce.created_at
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.cronograma_entries
      SET status = 'Realizado',
          type = 'Realizado',
          completion_date = v_completion,
          justification = NULL,
          notes = CASE WHEN coalesce(trim(v_pending.notes),'') = '' THEN v_note ELSE v_pending.notes || ' · ' || v_note END
      WHERE id = v_pending.id;
      v_updated := v_updated + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.cronograma_entries ce
      WHERE ce.month = v_month
        AND ce.employee_id = v_employee.id
        AND public.cronograma_import_norm(ce.theme) = public.cronograma_import_norm(v_theme)
        AND ce.status = 'Realizado'
    ) THEN
      v_ignored := v_ignored + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.cronograma_entries(
      month, employee_id, employee_name, employee_matricula, employee_sector,
      theme, type, status, completion_date, notes, created_by
    ) VALUES (
      v_month, v_employee.id, v_employee.full_name, v_employee.matricula, v_employee.sector,
      v_theme, 'Realizado', 'Realizado', v_completion, v_note, auth.uid()
    );
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated, 'created', v_created, 'ignored', v_ignored);
END;
$$;

REVOKE ALL ON FUNCTION public.import_cronograma_results(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_cronograma_results(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.cronograma_import_norm(text) FROM PUBLIC, anon, authenticated;
