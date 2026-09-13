-- SEGEMPAT · código de ativação com aleatoriedade criptográfica

CREATE OR REPLACE FUNCTION public.generate_registration_code(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_employee public.employees%rowtype;
  v_code text;
  v_random bigint;
  v_expires_at timestamptz := now() + interval '24 hours';
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT * INTO v_employee
  FROM public.employees
  WHERE id = p_employee_id
    AND status = 'Ativo';

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'Colaborador ativo não encontrado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(trim(p.matricula)) = lower(trim(v_employee.matricula))
  ) THEN
    RAISE EXCEPTION 'Esta matrícula já possui acesso cadastrado';
  END IF;

  -- 48 bits de entropia criptográfica; o valor final é apresentado como 8 dígitos.
  v_random := (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint);
  v_code := lpad((v_random % 100000000)::text, 8, '0');

  INSERT INTO public.registration_activation_codes (
    employee_id, code_hash, expires_at, used_at, created_by, created_at
  ) VALUES (
    v_employee.id,
    encode(digest(v_code, 'sha256'), 'hex'),
    v_expires_at,
    NULL,
    auth.uid(),
    now()
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    code_hash = EXCLUDED.code_hash,
    expires_at = EXCLUDED.expires_at,
    used_at = NULL,
    created_by = EXCLUDED.created_by,
    created_at = now();

  RETURN jsonb_build_object(
    'code', v_code,
    'employee_id', v_employee.id,
    'employee_name', v_employee.full_name,
    'matricula', v_employee.matricula,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_registration_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_registration_code(uuid) TO authenticated;
