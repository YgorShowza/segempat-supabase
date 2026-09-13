-- Preserve operational history when an employee already participated in SEGEMPAT.
-- Linked or historical employees must be inactivated instead of deleted/renumbered.
CREATE OR REPLACE FUNCTION public.protect_linked_employee_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_account boolean;
  v_has_history boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(trim(p.matricula)) = lower(trim(OLD.matricula))
  ) INTO v_has_account;

  SELECT
    EXISTS (SELECT 1 FROM public.cronograma_entries ce WHERE ce.employee_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.cronograma_suspensions cs WHERE cs.employee_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.occurrences o WHERE o.employee_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.practical_evaluations pe WHERE pe.employee_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.training_activity_attempts ta WHERE ta.employee_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.training_schedules ts WHERE ts.employee_id = OLD.id)
    OR EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE lower(trim(coalesce(ea.matricula, ''))) = lower(trim(OLD.matricula))
    )
    OR EXISTS (
      SELECT 1 FROM public.certificates c
      WHERE lower(trim(coalesce(c.matricula, ''))) = lower(trim(OLD.matricula))
    )
  INTO v_has_history;

  IF TG_OP = 'DELETE' THEN
    IF v_has_account OR v_has_history THEN
      RAISE EXCEPTION 'Colaborador possui conta ou histórico operacional. Inative o cadastro em vez de excluir.';
    END IF;
    RETURN OLD;
  END IF;

  IF lower(trim(NEW.matricula)) IS DISTINCT FROM lower(trim(OLD.matricula))
     AND (v_has_account OR v_has_history) THEN
    RAISE EXCEPTION 'Matrícula de colaborador com conta ou histórico operacional não pode ser alterada diretamente.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_linked_employee_identity() FROM PUBLIC, anon, authenticated;
