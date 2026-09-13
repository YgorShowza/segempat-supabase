# SEGEMPAT · Checklist para projeto Supabase real

Este checklist começa **depois** da fundação PostgreSQL validada em CI. Ele não autoriza deploy de produção e não deve receber senhas, tokens, service-role keys ou connection strings reais em commits, issues ou documentação pública.

## 1. Projeto e rede

- [ ] Projeto Supabase alvo identificado.
- [ ] Região e política de disponibilidade definidas.
- [ ] Connection string de servidor/pooler disponível somente como secret do ambiente da API.
- [ ] TLS obrigatório confirmado.
- [ ] Limites de conexão/pool compatíveis com a API SEGEMPAT.
- [ ] Origens HTTPS do frontend definidas para CORS.

## 2. Separação de credenciais

A edição usa duas conexões distintas em produção:

- `DATABASE_URL`: role de runtime da API, com menor privilégio;
- `SEGEMPAT_MIGRATION_DATABASE_URL`: credencial temporária/separada para aplicar migrations.

Critérios:

- [ ] runtime e migrator não reutilizam a mesma credencial;
- [ ] runtime não possui SUPERUSER, CREATEROLE, CREATEDB, REPLICATION ou BYPASSRLS;
- [ ] runtime não possui CREATE no schema `public`;
- [ ] runtime não possui TRUNCATE, TRIGGER ou REFERENCES desnecessários nas tabelas;
- [ ] credencial de migration não permanece exposta ao frontend nem em `VITE_*`;
- [ ] nenhum segredo real foi versionado.

## 3. Aplicação do schema

No ambiente controlado da API, com secrets injetados pelo ambiente:

```bash
npm ci --prefix server
npm run migrate --prefix server
```

O runner deve:

- [ ] aplicar `supabase/migrations/20260913010000_api_owned_baseline.sql`;
- [ ] aplicar `supabase/migrations/20260913020000_current_hardening.sql`;
- [ ] registrar versão, arquivo e SHA-256 em `schema_migrations`;
- [ ] aceitar nova execução sem reaplicar migrations já registradas;
- [ ] rejeitar divergência de checksum;
- [ ] manter advisory lock durante o processo.

## 4. Runtime da API

Com `DATABASE_URL` da role de runtime:

```bash
npm run preflight --prefix server
npm run smoke --prefix server
npm run start --prefix server
```

Depois da API iniciar:

- [ ] `/health` responde com sucesso;
- [ ] `/health/ready` confirma banco, schema/migrations e storage;
- [ ] o preflight confirma PostgreSQL, UTC, UTF-8 e integridade estrutural;
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
- [ ] política do storage de assinaturas/evidências definida;
- [ ] evidências privadas não são servidas publicamente;
- [ ] backup e restauração do banco e do storage testados antes do uso real.

## 7. Cutover de homologação

```bash
npm run cutover:audit --prefix server
```

Somente avançar quando:

- [ ] cutover audit estiver aprovado;
- [ ] relatório de privilégios não mostrar divergências;
- [ ] `/health/ready` estiver verde;
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

## Estado esperado ao final

A frase **“SEGEMPAT homologado no Supabase”** só deve ser usada depois da execução deste checklist no projeto Supabase real. Até lá, o estado correto é **“fundação PostgreSQL/Supabase validada em CI e pronta para conexão ao projeto real”**.
