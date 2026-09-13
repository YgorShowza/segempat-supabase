-- SEGEMPAT · preserva referências do Banco de Questões usadas pelo Cronograma.
-- Questão já vinculada não é apagada; deve ser desativada para manter rastreabilidade.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_question_bank_admin(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito à Inspetoria';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.question_bank qb WHERE qb.id = p_id) THEN
    RAISE EXCEPTION 'Questão não encontrada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cronograma_entries ce
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(ce.question_bank_ids, '[]'::jsonb)) linked(question_id)
    WHERE linked.question_id = p_id::text
  ) THEN
    RAISE EXCEPTION 'Questão vinculada ao Cronograma não pode ser excluída. Desative-a para preservar o histórico operacional.';
  END IF;

  DELETE FROM public.question_bank WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_question_bank_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_question_bank_admin(uuid) TO authenticated;

COMMIT;
