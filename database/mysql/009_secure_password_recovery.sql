-- SEGEMPAT · recuperação segura de senha
--
-- Códigos de recuperação são de uso único, armazenados somente como hash e
-- vinculados à conta existente. O contador de tentativas permite bloquear um
-- código após sucessivas validações incorretas sem expor a credencial em texto.

CREATE TABLE password_reset_codes (
  user_id CHAR(36) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_at DATETIME(3) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY password_reset_codes_expiry_idx (expires_at, used_at, locked_at),
  CONSTRAINT password_reset_codes_attempts_chk CHECK (failed_attempts BETWEEN 0 AND 5),
  CONSTRAINT password_reset_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT password_reset_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
