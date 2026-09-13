-- SEGEMPAT · base de atividades de treinamento
-- Esta migration precisa vir antes do Desafio Diário, que adiciona activity_day
-- e evolui a função de registro das atividades.

CREATE TABLE IF NOT EXISTS public.training_activity_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  employee_matricula text,
  employee_sector text,
  activity_type text NOT NULL CHECK (activity_type IN ('Simulador','Stress Test','Desafio Diário','Teste Rápido','Treinamento')),
  activity_title text NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 10,
  passed boolean NOT NULL DEFAULT false,
  points_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_activity_attempts_user_created_idx
  ON public.training_activity_attempts (user_id, created_at DESC);

ALTER TABLE public.training_activity_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Training activities select" ON public.training_activity_attempts;
CREATE POLICY "Training activities select"
ON public.training_activity_attempts
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete training activities" ON public.training_activity_attempts;
CREATE POLICY "Admins delete training activities"
ON public.training_activity_attempts
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.training_activity_attempts TO authenticated;
GRANT ALL ON public.training_activity_attempts TO service_role;
