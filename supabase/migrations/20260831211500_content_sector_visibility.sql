-- SEGEMPAT · visibilidade de conteúdos por setor
-- Defesa em profundidade: o frontend já filtra, mas o banco também deve
-- limitar conteúdos ativos ao setor do usuário ou ao público Todos.

DROP POLICY IF EXISTS "Knowledge select" ON public.knowledge_items;
CREATE POLICY "Knowledge select by sector"
ON public.knowledge_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    active = true
    AND (
      target_sector = 'Todos'
      OR target_sector = public.current_employee_sector()
    )
  )
);

DROP POLICY IF EXISTS "Training modules select" ON public.training_modules;
CREATE POLICY "Training modules select by sector"
ON public.training_modules
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    status = 'Ativo'
    AND (
      target_sector = 'Todos'
      OR target_sector = public.current_employee_sector()
    )
  )
);

DROP POLICY IF EXISTS "Question bank select" ON public.question_bank;
CREATE POLICY "Question bank select by sector"
ON public.question_bank
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    active = true
    AND (
      target_sector = 'Todos'
      OR target_sector = public.current_employee_sector()
    )
  )
);
