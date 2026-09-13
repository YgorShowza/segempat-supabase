-- SEGEMPAT — controle de acesso granular e níveis administrativos
-- Mantém compatibilidade com as contas existentes e aplica menor privilégio.

CREATE TABLE access_levels (
  code VARCHAR(32) NOT NULL,
  label VARCHAR(80) NOT NULL,
  rank_value INT NOT NULL,
  PRIMARY KEY (code),
  UNIQUE KEY access_levels_rank_key (rank_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE access_permissions (
  code VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  permission_group VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  master_only TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (code),
  KEY access_permissions_group_idx (permission_group, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE access_level_permissions (
  level_code VARCHAR(32) NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  PRIMARY KEY (level_code, permission_code),
  CONSTRAINT access_level_permissions_level_fk FOREIGN KEY (level_code) REFERENCES access_levels(code) ON DELETE CASCADE,
  CONSTRAINT access_level_permissions_permission_fk FOREIGN KEY (permission_code) REFERENCES access_permissions(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_access_levels (
  user_id CHAR(36) NOT NULL,
  level_code VARCHAR(32) NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY user_access_levels_level_idx (level_code),
  CONSTRAINT user_access_levels_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT user_access_levels_level_fk FOREIGN KEY (level_code) REFERENCES access_levels(code) ON DELETE RESTRICT,
  CONSTRAINT user_access_levels_updater_fk FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_permission_overrides (
  user_id CHAR(36) NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  allowed TINYINT(1) NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, permission_code),
  KEY user_permission_overrides_permission_idx (permission_code, allowed),
  CONSTRAINT user_permission_overrides_user_fk FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT user_permission_overrides_permission_fk FOREIGN KEY (permission_code) REFERENCES access_permissions(code) ON DELETE CASCADE,
  CONSTRAINT user_permission_overrides_updater_fk FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT user_permission_overrides_allowed_chk CHECK (allowed IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Master sempre recebe todas as permissões; os demais níveis recebem presets seguros.
INSERT INTO access_level_permissions (level_code, permission_code)
SELECT 'master', code FROM access_permissions;

INSERT INTO access_level_permissions (level_code, permission_code)
SELECT 'admin', code FROM access_permissions
 WHERE code NOT IN ('access.permissions.manage', 'audit.view');

INSERT INTO access_level_permissions (level_code, permission_code)
SELECT 'inspector', code FROM access_permissions
 WHERE code NOT IN ('access.permissions.manage', 'audit.view', 'security.document.view');

-- Migração de menor privilégio para contas existentes.
-- Um legado com role admin não vira Master automaticamente: o nível Master é
-- concedido somente por procedimento explícito e auditável da TI.
INSERT INTO user_access_levels (user_id, level_code, updated_by, updated_at)
SELECT u.id,
       CASE
         WHEN e.access_profile = 'Inspetor' THEN 'inspector'
         WHEN EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin')
              THEN 'admin'
         ELSE 'operator'
       END,
       NULL,
       UTC_TIMESTAMP(3)
  FROM app_users u
  LEFT JOIN employees e ON LOWER(TRIM(e.matricula)) = LOWER(TRIM(u.matricula));
