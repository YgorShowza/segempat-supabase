-- SEGEMPAT · Assinatura eletrônica de provas formais

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS signature_path text,
  ADD COLUMN IF NOT EXISTS signature_name text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_agreed boolean NOT NULL DEFAULT false;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exam-signatures', 'exam-signatures', false, 524288, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload own exam signatures" ON storage.objects;
CREATE POLICY "Users upload own exam signatures"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exam-signatures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users read own exam signatures" ON storage.objects;
CREATE POLICY "Users read own exam signatures"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'exam-signatures'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

DROP POLICY IF EXISTS "Users update own exam signatures" ON storage.objects;
CREATE POLICY "Users update own exam signatures"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'exam-signatures'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'exam-signatures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users delete own exam signatures" ON storage.objects;
CREATE POLICY "Users delete own exam signatures"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'exam-signatures'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- Nunca conceder UPDATE genérico da tentativa ao Operador.
DROP POLICY IF EXISTS "Users sign own exam attempts" ON public.exam_attempts;

CREATE OR REPLACE FUNCTION public.sign_exam_attempt(
  p_attempt_id uuid,
  p_signature_path text,
  p_signature_name text
)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.exam_attempts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF p_signature_path IS NULL OR btrim(p_signature_path) = '' THEN
    RAISE EXCEPTION 'Caminho da assinatura inválido';
  END IF;

  IF split_part(p_signature_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Assinatura fora do diretório autorizado';
  END IF;

  UPDATE public.exam_attempts
  SET signature_path = p_signature_path,
      signature_name = nullif(btrim(p_signature_name), ''),
      signed_at = now(),
      signature_agreed = true,
      updated_at = now()
  WHERE id = p_attempt_id
    AND user_id = auth.uid()
  RETURNING * INTO v_attempt;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Tentativa não encontrada ou não pertence ao usuário';
  END IF;

  RETURN v_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_exam_attempt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_exam_attempt(uuid, text, text) TO authenticated;
