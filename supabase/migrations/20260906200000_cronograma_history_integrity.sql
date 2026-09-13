-- SEGEMPAT · integridade do Cronograma no fallback Supabase do preview.
-- O banco corporativo definitivo usa a regra equivalente na migration MySQL 002.

CREATE OR REPLACE FUNCTION public.guard_cronograma_entry_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_finished_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('Realizado', 'Justificado') THEN
      RAISE EXCEPTION 'Lançamento realizado ou justificado pertence ao histórico operacional e não pode ser excluído';
    END IF;
    RETURN OLD;
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
$$;

REVOKE ALL ON FUNCTION public.guard_cronograma_entry_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cronograma_entries_history_guard ON public.cronograma_entries;
CREATE TRIGGER cronograma_entries_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.cronograma_entries
FOR EACH ROW
EXECUTE FUNCTION public.guard_cronograma_entry_history();
