-- SEGEMPAT · proteção de histórico entre Avaliação Prática e Cronograma
--
-- Uma avaliação ainda pode aparecer como Planejada quando o lançamento correspondente
-- do Cronograma já foi formalizado como Realizado/Justificado. Nesse caso o vínculo é
-- evidência operacional e não pode ser apagado, pois isso deixaria o marcador
-- [PRACTICAL:<id>] apontando para uma avaliação inexistente.

DROP TRIGGER IF EXISTS practical_evaluations_guard_delete;

CREATE TRIGGER practical_evaluations_guard_delete
BEFORE DELETE ON practical_evaluations
FOR EACH ROW
BEGIN
  IF OLD.status <> 'Planejada' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Avaliacao pratica em andamento ou concluida pertence ao historico operacional e nao pode ser excluida';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM cronograma_entries ce
     WHERE ce.employee_id = OLD.employee_id
       AND ce.notes LIKE CONCAT('%[PRACTICAL:', OLD.id, ']%')
       AND ce.status <> 'Pendente'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Avaliacao pratica vinculada a Cronograma formalizado pertence ao historico e nao pode ser excluida';
  END IF;
END;
