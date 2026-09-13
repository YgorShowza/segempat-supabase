-- SEGEMPAT · Modelos de Avaliação Prática
-- Port do PracticalEvalTemplate do app original.

CREATE TABLE IF NOT EXISTS public.practical_eval_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  platform text,
  description text,
  target_sector text NOT NULL DEFAULT 'CFTV'
    CHECK (target_sector IN ('Todos', 'CFTV', 'Vigilância')),
  min_approval_score numeric(4,2) NOT NULL DEFAULT 7
    CHECK (min_approval_score >= 0 AND min_approval_score <= 10),
  recurrence text NOT NULL DEFAULT 'monthly'
    CHECK (recurrence IN ('once', 'monthly', 'bimonthly', 'quarterly')),
  applications_per_month integer NOT NULL DEFAULT 1
    CHECK (applications_per_month >= 1 AND applications_per_month <= 31),
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(tasks) = 'array'),
  status text NOT NULL DEFAULT 'Ativo'
    CHECK (status IN ('Ativo', 'Inativo')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practical_eval_templates_status_idx
  ON public.practical_eval_templates(status, target_sector, recurrence);

DROP TRIGGER IF EXISTS practical_eval_templates_set_updated_at ON public.practical_eval_templates;
CREATE TRIGGER practical_eval_templates_set_updated_at
  BEFORE UPDATE ON public.practical_eval_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.practical_eval_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practical_eval_templates TO authenticated;
GRANT ALL ON public.practical_eval_templates TO service_role;

DROP POLICY IF EXISTS "Practical templates select" ON public.practical_eval_templates;
CREATE POLICY "Practical templates select"
  ON public.practical_eval_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR status = 'Ativo');

DROP POLICY IF EXISTS "Admins insert practical templates" ON public.practical_eval_templates;
CREATE POLICY "Admins insert practical templates"
  ON public.practical_eval_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update practical templates" ON public.practical_eval_templates;
CREATE POLICY "Admins update practical templates"
  ON public.practical_eval_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete practical templates" ON public.practical_eval_templates;
CREATE POLICY "Admins delete practical templates"
  ON public.practical_eval_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
