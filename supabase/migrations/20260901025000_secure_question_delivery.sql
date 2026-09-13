-- SEGEMPAT · entrega segura do Banco de Questões
-- Admin recebe dados completos; atividades operacionais recebem conteúdo sem gabarito/explicação.

CREATE OR REPLACE FUNCTION public.list_question_bank_admin()
RETURNS SETOF public.question_bank
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso administrativo necessário';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.question_bank
  ORDER BY active DESC, theme ASC NULLS LAST, question_text ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_operational_questions()
RETURNS TABLE (
  id uuid,
  bank_type text,
  question_text text,
  options jsonb,
  target_sector text,
  difficulty text,
  theme text,
  active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_sector text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  v_sector := public.current_employee_sector();

  IF NOT v_is_admin AND NOT public.is_active_employee_user() THEN
    RAISE EXCEPTION 'Colaborador inativo ou sem vínculo ativo';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.bank_type,
    q.question_text,
    q.options,
    q.target_sector,
    q.difficulty,
    q.theme,
    q.active,
    q.created_at
  FROM public.question_bank q
  WHERE q.active = true
    AND (
      v_is_admin
      OR q.target_sector = 'Todos'
      OR q.target_sector = v_sector
    )
  ORDER BY q.theme ASC NULLS LAST, q.question_text ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_question_bank_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_operational_questions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_question_bank_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_operational_questions() TO authenticated;
