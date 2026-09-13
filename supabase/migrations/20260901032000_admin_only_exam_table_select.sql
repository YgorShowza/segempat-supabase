-- Permite SELECT direto na tabela exams apenas para a Inspetoria.
-- Operadores consomem exclusivamente as RPCs sanitizadas list_available_exams/get_exam_for_attempt.

GRANT SELECT ON public.exams TO authenticated;

DROP POLICY IF EXISTS "Exams select by publication and sector" ON public.exams;
DROP POLICY IF EXISTS "Admins can read exams directly" ON public.exams;

CREATE POLICY "Admins can read exams directly"
ON public.exams
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
