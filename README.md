# SEGEMPAT · Supabase / PostgreSQL Edition

Edição independente do **SEGEMPAT** preparada para evoluir sobre **Supabase/PostgreSQL**, preservando a interface, os módulos, as regras de negócio, a hierarquia de acesso e a identidade visual do projeto original.

> Esta edição não substitui nem modifica o repositório corporativo MySQL `YgorShowza/app-reimagined`. O projeto corporativo permanece separado e preparado para homologação no MySQL da empresa.

## Status atual

**PORTABILIDADE POSTGRESQL EM DESENVOLVIMENTO — FUNDAÇÃO, MIGRATIONS, API, READINESS, PREFLIGHT E SMOKES JÁ VALIDADOS EM POSTGRESQL 16 NO CI.**

Ainda **não** significa homologação em um projeto Supabase real e **não** significa produção. Antes dessa classificação ainda serão necessários conexão com um projeto Supabase real, configuração segura de credenciais/roles, validação do storage definitivo, carga de dados/evidências e testes ponta a ponta no ambiente final.

## Arquitetura da edição Supabase

```text
Frontend SEGEMPAT
        |
        | HTTPS / JSON
        v
API SEGEMPAT — Node.js / Express
        |
        +--> Supabase / PostgreSQL
        +--> storage privado de evidências
        +--> autenticação, autorização e regras de negócio
```

O navegador **não acessa diretamente o PostgreSQL** e não recebe `DATABASE_URL`, senha, certificado ou credencial administrativa. A API continua sendo a fonte de verdade das regras de segurança e negócio.

## Stack principal

### Frontend

- React 19
- TypeScript
- TanStack Router / TanStack Query
- TanStack Start / Vite
- Tailwind CSS
- Bun
- Cloudflare Workers como opção de publicação do frontend

### Backend

- Node.js 20+
- Express
- PostgreSQL 15+; CI atual em PostgreSQL 16
- driver `pg`
- sessões assinadas por cookie
- bcrypt para senhas e códigos sensíveis
- Helmet e CORS por allowlist
- storage privado controlado pela API

## Banco e migrations

As migrations desta edição ficam exclusivamente em:

```text
supabase/migrations/
```

A cadeia atual contém:

```text
20260913010000_api_owned_baseline.sql
20260913020000_current_hardening.sql
```

O baseline PostgreSQL foi derivado do schema funcional consolidado do SEGEMPAT. O hardening seguinte preserva controles atuais de cronograma, avaliações práticas, ocorrências, auditoria, recuperação de senha e autorização granular.

O runner `server/scripts/migrate-postgres.js` mantém uma tabela `schema_migrations` com versão, nome, checksum SHA-256 e data de aplicação. A execução é transacional, usa advisory lock e rejeita divergência de checksum.

## Configuração da API

Use `server/.env.example` como referência. Os principais valores são:

```text
DATABASE_URL=postgresql://...
POSTGRES_SSL=true
POSTGRES_SSL_CA_PATH=
POSTGRES_POOL_SIZE=10
SEGEMPAT_SESSION_SECRET=...
SEGEMPAT_ALLOWED_ORIGINS=https://...
SEGEMPAT_STORAGE_DRIVER=filesystem
SEGEMPAT_STORAGE_PATH=/caminho/persistente
SEGEMPAT_TIMEZONE=America/Maceio
```

Nunca coloque `DATABASE_URL`, senha de banco ou segredo de sessão em variáveis `VITE_*`, no frontend, em issues ou em documentação pública.

## Comandos técnicos da API

Dentro de `server/`:

```bash
npm ci
npm run preflight
npm run migrate
npm run smoke
npm run start
```

O gate ampliado de pré-cutover é:

```bash
npm run cutover:audit
```

Ele reúne smoke estrutural PostgreSQL, validação da role de runtime, coerência funcional mínima, evidências e revisão de acessos privilegiados.

## Validações já automatizadas

A branch de portabilidade possui gates PostgreSQL que verificam, entre outros pontos:

- aplicação e idempotência das migrations;
- checksum e histórico de migrations;
- presença das tabelas críticas;
- foreign keys, índices únicos e triggers de proteção;
- catálogo de níveis e permissões;
- PostgreSQL em UTC e UTF-8;
- preflight do ambiente;
- política de menor privilégio para a role de produção;
- inicialização real da API sobre PostgreSQL;
- `/health` e `/health/ready`;
- proteção de `Origin` nas escritas;
- login real por sessão;
- sessão de Administrador Master;
- leitura e CRUD de colaboradores;
- geração de auditoria nas operações autenticadas;
- auditoria pré-cutover PostgreSQL.

## Autorização

O modelo granular foi preservado:

- **Master** — nível máximo, incluindo gestão de permissões;
- **Administrador** — administração sem poderes exclusivos do Master;
- **Inspetor** — gestão operacional conforme permissões efetivas;
- **Operador** — acesso operacional e pessoal autorizado.

A API reconstitui o contexto de autorização a partir do banco. Alterações administrativas de nível e permissão invalidam sessões anteriores por `session_epoch`, e o sistema protege a continuidade de pelo menos um Master utilizável.

## Segurança desta edição

A portabilidade preserva os princípios do projeto corporativo:

- backend como fonte de verdade;
- negação por padrão fora das permissões efetivas;
- credenciais somente no servidor;
- CORS explícito;
- cookies seguros em produção;
- TLS obrigatório para PostgreSQL em produção;
- transações em operações críticas;
- auditoria append-only protegida por triggers;
- evidências privadas fora de rotas públicas;
- códigos sensíveis com hash, expiração e uso único;
- gabaritos e respostas protegidos por autorização;
- readiness que revalida schema e migrations antes de declarar a API pronta.

## Menor privilégio no Supabase/PostgreSQL

Em produção, a API não deve utilizar uma role administrativa do projeto Supabase. O preflight rejeita uma role de runtime com privilégios elevados como `SUPERUSER`, `CREATEROLE`, `CREATEDB`, `REPLICATION`, `BYPASSRLS`, `CREATE` no schema ou privilégios críticos desnecessários em tabelas.

A conta administrativa/migration deve ser separada da role utilizada continuamente pela API.

## Conteúdo MySQL ainda presente

Alguns arquivos `database/mysql/` e documentos históricos continuam no repositório como **referência de origem e rastreabilidade da conversão**. Eles não são o alvo de runtime desta edição. Os workflows MySQL corporativos não fazem parte do CI ativo da edição Supabase.

A versão oficial preparada para o banco corporativo permanece em:

```text
YgorShowza/app-reimagined
```

## O que ainda falta para homologar no Supabase real

Antes de chamar esta edição de homologada, ainda é necessário:

1. criar/conectar o projeto Supabase real;
2. definir roles e secrets reais sem expô-los ao frontend;
3. aplicar as migrations no ambiente Supabase alvo;
4. validar TLS, pool/conexões e menor privilégio;
5. decidir e validar o storage definitivo de assinaturas/evidências;
6. executar carga/migração de dados quando aplicável;
7. rodar preflight, smoke, cutover audit e `/health/ready` no ambiente real;
8. executar testes ponta a ponta dos perfis Master, Administrador, Inspetor e Operador;
9. validar dispositivos, impressão/PDF, Modo TV e operação real;
10. publicar o frontend somente depois dos gates anteriores.

## Documento de portabilidade

Veja também [`SUPABASE_EDITION.md`](SUPABASE_EDITION.md) para o contexto da separação entre as edições PostgreSQL e MySQL.
