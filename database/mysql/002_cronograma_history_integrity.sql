-- SEGEMPAT · integridade do Cronograma no banco corporativo
-- Garante que uma atividade vinculada a prova só fique Realizado quando houver
-- tentativa aprovada da mesma prova/matrícula e preserva registros históricos.

DROP TRIGGER IF EXISTS cronograma_entries_guard_insert;
DROP TRIGGER IF EXISTS cronograma_entries_guard_update;
DROP TRIGGER IF EXISTS cronograma_entries_guard_delete;

CREATE TRIGGER cronograma_entries_guard_insert
BEFORE INSERT ON cronograma_entries
FOR EACH ROW
BEGIN
  DECLARE v_completion DATE DEFAULT NULL;

  IF NEW.status = 'Realizado' THEN
    SET NEW.type = 'Realizado';
    SET NEW.justification = NULL;

    IF NEW.exam_id IS NOT NULL THEN
      SELECT DATE(DATE_SUB(MIN(finished_at), INTERVAL 3 HOUR))
        INTO v_completion
        FROM exam_attempts
       WHERE exam_id = NEW.exam_id
         AND LOWER(TRIM(matricula)) = LOWER(TRIM(NEW.employee_matricula))
         AND passed = 1;

      IF v_completion IS NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Cronograma vinculado a prova exige tentativa aprovada da mesma matricula';
      END IF;

      SET NEW.completion_date = v_completion;
    ELSEIF NEW.completion_date IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Atividade realizada sem prova exige data de conclusao';
    END IF;
  ELSEIF NEW.status = 'Justificado' THEN
    IF NEW.justification IS NULL OR CHAR_LENGTH(TRIM(NEW.justification)) = 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lancamento justificado exige motivo';
    END IF;
    SET NEW.type = 'Planejado';
    SET NEW.completion_date = NULL;
  ELSE
    SET NEW.type = 'Planejado';
    SET NEW.completion_date = NULL;
    SET NEW.justification = NULL;
  END IF;
END;

CREATE TRIGGER cronograma_entries_guard_update
BEFORE UPDATE ON cronograma_entries
FOR EACH ROW
BEGIN
  DECLARE v_completion DATE DEFAULT NULL;

  IF NEW.status = 'Realizado' THEN
    SET NEW.type = 'Realizado';
    SET NEW.justification = NULL;

    IF NEW.exam_id IS NOT NULL THEN
      SELECT DATE(DATE_SUB(MIN(finished_at), INTERVAL 3 HOUR))
        INTO v_completion
        FROM exam_attempts
       WHERE exam_id = NEW.exam_id
         AND LOWER(TRIM(matricula)) = LOWER(TRIM(NEW.employee_matricula))
         AND passed = 1;

      IF v_completion IS NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Cronograma vinculado a prova exige tentativa aprovada da mesma matricula';
      END IF;

      SET NEW.completion_date = v_completion;
    ELSEIF NEW.completion_date IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Atividade realizada sem prova exige data de conclusao';
    END IF;
  ELSEIF NEW.status = 'Justificado' THEN
    IF NEW.justification IS NULL OR CHAR_LENGTH(TRIM(NEW.justification)) = 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lancamento justificado exige motivo';
    END IF;
    SET NEW.type = 'Planejado';
    SET NEW.completion_date = NULL;
  ELSE
    SET NEW.type = 'Planejado';
    SET NEW.completion_date = NULL;
    SET NEW.justification = NULL;
  END IF;
END;

CREATE TRIGGER cronograma_entries_guard_delete
BEFORE DELETE ON cronograma_entries
FOR EACH ROW
BEGIN
  IF OLD.status IN ('Realizado', 'Justificado') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Lancamento realizado ou justificado pertence ao historico e nao pode ser excluido';
  END IF;
END;
