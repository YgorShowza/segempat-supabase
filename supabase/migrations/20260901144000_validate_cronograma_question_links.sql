-- Garante integridade dos vínculos entre Cronograma e Banco de Questões.
-- Protege inserts/updates vindos de qualquer fluxo, não apenas da interface atual.

CREATE OR REPLACE FUNCTION public.validate_cronograma_question_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected integer;
  v_valid integer;
BEGIN
  NEW.question_bank_ids := coalesce(NEW.question_bank_ids, ARRAY[]::uuid[]);
  v_expected := cardinality(NEW.question_bank_ids);

  IF v_expected = 0 THEN
    RETURN NEW;
  END IF;

  IF cardinality(ARRAY(SELECT DISTINCT unnest(NEW.question_bank_ids))) <> v_expected THEN
    RAISE EXCEPTION 'Existem questões duplicadas vinculadas ao lançamento';
  END IF;

  SELECT count(*) INTO v_valid
  FROM public.question_bank q
  WHERE q.id = ANY(NEW.question_bank_ids)
    AND q.active = true
    AND (q.target_sector = 'Todos' OR q.target_sector = NEW.employee_sector);

  IF v_valid <> v_expected THEN
    RAISE EXCEPTION 'Uma ou mais questões vinculadas estão inativas, inexistentes ou incompatíveis com o setor %', NEW.employee_sector;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cronograma_question_links ON public.cronograma_entries;
CREATE TRIGGER trg_validate_cronograma_question_links
BEFORE INSERT OR UPDATE OF employee_sector, question_bank_ids
ON public.cronograma_entries
FOR EACH ROW
EXECUTE FUNCTION public.validate_cronograma_question_links();

REVOKE ALL ON FUNCTION public.validate_cronograma_question_links() FROM PUBLIC, anon, authenticated;
