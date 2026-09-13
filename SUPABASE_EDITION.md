# SEGEMPAT · Edição Supabase / PostgreSQL

Este repositório é uma edição separada do SEGEMPAT destinada a operar sobre Supabase/PostgreSQL.

## Separação obrigatória

- `YgorShowza/app-reimagined` permanece como linha corporativa preparada para o MySQL da empresa.
- `YgorShowza/segempat-supabase` evolui de forma independente.
- Alterações desta edição não devem ser copiadas para a linha MySQL sem revisão explícita.
- Nenhum gate, migration ou configuração desta edição autoriza alteração no banco corporativo.

## Arquitetura desta edição

A edição Supabase preserva o desenho de segurança mais recente do SEGEMPAT:

`Frontend -> API SEGEMPAT -> Supabase/PostgreSQL`

O frontend não recebe senha de banco, connection string, service-role key ou qualquer credencial privilegiada. A API continua sendo a fonte de verdade para regras de negócio, autorização, correção de provas, XP, evidências, auditoria e operações transacionais.

Nesta etapa, a autenticação de aplicação permanece compatível com a API atual (`app_users`, sessão assinada e controles de privilégio). Supabase Auth poderá ser avaliado depois, em migração separada, somente se for possível preservar integralmente as regras atuais de acesso, hierarquia, auditoria e revogação de sessão.

## Banco PostgreSQL

A árvore ativa desta edição fica em:

```text
supabase/migrations/
```

Migrations atuais:

```text
20260913010000_api_owned_baseline.sql
20260913020000_current_hardening.sql
```

O baseline foi convertido do schema funcional consolidado do SEGEMPAT. O hardening PostgreSQL preserva os controles atuais de cronograma, avaliações práticas, ocorrências, auditoria, recuperação de senha e autorização granular.

O runner `server/scripts/migrate-postgres.js` aplica a cadeia em transação, utiliza advisory lock e mantém `schema_migrations` com versão, nome, checksum SHA-256 e data de aplicação. Divergência de checksum interrompe a execução.

## O que já foi concluído na fundação PostgreSQL

- baseline PostgreSQL equivalente ao schema funcional atual;
- hardenings atuais portados para PostgreSQL;
- driver da API alterado de `mysql2` para `pg`;
- `DATABASE_URL`, TLS e pool PostgreSQL configurados no backend;
- adaptador de compatibilidade para queries ainda escritas na forma histórica da API;
- migrations com checksum, idempotência e lock;
- `/health/ready` adaptado para PostgreSQL;
- preflight PostgreSQL;
- gate de menor privilégio para a role de runtime em produção;
- smoke estrutural de schema, foreign keys, índices e triggers;
- teste real da API sobre PostgreSQL 16;
- login por sessão e fluxo autenticado Master;
- CRUD autenticado de colaboradores e validação da auditoria;
- auditoria pré-cutover PostgreSQL;
- utilitários de bootstrap Master, concessão/revogação de Inspetor e concessão Master cobertos por CI específico;
- workflows exclusivamente MySQL removidos do CI desta edição.

## Geração histórica do baseline

O baseline PostgreSQL foi inicialmente gerado a partir do schema MySQL consolidado para reduzir risco de regressão funcional. A antiga árvore Supabase existente antes da edição MySQL foi tratada apenas como referência histórica; ela não deve ser reaplicada porque pertencia a outra arquitetura baseada em `auth.users`, RLS e acesso Supabase direto.

Referência histórica imediatamente anterior à remoção das árvores Supabase no repositório original:

- commit: `79871bd90712ee9db068fd5efff05bf2086ac0bc`

Os arquivos em `database/mysql/` que permanecerem nesta edição são referência de rastreabilidade da conversão, não migrations de runtime PostgreSQL.

## Gates ativos de PostgreSQL

A branch de portabilidade mantém gates específicos para:

- geração/validação do baseline;
- integração API + PostgreSQL;
- smoke estrutural PostgreSQL;
- auditoria de cutover;
- utilitários de acesso privilegiado.

Esses gates utilizam PostgreSQL 16 isolado no GitHub Actions. Passar nesses testes comprova a portabilidade de código coberta por eles, mas não substitui homologação em um projeto Supabase real.

## Próxima fase: projeto Supabase real

A conexão a um projeto Supabase real deve ocorrer somente depois da consolidação da fundação desta branch. Nessa fase será necessário:

1. obter a connection string do ambiente alvo por canal seguro;
2. criar uma role dedicada de runtime com menor privilégio e separar a identidade de migration;
3. configurar TLS e política de conexão/pooling compatível com o ambiente Supabase;
4. aplicar as migrations PostgreSQL e validar `schema_migrations`;
5. executar `preflight`, `smoke`, `cutover:audit` e `/health/ready` no ambiente real;
6. decidir e validar o storage definitivo de assinaturas/evidências;
7. testar os perfis Master, Administrador, Inspetor e Operador ponta a ponta;
8. só então preparar publicação do frontend.

## Regra de segurança

Nenhuma credencial real do Supabase deve entrar em commit, issue, documentação pública ou variável `VITE_*`. Valores reais ficam somente em secrets do ambiente de execução. A aplicação não deve utilizar continuamente uma credencial administrativa/service-role quando uma role PostgreSQL dedicada e limitada for suficiente.

## Status correto

Neste momento, a formulação correta é:

**“FUNDAÇÃO POSTGRESQL DA EDIÇÃO SUPABASE VALIDADA EM CI — AGUARDANDO CONEXÃO E HOMOLOGAÇÃO EM PROJETO SUPABASE REAL.”**

Não utilizar ainda a expressão “SEGEMPAT homologado no Supabase”, pois nenhum projeto Supabase real foi conectado nesta fase.
