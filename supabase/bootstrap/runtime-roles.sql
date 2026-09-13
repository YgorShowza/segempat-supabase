-- SEGEMPAT · Supabase/PostgreSQL · bootstrap de papéis de runtime
--
-- Este arquivo NÃO pertence à cadeia de migrations de negócio.
-- Ele prepara papéis técnicos do ambiente e nunca deve conter senha real.
-- Arquitetura: Frontend -> API SEGEMPAT -> PostgreSQL.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'segempat_runtime') THEN
    CREATE ROLE segempat_runtime
      NOLOGIN
      INHERIT
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END;
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO segempat_runtime', current_database());
END;
$$;

GRANT USAGE ON SCHEMA public TO segempat_runtime;
REVOKE CREATE ON SCHEMA public FROM segempat_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO segempat_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO segempat_runtime;

-- O runtime pode apenas ler o histórico usado pelo /health/ready.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE schema_migrations FROM segempat_runtime;
GRANT SELECT ON TABLE schema_migrations TO segempat_runtime;

-- Funções auxiliares continuam fechadas para chamadas diretas.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM segempat_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO segempat_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO segempat_runtime;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'segempat_app') THEN
    CREATE ROLE segempat_app
      LOGIN
      INHERIT
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      CONNECTION LIMIT 10;
  END IF;
END;
$$;

-- Nunca colocar senha aqui. Defina a senha de segempat_app somente no secret manager/console do ambiente.
ALTER ROLE segempat_app PASSWORD NULL;
GRANT segempat_runtime TO segempat_app;
ALTER ROLE segempat_app SET search_path = public;
ALTER ROLE segempat_app SET statement_timeout = '30s';
ALTER ROLE segempat_app SET idle_in_transaction_session_timeout = '30s';
