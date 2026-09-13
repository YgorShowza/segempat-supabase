-- SEGEMPAT · princípio de menor privilégio para identidade

REVOKE REFERENCES, TRIGGER ON public.profiles FROM authenticated;
REVOKE REFERENCES, TRIGGER ON public.user_roles FROM authenticated;

-- Cliente autenticado precisa apenas de SELECT nessas tabelas.