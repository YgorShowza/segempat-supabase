# SEGEMPAT — Comece aqui · Entrega para TI

Este é o ponto de entrada para a equipe de TI conectar e homologar o SEGEMPAT no MySQL corporativo.

> **Status de entrega:** código do frontend, API, integração MySQL, migrations, contratos de segurança e readiness preparados e validados em CI. A homologação final depende do ambiente real da empresa.
>
> **Não registrar neste repositório:** senhas MySQL, segredo de sessão, tokens Cloudflare, chaves privadas, conteúdo de certificados privados ou outros secrets corporativos.

## 1. O que a TI recebe

Arquitetura prevista:

```text
Navegador do usuário
        | HTTPS
        v
Frontend SEGEMPAT / Cloudflare
        | HTTPS / JSON
        v
API SEGEMPAT — Node.js / Express
        | TLS
        v
MySQL 8 corporativo
        |
        +--> storage privado persistente de assinaturas/evidências
```

O frontend nunca acessa o MySQL diretamente. Credenciais e demais secrets ficam somente no ambiente servidor/cofre corporativo.

## 2. Documentos do pacote

Leia nesta ordem:

1. **`COMECE_AQUI_TI.md`** — esta capa e ordem de execução.
2. **`MYSQL_TI_INPUTS.md`** — dados de infraestrutura que a TI precisa definir/confirmar, sem senhas.
3. **`ENTREGA_TI.md`** — roteiro operacional resumido de implantação e homologação.
4. **`MYSQL_CORPORATE_HANDOFF.md`** — procedimento técnico detalhado de conexão, migrations, smoke, carga e cutover.
5. **`CORPORATE_HOMOLOGATION_CHECKLIST.md`** — checklist de execução no ambiente corporativo.
6. **`PRODUCTION_CHECKLIST.md`** — checklist de produção/cutover, separando o que já foi comprovado em código/CI do que depende do ambiente real.
7. **`HOMOLOGATION_EVIDENCE_TEMPLATE.md`** — registro formal das evidências e do aceite.
8. **`TI_REVIEW.md`** — visão técnica para revisão do repositório.
9. **`SECURITY_AUDIT.md`** e **`LGPD_GOVERNANCE.md`** — controles de segurança, auditoria, privacidade e responsabilidades.

Arquivos técnicos principais:

- `server/.env.example` — modelo das variáveis da API, sem secrets;
- `server/package.json` — comandos oficiais da API e dos gates;
- `server/src/` — API SEGEMPAT;
- `database/mysql/` — schema e migrations versionadas;
- `server/Dockerfile` e `server/docker-compose.yml` — referência para container;
- `server/deploy/` — referência de systemd/proxy;
- `.github/workflows/` — CI, integração MySQL, hardening e readiness Cloudflare.

## 3. Antes de executar qualquer migration

A TI deve primeiro preencher/confirmar os itens de `MYSQL_TI_INPUTS.md`.

Os pontos mínimos são:

- MySQL 8.x e database dedicado;
- usuário **runtime** de privilégio mínimo;
- usuário **migration** separado e temporário;
- TLS disponível entre API e MySQL;
- política para criação dos triggers versionados;
- host da API e acesso de rede ao MySQL;
- URL HTTPS da API;
- URL HTTPS do frontend;
- proxy/firewall/VPN/allowlist conforme política corporativa;
- storage persistente e política de backup/restore;
- responsável técnico pela homologação e pelo rollback.

### Separação de credenciais

A API usa uma identidade permanente de runtime:

```text
MYSQL_USER=<USUARIO_RUNTIME>
MYSQL_PASSWORD=<SECRET_NO_COFRE>
```

As migrations usam outra identidade, injetada somente durante a atualização de schema:

```text
MYSQL_MIGRATION_USER=<USUARIO_MIGRATION_TI>
MYSQL_MIGRATION_PASSWORD=<SECRET_TEMPORARIO_NO_COFRE>
```

A identidade de runtime não deve receber `CREATE`, `ALTER`, `DROP`, `TRIGGER`, `INDEX`, `GRANT OPTION` ou privilégios administrativos equivalentes.

## 4. Regra de parada

A sequência é **gateada**. Se um gate falhar, a equipe deve parar, corrigir a causa e repetir o gate. Não alterar scripts, migrations ou validações apenas para mascarar uma divergência do ambiente.

Em especial:

- sem TLS no MySQL em produção: **parar**;
- `preflight` reprovado: **não executar migrations**;
- migration/baseline divergente: **não continuar a carga**;
- `smoke` reprovado: **não iniciar cutover**;
- `cutover:audit` ou `report-privileged-access` com divergência crítica: **não liberar usuários**;
- `/health/ready` não saudável: **não publicar/ligar o frontend corporativo**.

## 5. Ordem oficial de homologação

No host da API, com os secrets configurados fora do repositório:

```bash
cd server
npm ci
npm run preflight
```

Somente após `preflight` aprovado, injetar temporariamente a identidade de migration e executar:

```bash
npm run migrate
```

Encerrar/remover a exposição do secret de migration. Voltar à identidade de runtime e executar:

```bash
npm run smoke
```

Depois:

```text
migrar/carregar dados e evidências oficiais
        ↓
npm run cutover:audit
        ↓
bootstrap/concessão explícita de Administrador Master, somente se necessário
        ↓
npm run report-privileged-access
        ↓
subir a API
        ↓
GET /health
GET /health/ready
        ↓
publicar/conectar frontend corporativo
        ↓
E2E Administrador Master + Inspetor + Operador
        ↓
backup/restore/rollback + aceite
```

## 6. Configuração do frontend corporativo

No build corporativo:

```text
VITE_SEGEMPAT_API_URL=https://<api-corporativa>
VITE_SEGEMPAT_REQUIRE_API=true
```

Na API:

```text
SEGEMPAT_ALLOWED_ORIGINS=https://<frontend-corporativo>
```

A origem deve ser exata e HTTPS. Nenhuma variável `VITE_*` pode conter credencial MySQL ou secret da API.

## 7. Administrador Master

Nenhuma migration deve transformar automaticamente uma conta legada em Administrador Master.

Se não existir uma conta administrativa válida após a carga e for necessário criar a primeira conta, usar o procedimento de `bootstrap-admin` descrito em `ENTREGA_TI.md`.

Se a conta já existir e precisar ser designada explicitamente como Master, usar `grant-master-access` conforme o mesmo documento.

Depois da definição de acessos privilegiados, executar obrigatoriamente:

```bash
npm run report-privileged-access
```

A TI deve revisar e guardar a evidência sanitizada sem registrar senha.

## 8. O que deve ser testado no ambiente real

O CI comprova o comportamento do código e executa integração contra MySQL 8 descartável, mas não substitui a validação corporativa. A TI/gestão deve comprovar no ambiente real, no mínimo:

- conexão e TLS com o MySQL corporativo;
- migrations e histórico/checksums;
- carga dos dados oficiais e evidências;
- storage persistente e backup/restore;
- HTTPS, CORS, cookies e rede;
- `/health/ready` saudável;
- login/logout e primeiro acesso;
- Administrador Master e gestão granular de permissões;
- Inspetor e Operador com bloqueios corretos;
- Cronograma, Provas, Banco de Questões, certificados e assinaturas;
- Treinamentos, Avaliação Prática e Ocorrências;
- PDF/impressão e assinatura em dispositivo real;
- rollback e responsáveis.

Use `HOMOLOGATION_EVIDENCE_TEMPLATE.md` para registrar essas evidências.

## 9. Cloudflare

O repositório possui um workflow separado de **Production Deploy**. Ele é manual, exige a branch `main`, confirmação explícita `PUBLICAR`, secrets/configuração do ambiente de produção e uma URL HTTPS real da API.

Antes do upload real ele executa build e dry-run. A existência desse workflow não significa que produção já foi publicada.

A publicação deve ocorrer apenas quando a TI tiver definido o ambiente corporativo e estiver seguindo o plano de cutover aprovado.

## 10. Identificação do commit implantado

Antes da homologação, a TI deve registrar o commit exato que será implantado:

```bash
git rev-parse HEAD
```

O SHA deve ser copiado para `HOMOLOGATION_EVIDENCE_TEMPLATE.md` e mantido junto às evidências da homologação.

## 11. Critério final

Antes dos gates no ambiente real, a frase correta é:

**PARTE DO MYSQL NO CÓDIGO CONCLUÍDA — PRONTO PARA CONECTAR AO BANCO DA EMPRESA.**

Somente depois de `preflight`, `migrate`, `smoke`, carga/auditoria, readiness, E2E, infraestrutura, backup/restore/rollback e aceite aprovados no ambiente corporativo:

**SEGEMPAT HOMOLOGADO NO MYSQL DA EMPRESA.**
