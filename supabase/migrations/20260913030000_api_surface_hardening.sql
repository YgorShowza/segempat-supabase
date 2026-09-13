-- SEGEMPAT · Supabase/PostgreSQL · endurecimento da superfície Data API
-- Arquitetura desta edição: Frontend -> API SEGEMPAT -> PostgreSQL.
-- O frontend não deve acessar as tabelas diretamente via PostgREST/Supabase client.

SET TIME ZONE 'UTC';

-- Fecha a superfície existente do schema public para papéis do Data API quando eles existem.
-- Em PostgreSQL puro (CI), esses papéis não existem; no Supabase, existem por padrão.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);

      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Funções próprias não ficam executáveis por PUBLIC/Data API por padrão.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM public;

-- Fixa search_path nas funções próprias para impedir resolução de objetos em schemas inesperados.
ALTER FUNCTION public.segempat_set_updated_at()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.segempat_cronograma_guard()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.segempat_practical_history_guard()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.segempat_block_audit_mutation()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.segempat_occurrence_history_guard()
  SET search_path = pg_catalog, public;

-- Observação: RLS é tratado em migration separada após decisão explícita de política.
-- Não habilitar RLS automaticamente aqui evita bloquear o futuro usuário PostgreSQL da API
-- antes de criarmos e validarmos o papel de runtime com menor privilégio.
