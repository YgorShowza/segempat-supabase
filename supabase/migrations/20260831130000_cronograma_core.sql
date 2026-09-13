-- SEGEMPAT · Cronograma core
-- Mantém o Supabase como fonte de verdade e replica as regras funcionais do módulo original.

CREATE TABLE IF NOT EXISTS public.cronograma_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  employee_matricula text NOT NULL,
  employee_sector text NOT NULL,
  theme text NOT NULL CHECK (length(trim(theme)) > 0),
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  exam_title text,
  type text NOT NULL DEFAULT 'Planejado' CHECK (type IN ('Planejado', 'Realizado')),
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Realizado', 'Justificado')),
  justification text,
  planned_date date,
  completion_date date,
  notes text,
  question_bank_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cronograma_justification_required
    CHECK (status <> 'Justificado' OR length(trim(COALESCE(justification, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS cronograma_entries_month_idx
  ON public.cronograma_entries(month);
CREATE INDEX IF NOT EXISTS cronograma_entries_employee_idx
  ON public.cronograma_entries(employee_id, month);
CREATE INDEX IF NOT EXISTS cronograma_entries_status_idx
  ON public.cronograma_entries(month, status);
CREATE INDEX IF NOT EXISTS cronograma_entries_sector_idx
  ON public.cronograma_entries(month, employee_sector);
CREATE UNIQUE INDEX IF NOT EXISTS cronograma_entries_no_exact_duplicate_idx
  ON public.cronograma_entries(month, employee_id, theme, COALESCE(planned_date, DATE '1900-01-01'));

CREATE TABLE IF NOT EXISTS public.cronograma_recurring_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme text NOT NULL CHECK (length(trim(theme)) > 0),
  target_sector text NOT NULL DEFAULT 'Vigilância'
    CHECK (target_sector IN ('Vigilância', 'CFTV', 'Todos', 'Portaria', 'Ronda', 'Administrativo')),
  recurrence text NOT NULL DEFAULT 'monthly' CHECK (recurrence = 'monthly'),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cronograma_recurring_models_active_idx
  ON public.cronograma_recurring_models(active, target_sector);

CREATE TABLE IF NOT EXISTS public.cronograma_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('mes_suspenso', 'ausencia_operador')),
  month text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  notes text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name text,
  employee_matricula text,
  date_start date,
  date_end date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cronograma_suspension_employee_required
    CHECK (type <> 'ausencia_operador' OR employee_id IS NOT NULL),
  CONSTRAINT cronograma_suspension_dates_valid
    CHECK (date_start IS NULL OR date_end IS NULL OR date_end >= date_start)
);

CREATE INDEX IF NOT EXISTS cronograma_suspensions_month_idx
  ON public.cronograma_suspensions(month, type);
CREATE INDEX IF NOT EXISTS cronograma_suspensions_employee_idx
  ON public.cronograma_suspensions(employee_id, month);

-- updated_at usa a função já existente no projeto.
DROP TRIGGER IF EXISTS cronograma_entries_set_updated_at ON public.cronograma_entries;
CREATE TRIGGER cronograma_entries_set_updated_at
  BEFORE UPDATE ON public.cronograma_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cronograma_recurring_models_set_updated_at ON public.cronograma_recurring_models;
CREATE TRIGGER cronograma_recurring_models_set_updated_at
  BEFORE UPDATE ON public.cronograma_recurring_models
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cronograma_suspensions_set_updated_at ON public.cronograma_suspensions;
CREATE TRIGGER cronograma_suspensions_set_updated_at
  BEFORE UPDATE ON public.cronograma_suspensions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cronograma_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_recurring_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_suspensions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_recurring_models TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_suspensions TO authenticated;
GRANT ALL ON public.cronograma_entries, public.cronograma_recurring_models, public.cronograma_suspensions TO service_role;

-- Helper: vincula auth.users -> profiles.matricula -> employees.id.
CREATE OR REPLACE FUNCTION public.is_current_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.employees e ON e.matricula = p.matricula
    WHERE p.id = auth.uid() AND e.id = _employee_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_current_employee(uuid) TO authenticated;

DROP POLICY IF EXISTS "Cronograma entries select" ON public.cronograma_entries;
CREATE POLICY "Cronograma entries select"
  ON public.cronograma_entries FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_current_employee(employee_id)
  );

DROP POLICY IF EXISTS "Admins insert cronograma entries" ON public.cronograma_entries;
CREATE POLICY "Admins insert cronograma entries"
  ON public.cronograma_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update cronograma entries" ON public.cronograma_entries;
CREATE POLICY "Admins update cronograma entries"
  ON public.cronograma_entries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete cronograma entries" ON public.cronograma_entries;
CREATE POLICY "Admins delete cronograma entries"
  ON public.cronograma_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Recurring models select" ON public.cronograma_recurring_models;
CREATE POLICY "Recurring models select"
  ON public.cronograma_recurring_models FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR active = true);

DROP POLICY IF EXISTS "Admins manage recurring models" ON public.cronograma_recurring_models;
CREATE POLICY "Admins manage recurring models"
  ON public.cronograma_recurring_models FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Cronograma suspensions select" ON public.cronograma_suspensions;
CREATE POLICY "Cronograma suspensions select"
  ON public.cronograma_suspensions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (type = 'ausencia_operador' AND public.is_current_employee(employee_id))
  );

DROP POLICY IF EXISTS "Admins manage cronograma suspensions" ON public.cronograma_suspensions;
CREATE POLICY "Admins manage cronograma suspensions"
  ON public.cronograma_suspensions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
