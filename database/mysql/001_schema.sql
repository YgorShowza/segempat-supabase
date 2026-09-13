-- SEGEMPAT — MySQL 8.0 baseline schema
-- Preparado a partir do schema PostgreSQL/Supabase ativo em 2026-09-02.
-- Todos os IDs permanecem CHAR(36) para permitir migração direta dos UUIDs atuais.
-- Timestamps devem ser gravados em UTC pela API; conversão para America/Maceio fica na aplicação.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE app_users (
  id CHAR(36) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY app_users_matricula_key (matricula)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employees (
  id CHAR(36) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  sector VARCHAR(80) NOT NULL DEFAULT 'CFTV',
  access_profile VARCHAR(40) NOT NULL DEFAULT 'Operacional',
  status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
  level INT NOT NULL DEFAULT 1,
  points INT NOT NULL DEFAULT 0,
  first_access TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY employees_matricula_key (matricula),
  KEY employees_sector_idx (sector)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE profiles (
  id CHAR(36) NOT NULL,
  matricula VARCHAR(64) NOT NULL,
  nome VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY profiles_matricula_key (matricula),
  CONSTRAINT profiles_user_fk FOREIGN KEY (id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_employee_matricula_fk FOREIGN KEY (matricula) REFERENCES employees(matricula) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY user_roles_user_id_role_key (user_id, role),
  CONSTRAINT user_roles_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE registration_activation_codes (
  employee_id CHAR(36) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (employee_id),
  KEY registration_activation_codes_expiry_idx (expires_at, used_at),
  CONSTRAINT registration_activation_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT registration_activation_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exams (
  id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  exam_type VARCHAR(80) NOT NULL DEFAULT 'Múltipla escolha',
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Todos',
  min_approval_pct INT NOT NULL DEFAULT 70,
  scheduled_date DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Rascunho',
  questions JSON NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY exams_status_sector_idx (status, target_sector),
  CONSTRAINT exams_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT exams_min_approval_chk CHECK (min_approval_pct BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_attempts (
  id CHAR(36) NOT NULL,
  exam_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  matricula VARCHAR(64) NULL,
  score DECIMAL(6,2) NOT NULL DEFAULT 0,
  passed TINYINT(1) NOT NULL DEFAULT 0,
  answers JSON NOT NULL,
  finished_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  certificate_code VARCHAR(128) NULL,
  signature_path VARCHAR(1024) NULL,
  signature_name VARCHAR(255) NULL,
  signed_at DATETIME(3) NULL,
  signature_agreed TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY exam_attempts_certificate_code_uidx (certificate_code),
  KEY exam_attempts_user_idx (user_id, exam_id),
  KEY exam_attempts_finished_at_idx (finished_at),
  CONSTRAINT exam_attempts_exam_fk FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
  CONSTRAINT exam_attempts_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE certificates (
  id CHAR(36) NOT NULL,
  attempt_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  matricula VARCHAR(64) NULL,
  employee_name VARCHAR(255) NOT NULL,
  exam_id CHAR(36) NOT NULL,
  exam_title VARCHAR(255) NOT NULL,
  score DECIMAL(6,2) NOT NULL,
  verification_code VARCHAR(128) NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  revoked_at DATETIME(3) NULL,
  revoked_reason TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY certificates_attempt_id_key (attempt_id),
  UNIQUE KEY certificates_verification_code_key (verification_code),
  KEY certificates_user_idx (user_id, issued_at),
  CONSTRAINT certificates_attempt_fk FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
  CONSTRAINT certificates_exam_fk FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
  CONSTRAINT certificates_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cronograma_entries (
  id CHAR(36) NOT NULL,
  month CHAR(7) NOT NULL,
  employee_id CHAR(36) NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  employee_matricula VARCHAR(64) NOT NULL,
  employee_sector VARCHAR(80) NOT NULL,
  theme VARCHAR(500) NOT NULL,
  exam_id CHAR(36) NULL,
  exam_title VARCHAR(255) NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'Planejado',
  status VARCHAR(40) NOT NULL DEFAULT 'Pendente',
  justification TEXT NULL,
  planned_date DATE NULL,
  completion_date DATE NULL,
  notes TEXT NULL,
  question_bank_ids JSON NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  planned_date_key DATE GENERATED ALWAYS AS (COALESCE(planned_date, DATE('1900-01-01'))) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY cronograma_entries_no_exact_duplicate_idx (month, employee_id, theme(191), planned_date_key),
  KEY cronograma_entries_employee_idx (employee_id, month),
  KEY cronograma_entries_month_idx (month),
  KEY cronograma_entries_sector_idx (month, employee_sector),
  KEY cronograma_entries_status_idx (month, status),
  CONSTRAINT cronograma_entries_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT cronograma_entries_exam_fk FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
  CONSTRAINT cronograma_entries_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cronograma_recurring_models (
  id CHAR(36) NOT NULL,
  theme VARCHAR(500) NOT NULL,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Vigilância',
  recurrence VARCHAR(40) NOT NULL DEFAULT 'monthly',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_by_name VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY cronograma_recurring_models_active_idx (active, target_sector),
  CONSTRAINT cronograma_recurring_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cronograma_suspensions (
  id CHAR(36) NOT NULL,
  type VARCHAR(80) NOT NULL,
  month CHAR(7) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  notes TEXT NULL,
  employee_id CHAR(36) NULL,
  employee_name VARCHAR(255) NULL,
  employee_matricula VARCHAR(64) NULL,
  date_start DATE NULL,
  date_end DATE NULL,
  created_by CHAR(36) NULL,
  created_by_name VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY cronograma_suspensions_employee_idx (employee_id, month),
  KEY cronograma_suspensions_month_idx (month, type),
  CONSTRAINT cronograma_suspensions_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT cronograma_suspensions_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE knowledge_items (
  id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Geral',
  content LONGTEXT NOT NULL,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Todos',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY knowledge_items_sector_idx (target_sector, active),
  CONSTRAINT knowledge_items_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE question_bank (
  id CHAR(36) NOT NULL,
  bank_type VARCHAR(80) NOT NULL,
  question_text TEXT NOT NULL,
  options JSON NOT NULL,
  correct_index INT NULL,
  correct_answer TEXT NULL,
  explanation TEXT NULL,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Todos',
  difficulty VARCHAR(40) NOT NULL DEFAULT 'Básico',
  theme VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY question_bank_sector_idx (target_sector, active),
  KEY question_bank_type_idx (bank_type, active),
  CONSTRAINT question_bank_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE training_modules (
  id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  content LONGTEXT NULL,
  display_order INT NOT NULL DEFAULT 1,
  min_score DECIMAL(6,2) NOT NULL DEFAULT 7,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'Todos',
  status VARCHAR(32) NOT NULL DEFAULT 'Ativo',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY training_modules_order_idx (status, display_order),
  CONSTRAINT training_modules_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE training_activity_attempts (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  employee_id CHAR(36) NULL,
  employee_name VARCHAR(255) NOT NULL,
  employee_matricula VARCHAR(64) NULL,
  employee_sector VARCHAR(80) NULL,
  activity_type VARCHAR(80) NOT NULL,
  activity_title VARCHAR(255) NOT NULL,
  answers JSON NOT NULL,
  score DECIMAL(6,2) NOT NULL DEFAULT 0,
  max_score DECIMAL(6,2) NOT NULL DEFAULT 10,
  passed TINYINT(1) NOT NULL DEFAULT 0,
  points_earned INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  activity_day DATE NULL,
  daily_challenge_guard VARCHAR(100) GENERATED ALWAYS AS (
    CASE WHEN activity_type = 'Desafio Diário' AND activity_day IS NOT NULL
      THEN CONCAT(user_id, '|', DATE_FORMAT(activity_day, '%Y-%m-%d'))
      ELSE NULL END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY training_activity_daily_challenge_unique_idx (daily_challenge_guard),
  KEY training_activity_attempts_user_created_idx (user_id, created_at),
  CONSTRAINT training_activity_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT training_activity_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE training_schedules (
  id CHAR(36) NOT NULL,
  employee_id CHAR(36) NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  employee_matricula VARCHAR(64) NULL,
  cycle_days INT NOT NULL DEFAULT 90,
  last_training_date DATE NULL,
  window_start DATE NULL,
  window_end DATE NULL,
  observations TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Em dia',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY training_schedules_employee_id_key (employee_id),
  KEY training_schedules_status_idx (status, window_end),
  CONSTRAINT training_schedules_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT training_schedules_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE practical_eval_templates (
  id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  platform VARCHAR(120) NULL,
  description TEXT NULL,
  target_sector VARCHAR(80) NOT NULL DEFAULT 'CFTV',
  min_approval_score DECIMAL(6,2) NOT NULL DEFAULT 7,
  recurrence VARCHAR(40) NOT NULL DEFAULT 'monthly',
  applications_per_month INT NOT NULL DEFAULT 1,
  tasks JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Ativo',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY practical_eval_templates_status_idx (status, target_sector, recurrence),
  CONSTRAINT practical_eval_templates_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE practical_evaluations (
  id CHAR(36) NOT NULL,
  employee_id CHAR(36) NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  employee_matricula VARCHAR(64) NOT NULL,
  employee_sector VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  evaluator_id CHAR(36) NULL,
  evaluator_name VARCHAR(255) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Planejada',
  score DECIMAL(6,2) NOT NULL DEFAULT 0,
  max_score DECIMAL(6,2) NOT NULL DEFAULT 10,
  checklist JSON NOT NULL,
  notes TEXT NULL,
  evaluation_date DATE NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY practical_evaluations_employee_idx (employee_id, evaluation_date),
  KEY practical_evaluations_status_idx (status, evaluation_date),
  CONSTRAINT practical_evaluations_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT practical_evaluations_evaluator_fk FOREIGN KEY (evaluator_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE occurrences (
  id CHAR(36) NOT NULL,
  employee_id CHAR(36) NULL,
  employee_name VARCHAR(255) NULL,
  employee_matricula VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Operacional',
  severity VARCHAR(40) NOT NULL DEFAULT 'Baixa',
  description LONGTEXT NOT NULL,
  location VARCHAR(255) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Aberta',
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolution_notes TEXT NULL,
  resolved_at DATETIME(3) NULL,
  created_by CHAR(36) NULL,
  created_by_name VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY occurrences_employee_idx (employee_id, occurred_at),
  KEY occurrences_status_idx (status, occurred_at),
  CONSTRAINT occurrences_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT occurrences_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entity_id VARCHAR(128) NULL,
  details JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY audit_logs_created_idx (created_at),
  KEY audit_logs_entity_idx (entity, entity_id),
  CONSTRAINT audit_logs_actor_fk FOREIGN KEY (actor_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Regras que deverão ser implementadas na API, não por acesso direto do navegador:
-- 1) autorização por role/setor/identidade (substitui RLS);
-- 2) criação de exam_attempts com correção server-side;
-- 3) criação de training_activity_attempts com cálculo server-side;
-- 4) assinatura e emissão de certificado em transação;
-- 5) ativação de conta/código temporário;
-- 6) auditoria de INSERT/UPDATE/DELETE;
-- 7) armazenamento privado de evidências.