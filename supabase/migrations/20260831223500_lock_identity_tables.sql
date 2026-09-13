-- SEGEMPAT · identidade imutável no cliente
-- profiles é criado pelo trigger de auth; matrícula/nome não podem ser alterados pelo usuário.
-- user_roles só pode ser provisionado por procedimento administrativo/backend.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;

REVOKE ALL ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- Mantém as políticas SELECT existentes:
-- profiles: usuário lê apenas o próprio perfil.
-- user_roles: usuário lê a própria role; admin pode ler roles.