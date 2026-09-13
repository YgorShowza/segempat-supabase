# SEGEMPAT — Dados necessários da TI para iniciar a homologação MySQL

Este documento marca a transição entre **código pronto** e **homologação no ambiente real da empresa**.

> Não registrar senha real, segredo de sessão ou conteúdo de certificados neste arquivo, em issue, commit ou chat compartilhado. Esses valores devem ser entregues pela TI por canal seguro e configurados somente no servidor.

## 1. Banco MySQL corporativo

Preencher/confirmar:

- Versão exata do MySQL 8.x:
- Host/IP do servidor MySQL:
- Porta TCP (padrão 3306):
- Nome do database destinado ao SEGEMPAT:
- Usuário de aplicação/runtime com privilégio mínimo:
- Usuário separado de migration, controlado pela TI:
- Binary logging ativo? `sim/não`:
- Se binary logging estiver ativo, `log_bin_trust_function_creators=1` (ou política corporativa equivalente que permita à identidade de migration criar os triggers versionados sem conceder `SUPER` ao runtime):
- TLS disponível e habilitado para a conexão da API: `sim` (obrigatório com `NODE_ENV=production`):
- CA corporativa própria? `sim/não`:
- Se houver CA, caminho absoluto onde ela ficará no host da API:
- Origem de rede/IP que deve ser liberada no firewall/allowlist para a API:

As senhas MySQL **não devem ser escritas neste documento**.

### Separação obrigatória em produção

`MYSQL_USER` é a identidade de runtime da API e deve possuir apenas os grants necessários à operação normal do SEGEMPAT. Essa conta não deve receber privilégios de DDL/administrativos como `CREATE`, `ALTER`, `DROP`, `TRIGGER`, `INDEX` ou `GRANT OPTION`.

As migrations usam uma segunda identidade, fornecida somente durante a execução pela TI:

```text
MYSQL_MIGRATION_USER=<USUARIO_MIGRATION_TI>
MYSQL_MIGRATION_PASSWORD=<SECRET_INJETADO_POR_CANAL_SEGURO>
```

Em `NODE_ENV=production`, `npm run migrate` recusa:

- ausência da credencial de migration;
- apenas uma das duas variáveis preenchida;
- `MYSQL_MIGRATION_USER` igual a `MYSQL_USER`.

A senha de migration não deve permanecer no `.env` do serviço da API depois da atualização de schema. Preferir secret temporário, cofre corporativo ou mecanismo equivalente da TI.

O schema do SEGEMPAT possui triggers de integridade e auditoria. Em servidores MySQL com binary logging ativo e `log_bin_trust_function_creators=0`, a criação desses objetos pode exigir privilégio global elevado. A configuração recomendada para homologação é a TI aprovar `log_bin_trust_function_creators=1` (ou mecanismo corporativo equivalente) durante a política de migrations, mantendo a conta de runtime sem `SUPER` e sem DDL. O workflow descartável do GitHub reproduz essa separação.

Se o MySQL corporativo não oferecer TLS para o host da API, a homologação em modo `production` deve parar até a TI definir uma solução compatível; não desabilitar o controle apenas para fazer o gate passar.

## 2. Servidor da API SEGEMPAT

- Tipo de execução: `Docker` / `Linux + systemd` / outro:
- Hostname/IP da API:
- Porta interna da API (padrão 8787):
- URL HTTPS final da API, por exemplo `https://api.segempat.empresa.local`:
- Proxy reverso: `Nginx` / `IIS` / balanceador corporativo / outro:
- Certificado HTTPS disponível? `sim/não`:
- Diretório/volume persistente para assinaturas e evidências:
- Esse storage entra no backup corporativo? `sim/não`:

## 3. Frontend corporativo

- URL HTTPS do frontend de homologação:
- URL HTTPS do frontend definitivo:
- A API deve aceitar exatamente essas origens em `SEGEMPAT_ALLOWED_ORIGINS`.

No build corporativo do frontend usar obrigatoriamente:

```text
VITE_SEGEMPAT_API_URL=<URL HTTPS DA API>
VITE_SEGEMPAT_REQUIRE_API=true
```

`VITE_SEGEMPAT_REQUIRE_API=true` é o controle de corte que impede funcionamento corporativo sem a API própria configurada. O modo demonstração não fica disponível quando a API corporativa está configurada/obrigatória.

## 4. Configuração persistente da API

Usar `server/.env.example` como modelo. Os valores reais devem existir somente no servidor/secrets manager.

Variáveis persistentes de runtime:

```text
NODE_ENV=production
PORT=8787
MYSQL_HOST=<HOST>
MYSQL_PORT=<PORTA>
MYSQL_DATABASE=<DATABASE>
MYSQL_USER=<USUARIO_RUNTIME>
MYSQL_PASSWORD=<SEGREDO_RUNTIME>
MYSQL_SSL=true
MYSQL_SSL_CA_PATH=<CAMINHO_ABSOLUTO_SE_EXIGIDO>
MYSQL_POOL_SIZE=10
SEGEMPAT_SESSION_SECRET=<SEGREDO_ALEATORIO_32+_BYTES>
SEGEMPAT_SESSION_COOKIE=segempat_session
SEGEMPAT_SESSION_TTL_HOURS=12
SEGEMPAT_SESSION_SECURE=true
SEGEMPAT_SESSION_SAMESITE=lax
SEGEMPAT_ALLOWED_ORIGINS=<ORIGENS_HTTPS_EXATAS>
SEGEMPAT_STORAGE_DRIVER=filesystem
SEGEMPAT_STORAGE_PATH=<CAMINHO_ABSOLUTO_PERSISTENTE>
SEGEMPAT_TIMEZONE=America/Maceio
```

`MYSQL_MIGRATION_USER` e `MYSQL_MIGRATION_PASSWORD` não fazem parte do segredo permanente da API; são injetados somente no processo controlado de migration.

## 5. Ordem oficial de execução da homologação

Com os dados de runtime configurados no ambiente real, executar na pasta `server/`:

```bash
npm ci
npm run preflight
```

Depois, com `MYSQL_MIGRATION_USER` e `MYSQL_MIGRATION_PASSWORD` injetados de forma segura pela TI:

```bash
npm run migrate
```

Nesta revisão, o histórico esperado chega até `010_granular_access_control.sql`.

Remover/encerrar a exposição do secret de migration e voltar à identidade de runtime. Então:

```bash
npm run smoke
```

Somente se todos os gates acima passarem:

1. realizar a carga/migração dos dados e evidências;
2. executar `npm run cutover:audit`;
3. executar `npm run bootstrap-admin` apenas se for necessário criar a primeira conta administrativa, que será **Administrador Master**;
4. se a conta já existir e precisar ser designada Master, executar `npm run grant-master-access` com confirmação explícita da TI;
5. executar `npm run report-privileged-access` e revisar qualquer divergência;
6. iniciar a API com `npm start` ou pelo runtime corporativo definido;
7. confirmar `GET /health` e `GET /health/ready`;
8. publicar o frontend corporativo com `VITE_SEGEMPAT_API_URL=<HTTPS DA API>` e `VITE_SEGEMPAT_REQUIRE_API=true`;
9. executar os testes ponta a ponta com Administrador Master, Inspetor e Operador.

Então validar:

- login de Administrador Master;
- Acessos → Níveis e permissões;
- proteção da própria conta e do último Master;
- invalidação de sessão após mudança de privilégio;
- login de Inspetor;
- login de Operador;
- primeiro acesso/ativação;
- Equipe/Colaboradores;
- Cronograma;
- Banco de Questões e Provas;
- correção e tentativas;
- assinatura/evidências;
- certificados e validação;
- Treinamentos;
- Avaliação Prática;
- Ocorrências;
- demais módulos funcionais;
- CORS, cookies, HTTPS, firewall, backup e rollback.

## 6. Controle de acesso privilegiado pela TI

A Gestão de Equipe do aplicativo é operacional e **não deve promover automaticamente nenhuma conta para Administrador Master**. A migration `010_granular_access_control.sql` preserva menor privilégio: contas legadas podem ser classificadas como Administrador, Inspetor ou Operador, mas Master exige decisão explícita e auditável da TI.

### Administrador Master

Se a conta já existir e a TI precisar designá-la como Master sem redefinir senha:

```bash
CONFIRM_MASTER_ACCESS=SIM \
MATRICULA=<MATRICULA_AUTORIZADA> \
TI_OPERATOR="<RESPONSAVEL_TI>" \
npm run grant-master-access
```

A concessão invalida sessões anteriores, registra `TI_GRANT_MASTER_ACCESS` e não manipula senha.

O nível Master deve permanecer restrito às contas formalmente aprovadas pela TI. A própria conta não pode alterar o próprio nível e a remoção do último Administrador Master é bloqueada pela API.

### Inspetor

Depois do bootstrap/concessão inicial, conceder privilégio de Inspetor a outro colaborador somente com:

```bash
CONFIRM_PRIVILEGED_ACCESS=SIM \
ACTION=GRANT \
MATRICULA=<MATRICULA> \
TI_OPERATOR="<RESPONSAVEL_TI>" \
npm run manage-inspector-access
```

Para revogar:

```bash
CONFIRM_PRIVILEGED_ACCESS=SIM \
ACTION=REVOKE \
MATRICULA=<MATRICULA> \
TI_OPERATOR="<RESPONSAVEL_TI>" \
npm run manage-inspector-access
```

A execução é transacional, não recebe senha, invalida sessões anteriores da conta vinculada e registra a alteração em `audit_logs` como `TI_GRANT_INSPECTOR` ou `TI_REVOKE_INSPECTOR`. O script protege conta Master contra rebaixamento indevido.

Para revisão periódica e antes do aceite:

```bash
npm run report-privileged-access
```

O acesso ao host capaz de executar esses comandos deve ser limitado aos administradores técnicos autorizados.

A matriz completa de responsabilidades está em `LGPD_GOVERNANCE.md`.

## 7. Auditoria e governança MySQL

A migration `006_governance_audit_session_hardening.sql` acrescenta:

- `app_users.session_epoch` para revogação imediata de sessões após mudança de privilégio/status;
- trigger que bloqueia `UPDATE` de `audit_logs`;
- trigger que bloqueia `DELETE` de `audit_logs`;
- preservação do vínculo do ator por foreign key `RESTRICT`.

A migration `010_granular_access_control.sql` acrescenta os níveis e permissões granulares e exige concessão explícita do nível Master.

`npm run smoke` e `npm run cutover:audit` executam verificações de integridade no banco real; `/health/ready` valida o histórico completo das migrations versionadas do deploy.

## 8. Regra de parada

Se `preflight`, `migrate`, `smoke`, `cutover:audit`, `report-privileged-access` ou `/health/ready` apresentarem divergência crítica, **não considerar o ambiente homologado e não mascarar a divergência**. Corrigir a configuração, schema, dados, privilégios ou infraestrutura e repetir o gate.

## 9. Critério de conclusão

Antes dos testes no ambiente real, o status correto permanece:

**PARTE DO MYSQL NO CÓDIGO CONCLUÍDA — PRONTO PARA CONECTAR AO BANCO DA EMPRESA.**

Somente após aprovação dos gates e do teste ponta a ponta no ambiente corporativo:

**SEGEMPAT HOMOLOGADO NO MYSQL DA EMPRESA.**
