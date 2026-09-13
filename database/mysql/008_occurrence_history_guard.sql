-- SEGEMPAT · proteção de histórico operacional de ocorrências
--
-- O registro deixa de ser descartável assim que entra em tratamento, recebe
-- atualização de andamento ou evidência fotográfica. Ocorrências concluídas são
-- imutáveis no nível do banco, complementando as barreiras da API.

DROP TRIGGER IF EXISTS occurrences_guard_delete;

CREATE TRIGGER occurrences_guard_delete
BEFORE DELETE ON occurrences
FOR EACH ROW
BEGIN
  IF OLD.status <> 'Aberta' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Ocorrencia em tratamento ou concluida pertence ao historico e nao pode ser excluida';
  END IF;

  IF EXISTS (SELECT 1 FROM occurrence_updates u WHERE u.occurrence_id = OLD.id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Ocorrencia com atualizacoes pertence ao historico e nao pode ser excluida';
  END IF;

  IF EXISTS (SELECT 1 FROM occurrence_attachments a WHERE a.occurrence_id = OLD.id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Ocorrencia com evidencia pertence ao historico e nao pode ser excluida';
  END IF;
END;

DROP TRIGGER IF EXISTS occurrences_guard_completed_update;

CREATE TRIGGER occurrences_guard_completed_update
BEFORE UPDATE ON occurrences
FOR EACH ROW
BEGIN
  IF OLD.status = 'Concluída' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Ocorrencia concluida pertence ao historico e nao pode ser alterada';
  END IF;
END;
