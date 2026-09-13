-- SEGEMPAT · assinatura só é formalizada quando o arquivo existe no Storage privado

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

  IF split_part(p_signature_path,'/',1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Assinatura fora do diretório autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'exam-signatures'
      AND o.name = p_signature_path
      AND (o.owner = auth.uid() OR o.owner_id = auth.uid()::text)
      AND COALESCE(o.is_delete_marker,false) = false
  ) THEN
    RAISE EXCEPTION 'Arquivo de assinatura não encontrado no Storage';
  END IF;

  UPDATE public.exam_attempts
  SET signature_path = p_signature_path,
      signature_name = nullif(btrim(p_signature_name),''),
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

REVOKE ALL ON FUNCTION public.sign_exam_attempt(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_exam_attempt(uuid,text,text) TO authenticated;
