# SEGEMPAT API — contrato implementado para MySQL

Este documento descreve a superfície HTTP efetivamente montada pela API corporativa atual.

Base URL do frontend:

```text
VITE_SEGEMPAT_API_URL=https://<api-corporativa>
VITE_SEGEMPAT_REQUIRE_API=true
```

## Regras gerais

- sessão em cookie `HttpOnly`;
- `Secure=true` obrigatório em produção;
- requests funcionais de escrita usam JSON (`Content-Type: application/json`);
- toda escrita em `/api` exige cabeçalho `Origin` presente e exatamente autorizado em `SEGEMPAT_ALLOWED_ORIGINS`;
- o frontend usa `credentials: include`;
- não armazenar senha, segredo de sessão ou credencial MySQL no navegador;
- erros seguem, em geral:

```json
{ "error": "Mensagem segura", "code": "SOME_CODE", "details": null }
```

## Health

- `GET /health` — liveness do processo HTTP;
- `GET /health/ready` — readiness de MySQL/TLS/migration/schema/storage.

## Auth — `/api/auth`

- `POST /api/auth/login`
- `POST /api/auth/activate`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`

### Login

```json
{ "matricula": "000", "password": "..." }
```

Resposta de sessão:

```json
{ "id": "uuid", "matricula": "000", "nome": "Nome", "setor": "CFTV", "isAdmin": true }
```

Login e ativação possuem limitação local de tentativas. A troca de senha rotaciona a sessão atual e invalida tokens antigos por versão da conta.

`logout` remove o cookie no dispositivo atual. Como a sessão é stateless, um token copiado não é mantido em uma tabela de revogação; ele deixa de ser aceito ao expirar, quando a conta é alterada/inativada ou quando a credencial é modificada.

## Colaboradores — `/api/employees`

- `GET /api/employees` — Inspetor recebe a coleção administrativa; Operador recebe somente colaboradores ativos compatíveis com seu setor;
- `GET /api/employees/me` — cadastro funcional do usuário autenticado;
- `POST /api/employees` — Inspetor;
- `PATCH /api/employees/:id` — Inspetor;
- `DELETE /api/employees/:id` — Inspetor, bloqueado quando existe conta/histórico.

## Acessos — `/api/access`

Somente Inspetor:

- `GET /api/access/activation-codes`
- `POST /api/access/activation-codes/:employeeId`
- `DELETE /api/access/activation-codes/:employeeId`
- `GET /api/access/audit?limit=&offset=`

O código puro de primeiro acesso é devolvido somente na emissão; o MySQL guarda apenas hash bcrypt.

## Provas — administração `/api/exams`

Somente Inspetor:

- `GET /api/exams`
- `GET /api/exams/:id`
- `POST /api/exams`
- `PATCH /api/exams/:id`
- `DELETE /api/exams/:id`

## Provas — usuário autenticado `/api/me`

- `GET /api/me/exams` — metadados de provas publicadas compatíveis com setor/data;
- `GET /api/me/exams/:id` — prova sanitizada, sem `correct_index` e `model_answer`;
- `GET /api/me/exam-attempts`
- `GET /api/me/exam-attempts/year/:year`
- `POST /api/me/exams/:id/attempts` — servidor recalcula nota/aprovação;
- `POST /api/me/exam-attempts/:attemptId/signature` — assinatura da própria tentativa aprovada.

## Evidências administrativas — `/api/admin`

Somente Inspetor:

- `GET /api/admin/exam-attempts?year=`
- `GET /api/admin/exam-signatures?path=`

A leitura de assinatura exige vínculo formal, caminho confinado ao storage e arquivo PNG válido.

## Cronograma — `/api/cronograma`

Leitura autenticada; escrita administrativa:

- `GET /api/cronograma?month=YYYY-MM`
- `GET /api/cronograma/year/:year`
- `POST /api/cronograma`
- `POST /api/cronograma/bulk`
- `PATCH /api/cronograma/:id`
- `DELETE /api/cronograma/:id`
- `POST /api/cronograma/sync-exam-attempts`

O mesmo router contém as operações versionadas de importação, recorrências e suspensões usadas pelo frontend. Identidade funcional e vínculos de questões são derivados/validados no servidor.

## Banco de Questões — `/api/question-bank`

- `GET /api/question-bank` — Inspetor, inclui dados administrativos;
- `GET /api/question-bank/operational` — usuário autenticado, somente questões ativas/setoriais e sem gabarito;
- `POST /api/question-bank` — Inspetor;
- `PATCH /api/question-bank/:id` — Inspetor;
- `DELETE /api/question-bank/:id` — Inspetor.

## Treinamentos

### Leitura de módulos — `/api/training`

- `GET /api/training/modules`

Operador recebe módulos ativos compatíveis com setor; Inspetor pode receber a coleção administrativa.

### Administração — `/api/admin/training`

Somente Inspetor:

- `POST /api/admin/training/modules`
- `PATCH /api/admin/training/modules/:id`
- `DELETE /api/admin/training/modules/:id`
- `GET /api/admin/training/schedules`
- `POST /api/admin/training/schedules`
- `PATCH /api/admin/training/schedules/:id`
- `DELETE /api/admin/training/schedules/:id`

### Usuário — `/api/me/training`

- `GET /api/me/training/schedule`
- `GET /api/me/training/activities`
- `POST /api/me/training/activities/:type/attempts`

Tipos aceitos no backend: `Simulador`, `Stress Test`, `Desafio Diário` e `Teste Rápido`. O servidor revalida questões, setor, tipo/dificuldade, calcula score, aprovação e XP.

## Operações — `/api/operations`

### Base de Conhecimento

- `GET /api/operations/knowledge` — autenticado, filtrado para Operador;
- `POST /api/operations/knowledge` — Inspetor;
- `PATCH /api/operations/knowledge/:id` — Inspetor;
- `DELETE /api/operations/knowledge/:id` — Inspetor.

### Ocorrências

- `GET /api/operations/occurrences` — Inspetor vê tudo; Operador vê somente registros próprios/vinculados;
- `POST /api/operations/occurrences` — autenticado; identidade do Operador é derivada da sessão;
- `PATCH /api/operations/occurrences/:id` — Inspetor;
- `DELETE /api/operations/occurrences/:id` — Inspetor.

### Avaliações Práticas

Administração:

- `GET /api/operations/practical-evaluations`
- `POST /api/operations/practical-evaluations`
- `PATCH /api/operations/practical-evaluations/:id`
- `DELETE /api/operations/practical-evaluations/:id`
- `POST /api/operations/practical-evaluations/generate-month`
- `GET /api/operations/practical-templates`
- `POST /api/operations/practical-templates`
- `PATCH /api/operations/practical-templates/:id`
- `DELETE /api/operations/practical-templates/:id`

A geração mensal recebe `month` no formato `YYYY-MM` e, opcionalmente, `template_id`. Ela executa em uma única transação, considera apenas modelos ativos e colaboradores operacionais ativos, respeita setor e suspensões do Cronograma, distribui as datas dentro do mês e cria o vínculo 1:1 entre cada avaliação e seu lançamento no Cronograma. `template_slot` + índice UNIQUE tornam a operação idempotente: repetir a mesma geração não cria o mesmo slot novamente.

Exemplo:

```json
{ "month": "2026-09", "template_id": "uuid-opcional" }
```

Resposta:

```json
{ "month": "2026-09", "created": 12, "skipped": 4, "suspended": 0, "due_templates": 2 }
```

A exclusão de avaliação prática também é protegida na camada MySQL: registros em andamento/concluídos e avaliações cujo lançamento vinculado no Cronograma já tenha sido formalizado não podem romper o histórico operacional.

Consulta pessoal:

- `GET /api/me/practical-evaluations`

A rota pessoal usa exclusivamente o `employeeId` da sessão atual, inclusive quando a conta autenticada também possui privilégios administrativos.

### Auditoria operacional

- `GET /api/operations/audit?limit=` — Inspetor.

## Storage

O driver **implementado atualmente é somente `filesystem` privado**. A configuração rejeita outros drivers. O MySQL guarda metadados/caminhos e a API controla leitura/escrita das evidências.

Adicionar S3 ou outro storage no futuro exige implementação explícita no backend e nova homologação; não deve ser tratado como opção já suportada.

## Segurança de resposta

A API não deve retornar stack trace, SQL, host, usuário do banco ou detalhes internos de infraestrutura ao navegador. Endpoints de health também mantêm respostas operacionais sanitizadas.