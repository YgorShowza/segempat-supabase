# SEGEMPAT Supabase — Handoff de Produção no Cloudflare

Este documento registra a etapa final de publicação do frontend da edição **SEGEMPAT Supabase** no Cloudflare, sem expor credenciais e sem misturar a hospedagem do frontend com o PostgreSQL/Storage do Supabase.

## Estado técnico

O frontend já possui configuração Cloudflare versionada (`@cloudflare/vite-plugin`, `wrangler` e `wrangler.jsonc`). O Worker desta edição usa o nome exclusivo `segempat-supabase`, separado da edição MySQL.

O workflow `SEGEMPAT Cloudflare Deployment Readiness` valida o build e executa `wrangler deploy --dry-run`, sem publicação.

A publicação real é separada e somente manual, por `.github/workflows/cloudflare-production-deploy.yml`.

## Pré-requisitos obrigatórios

Antes de qualquer publicação real, configurar no GitHub Environment `production` deste repositório:

- Secret `CLOUDFLARE_API_TOKEN` com permissão mínima necessária para publicar o Worker `segempat-supabase`;
- Secret `CLOUDFLARE_ACCOUNT_ID` da conta Cloudflare autorizada;
- Variable `VITE_SEGEMPAT_API_URL` com a URL HTTPS real da API Node/Express desta edição.

A URL da API não pode apontar para localhost nem domínio de exemplo. O frontend de produção permanece com `VITE_SEGEMPAT_REQUIRE_API=true`, sem fallback silencioso para demonstração.

## Relação com Supabase

Cloudflare hospeda o frontend/Worker público do SEGEMPAT.

A API Node/Express permanece como a única camada autorizada a acessar:

- PostgreSQL do projeto Supabase;
- bucket privado `segempat-evidence` no Supabase Storage;
- credenciais técnicas de runtime e de Storage.

O navegador não recebe `DATABASE_URL`, senha do PostgreSQL, credenciais S3, chaves administrativas nem outros secrets do backend.

A hospedagem da API é independente do Cloudflare do frontend. O repositório está preparado para hospedar a API em um serviço Node HTTPS e conectá-la ao projeto Supabase real.

## Publicação controlada

O workflow de produção:

1. só pode ser iniciado manualmente (`workflow_dispatch`);
2. só executa a partir da branch `main`;
3. exige que o operador digite exatamente `PUBLICAR`;
4. exige token e account ID do Cloudflare;
5. exige URL HTTPS real da API desta edição;
6. instala dependências com lockfile;
7. executa o build;
8. executa um `wrangler deploy --dry-run` imediatamente antes da publicação;
9. somente então executa `wrangler deploy` no Worker `segempat-supabase`.

Não existe gatilho automático por `push` ou `pull_request` para publicação de produção.

## Ordem final recomendada

```text
API Node/Express conectada ao Supabase real
  -> /health/ready verde
  -> configurar VITE_SEGEMPAT_API_URL com a URL HTTPS real da API
  -> configurar secrets Cloudflare no environment production
  -> confirmar todos os checks da main verdes
  -> executar SEGEMPAT Cloudflare Production Deploy manualmente
  -> digitar PUBLICAR
  -> validar a URL publicada do Worker segempat-supabase
  -> executar teste E2E Master + Administrador + Inspetor + Operador
  -> validar banco, Storage, sessões, evidências e auditoria
  -> registrar evidências de aceite
```

## Separação da edição MySQL

Este procedimento pertence exclusivamente ao repositório `YgorShowza/segempat-supabase`.

Ele não modifica, não publica por cima e não reutiliza o Worker `app-reimagined` da edição MySQL.

## Regra de aceite

A existência deste workflow não significa que o sistema já foi publicado. Até o deploy manual bem-sucedido e a homologação E2E, o estado correto é:

**CLOUDFLARE DA EDIÇÃO SUPABASE PREPARADO PARA PUBLICAÇÃO CONTROLADA — PRODUÇÃO AINDA NÃO PUBLICADA.**
