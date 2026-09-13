CREATE OR REPLACE FUNCTION public.enforce_training_schedule_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_attention_days integer;
  v_today date := (now() AT TIME ZONE 'America/Maceio')::date;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'Não é permitido trocar o colaborador de um ciclo existente';
  END IF;

  SELECT e.* INTO v_employee
    FROM public.employees e
   WHERE e.id = NEW.employee_id
   LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;
  IF v_employee.status <> 'Ativo' THEN
    RAISE EXCEPTION 'O ciclo só pode ser mantido para colaborador ativo';
  END IF;
  IF v_employee.access_profile = 'Inspetor' THEN
    RAISE EXCEPTION 'Ciclo operacional não pode ser vinculado a Inspetor';
  END IF;
  IF NEW.cycle_days < 1 OR NEW.cycle_days > 3650 THEN
    RAISE EXCEPTION 'Ciclo de treinamento inválido';
  END IF;

  NEW.employee_name := v_employee.full_name;
  NEW.employee_matricula := v_employee.matricula;

  IF NEW.last_training_date IS NULL THEN
    NEW.window_start := NULL;
    NEW.window_end := NULL;
    NEW.status := 'Vencido';
  ELSE
    NEW.window_end := NEW.last_training_date + NEW.cycle_days;
    v_attention_days := LEAST(15, GREATEST(7, ROUND(NEW.cycle_days * 0.2)::integer));
    NEW.window_start := NEW.window_end - v_attention_days;
    NEW.status := CASE
      WHEN v_today > NEW.window_end THEN 'Vencido'
      WHEN v_today >= NEW.window_start THEN 'Próximo ao vencimento'
      ELSE 'Em dia'
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS training_schedules_integrity_guard ON public.training_schedules;
CREATE TRIGGER training_schedules_integrity_guard
BEFORE INSERT OR UPDATE ON public.training_schedules
FOR EACH ROW EXECUTE FUNCTION public.enforce_training_schedule_integrity();
