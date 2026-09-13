-- SEGEMPAT · Supabase Storage · bucket privado de evidências
--
-- Infraestrutura de ambiente; não pertence à cadeia de migrations de negócio
-- validada pelo /health/ready.
-- O frontend NÃO recebe chave secreta nem acessa este bucket diretamente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'segempat-evidence',
  'segempat-evidence',
  false,
  1500000,
  array['image/png','image/jpeg']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Não criar policies para anon/authenticated: esta edição mantém
-- Frontend -> API SEGEMPAT -> Storage. Operações de objetos são feitas
-- somente pelo backend com a chave secreta armazenada no ambiente do servidor.
