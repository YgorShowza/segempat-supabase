# SEGEMPAT · Supabase / PostgreSQL Edition

Edição independente do **SEGEMPAT** preparada para operar sobre **Supabase/PostgreSQL**, preservando a interface, os módulos, as regras de negócio, a hierarquia de acesso e a identidade visual do projeto.

> **Separação obrigatória:** este repositório não substitui nem modifica `YgorShowza/app-reimagined`. A edição corporativa preparada para MySQL permanece em outro repositório e não recebe alterações desta linha Supabase.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FYgorShowza%2Fsegempat-supabase)

## Estado atual

O projeto Supabase real já existe no plano **Free**, na região São Paulo (`sa-east-1`), com PostgreSQL ativo e saudável.

Já estão concluídos e validados:

- schema funcional do SEGEMPAT no PostgreSQL;
- hardening e regras de integridade;
- três migrations de negócio versionadas e ledger `schema_migrations` com SHA-256;
- superfície Data API fechada para `anon`, `authenticated` e `service_role` nas tabelas/funções do SEGEMPAT;
- Security Advisor do Supabase sem lints;
- papel técnico `segempat_runtime` e login de runtime `segempat_app` com menor privilégio;
- `segempat_app` sem SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS ou CREATE no schema `public`;
- CRUD do runtime nas 28 tabelas funcionais e somente leitura no histórico de migrations;
- bucket privado `segempat-evidence`, limitado a 1,5 MB e PNG/JPEG;
- driver server-side para Supabase Storage;
- Blueprint `render.yaml` para homologação da API em Render Free;
- preflight, smoke, cutover audit, CI, contratos e readiness automatizados;
- gate manual **Hosted API Readiness** para validar a API depois do deploy.

O estado correto neste momento é:

> **SUPABASE REAL E SEGURANÇA DE BANCO/STORAGE PREPARADOS — PENDENTE INJETAR OS SECRETS NO HOST, CONECTAR A API E EXECUTAR A HOMOLOGAÇÃO E2E.**

Isso ainda **não significa produção nem homologação final**.

## Arquitetura

```text
Frontend SEGEMPAT
        |
        | HTTPS / JSON
        v
API SEGEMPAT · Node.js / Express
        |
        +--> PostgreSQL Supabase
        +--> Supabase Storage privado
        +--> autenticação, autorização e regras de negócio
```

O navegador não recebe senha do PostgreSQL, `DATABASE_URL`, credenciais S3, service-role key nem credenciais administrativas. O backend continua sendo a fonte de verdade das regras de segurança e negócio.

## Banco e migrations

A cadeia de negócio fica exclusivamente em `supabase/migrations/`:

```text
20260913010000_api_owned_baseline.sql
20260913020000_current_hardening.sql
20260913030000_api_surface_hardening.sql
```

O runner `server/scripts/migrate-postgres.js` usa transação, advisory lock e uma tabela `schema_migrations` com versão, nome do arquivo, checksum SHA-256 e data de aplicação. Divergência de checksum é rejeitada.

Papéis técnicos e outros itens de infraestrutura do ambiente ficam separados da cadeia de negócio. A configuração reproduzível dos papéis está em:

```text
supabase/bootstrap/runtime-roles.sql
```

## Runtime PostgreSQL

A identidade permanente da API é `segempat_app`, herdando somente `segempat_runtime`.

Para hospedagem, a configuração preparada usa o **Shared Session Pooler** do Supabase, com o username:

```text
segempat_app.bkghgceaubnuhjtzggsj
```

O host exato do pooler deve ser copiado do botão **Connect** do projeto Supabase. Não monte o hostname manualmente.

A `DATABASE_URL` real deve existir apenas no secret manager do host da API. Se a senha operacional atual não estiver disponível ao responsável pelo ambiente, ela deve ser rotacionada diretamente no ambiente seguro. Nenhuma senha deve ser colocada em Git, issue, documentação pública, chat ou variável `VITE_*`.

## Storage privado

As evidências usam o bucket:

```text
segempat-evidence
```

Características já confirmadas:

- privado;
- limite de 1,5 MB por objeto;
- `image/png` e `image/jpeg`;
- acesso da aplicação exclusivamente pelo backend;
- downloads autorizados pela API;
- readiness preparado para probe de escrita, leitura e remoção no driver ativo.

As credenciais S3 do backend devem ser geradas/configuradas somente no secret manager do host.

## Homologação da API no Render Free

O repositório possui `render.yaml` na raiz e um botão **Deploy to Render** no topo deste README.

O Blueprint prepara:

- Web Service Node;
- plano `free`;
- branch `main`;
- deploy automático desligado;
- `/health/ready` como health check;
- TLS PostgreSQL obrigatório;
- pool da API de 5 conexões;
- papel esperado `segempat_app`;
- Storage Supabase privado;
- sessão segura em HTTPS.

Durante a criação no Render, os valores marcados como `sync: false` precisam ser cadastrados diretamente na interface do Render. Não os publique no repositório.

Os principais secrets são:

```text
DATABASE_URL
SEGEMPAT_ALLOWED_ORIGINS
SUPABASE_STORAGE_S3_ACCESS_KEY_ID
SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY
```

`SEGEMPAT_SESSION_SECRET` é gerado pelo Blueprint.

Consulte [`RENDER_SUPABASE_HANDOFF.md`](RENDER_SUPABASE_HANDOFF.md) e [`SUPABASE_RUNTIME_CONNECTION.md`](SUPABASE_RUNTIME_CONNECTION.md) antes do primeiro deploy.

## Gates depois do deploy

Após a API receber uma URL HTTPS:

1. validar `/health`;
2. validar `/health/ready`;
3. executar o workflow **Hosted API Readiness** no branch `main`;
4. confirmar TLS, migrations, schema e Storage;
5. validar CORS e bloqueio de escrita sem `Origin` confiável;
6. executar smoke/cutover contra o ambiente real;
7. validar Master, Administrador, Inspetor e Operador;
8. testar assinaturas, evidências, auditoria e revogação de sessão;
9. só depois apontar/publicar o frontend para a API homologada.

## Comandos técnicos da API

```bash
npm ci --prefix server
npm run preflight --prefix server
npm run migrate --prefix server
npm run smoke --prefix server
npm run cutover:audit --prefix server
npm run start --prefix server
```

A credencial de migration deve ser separada da credencial de runtime. O workflow manual **Supabase Real Migration** usa `SEGEMPAT_MIGRATION_DATABASE_URL` e nunca é executado automaticamente em push ou pull request.

## Stack principal

**Frontend:** React 19, TypeScript, TanStack Router/Query, Vite/TanStack Start, Tailwind CSS e Bun.

**Backend:** Node.js 20+, Express, PostgreSQL 15+, driver `pg`, sessões assinadas por cookie, bcrypt, Helmet, CORS por allowlist e storage privado controlado pela API.

## Segurança

A edição preserva os princípios do SEGEMPAT:

- backend como fonte de verdade;
- negação por padrão;
- credenciais apenas no servidor;
- menor privilégio no PostgreSQL;
- CORS explícito;
- cookies seguros em produção;
- TLS obrigatório para o banco em produção;
- transações em operações críticas;
- auditoria protegida;
- códigos sensíveis com hash, expiração e uso único;
- proteção do último Master;
- readiness que revalida migrations, banco e storage.

O aplicativo também mantém `robots.txt` com bloqueio de indexação e metadados `noindex`. Isso reduz exposição acidental a buscadores, mas não substitui autenticação e autorização.

## Performance Advisor

O Security Advisor está limpo. O Performance Advisor ainda apresenta apenas itens informativos de um banco recém-criado, como foreign keys sem índice dedicado e índices sem uso observado. Esses itens serão refinados com base em carga e consultas reais, em vez de alterar o schema apenas para zerar o linter.

## Documentos principais

- [`SUPABASE_REAL_PROJECT_CHECKLIST.md`](SUPABASE_REAL_PROJECT_CHECKLIST.md)
- [`SUPABASE_RUNTIME_CONNECTION.md`](SUPABASE_RUNTIME_CONNECTION.md)
- [`RENDER_SUPABASE_HANDOFF.md`](RENDER_SUPABASE_HANDOFF.md)
- [`SUPABASE_EDITION.md`](SUPABASE_EDITION.md)

A frase **“SEGEMPAT homologado no Supabase”** só deve ser usada depois dos gates reais de API, Storage e E2E.
