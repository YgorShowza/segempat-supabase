-- SEGEMPAT · módulos operacionais complementares

CREATE TABLE IF NOT EXISTS public.knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  category text NOT NULL DEFAULT 'Geral',
  content text NOT NULL,
  target_sector text NOT NULL DEFAULT 'Todos',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name text,
  employee_matricula text,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  category text NOT NULL DEFAULT 'Operacional',
  severity text NOT NULL DEFAULT 'Baixa' CHECK (severity IN ('Baixa','Média','Alta','Crítica')),
  description text NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta','Em análise','Concluída')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolution_notes text,
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS occurrences_status_idx ON public.occurrences(status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS occurrences_employee_idx ON public.occurrences(employee_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.practical_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  employee_matricula text NOT NULL,
  employee_sector text NOT NULL,
  title text NOT NULL,
  evaluator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evaluator_name text,
  status text NOT NULL DEFAULT 'Planejada' CHECK (status IN ('Planejada','Em andamento','Concluída')),
  score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 10 CHECK (max_score > 0),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  evaluation_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practical_evaluations_employee_idx ON public.practical_evaluations(employee_id, evaluation_date DESC);
CREATE INDEX IF NOT EXISTS practical_evaluations_status_idx ON public.practical_evaluations(status, evaluation_date);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs(entity, entity_id);

DROP TRIGGER IF EXISTS knowledge_items_set_updated_at ON public.knowledge_items;
CREATE TRIGGER knowledge_items_set_updated_at BEFORE UPDATE ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS occurrences_set_updated_at ON public.occurrences;
CREATE TRIGGER occurrences_set_updated_at BEFORE UPDATE ON public.occurrences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS practical_evaluations_set_updated_at ON public.practical_evaluations;
CREATE TRIGGER practical_evaluations_set_updated_at BEFORE UPDATE ON public.practical_evaluations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practical_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_items, public.occurrences, public.practical_evaluations TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.knowledge_items, public.occurrences, public.practical_evaluations, public.audit_logs TO service_role;

CREATE POLICY "Knowledge select" ON public.knowledge_items FOR SELECT TO authenticated USING (active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage knowledge" ON public.knowledge_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Occurrences select" ON public.occurrences FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR (employee_id IS NOT NULL AND public.is_current_employee(employee_id)) OR created_by = auth.uid());
CREATE POLICY "Authenticated create occurrences" ON public.occurrences FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Admins update occurrences" ON public.occurrences FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete occurrences" ON public.occurrences FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Practical select" ON public.practical_evaluations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_current_employee(employee_id));
CREATE POLICY "Admins create practical" ON public.practical_evaluations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update practical" ON public.practical_evaluations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete practical" ON public.practical_evaluations FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_id text;
  payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_id := COALESCE(to_jsonb(OLD)->>'id','');
    payload := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    row_id := COALESCE(to_jsonb(NEW)->>'id','');
    payload := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    row_id := COALESCE(to_jsonb(NEW)->>'id','');
    payload := jsonb_build_object('new', to_jsonb(NEW));
  END IF;
  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, row_id, payload);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees','exams','cronograma_entries','occurrences','practical_evaluations','knowledge_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t, t);
  END LOOP;
END $$;
