-- CRUD administrativo de provas e banco de questões sem devolver SELECT direto às tabelas.

CREATE OR REPLACE FUNCTION public.create_exam_admin(p_input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Acesso restrito à Inspetoria'; END IF;
  INSERT INTO public.exams(title,description,exam_type,target_sector,min_approval_pct,scheduled_date,status,questions,created_by)
  VALUES(
    trim(coalesce(p_input->>'title','')),
    nullif(trim(coalesce(p_input->>'description','')),''),
    coalesce(nullif(trim(p_input->>'exam_type'),''),'Múltipla escolha'),
    coalesce(nullif(trim(p_input->>'target_sector'),''),'Todos'),
    coalesce((p_input->>'min_approval_pct')::numeric,70),
    nullif(p_input->>'scheduled_date','')::date,
    coalesce(nullif(trim(p_input->>'status'),''),'Rascunho'),
    coalesce(p_input->'questions','[]'::jsonb),
    auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_exam_admin(p_id uuid,p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Acesso restrito à Inspetoria'; END IF;
  UPDATE public.exams SET
    title=CASE WHEN p_patch ? 'title' THEN trim(coalesce(p_patch->>'title','')) ELSE title END,
    description=CASE WHEN p_patch ? 'description' THEN nullif(trim(coalesce(p_patch->>'description','')),'') ELSE description END,
    exam_type=CASE WHEN p_patch ? 'exam_type' THEN p_patch->>'exam_type' ELSE exam_type END,
    target_sector=CASE WHEN p_patch ? 'target_sector' THEN p_patch->>'target_sector' ELSE target_sector END,
    min_approval_pct=CASE WHEN p_patch ? 'min_approval_pct' THEN (p_patch->>'min_approval_pct')::numeric ELSE min_approval_pct END,
    scheduled_date=CASE WHEN p_patch ? 'scheduled_date' THEN nullif(p_patch->>'scheduled_date','')::date ELSE scheduled_date END,
    status=CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
    questions=CASE WHEN p_patch ? 'questions' THEN coalesce(p_patch->'questions','[]'::jsonb) ELSE questions END
  WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prova não encontrada'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_exam_admin(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Acesso restrito à Inspetoria'; END IF;
  DELETE FROM public.exams WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prova não encontrada'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_question_bank_admin(p_input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Acesso restrito à Inspetoria'; END IF;
  INSERT INTO public.question_bank(bank_type,question_text,options,correct_index,correct_answer,explanation,target_sector,difficulty,theme,active,created_by)
  VALUES(
    trim(coalesce(p_input->>'bank_type','')),
    trim(coalesce(p_input->>'question_text','')),
    coalesce(p_input->'options','[]'::jsonb),
    nullif(p_input->>'correct_index','')::int,
    nullif(trim(coalesce(p_input->>'correct_answer','')),''),
    nullif(trim(coalesce(p_input->>'explanation','')),''),
    coalesce(nullif(trim(p_input->>'target_sector'),''),'Todos'),
    coalesce(nullif(trim(p_input->>'difficulty'),''),'Básico'),
    nullif(trim(coalesce(p_input->>'theme','')),''),
    coalesce((p_input->>'active')::boolean,true),
    auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_question_bank_admin(p_id uuid,p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Acesso restrito à Inspetoria'; END IF;
  UPDATE public.question_bank SET
    bank_type=CASE WHEN p_patch ? 'bank_type' THEN p_patch->>'bank_type' ELSE bank_type END,
    question_text=CASE WHEN p_patch ? 'question_text' THEN p_patch->>'question_text' ELSE question_text END,
    options=CASE WHEN p_patch ? 'options' THEN coalesce(p_patch->'options','[]'::jsonb) ELSE options END,
    correct_index=CASE WHEN p_patch ? 'correct_index' THEN nullif(p_patch->>'correct_index','')::int ELSE correct_index END,
    correct_answer=CASE WHEN p_patch ? 'correct_answer' THEN nullif(trim(coalesce(p_patch->>'correct_answer','')),'') ELSE correct_answer END,
    explanation=CASE WHEN p_patch ? 'explanation' THEN nullif(trim(coalesce(p_patch->>'explanation','')),'') ELSE explanation END,
    target_sector=CASE WHEN p_patch ? 'target_sector' THEN p_patch->>'target_sector' ELSE target_sector END,
    difficulty=CASE WHEN p_patch ? 'difficulty' THEN p_patch->>'difficulty' ELSE difficulty END,
    theme=CASE WHEN p_patch ? 'theme' THEN nullif(trim(coalesce(p_patch->>'theme','')),'') ELSE theme END,
    active=CASE WHEN p_patch ? 'active' THEN (p_patch->>'active')::boolean ELSE active END
  WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Questão não encontrada'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_question_bank_admin(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Acesso restrito à Inspetoria'; END IF;
  DELETE FROM public.question_bank WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Questão não encontrada'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_exam_admin(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_exam_admin(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_exam_admin(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_question_bank_admin(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_question_bank_admin(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_question_bank_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_exam_admin(jsonb), public.update_exam_admin(uuid,jsonb), public.delete_exam_admin(uuid), public.create_question_bank_admin(jsonb), public.update_question_bank_admin(uuid,jsonb), public.delete_question_bank_admin(uuid) TO authenticated;

REVOKE INSERT,UPDATE,DELETE ON public.exams FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.question_bank FROM authenticated;
