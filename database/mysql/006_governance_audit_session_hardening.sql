-- SEGEMPAT · governança, auditoria imutável e revogação de sessão
--
-- 1) session_epoch permite invalidar imediatamente cookies já emitidos quando
--    status/privilégio muda, sem depender de troca de senha.
-- 2) audit_logs passa a ser append-only: UPDATE e DELETE são bloqueados no banco.
-- 3) actor_id usa RESTRICT para preservar a identidade referenciada e impedir que
--    a exclusão de uma conta reescreva silenciosamente um log histórico.

ALTER TABLE app_users
  ADD COLUMN session_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER password_hash;

ALTER TABLE audit_logs
  DROP FOREIGN KEY audit_logs_actor_fk;

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_fk
  FOREIGN KEY (actor_id) REFERENCES app_users(id)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS audit_logs_block_update;

CREATE TRIGGER audit_logs_block_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Audit log e imutavel e nao pode ser alterado';
END;

DROP TRIGGER IF EXISTS audit_logs_block_delete;

CREATE TRIGGER audit_logs_block_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Audit log pertence ao historico e nao pode ser excluido';
END;
