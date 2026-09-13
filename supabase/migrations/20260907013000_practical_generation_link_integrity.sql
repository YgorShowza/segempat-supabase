-- Compatibilidade temporária do preview: mantém a geração recorrente de avaliações práticas
-- com o mesmo vínculo 1:1 usado pela API/MySQL. Aplicações do mesmo tema no mesmo mês
-- não podem reutilizar o lançamento de outra data no Cronograma.

DO $$
BEGIN
  ALTER TABLE public.practical_evaluations
    ADD CONSTRAINT practical_evaluations_template_fk
    FOREIGN KEY (template_id) REFERENCES public.practical_eval_templates(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.sync_practical_evaluation_cronograma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marker text := '[PRACTICAL:' || NEW.id::text || ']';
  v_month text;
  v_entry public.cronograma_entries%rowtype;
  v_notes text;
  v_completion date;
BEGIN
  v_month := to_char(NEW.evaluation_date, 'YYYY-MM');

  SELECT ce.* INTO v_entry
    FROM public.cronograma_entries ce
   WHERE ce.employee_id = NEW.employee_id
     AND position(v_marker in COALESCE(ce.notes, '')) > 0
   ORDER BY ce.created_at
   LIMIT 1
   FOR UPDATE;

  IF v_entry.id IS NULL THEN
    SELECT ce.* INTO v_entry
      FROM public.cronograma_entries ce
     WHERE ce.employee_id = NEW.employee_id
       AND ce.month = v_month
       AND lower(btrim(ce.theme)) = lower(btrim(NEW.title))
       AND ce.planned_date = NEW.evaluation_date
       AND ce.exam_id IS NULL
     ORDER BY CASE ce.status WHEN 'Pendente' THEN 0 WHEN 'Justificado' THEN 1 ELSE 2 END, ce.created_at
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF NEW.status = 'Concluída' THEN
    v_completion := COALESCE((NEW.completed_at AT TIME ZONE 'America/Maceio')::date, (now() AT TIME ZONE 'America/Maceio')::date);

    IF v_entry.id IS NOT NULL AND v_entry.status = 'Justificado' THEN
      RAISE EXCEPTION 'O lançamento vinculado está justificado. Planeje uma nova avaliação prática em vez de sobrescrever esse histórico.';
    END IF;

    IF v_entry.id IS NOT NULL THEN
      v_notes := CASE
        WHEN position(v_marker in COALESCE(v_entry.notes, '')) > 0 THEN v_entry.notes
        WHEN NULLIF(btrim(COALESCE(v_entry.notes, '')), '') IS NULL THEN v_marker
        ELSE v_entry.notes || E'\n' || v_marker
      END;
      UPDATE public.cronograma_entries
         SET status = 'Realizado',
             type = 'Realizado',
             completion_date = v_completion,
             justification = NULL,
             theme = NEW.title,
             notes = v_notes
       WHERE id = v_entry.id;
    ELSE
      INSERT INTO public.cronograma_entries(
        month, employee_id, employee_name, employee_matricula, employee_sector,
        theme, exam_id, exam_title, type, status, justification, planned_date,
        completion_date, notes, question_bank_ids, created_by
      ) VALUES (
        v_month,
        NEW.employee_id, NEW.employee_name, NEW.employee_matricula, NEW.employee_sector,
        NEW.title, NULL, NULL, 'Realizado', 'Realizado', NULL, NEW.evaluation_date,
        v_completion, v_marker, '{}'::uuid[], NEW.evaluator_id
      );
    END IF;

    RETURN NEW;
  END IF;

  IF v_entry.id IS NOT NULL THEN
    IF v_entry.status = 'Pendente' THEN
      v_notes := CASE
        WHEN position(v_marker in COALESCE(v_entry.notes, '')) > 0 THEN v_entry.notes
        WHEN NULLIF(btrim(COALESCE(v_entry.notes, '')), '') IS NULL THEN v_marker
        ELSE v_entry.notes || E'\n' || v_marker
      END;
      UPDATE public.cronograma_entries
         SET month = v_month,
             theme = NEW.title,
             planned_date = NEW.evaluation_date,
             notes = v_notes
       WHERE id = v_entry.id;
    ELSIF position(v_marker in COALESCE(v_entry.notes, '')) > 0 THEN
      RAISE EXCEPTION 'A avaliação está vinculada a um lançamento de Cronograma já formalizado. Planeje uma nova avaliação para continuar.';
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.cronograma_entries(
    month, employee_id, employee_name, employee_matricula, employee_sector,
    theme, exam_id, exam_title, type, status, justification, planned_date,
    completion_date, notes, question_bank_ids, created_by
  ) VALUES (
    v_month, NEW.employee_id, NEW.employee_name, NEW.employee_matricula, NEW.employee_sector,
    NEW.title, NULL, NULL, 'Planejado', 'Pendente', NULL, NEW.evaluation_date,
    NULL, v_marker, '{}'::uuid[], NEW.evaluator_id
  );

  RETURN NEW;
END;
$function$;
