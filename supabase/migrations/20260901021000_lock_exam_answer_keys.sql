-- SEGEMPAT · bloqueio definitivo da chave de correção no frontend
-- A tabela exams deixa de ser legível diretamente pelo papel authenticated.
-- Leituras passam por RPCs distintas para Inspetor e Operador.

CREATE OR REPLACE FUNCTION public.list_exams_admin()
RETURNS SETOF public.exams
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso administrativo necessário';
  END IF;

  RETURN QUERY
  SELECT * FROM public.exams ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_exam_admin(p_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso administrativo necessário';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id LIMIT 1;
  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Prova não encontrada';
  END IF;

  RETURN to_jsonb(v_exam);
END;
$$;

REVOKE SELECT ON public.exams FROM authenticated;
REVOKE ALL ON FUNCTION public.list_exams_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exam_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_exams_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_admin(uuid) TO authenticated;

-- CRUD administrativo permanece permitido e continua condicionado às policies RLS.
GRANT INSERT, UPDATE, DELETE ON public.exams TO authenticated;
