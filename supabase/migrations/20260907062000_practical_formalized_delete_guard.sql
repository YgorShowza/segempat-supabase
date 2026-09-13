-- Compatibilidade temporária do preview: preserva o mesmo histórico protegido pela API/MySQL.
-- Se o Cronograma vinculado à avaliação já foi Realizado ou Justificado, a avaliação
-- não pode ser excluída mesmo que seu status ainda seja Planejada.

CREATE OR REPLACE FUNCTION public.guard_practical_evaluation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_employee public.employees%rowtype;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'Planejada' THEN
      RAISE EXCEPTION 'Avaliação prática em andamento ou concluída pertence ao histórico operacional e não pode ser excluída';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.cronograma_entries ce
       WHERE ce.employee_id = OLD.employee_id
         AND position(('[PRACTICAL:' || OLD.id::text || ']') in COALESCE(ce.notes, '')) > 0
         AND ce.status <> 'Pendente'
    ) THEN
      RAISE EXCEPTION 'Avaliação prática vinculada a Cronograma formalizado pertence ao histórico e não pode ser excluída';
    END IF;

    DELETE FROM public.cronograma_entries ce
     WHERE ce.employee_id = OLD.employee_id
       AND ce.status = 'Pendente'
       AND position(('[PRACTICAL:' || OLD.id::text || ']') in COALESCE(ce.notes, '')) > 0;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'Concluída' THEN
    RAISE EXCEPTION 'Avaliação prática concluída pertence ao histórico operacional e não pode ser alterada';
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

  IF NEW.evaluation_date IS NULL THEN
    RAISE EXCEPTION 'Informe a data da avaliação para sincronizar com o Cronograma';
  END IF;

  IF NEW.max_score IS NULL OR NEW.max_score <= 0 THEN
    RAISE EXCEPTION 'Nota máxima inválida';
  END IF;
  IF NEW.score IS NULL OR NEW.score < 0 OR NEW.score > NEW.max_score THEN
    RAISE EXCEPTION 'Nota da avaliação prática inválida';
  END IF;
  IF NEW.min_approval_score IS NULL OR NEW.min_approval_score < 0 OR NEW.min_approval_score > 10 THEN
    RAISE EXCEPTION 'Nota mínima da avaliação prática inválida';
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
  ELSE
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_practical_evaluation_integrity() FROM PUBLIC, anon, authenticated;
