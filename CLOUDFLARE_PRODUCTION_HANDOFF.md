# SEGEMPAT — Handoff de Produção no Cloudflare

Este documento registra a etapa final de publicação do frontend do SEGEMPAT no Cloudflare sem expor credenciais e sem misturar a hospedagem do frontend com o MySQL corporativo.

## Estado técnico

O frontend já possui configuração Cloudflare versionada (`@cloudflare/vite-plugin`, `wrangler` e `wrangler.jsonc`). O workflow `SEGEMPAT Cloudflare Deployment Readiness` valida o build corporativo e executa `wrangler deploy --dry-run`, sem publicação.

A publicação real é separada e somente manual, por `.github/workflows/cloudflare-production-deploy.yml`.

## Pré-requisitos obrigatórios

Antes de qualquer publicação real, configurar no GitHub Environment `production`:

- Secret `CLOUDFLARE_API_TOKEN` com permissão mínima necessária para publicar o Worker do SEGEMPAT;
- Secret `CLOUDFLARE_ACCOUNT_ID` da conta Cloudflare autorizada;
- Variable `VITE_SEGEMPAT_API_URL` com a URL HTTPS real da API corporativa do SEGEMPAT.

A URL da API não pode apontar para localhost ou domínio de exemplo. O frontend corporativo permanece com `VITE_SEGEMPAT_REQUIRE_API=true`, sem fallback silencioso para demonstração.

## Relação com o MySQL da empresa

Cloudflare hospeda o frontend/Worker. O navegador não recebe host, usuário, senha, CA ou qualquer segredo do MySQL.

A API SEGEMPAT continua sendo a única camada autorizada a acessar o MySQL 8.0+ corporativo via TLS, conforme `MYSQL_CORPORATE_HANDOFF.md`.

Portanto, publicar no Cloudflare não substitui, move ou altera o banco MySQL da empresa.

## Publicação controlada

O workflow de produção:

1. só pode ser iniciado manualmente (`workflow_dispatch`);
2. só executa a partir da branch `main`;
3. exige que o operador digite exatamente `PUBLICAR`;
4. exige token e account ID do Cloudflare;
5. exige URL HTTPS real da API;
6. instala dependências com lockfile;
7. executa o build corporativo;
8. executa um `wrangler deploy --dry-run` imediatamente antes da publicação;
9. somente então executa `wrangler deploy`.

Não existe gatilho automático por `push` ou `pull_request` para publicação de produção.

## Ordem final recomendada

```text
TI homologa API + MySQL corporativo
  -> /health/ready verde
  -> configurar URL HTTPS real da API
  -> configurar secrets Cloudflare no environment production
  -> confirmar todos os checks do main verdes
  -> executar SEGEMPAT Cloudflare Production Deploy manualmente
  -> digitar PUBLICAR
  -> validar URL publicada
  -> executar teste E2E Master + Inspetor + Operador
  -> registrar evidências de aceite
```

## Regra de aceite

A existência deste workflow não significa que o sistema já foi publicado. Até o deploy manual bem-sucedido, o estado correto é:

**CLOUDFLARE PREPARADO PARA PUBLICAÇÃO CONTROLADA — PRODUÇÃO AINDA NÃO PUBLICADA.**
