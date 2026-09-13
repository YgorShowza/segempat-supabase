CREATE OR REPLACE FUNCTION public.guard_cronograma_entry_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_finished_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('Realizado', 'Justificado') THEN
      RAISE EXCEPTION 'Lançamento realizado ou justificado pertence ao histórico operacional e não pode ser excluído';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'Realizado' THEN
    IF NEW.month IS DISTINCT FROM OLD.month
      OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
      OR NEW.employee_name IS DISTINCT FROM OLD.employee_name
      OR NEW.employee_matricula IS DISTINCT FROM OLD.employee_matricula
      OR NEW.employee_sector IS DISTINCT FROM OLD.employee_sector
      OR NEW.theme IS DISTINCT FROM OLD.theme
      OR NEW.exam_id IS DISTINCT FROM OLD.exam_id
      OR NEW.exam_title IS DISTINCT FROM OLD.exam_title
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.justification IS DISTINCT FROM OLD.justification
      OR NEW.planned_date IS DISTINCT FROM OLD.planned_date
      OR NEW.completion_date IS DISTINCT FROM OLD.completion_date
      OR NEW.question_bank_ids IS DISTINCT FROM OLD.question_bank_ids
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Lançamento realizado é histórico operacional; somente observações podem ser complementadas';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'Justificado' THEN
    IF NEW.month IS DISTINCT FROM OLD.month
      OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
      OR NEW.employee_name IS DISTINCT FROM OLD.employee_name
      OR NEW.employee_matricula IS DISTINCT FROM OLD.employee_matricula
      OR NEW.employee_sector IS DISTINCT FROM OLD.employee_sector
      OR NEW.theme IS DISTINCT FROM OLD.theme
      OR NEW.exam_id IS DISTINCT FROM OLD.exam_id
      OR NEW.exam_title IS DISTINCT FROM OLD.exam_title
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.planned_date IS DISTINCT FROM OLD.planned_date
      OR NEW.completion_date IS DISTINCT FROM OLD.completion_date
      OR NEW.question_bank_ids IS DISTINCT FROM OLD.question_bank_ids
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Lançamento justificado é histórico operacional; somente justificativa e observações podem ser complementadas';
    END IF;
  END IF;

  IF NEW.status = 'Realizado' THEN
    NEW.type := 'Realizado';
    NEW.justification := NULL;

    IF NEW.exam_id IS NOT NULL THEN
      SELECT MIN(COALESCE(a.finished_at, a.created_at))
        INTO v_finished_at
        FROM public.exam_attempts a
       WHERE a.exam_id = NEW.exam_id
         AND lower(btrim(COALESCE(a.matricula, ''))) = lower(btrim(COALESCE(NEW.employee_matricula, '')))
         AND a.passed IS TRUE;

      IF v_finished_at IS NULL THEN
        RAISE EXCEPTION 'Lançamento vinculado a prova só pode ser concluído após aprovação da prova pelo colaborador';
      END IF;

      NEW.completion_date := (v_finished_at AT TIME ZONE 'America/Maceio')::date;
    ELSIF NEW.completion_date IS NULL THEN
      RAISE EXCEPTION 'Atividade realizada sem prova vinculada exige data de conclusão';
    END IF;
  ELSIF NEW.status = 'Justificado' THEN
    IF NULLIF(btrim(COALESCE(NEW.justification, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Motivo é obrigatório para lançamento justificado';
    END IF;
    NEW.type := 'Planejado';
    NEW.completion_date := NULL;
  ELSE
    NEW.type := 'Planejado';
    NEW.completion_date := NULL;
    NEW.justification := NULL;
  END IF;

  RETURN NEW;
END;
$function$;
