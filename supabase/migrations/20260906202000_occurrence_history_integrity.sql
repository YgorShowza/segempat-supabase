-- SEGEMPAT · preserva o ciclo formal das ocorrências no fallback Supabase.

CREATE OR REPLACE FUNCTION public.guard_occurrence_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'Aberta' THEN
      RAISE EXCEPTION 'Ocorrência em análise ou concluída pertence ao histórico operacional e não pode ser excluída';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'Concluída' THEN
    RAISE EXCEPTION 'Ocorrência concluída pertence ao histórico operacional e não pode ser alterada';
  END IF;

  IF NEW.status = 'Concluída' THEN
    IF NULLIF(btrim(COALESCE(NEW.resolution_notes, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Informe as notas de conclusão antes de concluir a ocorrência';
    END IF;
    NEW.resolved_at := now();
  ELSE
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_occurrence_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS occurrences_history_guard ON public.occurrences;
CREATE TRIGGER occurrences_history_guard
BEFORE UPDATE OR DELETE ON public.occurrences
FOR EACH ROW
EXECUTE FUNCTION public.guard_occurrence_history();
