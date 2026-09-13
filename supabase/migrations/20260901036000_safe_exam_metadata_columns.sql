BEGIN;

-- Algumas telas administrativas auxiliares precisam de metadados básicos de prova
-- (ex.: validação de certificados), mas nenhuma leitura direta deve incluir o JSON
-- `questions`, que contém a chave de correção. A RLS de `exams` continua permitindo
-- SELECT direto somente para admin.
REVOKE SELECT ON TABLE public.exams FROM authenticated;
GRANT SELECT (
  id,
  title,
  description,
  exam_type,
  target_sector,
  min_approval_pct,
  scheduled_date,
  status,
  created_by,
  created_at,
  updated_at
) ON TABLE public.exams TO authenticated;

COMMIT;
