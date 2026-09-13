-- SEGEMPAT · alinha políticas legadas/atuais do Storage para impedir sobrescrita ou remoção de evidência formalizada.

BEGIN;

DROP POLICY IF EXISTS "Users update own exam signatures" ON storage.objects;
DROP POLICY IF EXISTS "Active users update own exam signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own exam signatures" ON storage.objects;
DROP POLICY IF EXISTS "Active users delete own exam signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users delete unformalized exam signatures" ON storage.objects;

CREATE OR REPLACE FUNCTION public.can_delete_exam_signature(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.is_active_employee_user()
    AND split_part(COALESCE(p_name, ''), '/', 1) = auth.uid()::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      WHERE ea.signature_path = p_name
        AND (
          ea.signature_agreed IS TRUE
          OR ea.signed_at IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.certificates c WHERE c.attempt_id = ea.id)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_delete_exam_signature(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_exam_signature(text) TO authenticated;

CREATE POLICY "Users delete unformalized exam signatures"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'exam-signatures'
  AND public.can_delete_exam_signature(name)
);

CREATE OR REPLACE FUNCTION public.sign_exam_attempt(
  p_attempt_id uuid,
  p_signature_path text,
  p_signature_name text
)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_attempt public.exam_attempts;
  v_profile_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF NOT public.is_active_employee_user() THEN
    RAISE EXCEPTION 'Colaborador inativo ou sem vínculo ativo';
  END IF;
  IF p_signature_path IS NULL OR btrim(p_signature_path) = '' THEN
    RAISE EXCEPTION 'Caminho da assinatura inválido';
  END IF;
  IF split_part(p_signature_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Assinatura fora do diretório autorizado';
  END IF;

  SELECT ea.* INTO v_attempt
  FROM public.exam_attempts ea
  WHERE ea.id = p_attempt_id
    AND ea.user_id = auth.uid()
  FOR UPDATE;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Tentativa não encontrada ou não pertence ao usuário';
  END IF;
  IF v_attempt.passed IS NOT TRUE OR v_attempt.certificate_code IS NULL THEN
    RAISE EXCEPTION 'Assinatura disponível somente para tentativa aprovada';
  END IF;
  IF v_attempt.signature_agreed IS TRUE
     OR v_attempt.signature_path IS NOT NULL
     OR v_attempt.signed_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.certificates c WHERE c.attempt_id = v_attempt.id) THEN
    RAISE EXCEPTION 'Tentativa já assinada; a evidência é imutável';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'exam-signatures'
      AND o.name = p_signature_path
      AND (o.owner = auth.uid() OR o.owner_id = auth.uid()::text)
      AND COALESCE(o.is_delete_marker, false) = false
  ) THEN
    RAISE EXCEPTION 'Arquivo de assinatura não encontrado no Storage';
  END IF;

  SELECT nullif(btrim(p.nome), '') INTO v_profile_name
  FROM public.profiles p
  WHERE p.id = auth.uid();

  UPDATE public.exam_attempts
  SET signature_path = p_signature_path,
      signature_name = COALESCE(v_profile_name, nullif(btrim(p_signature_name), ''), matricula, 'Operador'),
      signed_at = now(),
      signature_agreed = true,
      updated_at = now()
  WHERE id = v_attempt.id
    AND user_id = auth.uid()
    AND signature_agreed IS NOT TRUE
    AND signature_path IS NULL
    AND signed_at IS NULL
  RETURNING * INTO v_attempt;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'A assinatura já foi formalizada por outra operação';
  END IF;

  RETURN v_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_exam_attempt(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_exam_attempt(uuid, text, text) TO authenticated;

COMMIT;
