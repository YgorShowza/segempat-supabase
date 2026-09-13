-- SEGEMPAT · primeiro acesso com código de ativação de uso único

CREATE TABLE IF NOT EXISTS public.registration_activation_codes (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_activation_codes_expiry_idx
  ON public.registration_activation_codes(expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.registration_activation_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.registration_activation_codes FROM anon;
REVOKE ALL ON public.registration_activation_codes FROM authenticated;
GRANT SELECT ON public.registration_activation_codes TO authenticated;

DROP POLICY IF EXISTS "Admins read activation codes" ON public.registration_activation_codes;
CREATE POLICY "Admins read activation codes"
  ON public.registration_activation_codes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.generate_registration_code(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_employee public.employees%rowtype;
  v_code text;
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

  v_code := lpad((floor(random() * 100000000))::bigint::text, 8, '0');

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

CREATE OR REPLACE FUNCTION public.revoke_registration_code(p_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  DELETE FROM public.registration_activation_codes
  WHERE employee_id = p_employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_registration_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_registration_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_matricula text;
  v_activation_code text;
  v_employee public.employees%rowtype;
  v_token public.registration_activation_codes%rowtype;
BEGIN
  v_matricula := lower(trim(COALESCE(NEW.raw_user_meta_data ->> 'matricula', split_part(NEW.email, '@', 1))));
  v_activation_code := trim(COALESCE(NEW.raw_user_meta_data ->> 'activation_code', ''));

  IF v_matricula IS NULL OR v_matricula = '' THEN
    RAISE EXCEPTION 'Matrícula obrigatória';
  END IF;

  IF v_activation_code = '' THEN
    RAISE EXCEPTION 'Código de ativação obrigatório';
  END IF;

  SELECT * INTO v_employee
  FROM public.employees e
  WHERE lower(trim(e.matricula)) = v_matricula
    AND e.status = 'Ativo'
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'Matrícula não autorizada para cadastro';
  END IF;

  SELECT * INTO v_token
  FROM public.registration_activation_codes r
  WHERE r.employee_id = v_employee.id
    AND r.used_at IS NULL
    AND r.expires_at > now()
    AND r.code_hash = encode(digest(v_activation_code, 'sha256'), 'hex')
  FOR UPDATE;

  IF v_token.employee_id IS NULL THEN
    RAISE EXCEPTION 'Código de ativação inválido ou expirado';
  END IF;

  INSERT INTO public.profiles (id, matricula, nome)
  VALUES (NEW.id, v_matricula, v_employee.full_name);

  UPDATE public.registration_activation_codes
  SET used_at = now()
  WHERE employee_id = v_employee.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
