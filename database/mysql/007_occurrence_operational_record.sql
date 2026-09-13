-- SEGEMPAT · registro operacional completo de ocorrências
--
-- Restaura os elementos confirmados no fluxo operacional: situação atual,
-- risco imediato, fonte, providências, apoio necessário, pessoas envolvidas,
-- atualizações de cenário e evidências fotográficas/documentais privadas.

ALTER TABLE occurrences
  ADD COLUMN current_situation TEXT NULL AFTER description,
  ADD COLUMN immediate_risk TEXT NULL AFTER current_situation,
  ADD COLUMN information_source VARCHAR(255) NULL AFTER immediate_risk,
  ADD COLUMN actions_taken TEXT NULL AFTER information_source,
  ADD COLUMN support_required TEXT NULL AFTER actions_taken,
  ADD COLUMN people_involved JSON NULL AFTER support_required;

UPDATE occurrences
   SET people_involved = JSON_ARRAY()
 WHERE people_involved IS NULL;

ALTER TABLE occurrences
  MODIFY COLUMN people_involved JSON NOT NULL;

CREATE TABLE occurrence_updates (
  id CHAR(36) NOT NULL,
  occurrence_id CHAR(36) NOT NULL,
  note TEXT NOT NULL,
  status_snapshot VARCHAR(40) NOT NULL,
  created_by CHAR(36) NULL,
  created_by_name VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY occurrence_updates_occurrence_idx (occurrence_id, created_at),
  CONSTRAINT occurrence_updates_occurrence_fk FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
  CONSTRAINT occurrence_updates_creator_fk FOREIGN KEY (created_by) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE occurrence_attachments (
  id CHAR(36) NOT NULL,
  occurrence_id CHAR(36) NOT NULL,
  -- Caminho interno é sempre gerado pela API com segmentos ASCII
  -- (occurrence-evidence/<uuid>/<uuid>.<ext>). Manter charset ASCII permite
  -- preservar unicidade sobre os 1024 caracteres sem ultrapassar o limite
  -- de 3072 bytes por chave do InnoDB com utf8mb4.
  storage_path VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  caption VARCHAR(500) NULL,
  uploaded_by CHAR(36) NULL,
  uploaded_by_name VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY occurrence_attachments_storage_path_uidx (storage_path),
  KEY occurrence_attachments_occurrence_idx (occurrence_id, created_at),
  CONSTRAINT occurrence_attachments_occurrence_fk FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
  CONSTRAINT occurrence_attachments_uploader_fk FOREIGN KEY (uploaded_by) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT occurrence_attachments_size_chk CHECK (size_bytes > 0 AND size_bytes <= 1250000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
