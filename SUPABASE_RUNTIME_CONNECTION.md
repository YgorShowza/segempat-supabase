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

A senha deve ser criada e armazenada diretamente nos secret managers apropriados. Não coloque a senha em Git, issue, documentação, variável `VITE_*` ou chat.

Se a senha contiver caracteres especiais, faça percent-encoding antes de inseri-la na connection string.

## Separação de privilégios

`DATABASE_URL` é exclusivamente a conexão de runtime da API. Ela não deve usar `postgres`, `service_role` ou qualquer papel administrativo.

Migrations usam uma credencial separada e temporária em `SEGEMPAT_MIGRATION_DATABASE_URL`, por meio do workflow manual **Supabase Real Migration**. A credencial de migration não pertence ao serviço permanente do Render.

## Gate esperado

Antes de apontar o frontend para a API hospedada:

1. `npm run preflight --prefix server` deve identificar `role=segempat_app`, PostgreSQL 15+, UTC, UTF-8 e TLS ativo;
2. `check-runtime-grants.js` deve confirmar menor privilégio;
3. `/health/ready` deve confirmar banco, migration, schema e storage;
4. o workflow **Hosted API Readiness** deve passar com a URL HTTPS da API e a origem HTTPS autorizada.

A existência da connection string ou do serviço hospedado, isoladamente, não significa homologação.
