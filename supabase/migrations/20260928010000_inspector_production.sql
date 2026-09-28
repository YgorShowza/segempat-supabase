-- SEGEMPAT · Produção da Inspetoria
-- Registro imutável das atribuições executadas pelos Inspetores de Unidade de Segurança Portuária.
-- Princípio: o executor é sempre derivado da sessão autenticada; não há atribuição prévia por responsável.

SET TIME ZONE 'UTC';

CREATE TABLE inspector_production_members (
  employee_id UUID NOT NULL,
  is_leader SMALLINT NOT NULL DEFAULT 0,
  active SMALLINT NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  created_by UUID NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (employee_id),
  CONSTRAINT inspector_production_members_employee_fk
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT inspector_production_members_creator_fk
    FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT inspector_production_members_leader_chk CHECK (is_leader IN (0, 1)),
  CONSTRAINT inspector_production_members_active_chk CHECK (active IN (0, 1))
);

CREATE UNIQUE INDEX inspector_production_one_active_leader_uidx
  ON inspector_production_members ((1))
  WHERE active = 1 AND is_leader = 1;

CREATE INDEX inspector_production_members_active_idx
  ON inspector_production_members (active, display_order);

CREATE TABLE inspector_production_entries (
  id UUID NOT NULL,
  executor_employee_id UUID NOT NULL,
  executor_user_id UUID NOT NULL,
  executor_name VARCHAR(255) NOT NULL,
  executor_matricula VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL,
  details TEXT NOT NULL,
  location VARCHAR(255) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'Registrada',
  executed_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  canceled_at TIMESTAMPTZ(3) NULL,
  canceled_by UUID NULL,
  canceled_by_name VARCHAR(255) NULL,
  canceled_reason VARCHAR(500) NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT inspector_production_entries_employee_fk
    FOREIGN KEY (executor_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT inspector_production_entries_user_fk
    FOREIGN KEY (executor_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT inspector_production_entries_canceled_by_fk
    FOREIGN KEY (canceled_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT inspector_production_entries_status_chk
    CHECK (status IN ('Registrada', 'Cancelada'))
);

CREATE INDEX inspector_production_entries_date_idx
  ON inspector_production_entries (executed_at DESC);

CREATE INDEX inspector_production_entries_executor_date_idx
  ON inspector_production_entries (executor_employee_id, executed_at DESC);

CREATE INDEX inspector_production_entries_category_date_idx
  ON inspector_production_entries (category, executed_at DESC);

CREATE INDEX inspector_production_entries_status_date_idx
  ON inspector_production_entries (status, executed_at DESC);

CREATE TABLE inspector_production_attachments (
  id UUID NOT NULL,
  entry_id UUID NOT NULL,
  storage_path VARCHAR(1024) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes BIGINT NOT NULL,
  caption VARCHAR(500) NULL,
  uploaded_by UUID NOT NULL,
  uploaded_by_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT inspector_production_attachments_storage_uidx UNIQUE (storage_path),
  CONSTRAINT inspector_production_attachments_entry_fk
    FOREIGN KEY (entry_id) REFERENCES inspector_production_entries(id) ON DELETE RESTRICT,
  CONSTRAINT inspector_production_attachments_uploader_fk
    FOREIGN KEY (uploaded_by) REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT inspector_production_attachments_size_chk
    CHECK (size_bytes BETWEEN 100 AND 1250000),
  CONSTRAINT inspector_production_attachments_mime_chk
    CHECK (mime_type IN ('image/png', 'image/jpeg'))
);

CREATE INDEX inspector_production_attachments_entry_idx
  ON inspector_production_attachments (entry_id, created_at);

DROP TRIGGER IF EXISTS inspector_production_members_set_updated_at ON inspector_production_members;
CREATE TRIGGER inspector_production_members_set_updated_at
BEFORE UPDATE ON inspector_production_members
FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

DROP TRIGGER IF EXISTS inspector_production_entries_set_updated_at ON inspector_production_entries;
CREATE TRIGGER inspector_production_entries_set_updated_at
BEFORE UPDATE ON inspector_production_entries
FOR EACH ROW EXECUTE FUNCTION public.segempat_set_updated_at();

CREATE OR REPLACE FUNCTION public.segempat_inspector_production_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Registro de produção pertence ao histórico e não pode ser excluído';
  END IF;

  IF OLD.status = 'Cancelada' THEN
    RAISE EXCEPTION 'Registro cancelado pertence ao histórico e não pode ser alterado';
  END IF;

  IF NEW.executor_employee_id IS DISTINCT FROM OLD.executor_employee_id
     OR NEW.executor_user_id IS DISTINCT FROM OLD.executor_user_id
     OR NEW.executor_name IS DISTINCT FROM OLD.executor_name
     OR NEW.executor_matricula IS DISTINCT FROM OLD.executor_matricula
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.location IS DISTINCT FROM OLD.location
     OR NEW.executed_at IS DISTINCT FROM OLD.executed_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Identidade e conteúdo do registro de produção são imutáveis';
  END IF;

  IF NEW.status NOT IN ('Registrada', 'Cancelada') THEN
    RAISE EXCEPTION 'Situação de produção inválida';
  END IF;

  IF NEW.status = 'Cancelada' THEN
    IF NEW.canceled_at IS NULL OR NEW.canceled_by IS NULL
       OR NEW.canceled_reason IS NULL OR length(trim(NEW.canceled_reason)) = 0 THEN
      RAISE EXCEPTION 'Cancelamento exige autor, data e motivo';
    END IF;
  ELSE
    IF NEW.canceled_at IS NOT NULL OR NEW.canceled_by IS NOT NULL
       OR NEW.canceled_by_name IS NOT NULL OR NEW.canceled_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Registro ativo não pode conter dados de cancelamento';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inspector_production_entries_guard_update ON inspector_production_entries;
CREATE TRIGGER inspector_production_entries_guard_update
BEFORE UPDATE ON inspector_production_entries
FOR EACH ROW EXECUTE FUNCTION public.segempat_inspector_production_guard();

DROP TRIGGER IF EXISTS inspector_production_entries_guard_delete ON inspector_production_entries;
CREATE TRIGGER inspector_production_entries_guard_delete
BEFORE DELETE ON inspector_production_entries
FOR EACH ROW EXECUTE FUNCTION public.segempat_inspector_production_guard();

CREATE OR REPLACE FUNCTION public.segempat_inspector_production_attachment_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Evidência de produção é imutável e não pode ser alterada ou excluída';
END;
$$;

DROP TRIGGER IF EXISTS inspector_production_attachments_guard_update ON inspector_production_attachments;
CREATE TRIGGER inspector_production_attachments_guard_update
BEFORE UPDATE ON inspector_production_attachments
FOR EACH ROW EXECUTE FUNCTION public.segempat_inspector_production_attachment_guard();

DROP TRIGGER IF EXISTS inspector_production_attachments_guard_delete ON inspector_production_attachments;
CREATE TRIGGER inspector_production_attachments_guard_delete
BEFORE DELETE ON inspector_production_attachments
FOR EACH ROW EXECUTE FUNCTION public.segempat_inspector_production_attachment_guard();

INSERT INTO access_permissions (code, label, permission_group, sort_order, master_only) VALUES
  ('inspector_production.view', 'Visualizar Produção da Inspetoria', 'Equipe & Desempenho', 55, 0),
  ('inspector_production.record', 'Registrar Produção da Inspetoria', 'Equipe & Desempenho', 56, 0);

INSERT INTO access_level_permissions (level_code, permission_code) VALUES
  ('master', 'inspector_production.view'),
  ('master', 'inspector_production.record'),
  ('admin', 'inspector_production.view'),
  ('admin', 'inspector_production.record'),
  ('inspector', 'inspector_production.view'),
  ('inspector', 'inspector_production.record');

-- A edição Supabase é API-owned. Fecha as novas tabelas para a Data API.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE inspector_production_members FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE inspector_production_entries FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE inspector_production_attachments FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;

-- Menor privilégio do runtime: consulta membros, registra/cancela entradas e adiciona evidências.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'segempat_runtime') THEN
    GRANT SELECT ON inspector_production_members TO segempat_runtime;
    GRANT SELECT, INSERT, UPDATE ON inspector_production_entries TO segempat_runtime;
    GRANT SELECT, INSERT ON inspector_production_attachments TO segempat_runtime;
  END IF;
END;
$$;
