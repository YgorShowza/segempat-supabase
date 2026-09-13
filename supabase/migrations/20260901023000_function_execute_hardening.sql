-- SEGEMPAT · menor privilégio em funções privilegiadas e funções de trigger

-- Helpers usados por RLS/RPCs: somente usuários autenticados.
REVOKE ALL ON FUNCTION public.is_active_employee_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_current_employee(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_employee_sector() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_employee_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_employee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_employee_sector() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- RPCs de aplicação: somente authenticated; validações internas continuam valendo.
REVOKE ALL ON FUNCTION public.generate_registration_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_registration_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sign_exam_attempt(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_training_activity(text,text,jsonb,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_exams_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exam_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_certificate(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_registration_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_registration_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_exam_attempt(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_training_activity(text,text,jsonb,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_exams_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_certificate(text) TO authenticated;

-- Funções exclusivas de trigger nunca devem ser chamadas diretamente pelo cliente.
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_certificate_from_attempt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_linked_employee_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_employee_access_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.assign_exam_attempt_certificate_code()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.assign_exam_attempt_certificate_code() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;
