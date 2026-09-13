# SEGEMPAT · Edição Supabase

Este repositório é uma edição separada do SEGEMPAT destinada a operar sobre Supabase/PostgreSQL.

## Separação obrigatória

- `YgorShowza/app-reimagined` permanece como linha corporativa preparada para MySQL da empresa.
- `YgorShowza/segempat-supabase` evolui de forma independente.
- Alterações Supabase não devem ser copiadas para a linha MySQL sem revisão explícita.

## Arquitetura desta edição

A edição Supabase preserva o desenho de segurança mais recente do SEGEMPAT:

`Frontend -> API SEGEMPAT -> Supabase/PostgreSQL`

O frontend não recebe senha de banco, connection string, service-role key ou qualquer credencial privilegiada. A API continua sendo a fonte de verdade para regras de negócio, autorização, correção de provas, XP, evidências, auditoria e operações transacionais.

Nesta primeira etapa, a autenticação de aplicação permanece compatível com a API atual (`app_users`, sessão assinada e controles de privilégio). Supabase Auth poderá ser avaliado depois, em migração separada, somente se for possível preservar integralmente as regras atuais de acesso e revogação.

## Banco

O baseline PostgreSQL é gerado a partir do schema MySQL atual para evitar regressão funcional. A migração histórica Supabase existente antes da edição MySQL foi consultada apenas como referência de origem; ela não deve ser reaplicada diretamente porque utilizava `auth.users`, RLS e acesso Supabase de uma arquitetura anterior.

Referência histórica imediatamente anterior à remoção das árvores Supabase no repositório original:

- commit: `79871bd90712ee9db068fd5efff05bf2086ac0bc`

A árvore ativa de migrations desta edição fica em `supabase/migrations/` e deve representar a arquitetura API-owned atual.

## Sequência de adaptação

1. Gerar e validar o baseline PostgreSQL equivalente ao `database/mysql/001_schema.sql`.
2. Portar para PostgreSQL os hardenings MySQL `002` a `010`.
3. Trocar o driver de banco da API de `mysql2` para `pg`, preservando a interface dos gateways.
4. Adaptar queries MySQL-específicas para PostgreSQL e validar transações.
5. Migrar evidências privadas para Supabase Storage ou manter storage privado da API, conforme o ambiente escolhido.
6. Criar CI específico PostgreSQL/Supabase e remover os gates exclusivamente MySQL desta edição.
7. Conectar a um projeto Supabase real somente após o schema e a API estarem verdes localmente/CI.

## Regra de segurança

Nenhuma credencial real do Supabase deve entrar em commit, issue, documentação pública ou variável `VITE_*`. Valores reais ficam somente em secrets do ambiente de execução.
