ALTER TABLE public.practical_evaluations
  ADD COLUMN IF NOT EXISTS template_id uuid NULL,
  ADD COLUMN IF NOT EXISTS template_slot text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS practical_evaluations_template_slot_unique_idx
  ON public.practical_evaluations(employee_id, template_id, template_slot)
  WHERE template_id IS NOT NULL AND template_slot IS NOT NULL;

CREATE INDEX IF NOT EXISTS practical_evaluations_template_idx
  ON public.practical_evaluations(template_id, evaluation_date);

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
  v_planned date;
  v_slot text;
  v_id uuid;
  v_checklist jsonb;
  v_created integer := 0;
  v_skipped integer := 0;
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
  SELECT COALESCE(p.full_name, 'Inspetoria') INTO v_evaluator_name FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1;
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
        v_planned := make_date(extract(year from v_base)::integer, extract(month from v_base)::integer, v_day);
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

  IF p_template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.practical_eval_templates WHERE id = p_template_id AND status = 'Ativo') THEN
    RAISE EXCEPTION 'Modelo ativo não encontrado';
  END IF;

  RETURN jsonb_build_object('month', p_month, 'created', v_created, 'skipped', v_skipped, 'due_templates', v_due_templates);
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_practical_evaluations_month(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_practical_evaluations_month(text, uuid) TO authenticated;
