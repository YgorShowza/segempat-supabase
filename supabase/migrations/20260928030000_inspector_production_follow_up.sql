-- SEGEMPAT · Produção da Inspetoria · Continuidade / acompanhamento
-- Um acompanhamento é sempre um novo registro imutável, vinculado ao registro que originou a continuidade.

SET TIME ZONE 'UTC';

ALTER TABLE inspector_production_entries
  ADD COLUMN parent_entry_id UUID NULL;

ALTER TABLE inspector_production_entries
  ADD CONSTRAINT inspector_production_entries_parent_fk
  FOREIGN KEY (parent_entry_id) REFERENCES inspector_production_entries(id) ON DELETE RESTRICT;

ALTER TABLE inspector_production_entries
  ADD CONSTRAINT inspector_production_entries_parent_self_chk
  CHECK (parent_entry_id IS NULL OR parent_entry_id <> id);

CREATE INDEX inspector_production_entries_parent_idx
  ON inspector_production_entries (parent_entry_id, executed_at ASC)
  WHERE parent_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.segempat_inspector_production_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_status text;
  parent_result text;
BEGIN
  IF NEW.parent_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_entry_id = NEW.id THEN
    RAISE EXCEPTION 'Um acompanhamento não pode referenciar o próprio registro';
  END IF;

  SELECT status, result_status
    INTO parent_status, parent_result
    FROM public.inspector_production_entries
   WHERE id = NEW.parent_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de origem do acompanhamento não encontrado';
  END IF;

  IF parent_status <> 'Registrada' THEN
    RAISE EXCEPTION 'Registro cancelado não pode originar novo acompanhamento';
  END IF;

  IF parent_result NOT IN ('Concluído com pendência', 'Requer acompanhamento') THEN
    RAISE EXCEPTION 'Somente registros com pendência ou que requeiram acompanhamento podem originar continuidade';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inspector_production_entries_guard_parent_insert ON inspector_production_entries;
CREATE TRIGGER inspector_production_entries_guard_parent_insert
BEFORE INSERT ON inspector_production_entries
FOR EACH ROW EXECUTE FUNCTION public.segempat_inspector_production_parent_guard();

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
     OR NEW.result_status IS DISTINCT FROM OLD.result_status
     OR NEW.parent_entry_id IS DISTINCT FROM OLD.parent_entry_id
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.location IS DISTINCT FROM OLD.location
     OR NEW.executed_at IS DISTINCT FROM OLD.executed_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Identidade, resultado, vínculo e conteúdo do registro de produção são imutáveis';
  END IF;

  IF NEW.status NOT IN ('Registrada', 'Cancelada') THEN
    RAISE EXCEPTION 'Situação de produção inválida';
  END IF;

  IF NEW.result_status NOT IN ('Concluído', 'Concluído com pendência', 'Requer acompanhamento') THEN
    RAISE EXCEPTION 'Resultado da atribuição inválido';
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
