-- SEGEMPAT · Supabase/PostgreSQL · baseline API-owned
-- Gerado a partir de database/mysql/001_schema.sql para preservar a estrutura funcional atual.
-- A edição Supabase mantém Frontend -> API SEGEMPAT -> PostgreSQL; o frontend não recebe credenciais de banco.
SET TIME ZONE 'UTC';
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_users (
  id UUID NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
  last_login_at TIMESTAMPTZ(3) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT app_users_matricula_key UNIQUE (matricula)
);

CREATE TABLE employees (
  id UUID NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  sector VARCHAR(80) NOT NULL DEFAULT 'CFTV',
  access_profile VARCHAR(40) NOT NULL DEFAULT 'Operacional',
  status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
  level INT NOT NULL DEFAULT 1,
  points INT NOT NULL DEFAULT 0,
  first_access SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT employees_matricula_key UNIQUE (matricula)
);

CREATE TABLE profiles (
  id UUID NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  nome VARCHAR(255) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT profiles_matricula_key UNIQUE (matricula),
  CONSTRAINT profiles_user_fk FOREIGN KEY (id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_employee_matricula_fk FOREIGN KEY (matricula) REFERENCES employees(matricula) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE user_roles (
  id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role),
  CONSTRAINT user_roles_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

CREATE TABLE registration_activation_codes (
  employee_id UUID NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  used_at TIMESTAMPTZ(3) NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (employee_id),
  CONSTRAINT registration_activation_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT registration_activation_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE exams (
  id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  exam_type VARCHAR(80) NOT NULL DEFAULT 'Múltipla escolha',
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Todos',
  min_approval_pct INT NOT NULL DEFAULT 70,
  scheduled_date DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Rascunho',
  questions JSONB NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT exams_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT exams_min_approval_chk CHECK (min_approval_pct BETWEEN 0 AND 100)
);

CREATE TABLE exam_attempts (
  id UUID NOT NULL,
  exam_id UUID NOT NULL,
  user_id UUID NOT NULL,
  matricula VARCHAR(64) NULL,
  score NUMERIC(6,2) NOT NULL DEFAULT 0,
  passed SMALLINT NOT NULL DEFAULT 0,
  answers JSONB NOT NULL,
  finished_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  certificate_code VARCHAR(128) NULL,
  signature_path VARCHAR(1024) NULL,
  signature_name VARCHAR(255) NULL,
  signed_at TIMESTAMPTZ(3) NULL,
  signature_agreed SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT exam_attempts_certificate_code_uidx UNIQUE (certificate_code),
  CONSTRAINT exam_attempts_exam_fk FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
  CONSTRAINT exam_attempts_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE certificates (
  id UUID NOT NULL,
  attempt_id UUID NOT NULL,
  user_id UUID NOT NULL,
  matricula VARCHAR(64) NULL,
  employee_name VARCHAR(255) NOT NULL,
  exam_id UUID NOT NULL,
  exam_title VARCHAR(255) NOT NULL,
  score NUMERIC(6,2) NOT NULL,
  verification_code VARCHAR(128) NOT NULL,
  issued_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked SMALLINT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ(3) NULL,
  revoked_reason TEXT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT certificates_attempt_id_key UNIQUE (attempt_id),
  CONSTRAINT certificates_verification_code_key UNIQUE (verification_code),
  CONSTRAINT certificates_attempt_fk FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
  CONSTRAINT certificates_exam_fk FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
  CONSTRAINT certificates_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE cronograma_entries (
  id UUID NOT NULL,
  month CHAR(7) NOT NULL,
  employee_id UUID NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  employee_matricula VARCHAR(64) NOT NULL,
  employee_sector VARCHAR(80) NOT NULL,
  theme VARCHAR(500) NOT NULL,
  exam_id UUID NULL,
  exam_title VARCHAR(255) NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'Planejado',
  status VARCHAR(40) NOT NULL DEFAULT 'Pendente',
  justification TEXT NULL,
  planned_date DATE NULL,
  completion_date DATE NULL,
  notes TEXT NULL,
  question_bank_ids JSONB NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  planned_date_key DATE GENERATED ALWAYS AS (COALESCE(planned_date, DATE '1900-01-01')) STORED,
  PRIMARY KEY (id),
  CONSTRAINT cronograma_entries_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT cronograma_entries_exam_fk FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
  CONSTRAINT cronograma_entries_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE cronograma_recurring_models (
  id UUID NOT NULL,
  theme VARCHAR(500) NOT NULL,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Vigilância',
  recurrence VARCHAR(40) NOT NULL DEFAULT 'monthly',
  active SMALLINT NOT NULL DEFAULT 1,
  created_by UUID NULL,
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT cronograma_recurring_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE cronograma_suspensions (
  id UUID NOT NULL,
  type VARCHAR(80) NOT NULL,
  month CHAR(7) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  notes TEXT NULL,
  employee_id UUID NULL,
  employee_name VARCHAR(255) NULL,
  employee_matricula VARCHAR(64) NULL,
  date_start DATE NULL,
  date_end DATE NULL,
  created_by UUID NULL,
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT cronograma_suspensions_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT cronograma_suspensions_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE knowledge_items (
  id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Geral',
  content TEXT NOT NULL,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Todos',
  active SMALLINT NOT NULL DEFAULT 1,
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT knowledge_items_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE question_bank (
  id UUID NOT NULL,
  bank_type VARCHAR(80) NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INT NULL,
  correct_answer TEXT NULL,
  explanation TEXT NULL,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Todos',
  difficulty VARCHAR(40) NOT NULL DEFAULT 'Básico',
  theme VARCHAR(255) NULL,
  active SMALLINT NOT NULL DEFAULT 1,
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT question_bank_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE training_modules (
  id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  content TEXT NULL,
  display_order INT NOT NULL DEFAULT 1,
  min_score NUMERIC(6,2) NOT NULL DEFAULT 7,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Todos',
  status VARCHAR(32) NOT NULL DEFAULT 'Ativo',
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT training_modules_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE training_activity_attempts (
  id UUID NOT NULL,
  user_id UUID NOT NULL,
  employee_id UUID NULL,
  employee_name VARCHAR(255) NOT NULL,
  employee_matricula VARCHAR(64) NULL,
  employee_sector VARCHAR(80) NULL,
  activity_type VARCHAR(80) NOT NULL,
  activity_title VARCHAR(255) NOT NULL,
  answers JSONB NOT NULL,
  score NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(6,2) NOT NULL DEFAULT 10,
  passed SMALLINT NOT NULL DEFAULT 0,
  points_earned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  activity_day DATE NULL,
  PRIMARY KEY (id),
  CONSTRAINT training_activity_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT training_activity_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE training_schedules (
  id UUID NOT NULL,
  employee_id UUID NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  employee_matricula VARCHAR(64) NULL,
  cycle_days INT NOT NULL DEFAULT 90,
  last_training_date DATE NULL,
  window_start DATE NULL,
  window_end DATE NULL,
  observations TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Em dia',
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT training_schedules_employee_id_key UNIQUE (employee_id),
  CONSTRAINT training_schedules_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT training_schedules_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE practical_eval_templates (
  id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  platform VARCHAR(120) NULL,
  description TEXT NULL,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'CFTV',
  min_approval_score NUMERIC(6,2) NOT NULL DEFAULT 7,
  recurrence VARCHAR(40) NOT NULL DEFAULT 'monthly',
  applications_per_month INT NOT NULL DEFAULT 1,
  tasks JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Ativo',
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT practical_eval_templates_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE practical_evaluations (
  id UUID NOT NULL,
  employee_id UUID NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  employee_matricula VARCHAR(64) NOT NULL,
  employee_sector VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  evaluator_id UUID NULL,
  evaluator_name VARCHAR(255) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Planejada',
  score NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(6,2) NOT NULL DEFAULT 10,
  checklist JSONB NOT NULL,
  notes TEXT NULL,
  evaluation_date DATE NULL,
  completed_at TIMESTAMPTZ(3) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT practical_evaluations_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT practical_evaluations_evaluator_fk FOREIGN KEY (evaluator_id) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE occurrences (
  id UUID NOT NULL,
  employee_id UUID NULL,
  employee_name VARCHAR(255) NULL,
  employee_matricula VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Operacional',
  severity VARCHAR(40) NOT NULL DEFAULT 'Baixa',
  description TEXT NOT NULL,
  location VARCHAR(255) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Aberta',
  occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolution_notes TEXT NULL,
  resolved_at TIMESTAMPTZ(3) NULL,
  created_by UUID NULL,
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT occurrences_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT occurrences_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE audit_logs (
  id UUID NOT NULL,
  actor_id UUID NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entity_id VARCHAR(128) NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT audit_logs_actor_fk FOREIGN KEY (actor_id) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX employees_sector_idx ON employees (sector);
CREATE INDEX registration_activation_codes_expiry_idx ON registration_activation_codes (expires_at, used_at);
CREATE INDEX exams_status_sector_idx ON exams (status, target_sector);
CREATE INDEX exam_attempts_user_idx ON exam_attempts (user_id, exam_id);
CREATE INDEX exam_attempts_finished_at_idx ON exam_attempts (finished_at);
CREATE INDEX certificates_user_idx ON certificates (user_id, issued_at);
CREATE UNIQUE INDEX cronograma_entries_no_exact_duplicate_idx ON cronograma_entries (month, employee_id, left(theme, 191), planned_date_key);
CREATE INDEX cronograma_entries_employee_idx ON cronograma_entries (employee_id, month);
CREATE INDEX cronograma_entries_month_idx ON cronograma_entries (month);
CREATE INDEX cronograma_entries_sector_idx ON cronograma_entries (month, employee_sector);
CREATE INDEX cronograma_entries_status_idx ON cronograma_entries (month, status);
CREATE INDEX cronograma_recurring_models_active_idx ON cronograma_recurring_models (active, target_sector);
CREATE INDEX cronograma_suspensions_employee_idx ON cronograma_suspensions (employee_id, month);
CREATE INDEX cronograma_suspensions_month_idx ON cronograma_suspensions (month, type);
CREATE INDEX knowledge_items_sector_idx ON knowledge_items (target_sector, active);
CREATE INDEX question_bank_sector_idx ON question_bank (target_sector, active);
CREATE INDEX question_bank_type_idx ON question_bank (bank_type, active);
CREATE INDEX training_modules_order_idx ON training_modules (status, display_order);
CREATE UNIQUE INDEX training_activity_daily_challenge_unique_idx ON training_activity_attempts (user_id, activity_day) WHERE activity_type = 'Desafio Diário' AND activity_day IS NOT NULL;
CREATE INDEX training_activity_attempts_user_created_idx ON training_activity_attempts (user_id, created_at);
CREATE INDEX training_schedules_status_idx ON training_schedules (status, window_end);
CREATE INDEX practical_eval_templates_status_idx ON practical_eval_templates (status, target_sector, recurrence);
CREATE INDEX practical_evaluations_employee_idx ON practical_evaluations (employee_id, evaluation_date);
CREATE INDEX practical_evaluations_status_idx ON practical_evaluations (status, evaluation_date);
CREATE INDEX occurrences_employee_idx ON occurrences (employee_id, occurred_at);
CREATE INDEX occurrences_status_idx ON occurrences (status, occurred_at);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);

CREATE OR REPLACE FUNCTION public.segempat_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP(3);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_set_updated_at ON app_users;
CREATE TRIGGER app_users_set_updated_at BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS cronograma_entries_set_updated_at ON cronograma_entries;
CREATE TRIGGER cronograma_entries_set_updated_at BEFORE UPDATE ON cronograma_entries FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS cronograma_recurring_models_set_updated_at ON cronograma_recurring_models;
CREATE TRIGGER cronograma_recurring_models_set_updated_at BEFORE UPDATE ON cronograma_recurring_models FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS cronograma_suspensions_set_updated_at ON cronograma_suspensions;
CREATE TRIGGER cronograma_suspensions_set_updated_at BEFORE UPDATE ON cronograma_suspensions FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS employees_set_updated_at ON employees;
CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS exam_attempts_set_updated_at ON exam_attempts;
CREATE TRIGGER exam_attempts_set_updated_at BEFORE UPDATE ON exam_attempts FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS exams_set_updated_at ON exams;
CREATE TRIGGER exams_set_updated_at BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS knowledge_items_set_updated_at ON knowledge_items;
CREATE TRIGGER knowledge_items_set_updated_at BEFORE UPDATE ON knowledge_items FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS occurrences_set_updated_at ON occurrences;
CREATE TRIGGER occurrences_set_updated_at BEFORE UPDATE ON occurrences FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS practical_eval_templates_set_updated_at ON practical_eval_templates;
CREATE TRIGGER practical_eval_templates_set_updated_at BEFORE UPDATE ON practical_eval_templates FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS practical_evaluations_set_updated_at ON practical_evaluations;
CREATE TRIGGER practical_evaluations_set_updated_at BEFORE UPDATE ON practical_evaluations FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS question_bank_set_updated_at ON question_bank;
CREATE TRIGGER question_bank_set_updated_at BEFORE UPDATE ON question_bank FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS training_modules_set_updated_at ON training_modules;
CREATE TRIGGER training_modules_set_updated_at BEFORE UPDATE ON training_modules FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS training_schedules_set_updated_at ON training_schedules;
CREATE TRIGGER training_schedules_set_updated_at BEFORE UPDATE ON training_schedules FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

-- Compatibilidade semântica com os flags 0/1 usados pela API atual.
-- A migração para BOOLEAN pode ser feita depois da homologação sem alterar a interface da aplicação.

