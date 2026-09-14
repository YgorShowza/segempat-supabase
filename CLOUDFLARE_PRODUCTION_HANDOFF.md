# SEGEMPAT Supabase — Handoff de Produção no Cloudflare

Este documento registra a publicação do frontend da edição **SEGEMPAT Supabase** no Cloudflare, sem misturar a hospedagem do frontend com PostgreSQL/Storage do Supabase.

## Estado técnico

O frontend possui configuração Cloudflare versionada (`@cloudflare/vite-plugin`, `wrangler` e `wrangler.jsonc`). O Worker desta edição usa o nome exclusivo `segempat-supabase`, separado da edição MySQL.

A API Node/Express está hospedada em:

`https://segempat-api-supabase.onrender.com`

O frontend de produção está publicado em:

`https://segempat-supabase.ygoxxx.workers.dev`

O Hosted API Readiness final foi executado usando a origem real do Worker e aprovou banco, TLS, schema, migrations, Storage e CORS.

## Configuração de produção

O workflow `SEGEMPAT Cloudflare Production Deploy` continua manual e protegido por confirmação explícita `PUBLICAR`.

O único segredo necessário no GitHub Environment `production` é:

- `CLOUDFLARE_API_TOKEN`

O token deve possuir apenas a permissão mínima necessária para publicar Workers Scripts.

Os seguintes valores são identificadores públicos de deployment e permanecem versionados no workflow:

- Cloudflare Account ID da conta autorizada;
- `VITE_SEGEMPAT_API_URL=https://segempat-api-supabase.onrender.com`.

Nenhuma senha de banco, `DATABASE_URL`, credencial S3 ou outro secret de backend é enviado ao frontend ou ao repositório.

## Relação com Supabase

Cloudflare hospeda o frontend/Worker público do SEGEMPAT.

A API Node/Express permanece como a única camada autorizada a acessar:

- PostgreSQL do projeto Supabase;
- bucket privado `segempat-evidence` no Supabase Storage;
- credenciais técnicas de runtime e de Storage.

O navegador não recebe `DATABASE_URL`, senha do PostgreSQL, credenciais S3, chaves administrativas nem outros secrets do backend.

## Publicação controlada

O workflow de produção:

1. só pode ser iniciado manualmente (`workflow_dispatch`);
2. só executa a partir da branch `main`;
3. exige que o operador digite exatamente `PUBLICAR`;
4. exige o token protegido do Cloudflare;
5. usa a URL HTTPS real da API desta edição;
6. instala dependências com lockfile;
7. executa o build;
8. executa `wrangler deploy --dry-run` imediatamente antes da publicação;
9. somente então executa `wrangler deploy` no Worker `segempat-supabase`.

## Separação da edição MySQL

Este procedimento pertence exclusivamente ao repositório `YgorShowza/segempat-supabase`.

Ele não modifica, não publica por cima e não reutiliza o Worker `app-reimagined` da edição MySQL.

## Estado de aceite

**CLOUDFLARE DA EDIÇÃO SUPABASE PUBLICADO — API RENDER SAUDÁVEL — STORAGE E CORS HOMOLOGADOS — WORKER `segempat-supabase` ATIVO.**
