-- SEGEMPAT · sincroniza Avaliação Prática com o Cronograma no fallback Supabase.
-- A API MySQL possui a regra equivalente no practical-integrity router.

CREATE OR REPLACE FUNCTION public.guard_practical_evaluation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee public.employees%rowtype;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'Concluída' THEN
      RAISE EXCEPTION 'Avaliação prática concluída pertence ao histórico operacional e não pode ser excluída';
    END IF;

    DELETE FROM public.cronograma_entries ce
     WHERE ce.employee_id = OLD.employee_id
       AND ce.status = 'Pendente'
       AND position(('[PRACTICAL:' || OLD.id::text || ']') in COALESCE(ce.notes, '')) > 0;
    RETURN OLD;
  END IF;

  SELECT * INTO v_employee
    FROM public.employees e
   WHERE e.id = NEW.employee_id
     AND e.status = 'Ativo'
     AND e.access_profile <> 'Inspetor'
   LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'Avaliação prática exige colaborador operacional ativo';
  END IF;

  NEW.employee_name := v_employee.full_name;
  NEW.employee_matricula := v_employee.matricula;
  NEW.employee_sector := v_employee.sector;

  IF NEW.max_score IS NULL OR NEW.max_score <= 0 THEN
    RAISE EXCEPTION 'Nota máxima inválida';
  END IF;
  IF NEW.score IS NULL OR NEW.score < 0 OR NEW.score > NEW.max_score THEN
    RAISE EXCEPTION 'Nota da avaliação prática inválida';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'Concluída' AND NEW.status <> 'Concluída' THEN
    RAISE EXCEPTION 'Avaliação prática concluída pertence ao histórico e não pode ser reaberta';
  END IF;

  IF NEW.status = 'Concluída' THEN
    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(COALESCE(NEW.checklist, '[]'::jsonb)) item
       WHERE COALESCE((item ->> 'done')::boolean, false) IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'Conclua todos os itens do checklist antes de finalizar a avaliação prática';
    END IF;
    NEW.completed_at := COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.completed_at ELSE NULL END, NEW.completed_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_practical_evaluation_cronograma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marker text := '[PRACTICAL:' || NEW.id::text || ']';
  v_month text;
  v_entry public.cronograma_entries%rowtype;
  v_notes text;
  v_completion date;
BEGIN
  IF NEW.evaluation_date IS NOT NULL THEN
    v_month := to_char(NEW.evaluation_date, 'YYYY-MM');
  END IF;

  SELECT ce.* INTO v_entry
    FROM public.cronograma_entries ce
   WHERE ce.employee_id = NEW.employee_id
     AND position(v_marker in COALESCE(ce.notes, '')) > 0
   ORDER BY ce.created_at
   LIMIT 1
   FOR UPDATE;

  IF v_entry.id IS NULL AND v_month IS NOT NULL THEN
    SELECT ce.* INTO v_entry
      FROM public.cronograma_entries ce
     WHERE ce.employee_id = NEW.employee_id
       AND ce.month = v_month
       AND lower(btrim(ce.theme)) = lower(btrim(NEW.title))
       AND ce.exam_id IS NULL
     ORDER BY CASE ce.status WHEN 'Pendente' THEN 0 WHEN 'Justificado' THEN 1 ELSE 2 END, ce.created_at
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF NEW.status = 'Concluída' THEN
    v_completion := COALESCE(NEW.evaluation_date, (now() AT TIME ZONE 'America/Maceio')::date);

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
        COALESCE(v_month, to_char(v_completion, 'YYYY-MM')),
        NEW.employee_id, NEW.employee_name, NEW.employee_matricula, NEW.employee_sector,
        NEW.title, NULL, NULL, 'Realizado', 'Realizado', NULL, NEW.evaluation_date,
        v_completion, v_marker, '{}'::uuid[], NEW.evaluator_id
      );
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.evaluation_date IS NULL THEN
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
$$;

REVOKE ALL ON FUNCTION public.guard_practical_evaluation_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_practical_evaluation_cronograma() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS practical_evaluations_integrity_guard ON public.practical_evaluations;
CREATE TRIGGER practical_evaluations_integrity_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.practical_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.guard_practical_evaluation_integrity();

DROP TRIGGER IF EXISTS practical_evaluations_cronograma_sync ON public.practical_evaluations;
CREATE TRIGGER practical_evaluations_cronograma_sync
AFTER INSERT OR UPDATE ON public.practical_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.sync_practical_evaluation_cronograma();
