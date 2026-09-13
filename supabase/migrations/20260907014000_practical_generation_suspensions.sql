-- Compatibilidade temporária do preview: aproxima a geração recorrente da API/MySQL.
-- Mês suspenso bloqueia a geração e ausências do operador deslocam a aplicação para
-- a data livre mais próxima dentro do mesmo mês.

CREATE OR REPLACE FUNCTION public.generate_practical_evaluations_month(p_month text, p_template_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base date;
  v_days integer;
  v_template public.practical_eval_templates%rowtype;
  v_employee public.employees%rowtype;
  v_apps integer;
  v_index integer;
  v_day integer;
  v_distance integer;
  v_candidate_day integer;
  v_planned date;
  v_slot text;
  v_id uuid;
  v_checklist jsonb;
  v_created integer := 0;
  v_skipped integer := 0;
  v_suspended integer := 0;
  v_due_templates integer := 0;
  v_evaluator_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas Inspetores podem gerar avaliações práticas recorrentes';
  END IF;

  IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;
  v_base := to_date(p_month || '-01', 'YYYY-MM-DD');
  IF to_char(v_base, 'YYYY-MM') <> p_month THEN RAISE EXCEPTION 'Mês inválido'; END IF;
  v_days := extract(day from (date_trunc('month', v_base) + interval '1 month - 1 day'))::integer;

  IF EXISTS (
    SELECT 1 FROM public.cronograma_suspensions
     WHERE month = p_month AND type = 'mes_suspenso'
  ) THEN
    RAISE EXCEPTION 'O mês % está suspenso no Cronograma', p_month;
  END IF;

  SELECT COALESCE(p.nome, 'Inspetoria')
    INTO v_evaluator_name
    FROM public.profiles p
   WHERE p.id = auth.uid()
   LIMIT 1;
  v_evaluator_name := COALESCE(v_evaluator_name, 'Inspetoria');

  FOR v_template IN
    SELECT * FROM public.practical_eval_templates
     WHERE status = 'Ativo'
       AND (p_template_id IS NULL OR id = p_template_id)
     ORDER BY title, id
  LOOP
    IF NOT (
      v_template.recurrence = 'once'
      OR v_template.recurrence = 'monthly'
      OR (v_template.recurrence = 'bimonthly' AND (extract(month from v_base)::integer - 1) % 2 = 0)
      OR (v_template.recurrence = 'quarterly' AND (extract(month from v_base)::integer - 1) % 3 = 0)
    ) THEN CONTINUE; END IF;

    v_due_templates := v_due_templates + 1;
    v_apps := CASE WHEN v_template.recurrence = 'once' THEN 1 ELSE greatest(1, least(31, v_template.applications_per_month)) END;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', COALESCE(NULLIF(task.value ->> 'id', ''), 'task_' || task.ordinality::text),
        'label', CASE
          WHEN NULLIF(btrim(COALESCE(task.value ->> 'category', '')), '') IS NULL THEN COALESCE(task.value ->> 'title', 'Procedimento')
          ELSE btrim(task.value ->> 'category') || ' · ' || COALESCE(task.value ->> 'title', 'Procedimento')
        END,
        'done', false
      ) ORDER BY task.ordinality
    ), '[]'::jsonb)
      INTO v_checklist
      FROM jsonb_array_elements(COALESCE(v_template.tasks, '[]'::jsonb)) WITH ORDINALITY AS task(value, ordinality);

    FOR v_employee IN
      SELECT * FROM public.employees
       WHERE status = 'Ativo'
         AND access_profile <> 'Inspetor'
         AND (v_template.target_sector = 'Todos' OR sector = v_template.target_sector)
       ORDER BY full_name, id
    LOOP
      FOR v_index IN 1..v_apps LOOP
        v_slot := CASE WHEN v_template.recurrence = 'once' THEN 'once' ELSE p_month || ':' || lpad(v_index::text, 2, '0') END;
        IF EXISTS (
          SELECT 1 FROM public.practical_evaluations
           WHERE employee_id = v_employee.id
             AND template_id = v_template.id
             AND template_slot = v_slot
        ) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        v_day := greatest(1, least(v_days, floor((v_index::numeric * (v_days + 1)) / (v_apps + 1))::integer));
        v_planned := NULL;

        FOR v_distance IN 0..(v_days - 1) LOOP
          FOR v_candidate_day IN
            SELECT candidate
              FROM unnest(CASE WHEN v_distance = 0 THEN ARRAY[v_day] ELSE ARRAY[v_day + v_distance, v_day - v_distance] END) candidate
          LOOP
            IF v_candidate_day < 1 OR v_candidate_day > v_days THEN CONTINUE; END IF;
            v_planned := make_date(extract(year from v_base)::integer, extract(month from v_base)::integer, v_candidate_day);

            IF EXISTS (
              SELECT 1 FROM public.cronograma_suspensions s
               WHERE s.month = p_month
                 AND s.type = 'ausencia_operador'
                 AND s.employee_id = v_employee.id
                 AND (s.date_start IS NULL OR v_planned >= s.date_start)
                 AND (s.date_end IS NULL OR v_planned <= s.date_end)
            ) THEN
              v_planned := NULL;
              CONTINUE;
            END IF;

            IF EXISTS (
              SELECT 1 FROM public.practical_evaluations pe
               WHERE pe.employee_id = v_employee.id
                 AND pe.template_id = v_template.id
                 AND pe.evaluation_date = v_planned
            ) OR EXISTS (
              SELECT 1 FROM public.cronograma_entries ce
               WHERE ce.employee_id = v_employee.id
                 AND ce.month = p_month
                 AND lower(btrim(ce.theme)) = lower(btrim(v_template.title))
                 AND ce.planned_date = v_planned
            ) THEN
              v_planned := NULL;
              CONTINUE;
            END IF;

            EXIT;
          END LOOP;
          EXIT WHEN v_planned IS NOT NULL;
        END LOOP;

        IF v_planned IS NULL THEN
          v_suspended := v_suspended + 1;
          CONTINUE;
        END IF;

        v_id := gen_random_uuid();
        INSERT INTO public.practical_evaluations(
          id, employee_id, employee_name, employee_matricula, employee_sector, title,
          template_id, template_slot, evaluator_id, evaluator_name, status, score, max_score,
          min_approval_score, checklist, notes, evaluation_date, completed_at
        ) VALUES (
          v_id, v_employee.id, v_employee.full_name, v_employee.matricula, v_employee.sector, v_template.title,
          v_template.id, v_slot, auth.uid(), v_evaluator_name, 'Planejada', 0, 10,
          v_template.min_approval_score, v_checklist, v_template.description, v_planned, NULL
        );
        v_created := v_created + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  IF p_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.practical_eval_templates WHERE id = p_template_id AND status = 'Ativo'
  ) THEN
    RAISE EXCEPTION 'Modelo ativo não encontrado';
  END IF;

  RETURN jsonb_build_object(
    'month', p_month,
    'created', v_created,
    'skipped', v_skipped,
    'suspended', v_suspended,
    'due_templates', v_due_templates
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_practical_evaluations_month(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_practical_evaluations_month(text, uuid) TO authenticated;
