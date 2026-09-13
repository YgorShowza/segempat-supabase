# SEGEMPAT — Entrega para a TI · MySQL Corporativo

Documento operacional para a equipe de TI implantar e homologar o SEGEMPAT no ambiente corporativo.

## Arquitetura

```text
Navegador do usuário
        | HTTPS
        v
API SEGEMPAT — Node.js / Express
        | TLS interno
        v
MySQL 8 da empresa
```

A API é a única camada que acessa o banco. O navegador nunca recebe credenciais MySQL.

## Materiais do pacote

| Item | Arquivo |
| --- | --- |
| Dados que a TI precisa fornecer | `MYSQL_TI_INPUTS.md` |
| Roteiro detalhado de homologação | `MYSQL_CORPORATE_HANDOFF.md` |
| Checklist de homologação | `CORPORATE_HOMOLOGATION_CHECKLIST.md` |
| Registro final de evidências/aceite | `HOMOLOGATION_EVIDENCE_TEMPLATE.md` |
| Checklist de produção/cutover | `PRODUCTION_CHECKLIST.md` |
| Auditoria de segurança atual | `SECURITY_AUDIT.md` |
| Schema MySQL | `database/mysql/001_schema.sql` + migrations versionadas até `010_granular_access_control.sql` nesta revisão |
| Modelo de variáveis da API | `server/.env.example` |
| Docker | `server/Dockerfile`, `server/docker-compose.yml` |
| systemd | `server/deploy/segempat-api.service` |
| Nginx | `server/deploy/nginx-segempat-api.conf` |

## Pré-requisitos da TI

- MySQL 8.x;
- database dedicado ao SEGEMPAT;
- usuário de aplicação de privilégio mínimo;
- usuário separado de migration;
- TLS habilitado para MySQL em produção;
- CA corporativa instalada quando exigida;
- servidor/VM/container para a API;
- URL HTTPS da API;
- URL HTTPS do frontend;
- storage privado e persistente para evidências;
- firewall/VPN/allowlist conforme política da empresa;
- política de backup e restauração.

## Secrets

Nunca colocar em GitHub, issue, chat compartilhado ou variável `VITE_*`:

- `MYSQL_PASSWORD`;
- `MYSQL_MIGRATION_PASSWORD`;
- `SEGEMPAT_SESSION_SECRET`;
- chave privada de certificado;
- conteúdo de CA privada quando a política da empresa tratar como material restrito.

Usar `server/.env.example` somente como modelo.

## Ordem oficial da homologação

### 1. Preparar ambiente

```bash
cd server
npm ci
```

Configurar as variáveis reais no servidor/cofre de secrets.

### 2. Gate de ambiente

```bash
npm run preflight
```

Se falhar, **parar**. Não executar migrations.

### 3. Schema

Injetar temporariamente `MYSQL_MIGRATION_USER` e `MYSQL_MIGRATION_PASSWORD`, com identidade distinta do runtime, e executar:

```bash
npm run migrate
```

Nesta revisão, o histórico esperado chega até `010_granular_access_control.sql`.

Encerrar/remover o secret de migration e voltar à identidade de runtime. Então:

```bash
npm run smoke
```

Se qualquer um falhar, **parar** e corrigir a causa.

### 4. Migrar dados e evidências

Carregar os dados oficiais preservando UUIDs, matrículas e vínculos. Copiar assinaturas/evidências para o storage corporativo e registrar contagens antes/depois.

A migration `010` aplica menor privilégio às contas existentes e não promove automaticamente nenhuma conta para Administrador Master.

### 5. Auditoria pós-carga

```bash
npm run cutover:audit
```

Qualquer inconsistência crítica bloqueia a continuidade.

A auditoria inclui a integridade da geração recorrente de Avaliação Prática: data operacional, slots, vínculo 1:1 com o Cronograma, coerência de colaborador/tema/data e ausência de marcadores `[PRACTICAL:<id>]` órfãos.

### 6. Administrador Master, somente se necessário

Se a carga não trouxer uma conta administrativa válida, executar o bootstrap depois da carga/auditoria. Não digitar a senha na linha de comando:

```bash
read -rsp 'Senha temporária: ' SENHA_TMP; echo
printf '%s' "$SENHA_TMP" | \
  CONFIRM_BOOTSTRAP_ADMIN=SIM SENHA_STDIN=SIM \
  MATRICULA=<MATRICULA> NOME="<NOME>" SETOR=Administrativo \
  npm run bootstrap-admin
unset SENHA_TMP
```

O bootstrap cria o primeiro **Administrador Master**. A senha temporária deve ser trocada no primeiro acesso.

Se a conta já existir e a TI precisar designá-la como Master sem redefinir senha:

```bash
CONFIRM_MASTER_ACCESS=SIM \
MATRICULA=<MATRICULA_AUTORIZADA> \
TI_OPERATOR="<RESPONSAVEL_TI>" \
npm run grant-master-access
```

Depois de qualquer definição de privilégio administrativo:

```bash
npm run report-privileged-access
```

Qualquer divergência crítica no relatório bloqueia a liberação.

### 7. Subir API

```bash
npm start
```

Ou usar Docker/systemd conforme padrão corporativo.

Confirmar:

```text
GET /health
GET /health/ready
```

`/health/ready` deve permanecer verde. O readiness valida o **histórico completo** de migrations do banco contra os arquivos versionados do deploy; migration ausente, extra, renomeada ou com checksum divergente torna a API não pronta.

### 8. Ligar o frontend corporativo

Publicar o frontend com:

```text
VITE_SEGEMPAT_API_URL=https://<api-corporativa>
VITE_SEGEMPAT_REQUIRE_API=true
```

A segunda variável impede fallback silencioso para o modo demonstração.

Na API:

```text
SEGEMPAT_ALLOWED_ORIGINS=https://<frontend-corporativo>
```

A origem deve ser exata e HTTPS.

### 9. E2E

Executar pelo menos um ciclo completo com **Administrador Master**, **Inspetor** e **Operador**.

Para o Master, validar Acessos → Níveis e permissões, proteção da própria conta, proteção do último Master, aplicação de permissões, invalidação de sessão após mudança de privilégio e auditoria das alterações.

Para Inspetor e Operador, validar os módulos permitidos e confirmar que operações não autorizadas permanecem bloqueadas pela API.

Cobrir também primeiro acesso, login/logout, Equipe, Cronograma, Banco de Questões, Provas, assinatura, certificados, Treinamentos, gamificação, Avaliação Prática manual e recorrente, Ocorrências, Base de Conhecimento, Perfil e Auditoria conforme as permissões efetivas.

Na Avaliação Prática recorrente, confirmar também uma segunda execução sem duplicação, respeito a suspensões, vínculo com o Cronograma/indicadores e proteção do histórico formalizado.

### 10. Infraestrutura e cutover

Confirmar:

- TLS do MySQL;
- HTTPS da API/frontend;
- CORS e cookies;
- firewall/VPN/allowlist;
- grants do usuário MySQL;
- storage persistente;
- backup e restore;
- logs/monitoramento;
- rate limiting central no proxy/WAF se houver múltiplas réplicas;
- topologia de proxy compatível com `trust proxy=1` ou ajuste correspondente;
- plano de rollback e responsáveis.

## Registro obrigatório das evidências

Usar `HOMOLOGATION_EVIDENCE_TEMPLATE.md` para registrar, sem secrets:

- commit implantado;
- versão do MySQL/Node e ambiente;
- resultados de `preflight`, `migrate`, `smoke` e `cutover:audit`;
- migration mais recente e histórico/checksums;
- contagens antes/depois da carga;
- estado de `/health` e `/health/ready`;
- evidência da conta Master aprovada pela TI;
- saída do `report-privileged-access`;
- E2E de Administrador Master, Inspetor e Operador;
- TLS, rede, CORS, cookies, storage e dispositivos;
- backup, restore e rollback;
- pendências e aceite técnico/funcional.

Sem esse registro preenchido e sem os gates reais aprovados, não declarar homologação concluída.

## Segurança já implementada na API

- sessão HMAC em cookie HTTP-only;
- `Secure=true` obrigatório em produção;
- autorização reconstruída do MySQL a cada requisição;
- conta/colaborador inativo bloqueado;
- níveis granulares `master`, `admin`, `inspector` e `operator`;
- permissões efetivas aplicadas pela API;
- gestão de níveis/permissões exclusiva do Administrador Master;
- última conta Master e alteração do próprio nível protegidas;
- mudanças de privilégio invalidam sessões anteriores e geram auditoria;
- operações de escrita exigem `Origin` autorizada;
- login/ativação possuem limitação de tentativas local;
- troca de senha invalida sessões antigas;
- recuperação segura de senha usa código temporário armazenado como hash;
- senhas e códigos temporários usam bcrypt;
- evidências ficam em storage privado;
- container e serviços possuem hardening de referência;
- readiness detecta drift no histórico completo das migrations.

## Status

Antes da execução real dos gates:

**PARTE DO MYSQL NO CÓDIGO CONCLUÍDA — PRONTO PARA CONECTAR AO BANCO DA EMPRESA.**

Somente depois da homologação real e do registro de evidências:

**SEGEMPAT HOMOLOGADO NO MYSQL DA EMPRESA.**
