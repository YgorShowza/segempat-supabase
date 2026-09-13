-- SEGEMPAT · formalização documental de certificados
-- Um certificado só existe/valida formalmente após aprovação + assinatura eletrônica completa.

CREATE OR REPLACE FUNCTION public.issue_certificate_from_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam_title text;
  v_employee_name text;
  v_code text;
BEGIN
  IF NEW.passed IS NOT TRUE
     OR NEW.signature_agreed IS NOT TRUE
     OR NEW.signature_path IS NULL
     OR NEW.signed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_exam_title FROM public.exams WHERE id = NEW.exam_id;
  SELECT nome INTO v_employee_name FROM public.profiles WHERE id = NEW.user_id;
  v_code := 'SEG-' || upper(substr(md5(NEW.id::text), 1, 12));

  INSERT INTO public.certificates(
    attempt_id,user_id,matricula,employee_name,exam_id,exam_title,score,verification_code,issued_at
  ) VALUES (
    NEW.id,NEW.user_id,NEW.matricula,
    COALESCE(v_employee_name,NEW.matricula,'Colaborador'),
    NEW.exam_id,COALESCE(v_exam_title,'Avaliação SEGEMPAT'),NEW.score,v_code,
    COALESCE(NEW.signed_at,NEW.finished_at,NEW.created_at,now())
  )
  ON CONFLICT (attempt_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS issue_certificate_after_attempt ON public.exam_attempts;
CREATE TRIGGER issue_certificate_after_attempt
AFTER INSERT OR UPDATE OF passed, signature_agreed, signature_path, signed_at
ON public.exam_attempts
FOR EACH ROW
WHEN (NEW.passed IS TRUE)
EXECUTE FUNCTION public.issue_certificate_from_attempt();

-- Preserva rastreabilidade de eventuais registros antigos, mas invalida formalização incompleta.
UPDATE public.certificates c
SET revoked = true,
    revoked_at = COALESCE(c.revoked_at, now()),
    revoked_reason = COALESCE(c.revoked_reason, 'Formalização anterior sem assinatura eletrônica completa')
WHERE c.revoked = false
  AND EXISTS (
    SELECT 1
    FROM public.exam_attempts ea
    WHERE ea.id = c.attempt_id
      AND NOT (
        ea.passed IS TRUE
        AND ea.signature_agreed IS TRUE
        AND ea.signature_path IS NOT NULL
        AND ea.signed_at IS NOT NULL
      )
  );

CREATE OR REPLACE FUNCTION public.validate_certificate(p_code text)
RETURNS TABLE(
  is_valid boolean,
  employee_name text,
  exam_title text,
  score numeric,
  issued_at timestamptz,
  verification_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Validação restrita à Inspetoria';
  END IF;

  RETURN QUERY
  SELECT
    (NOT c.revoked) AS is_valid,
    c.employee_name,
    c.exam_title,
    c.score,
    c.issued_at,
    c.verification_code
  FROM public.certificates c
  JOIN public.exam_attempts ea ON ea.id = c.attempt_id
  WHERE upper(c.verification_code) = upper(trim(p_code))
    AND ea.passed IS TRUE
    AND ea.signature_agreed IS TRUE
    AND ea.signature_path IS NOT NULL
    AND ea.signed_at IS NOT NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_certificate(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_certificate(text) TO authenticated;
