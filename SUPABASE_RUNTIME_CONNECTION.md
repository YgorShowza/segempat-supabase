# SEGEMPAT · Conexão de runtime com Supabase

Este documento descreve apenas a edição `YgorShowza/segempat-supabase`. Ele não se aplica ao repositório corporativo MySQL.

## Identidade técnica

- Projeto Supabase: `SEGEMPAT`
- Project ref: `bkghgceaubnuhjtzggsj`
- Banco: `postgres`
- Papel PostgreSQL efetivo da API: `segempat_app`
- Pool da aplicação: `5` conexões
- Limite do papel `segempat_app`: `10` conexões

A API valida no preflight que `current_user` é `segempat_app` quando `SEGEMPAT_EXPECTED_DB_ROLE=segempat_app` está configurado.

O catálogo PostgreSQL do projeto real já confirmou que `segempat_app` possui `LOGIN`, não é superuser, não possui `CREATEDB`, `CREATEROLE`, `REPLICATION` ou `BYPASSRLS`, não possui `CREATE` no schema `public` e herda somente o papel técnico `segempat_runtime`.

A credencial de login já existe no PostgreSQL, porém seu valor não é lido nem exibido pelo projeto. Se o responsável pelo ambiente não possuir o valor operacional atual, a senha deve ser **rotacionada diretamente no ambiente seguro** antes de configurar o host da API. Nunca recupere ou publique a senha em Git, issue, documentação ou chat.

## Session Pooler

Para um serviço hospedado, use preferencialmente o **Shared Session Pooler** do Supabase, porta `5432`.

O host do pooler deve ser **copiado do botão Connect do projeto Supabase**. Não monte o hostname manualmente: o índice do cluster (`aws-N-...`) não pode ser deduzido com segurança apenas pela região.

Para papel PostgreSQL customizado no Shared Pooler, o username precisa incluir o project ref:

```text
segempat_app.bkghgceaubnuhjtzggsj
```

Formato da `DATABASE_URL` de runtime:

```text
postgresql://segempat_app.bkghgceaubnuhjtzggsj:<PASSWORD_PERCENT_ENCODED>@<SESSION_POOLER_HOST>:5432/postgres
```

A `DATABASE_URL` deve ser montada e armazenada diretamente no secret manager do host. Não coloque a senha ou a connection string real em Git, issue, documentação, variável `VITE_*` ou chat.

Se a senha contiver caracteres especiais, faça percent-encoding antes de inseri-la na connection string.

## Separação de privilégios

`DATABASE_URL` é exclusivamente a conexão de runtime da API. Ela não deve usar `postgres`, `service_role` ou qualquer papel administrativo.

Migrations usam uma credencial separada e temporária em `SEGEMPAT_MIGRATION_DATABASE_URL`, por meio do workflow manual **Supabase Real Migration**. A credencial de migration não pertence ao serviço permanente do Render.

No projeto real, `segempat_app` possui CRUD nas 28 tabelas funcionais, mas apenas `SELECT` em `schema_migrations`, sem capacidade de inserir, alterar, excluir, truncar ou criar triggers nessa tabela. As funções internas `segempat_*` também não são executáveis diretamente pelo runtime.

## Gate esperado

Antes de apontar o frontend para a API hospedada:

1. `npm run preflight --prefix server` deve identificar `role=segempat_app`, PostgreSQL 15+, UTC, UTF-8 e TLS ativo;
2. `check-runtime-grants.js` deve confirmar menor privilégio;
3. `/health/ready` deve confirmar banco, migration, schema e storage;
4. o workflow **Hosted API Readiness** deve passar com a URL HTTPS da API e a origem HTTPS autorizada.

A existência da connection string ou do serviço hospedado, isoladamente, não significa homologação.
