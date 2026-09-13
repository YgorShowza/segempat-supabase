-- SEGEMPAT · Supabase/PostgreSQL · hardening equivalente às migrations MySQL 002–010
-- Mantém a arquitetura API-owned e as regras de integridade do estado corporativo atual.
SET TIME ZONE 'UTC';

-- 002 · Integridade do Cronograma
CREATE OR REPLACE FUNCTION public.segempat_cronograma_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_completion date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('Realizado', 'Justificado') THEN
      RAISE EXCEPTION 'Lancamento realizado ou justificado pertence ao historico e nao pode ser excluido';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status = 'Realizado' THEN
    NEW.type := 'Realizado';
    NEW.justification := NULL;

    IF NEW.exam_id IS NOT NULL THEN
      SELECT (MIN(finished_at) AT TIME ZONE 'America/Maceio')::date
        INTO v_completion
        FROM exam_attempts
       WHERE exam_id = NEW.exam_id
         AND lower(trim(COALESCE(matricula, ''))) = lower(trim(NEW.employee_matricula))
         AND passed = 1;

      IF v_completion IS NULL THEN
        RAISE EXCEPTION 'Cronograma vinculado a prova exige tentativa aprovada da mesma matricula';
      END IF;

      NEW.completion_date := v_completion;
    ELSIF NEW.completion_date IS NULL THEN
      RAISE EXCEPTION 'Atividade realizada sem prova exige data de conclusao';
    END IF;
  ELSIF NEW.status = 'Justificado' THEN
    IF NEW.justification IS NULL OR length(trim(NEW.justification)) = 0 THEN
      RAISE EXCEPTION 'Lancamento justificado exige motivo';
    END IF;
    NEW.type := 'Planejado';
    NEW.completion_date := NULL;
  ELSE
    NEW.type := 'Planejado';
    NEW.completion_date := NULL;
    NEW.justification := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cronograma_entries_guard_write ON cronograma_entries;
CREATE TRIGGER cronograma_entries_guard_write
BEFORE INSERT OR UPDATE ON cronograma_entries
FOR EACH ROW EXECUTE FUNCTION public.segempat_cronograma_guard();

DROP TRIGGER IF EXISTS cronograma_entries_guard_delete ON cronograma_entries;
CREATE TRIGGER cronograma_entries_guard_delete
BEFORE DELETE ON cronograma_entries
FOR EACH ROW EXECUTE FUNCTION public.segempat_cronograma_guard();

-- 003 · Nota mínima de aprovação em avaliação prática
ALTER TABLE practical_evaluations
  ADD COLUMN min_approval_score NUMERIC(6,2) NOT NULL DEFAULT 7;

UPDATE practical_evaluations
   SET min_approval_score = 7
 WHERE min_approval_score < 0 OR min_approval_score > 10;

-- 004 · Geração por modelo de avaliação prática
ALTER TABLE practical_evaluations
  ADD COLUMN template_id UUID NULL,
  ADD COLUMN template_slot VARCHAR(64) NULL;

CREATE UNIQUE INDEX practical_evaluations_template_slot_unique_idx
  ON practical_evaluations (employee_id, template_id, template_slot);

CREATE INDEX practical_evaluations_template_idx
  ON practical_evaluations (template_id, evaluation_date);

ALTER TABLE practical_evaluations
  ADD CONSTRAINT practical_evaluations_template_fk
  FOREIGN KEY (template_id) REFERENCES practical_eval_templates(id) ON DELETE RESTRICT;

-- 005 · Proteção do histórico entre Avaliação Prática e Cronograma
CREATE OR REPLACE FUNCTION public.segempat_practical_history_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'Planejada' THEN
    RAISE EXCEPTION 'Avaliacao pratica em andamento ou concluida pertence ao historico operacional e nao pode ser excluida';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM cronograma_entries ce
     WHERE ce.employee_id = OLD.employee_id
       AND ce.notes LIKE ('%[PRACTICAL:' || OLD.id::text || ']%')
       AND ce.status <> 'Pendente'
  ) THEN
    RAISE EXCEPTION 'Avaliacao pratica vinculada a Cronograma formalizado pertence ao historico e nao pode ser excluida';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS practical_evaluations_guard_delete ON practical_evaluations;
CREATE TRIGGER practical_evaluations_guard_delete
BEFORE DELETE ON practical_evaluations
FOR EACH ROW EXECUTE FUNCTION public.segempat_practical_history_guard();

-- 006 · Governança, auditoria imutável e revogação de sessão
ALTER TABLE app_users
  ADD COLUMN session_epoch BIGINT NOT NULL DEFAULT 0;

ALTER TABLE audit_logs
  DROP CONSTRAINT audit_logs_actor_fk;

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_fk
  FOREIGN KEY (actor_id) REFERENCES app_users(id)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.segempat_block_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log e imutavel e nao pode ser alterado ou excluido';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_block_update ON audit_logs;
CREATE TRIGGER audit_logs_block_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION public.segempat_block_audit_mutation();

DROP TRIGGER IF EXISTS audit_logs_block_delete ON audit_logs;
CREATE TRIGGER audit_logs_block_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION public.segempat_block_audit_mutation();

-- 007 · Registro operacional completo de ocorrências
ALTER TABLE occurrences
  ADD COLUMN current_situation TEXT NULL,
  ADD COLUMN immediate_risk TEXT NULL,
  ADD COLUMN information_source VARCHAR(255) NULL,
  ADD COLUMN actions_taken TEXT NULL,
  ADD COLUMN support_required TEXT NULL,
  ADD COLUMN people_involved JSONB NULL;

UPDATE occurrences
   SET people_involved = '[]'::jsonb
 WHERE people_involved IS NULL;

ALTER TABLE occurrences
  ALTER COLUMN people_involved SET NOT NULL,
  ALTER COLUMN people_involved SET DEFAULT '[]'::jsonb;

CREATE TABLE occurrence_updates (
  id UUID NOT NULL,
  occurrence_id UUID NOT NULL,
  note TEXT NOT NULL,
  status_snapshot VARCHAR(40) NOT NULL,
  created_by UUID NULL,
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT occurrence_updates_occurrence_fk FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
  CONSTRAINT occurrence_updates_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX occurrence_updates_occurrence_idx
  ON occurrence_updates (occurrence_id, created_at);

CREATE TABLE occurrence_attachments (
  id UUID NOT NULL,
  occurrence_id UUID NOT NULL,
  storage_path VARCHAR(1024) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes BIGINT NOT NULL,
  caption VARCHAR(500) NULL,
  uploaded_by UUID NULL,
  uploaded_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT occurrence_attachments_storage_path_uidx UNIQUE (storage_path),
  CONSTRAINT occurrence_attachments_occurrence_fk FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
  CONSTRAINT occurrence_attachments_uploader_fk FOREIGN KEY (uploaded_by) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT occurrence_attachments_size_chk CHECK (size_bytes > 0 AND size_bytes <= 1250000)
);

CREATE INDEX occurrence_attachments_occurrence_idx
  ON occurrence_attachments (occurrence_id, created_at);

-- 008 · Proteção do histórico de ocorrências
CREATE OR REPLACE FUNCTION public.segempat_occurrence_history_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'Aberta' THEN
      RAISE EXCEPTION 'Ocorrencia em tratamento ou concluida pertence ao historico e nao pode ser excluida';
    END IF;

    IF EXISTS (SELECT 1 FROM occurrence_updates u WHERE u.occurrence_id = OLD.id) THEN
      RAISE EXCEPTION 'Ocorrencia com atualizacoes pertence ao historico e nao pode ser excluida';
    END IF;

    IF EXISTS (SELECT 1 FROM occurrence_attachments a WHERE a.occurrence_id = OLD.id) THEN
      RAISE EXCEPTION 'Ocorrencia com evidencia pertence ao historico e nao pode ser excluida';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.status = 'Concluída' THEN
    RAISE EXCEPTION 'Ocorrencia concluida pertence ao historico e nao pode ser alterada';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS occurrences_guard_delete ON occurrences;
CREATE TRIGGER occurrences_guard_delete
BEFORE DELETE ON occurrences
FOR EACH ROW EXECUTE FUNCTION public.segempat_occurrence_history_guard();

DROP TRIGGER IF EXISTS occurrences_guard_completed_update ON occurrences;
CREATE TRIGGER occurrences_guard_completed_update
BEFORE UPDATE ON occurrences
FOR EACH ROW EXECUTE FUNCTION public.segempat_occurrence_history_guard();

-- 009 · Recuperação segura de senha
CREATE TABLE password_reset_codes (
  user_id UUID NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  used_at TIMESTAMPTZ(3) NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ(3) NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT password_reset_codes_attempts_chk CHECK (failed_attempts BETWEEN 0 AND 5),
  CONSTRAINT password_reset_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT password_reset_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX password_reset_codes_expiry_idx
  ON password_reset_codes (expires_at, used_at, locked_at);

DROP TRIGGER IF EXISTS password_reset_codes_set_updated_at ON password_reset_codes;
CREATE TRIGGER password_reset_codes_set_updated_at
BEFORE UPDATE ON password_reset_codes
FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

-- 010 · Controle de acesso granular e níveis administrativos
CREATE TABLE access_levels (
  code VARCHAR(32) NOT NULL,
  label VARCHAR(80) NOT NULL,
  rank_value INT NOT NULL,
  PRIMARY KEY (code),
  CONSTRAINT access_levels_rank_key UNIQUE (rank_value)
);

CREATE TABLE access_permissions (
  code VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  permission_group VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  master_only SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (code),
  CONSTRAINT access_permissions_master_only_chk CHECK (master_only IN (0, 1))
);

CREATE INDEX access_permissions_group_idx
  ON access_permissions (permission_group, sort_order);

CREATE TABLE access_level_permissions (
  level_code VARCHAR(32) NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  PRIMARY KEY (level_code, permission_code),
  CONSTRAINT access_level_permissions_level_fk FOREIGN KEY (level_code) REFERENCES access_levels(code) ON DELETE CASCADE,
  CONSTRAINT access_level_permissions_permission_fk FOREIGN KEY (permission_code) REFERENCES access_permissions(code) ON DELETE CASCADE
);

CREATE TABLE user_access_levels (
  user_id UUID NOT NULL,
  level_code VARCHAR(32) NOT NULL,
  updated_by UUID NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT user_access_levels_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT user_access_levels_level_fk FOREIGN KEY (level_code) REFERENCES access_levels(code) ON DELETE RESTRICT,
  CONSTRAINT user_access_levels_updater_fk FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX user_access_levels_level_idx ON user_access_levels (level_code);

DROP TRIGGER IF EXISTS user_access_levels_set_updated_at ON user_access_levels;
CREATE TRIGGER user_access_levels_set_updated_at
BEFORE UPDATE ON user_access_levels
FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

CREATE TABLE user_permission_overrides (
  user_id UUID NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  allowed SMALLINT NOT NULL,
  updated_by UUID NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, permission_code),
  CONSTRAINT user_permission_overrides_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT user_permission_overrides_permission_fk FOREIGN KEY (permission_code) REFERENCES access_permissions(code) ON DELETE CASCADE,
  CONSTRAINT user_permission_overrides_updater_fk FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT user_permission_overrides_allowed_chk CHECK (allowed IN (0, 1))
);

CREATE INDEX user_permission_overrides_permission_idx
  ON user_permission_overrides (permission_code, allowed);

DROP TRIGGER IF EXISTS user_permission_overrides_set_updated_at ON user_permission_overrides;
CREATE TRIGGER user_permission_overrides_set_updated_at
BEFORE UPDATE ON user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

INSERT INTO access_levels (code, label, rank_value) VALUES
  ('master', 'Administrador Master', 100),
  ('admin', 'Administrador', 80),
  ('inspector', 'Inspetor', 60),
  ('operator', 'Operador', 10);

INSERT INTO access_permissions (code, label, permission_group, sort_order, master_only) VALUES
  ('dashboard.view', 'Visualizar dashboard administrativo', 'Comando Operacional', 10, 0),
  ('attention.view', 'Visualizar Central de Atenção', 'Comando Operacional', 20, 0),
  ('team.view', 'Visualizar equipe completa', 'Equipe & Desempenho', 30, 0),
  ('team.manage', 'Cadastrar e editar colaboradores', 'Equipe & Desempenho', 40, 0),
  ('risk.view', 'Visualizar Zona de Risco', 'Equipe & Desempenho', 50, 0),
  ('schedule.manage', 'Gerenciar cronograma', 'Operação', 60, 0),
  ('occurrences.manage', 'Gerenciar ocorrências', 'Operação', 70, 0),
  ('practical.manage', 'Gerenciar avaliações práticas', 'Operação', 80, 0),
  ('exams.manage', 'Criar e gerenciar provas', 'Capacitação', 90, 0),
  ('question_bank.manage', 'Gerenciar banco de questões', 'Capacitação', 100, 0),
  ('training.manage', 'Gerenciar treinamentos, módulos e ciclos', 'Capacitação', 110, 0),
  ('knowledge.manage', 'Gerenciar conteúdos e base de conhecimento', 'Capacitação', 120, 0),
  ('certificates.manage', 'Gerenciar certificados e assinaturas', 'Capacitação', 130, 0),
  ('analytics.view', 'Visualizar Analytics e análise individual', 'Relatórios & Inteligência', 140, 0),
  ('reports.view', 'Visualizar relatórios gerenciais', 'Relatórios & Inteligência', 150, 0),
  ('ai.view', 'Acessar IA Base', 'Relatórios & Inteligência', 160, 0),
  ('access.identity.manage', 'Gerenciar primeiro acesso', 'Governança', 170, 0),
  ('access.password_reset', 'Autorizar recuperação de senha', 'Governança', 180, 0),
  ('audit.view', 'Visualizar trilha de auditoria', 'Governança', 190, 0),
  ('security.document.view', 'Visualizar documento de segurança', 'Governança', 200, 0),
  ('access.permissions.manage', 'Gerenciar níveis e permissões', 'Segurança', 210, 1);

INSERT INTO access_level_permissions (level_code, permission_code)
SELECT 'master', code FROM access_permissions;

INSERT INTO access_level_permissions (level_code, permission_code)
SELECT 'admin', code FROM access_permissions
 WHERE code NOT IN ('access.permissions.manage', 'audit.view');

INSERT INTO access_level_permissions (level_code, permission_code)
SELECT 'inspector', code FROM access_permissions
 WHERE code NOT IN ('access.permissions.manage', 'audit.view', 'security.document.view');

-- Contas legadas nunca são elevadas a Master automaticamente.
INSERT INTO user_access_levels (user_id, level_code, updated_by, updated_at)
SELECT u.id,
       CASE
         WHEN e.access_profile = 'Inspetor' THEN 'inspector'
         WHEN EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') THEN 'admin'
         ELSE 'operator'
       END,
       NULL,
       CURRENT_TIMESTAMP(3)
  FROM app_users u
  LEFT JOIN employees e ON lower(trim(e.matricula)) = lower(trim(u.matricula));
