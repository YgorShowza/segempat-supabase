# SEGEMPAT · Relatório consolidado de homologação técnica — HISTÓRICO

Data original: 01/09/2026

> **DOCUMENTO HISTÓRICO — ARQUITETURA SUPABASE.**
>
> Este relatório registra a homologação técnica da etapa anterior do projeto, quando o backend ainda era baseado em Supabase, RLS, RPCs e Supabase Storage. Ele é mantido apenas como evidência histórica e **não deve ser usado como evidência de homologação do MySQL corporativo**.
>
> A versão integral anterior permanece preservada no histórico do Git. Para o estado atual e para a entrega à TI, usar `README.md`, `MYSQL_TI_INPUTS.md`, `MYSQL_CORPORATE_HANDOFF.md`, `CORPORATE_HOMOLOGATION_CHECKLIST.md`, `PRODUCTION_CHECKLIST.md` e `SECURITY_AUDIT.md`.

## O que este documento comprova

Na data original, foram executadas verificações técnicas sobre a arquitetura Supabase então vigente, incluindo build/preview, autenticação, RLS, RPCs, Storage, provas, Banco de Questões, gamificação, Cronograma, tema e testes transacionais com rollback.

Essas evidências continuam úteis para rastrear a evolução funcional do SEGEMPAT, mas os mecanismos de segurança citados naquela fase foram posteriormente substituídos, no alvo corporativo, por:

- API própria Node.js/Express;
- MySQL 8 corporativo;
- autorização server-side;
- sessão assinada em cookie HTTP-only;
- storage privado controlado pelo backend;
- `preflight`, migrations MySQL, `smoke`, `cutover:audit` e `/health/ready`;
- frontend corporativo com `VITE_SEGEMPAT_REQUIRE_API=true`.

## Regra de interpretação

Qualquer referência histórica deste relatório a RLS, `anon`, `authenticated`, `SECURITY DEFINER`, Supabase Auth, buckets ou URLs do Supabase deve ser entendida exclusivamente no contexto da arquitetura de 01/09/2026.

Ela **não substitui** nenhum dos seguintes gates atuais:

1. conexão com o MySQL real da empresa;
2. `npm run preflight`;
3. `npm run migrate`;
4. `npm run smoke`;
5. migração/carga de dados e evidências;
6. `npm run cutover:audit`;
7. `/health/ready` verde;
8. E2E com Inspetor e Operador no ambiente corporativo;
9. validação de TLS, CORS, cookies, firewall, backup, restore e rollback.

## Status atual

Este arquivo, isoladamente, **não autoriza** declarar o sistema homologado em produção.

O status atual permanece:

**PARTE DO MYSQL NO CÓDIGO CONCLUÍDA — PRONTO PARA CONECTAR AO BANCO DA EMPRESA.**

A frase abaixo só poderá ser usada depois da homologação real no ambiente corporativo:

**SEGEMPAT HOMOLOGADO NO MYSQL DA EMPRESA.**
