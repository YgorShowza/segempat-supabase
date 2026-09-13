-- SEGEMPAT: princípio de menor privilégio nos grants de tabelas.
-- A RLS continua sendo a camada de autorização por linha; estes REVOKEs reduzem
-- a superfície caso uma policy futura seja criada de forma permissiva.

-- Nenhuma tabela pública do aplicativo precisa ser acessada por anon.
revoke all privileges on all tables in schema public from anon;

-- O cliente autenticado nunca precisa administrar estrutura, truncar tabela ou
-- criar triggers/referências. Mantemos somente DML necessário por tabela.
revoke references, trigger, truncate on all tables in schema public from authenticated;

-- Tabelas deliberadamente somente leitura para o cliente.
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.certificates from authenticated;
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.registration_activation_codes from authenticated;
revoke insert, update, delete on public.user_roles from authenticated;

-- Tentativas são criadas exclusivamente pela RPC submit_exam_attempt e não
-- recebem UPDATE genérico do cliente. Admin mantém DELETE para auditoria/limpeza.
revoke insert, update on public.exam_attempts from authenticated;

-- Atividades rápidas são criadas exclusivamente pela RPC server-side que calcula XP.
-- Admin mantém DELETE conforme policy administrativa existente.
revoke insert, update on public.training_activity_attempts from authenticated;

-- Evita que novas tabelas criadas pelo mesmo owner recebam privilégios amplos
-- para anon por padrão. RLS/policies e grants explícitos devem ser definidos na migration.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke references, trigger, truncate on tables from authenticated;
