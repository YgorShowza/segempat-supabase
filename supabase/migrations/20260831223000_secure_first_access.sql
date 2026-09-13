-- SEGEMPAT · hardening do primeiro acesso
-- Novas contas só podem ser criadas para matrícula ativa já cadastrada em employees.
-- Role admin deixa de ser concedida automaticamente por matrícula.

DROP TRIGGER IF EXISTS profiles_grant_admin ON public.profiles;
DROP FUNCTION IF EXISTS public.grant_admin_for_matricula();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula text;
  v_nome text;
BEGIN
  v_matricula := lower(trim(COALESCE(NEW.raw_user_meta_data ->> 'matricula', split_part(NEW.email, '@', 1))));

  IF v_matricula IS NULL OR v_matricula = '' THEN
    RAISE EXCEPTION 'Matrícula obrigatória';
  END IF;

  SELECT e.full_name
    INTO v_nome
  FROM public.employees e
  WHERE lower(trim(e.matricula)) = v_matricula
    AND e.status = 'Ativo'
  LIMIT 1;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Matrícula não autorizada para cadastro';
  END IF;

  -- profiles.matricula é UNIQUE: uma matrícula não pode reivindicar duas contas.
  INSERT INTO public.profiles (id, matricula, nome)
  VALUES (NEW.id, v_matricula, v_nome);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- Não existe mais grant automático de admin. Roles administrativas devem ser
-- provisionadas explicitamente em public.user_roles por procedimento controlado.