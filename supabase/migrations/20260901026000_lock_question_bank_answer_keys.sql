-- SEGEMPAT · bloqueio definitivo do gabarito do Banco de Questões
-- Leituras completas são administrativas via RPC; atividades usam RPC sanitizada.

REVOKE SELECT ON public.question_bank FROM authenticated;
GRANT INSERT, UPDATE, DELETE ON public.question_bank TO authenticated;

REVOKE ALL ON FUNCTION public.list_question_bank_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_operational_questions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_question_bank_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_operational_questions() TO authenticated;
