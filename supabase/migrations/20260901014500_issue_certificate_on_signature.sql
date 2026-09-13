-- Garante que o certificado legado seja emitido somente após aprovação + assinatura formal.

DROP TRIGGER IF EXISTS issue_certificate_after_attempt ON public.exam_attempts;

CREATE TRIGGER issue_certificate_after_attempt
AFTER INSERT OR UPDATE OF passed, signature_agreed, signature_path, signed_at
ON public.exam_attempts
FOR EACH ROW
EXECUTE FUNCTION public.issue_certificate_from_attempt();
