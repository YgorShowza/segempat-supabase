-- SEGEMPAT · protege o histórico de provas no preview legado.
-- A API MySQL já usa RESTRICT/guards; o Supabase de compatibilidade deve ter a mesma semântica.

ALTER TABLE public.exam_attempts
  DROP CONSTRAINT IF EXISTS exam_attempts_exam_id_fkey;

ALTER TABLE public.exam_attempts
  ADD CONSTRAINT exam_attempts_exam_id_fkey
  FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.update_exam_admin(p_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_history boolean;
  v_changes_evidence boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito à Inspetoria';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nenhum campo para atualizar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_id) THEN
    RAISE EXCEPTION 'Prova não encontrada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS key_name
    WHERE key_name <> 'status'
  ) INTO v_changes_evidence;

  IF v_changes_evidence THEN
    SELECT EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_id = p_id)
      INTO v_has_history;
    IF v_has_history THEN
      RAISE EXCEPTION 'Prova com tentativas registradas não pode ter conteúdo ou configuração alterados. Use apenas Publicar/Despublicar para preservar a evidência histórica.';
    END IF;
  END IF;

  IF p_patch ? 'status' AND coalesce(p_patch->>'status', '') NOT IN ('Rascunho', 'Publicada') THEN
    RAISE EXCEPTION 'Situação da prova inválida';
  END IF;
  IF p_patch ? 'min_approval_pct' AND ((p_patch->>'min_approval_pct')::numeric < 0 OR (p_patch->>'min_approval_pct')::numeric > 100) THEN
    RAISE EXCEPTION 'Percentual mínimo deve estar entre 0 e 100';
  END IF;
  IF p_patch ? 'title' AND btrim(coalesce(p_patch->>'title', '')) = '' THEN
    RAISE EXCEPTION 'Título é obrigatório';
  END IF;

  UPDATE public.exams
     SET title = CASE WHEN p_patch ? 'title' THEN btrim(p_patch->>'title') ELSE title END,
         description = CASE WHEN p_patch ? 'description' THEN nullif(btrim(coalesce(p_patch->>'description', '')), '') ELSE description END,
         exam_type = CASE WHEN p_patch ? 'exam_type' THEN p_patch->>'exam_type' ELSE exam_type END,
         target_sector = CASE WHEN p_patch ? 'target_sector' THEN p_patch->>'target_sector' ELSE target_sector END,
         min_approval_pct = CASE WHEN p_patch ? 'min_approval_pct' THEN (p_patch->>'min_approval_pct')::numeric ELSE min_approval_pct END,
         scheduled_date = CASE WHEN p_patch ? 'scheduled_date' THEN nullif(p_patch->>'scheduled_date', '')::date ELSE scheduled_date END,
         status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
         questions = CASE WHEN p_patch ? 'questions' THEN coalesce(p_patch->'questions', '[]'::jsonb) ELSE questions END
   WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_exam_admin(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso restrito à Inspetoria';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_id) THEN
    RAISE EXCEPTION 'Prova não encontrada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_id = p_id) THEN
    RAISE EXCEPTION 'Prova possui tentativas registradas. Despublique a prova para preservar o histórico operacional.';
  END IF;
  DELETE FROM public.exams WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_exam_admin(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_exam_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_exam_admin(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_exam_admin(uuid) TO authenticated;
