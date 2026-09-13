-- Compatibilidade temporária do preview: mantém o sincronismo Avaliação Prática -> Cronograma
-- alinhado à API/MySQL também para registros históricos sem evaluation_date.
--
-- A migration 20260907013000 tornou o vínculo por data exata (necessário para múltiplas
-- aplicações do mesmo modelo no mês), mas ao redefinir a função removeu o tratamento
-- de evaluation_date nula que já existia. Registros legados sem data podiam falhar ao
-- serem atualizados/concluídos no preview, enquanto a API corporativa trata esse caso.

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
       AND ce.planned_date = NEW.evaluation_date
       AND ce.exam_id IS NULL
     ORDER BY CASE ce.status WHEN 'Pendente' THEN 0 WHEN 'Justificado' THEN 1 ELSE 2 END, ce.created_at
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF NEW.status = 'Concluída' THEN
    v_completion := COALESCE(
      CASE
        WHEN NEW.completed_at IS NULL THEN NULL
        ELSE (NEW.completed_at AT TIME ZONE 'America/Maceio')::date
      END,
      (now() AT TIME ZONE 'America/Maceio')::date
    );

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

  -- Igual à API/MySQL: um registro legado sem data pode permanecer/ser editado,
  -- mas só entra no Cronograma quando possuir uma data operacional definida.
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
$function$;

-- A trigger já existe desde 20260906201000. Recriá-la aqui torna a migration
-- autossuficiente e evita deriva caso um ambiente de preview tenha sido provisionado
-- a partir de um conjunto parcial de migrations.
DROP TRIGGER IF EXISTS practical_evaluations_cronograma_sync ON public.practical_evaluations;
CREATE TRIGGER practical_evaluations_cronograma_sync
AFTER INSERT OR UPDATE ON public.practical_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.sync_practical_evaluation_cronograma();

REVOKE ALL ON FUNCTION public.sync_practical_evaluation_cronograma() FROM PUBLIC, anon, authenticated;