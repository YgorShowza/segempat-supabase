# SEGEMPAT · Checklist para projeto Supabase real

Este checklist começa **depois** da fundação PostgreSQL validada em CI. Ele não autoriza deploy de produção e não deve receber senhas, tokens, service-role keys ou connection strings reais em commits, issues ou documentação pública.

## Estado atual do projeto real

- Projeto Supabase `SEGEMPAT` criado no plano Free, região São Paulo (`sa-east-1`).
- PostgreSQL do projeto ativo e saudável.
- Schema funcional do SEGEMPAT aplicado.
- Hardening PostgreSQL aplicado.
- Superfície Data API fechada para `anon`, `authenticated` e `service_role` nas tabelas/funções do SEGEMPAT.
- Security Advisor sem lints após o hardening.
- Histórico interno `schema_migrations` alinhado com versão, arquivo e SHA-256 dos três arquivos atuais.
- Papel `segempat_runtime` criado sem login e sem privilégios administrativos.
- Login técnico `segempat_app` criado, com credencial privada já definida no PostgreSQL e herdando somente `segempat_runtime`.
- A credencial de `segempat_app` não é lida, exibida ou versionada pelo projeto; se o valor operacional não estiver disponível ao responsável pelo host, ele deve ser rotacionado diretamente no ambiente seguro antes da conexão.
- Catálogo PostgreSQL confirma que `segempat_app` não é superuser, não cria banco/roles, não replica, não possui `BYPASSRLS`, não possui `CREATE` no schema `public` e tem limite de 10 conexões.
- `segempat_app` possui CRUD nas 28 tabelas funcionais e somente `SELECT` em `schema_migrations`.
- Funções internas `segempat_*` permanecem sem `EXECUTE` direto para o runtime.
- Bucket `segempat-evidence` existe como privado, limite de 1,5 MB e MIME apenas PNG/JPEG.
- API ainda não conectada ao Supabase através da connection string de runtime no host.
- Nenhum deploy de produção realizado.

## 1. Projeto e rede

- [x] Projeto Supabase alvo identificado.
- [x] Região definida.
- [ ] Connection string de servidor/pooler disponível somente como secret do ambiente da API.
- [ ] TLS obrigatório confirmado na conexão real da API.
- [ ] Limites de conexão/pool validados no runtime real.
- [ ] Origens HTTPS do frontend definidas para CORS.

## 2. Separação de credenciais

A edição usa duas conexões distintas em produção:

- `DATABASE_URL`: role de runtime da API, com menor privilégio;
- `SEGEMPAT_MIGRATION_DATABASE_URL`: credencial temporária/separada para aplicar migrations.

Critérios:

- [x] role de runtime dedicada criada;
- [x] runtime não possui SUPERUSER, CREATEROLE, CREATEDB, REPLICATION ou BYPASSRLS;
- [x] runtime não possui CREATE no schema `public`;
- [x] runtime não pode alterar `schema_migrations`;
- [x] login técnico possui credencial definida privadamente no PostgreSQL, sem valor exposto/versionado;
- [ ] valor da credencial de runtime confirmado/rotacionado no secret manager do host da API;
- [ ] `DATABASE_URL` real configurada apenas no runtime da API;
- [ ] `SEGEMPAT_MIGRATION_DATABASE_URL` real configurada separadamente;
- [ ] runtime e migrator não reutilizam a mesma credencial;
- [x] nenhum segredo real foi versionado.

A configuração reproduzível dos papéis fica em `supabase/bootstrap/runtime-roles.sql`. Esse arquivo é infraestrutura de ambiente e **não** pertence à cadeia versionada em `supabase/migrations`.

## 3. Aplicação do schema

Migrations atualmente versionadas:

- [x] `supabase/migrations/20260913010000_api_owned_baseline.sql`;
- [x] `supabase/migrations/20260913020000_current_hardening.sql`;
- [x] `supabase/migrations/20260913030000_api_surface_hardening.sql`.

No ambiente controlado da API, com secrets injetados pelo ambiente:

```bash
npm ci --prefix server
npm run migrate --prefix server
```

O runner deve:

- [x] manter histórico em `schema_migrations` com versão, arquivo e SHA-256;
- [x] manter advisory lock durante o processo;
- [x] rejeitar divergência de checksum nos testes PostgreSQL;
- [ ] ser executado contra o projeto real usando a credencial de migration separada;
- [ ] aceitar nova execução real sem reaplicar migrations já registradas.

Observação de bootstrap: como o primeiro schema do projeto real foi provisionado pela integração Supabase durante a criação do ambiente, o histórico interno do SEGEMPAT foi adotado uma única vez com os SHA-256 exatos dos arquivos do `main`. A partir da conexão real da API, a fonte de verdade operacional volta a ser o runner `server/scripts/migrate-postgres.js`.

Os registros adicionais no histórico interno da plataforma Supabase referentes a bootstrap de papel técnico, adoção de ledger e bucket de Storage são **infraestrutura do ambiente**, não novas migrations de negócio do SEGEMPAT.

## 4. Runtime da API

Com `DATABASE_URL` da role `segempat_app`, configurada somente no host:

```bash
npm run preflight --prefix server
npm run smoke --prefix server
npm run start --prefix server
```

Depois da API iniciar:

- [ ] `/health` responde com sucesso;
- [ ] `/health/ready` confirma banco, schema/migrations e storage;
- [ ] o preflight confirma PostgreSQL, UTC, UTF-8, TLS e `current_user=segempat_app`;
- [ ] `check-runtime-grants.js` aprova a role de runtime em produção;
- [ ] escritas sem `Origin` confiável continuam bloqueadas;
- [ ] cookies de sessão usam `Secure` no ambiente HTTPS.

## 5. Acesso e governança

- [ ] bootstrap controlado do primeiro Administrador Master executado somente se necessário;
- [ ] Master, Administrador, Inspetor e Operador validados com contas de homologação;
- [ ] `access.permissions.manage` permanece exclusiva do Master;
- [ ] alteração de privilégio invalida sessões anteriores;
- [ ] concessão/revogação de Inspetor gera auditoria;
- [ ] concessão de Master gera auditoria;
- [ ] último Master utilizável permanece protegido.

## 6. Dados e evidências

- [ ] estratégia de carga/migração de dados definida antes de importar dados reais;
- [ ] integridade de matrículas, usuários, perfis e vínculos revisada;
- [ ] ocorrências e avaliações práticas sem referências órfãs;
- [x] bucket de evidências criado como privado, limitado a 1,5 MB e PNG/JPEG;
- [x] evidências privadas não são expostas por bucket público;
- [ ] credenciais S3 próprias do backend cadastradas somente no secret manager do host;
- [ ] upload/download/rollback do Storage validados pela API hospedada;
- [ ] backup e restauração do banco e do storage testados antes do uso real.

## 7. Cutover de homologação

```bash
npm run cutover:audit --prefix server
```

Somente avançar quando:

- [ ] cutover audit estiver aprovado contra o projeto real;
- [ ] relatório de privilégios não mostrar divergências;
- [ ] `/health/ready` estiver verde;
- [ ] workflow **Hosted API Readiness** estiver verde;
- [ ] testes ponta a ponta dos quatro níveis estiverem concluídos;
- [ ] impressão/PDF, Modo TV e dispositivos reais estiverem validados quando aplicável.

## 8. Frontend

O frontend recebe somente:

```text
VITE_SEGEMPAT_API_URL=https://...
VITE_SEGEMPAT_REQUIRE_API=true
```

- [ ] nenhum `DATABASE_URL` no frontend;
- [ ] nenhuma senha PostgreSQL no frontend;
- [ ] nenhuma service-role key no frontend;
- [ ] publicação do frontend feita somente depois da API e do banco passarem os gates anteriores.

## 9. Advisor de performance

O Security Advisor está limpo. O Performance Advisor atualmente apresenta apenas itens informativos:

- 23 foreign keys sem índice dedicado;
- índices ainda sem uso observado em um banco recém-criado/quase vazio.

Esses itens não bloqueiam a primeira homologação. Não remover índices nem criar dezenas de novos índices apenas para zerar o linter; a decisão deve ser baseada em carga e consultas representativas após a API real começar a operar.

## Estado esperado ao final

A frase **“SEGEMPAT homologado no Supabase”** só deve ser usada depois da execução dos gates reais de API, storage e E2E. O estado atual é:

**“SUPABASE REAL E SEGURANÇA DE BANCO/STORAGE PREPARADOS — PENDENTE INJETAR OS SECRETS NO HOST, CONECTAR A API E EXECUTAR A HOMOLOGAÇÃO E2E.”**

## Fase 5 · Storage privado pela API

- [x] Bucket `segempat-evidence` criado como privado, com limite de 1,5 MB e MIME PNG/JPEG.
- [x] API preparada para driver `supabase` via endpoint S3 compatível, sem expor credenciais ao frontend.
- [x] Assinaturas e evidências de ocorrências passam pela abstração server-side; downloads continuam autorizados pela API e usam `Cache-Control: private, no-store`.
- [x] Readiness do storage passa a executar escrita + leitura + remoção de probe no driver ativo.
- [ ] Gerar/confirmar credenciais S3 próprias do backend e armazená-las somente no secret manager do host da API.
- [ ] Validar upload/download/rollback no bucket real com a API hospedada e credenciais reais.

> Não inserir Access Key ID ou Secret Access Key em Git, chat, frontend ou variáveis `VITE_*`.
