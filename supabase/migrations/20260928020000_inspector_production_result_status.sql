-- SEGEMPAT · Produção da Inspetoria · Resultado da atribuição
-- Separa a situação histórica do registro (Registrada/Cancelada) do desfecho operacional da atividade.

SET TIME ZONE 'UTC';

ALTER TABLE inspector_production_entries
  ADD COLUMN result_status VARCHAR(40) NOT NULL;

ALTER TABLE inspector_production_entries
  ADD CONSTRAINT inspector_production_entries_result_status_chk
  CHECK (result_status IN ('Concluído', 'Concluído com pendência', 'Requer acompanhamento'));

CREATE INDEX inspector_production_entries_result_date_idx
  ON inspector_production_entries (result_status, executed_at DESC);

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
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.location IS DISTINCT FROM OLD.location
     OR NEW.executed_at IS DISTINCT FROM OLD.executed_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Identidade, resultado e conteúdo do registro de produção são imutáveis';
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
