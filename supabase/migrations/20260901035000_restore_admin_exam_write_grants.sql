-- Mantém a chave de respostas protegida contra SELECT direto, sem quebrar
-- o CRUD administrativo protegido pelas policies RLS existentes.
REVOKE SELECT ON TABLE public.exams FROM anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.exams TO authenticated;
