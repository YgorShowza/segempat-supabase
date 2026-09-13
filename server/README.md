# API SEGEMPAT sobre MySQL corporativo

Backend corporativo do SEGEMPAT. O navegador conversa somente com esta API; credenciais do banco permanecem no servidor, que aplica autenticação, autorização, regras de negócio, auditoria e acesso ao storage privado.

## Requisitos

- Node.js 20+
- MySQL 8.x
- TLS para MySQL em produção
- acesso de rede da API ao banco
- HTTPS no proxy reverso
- volume persistente para assinaturas/evidências

## Instalação

```bash
cd server
npm ci
cp .env.example .env
```

Preencha `.env` somente no servidor/cofre de secrets. Nunca use variáveis `VITE_*` para credenciais do backend.

## Ordem oficial do primeiro ambiente

1. Criar database e usuário MySQL de privilégio mínimo.
2. Configurar TLS/CA, rede, storage, CORS e sessão segura.
3. Executar:

```bash
npm run preflight
```

Se falhar, não executar migrations.

4. Com preflight aprovado:

```bash
npm run migrate
npm run smoke
```

5. Migrar/cargar os dados oficiais e copiar evidências para o storage corporativo.
6. Executar:

```bash
npm run cutover:audit
```

7. Somente se a carga não trouxer um Inspetor válido, executar bootstrap com senha via stdin:

```bash
read -rsp 'Senha temporária: ' SENHA_TMP; echo
printf '%s' "$SENHA_TMP" | \
  CONFIRM_BOOTSTRAP_ADMIN=SIM SENHA_STDIN=SIM \
  MATRICULA=<MATRICULA> NOME="<NOME>" SETOR=Administrativo \
  npm run bootstrap-admin
unset SENHA_TMP
```

8. Subir a API:

```bash
npm start
```

9. Confirmar:

```text
GET /health
GET /health/ready
```

`/health/ready` deve permanecer verde antes e durante o E2E.

## Frontend corporativo

Publicar com:

```text
VITE_SEGEMPAT_API_URL=https://<api-corporativa>
VITE_SEGEMPAT_REQUIRE_API=true
```

`VITE_SEGEMPAT_REQUIRE_API=true` impede fallback silencioso para o backend legado.

A API deve receber a origem exata do frontend:

```text
SEGEMPAT_ALLOWED_ORIGINS=https://<frontend-corporativo>
```

## Segurança da API

- produção exige `MYSQL_SSL=true`;
- TLS MySQL usa validação de certificado (`rejectUnauthorized: true`);
- cookie de sessão é HTTP-only e `Secure=true` em produção;
- sessão é assinada com HMAC-SHA256 e possui expiração;
- contexto do usuário é reconstruído do banco a cada requisição protegida;
- conta/colaborador inativo perde acesso mesmo com cookie ainda válido;
- Inspetor exige role `admin` + perfil funcional atual `Inspetor`;
- tokens de sessão incluem versão da conta; troca de senha invalida sessões antigas e rotaciona a atual;
- operações de escrita em `/api` exigem cabeçalho `Origin` autorizado, além do CORS;
- a API corporativa aceita payload funcional em JSON e não depende de formulários URL-encoded;
- login e ativação possuem limitação local de tentativas por IP + matrícula;
- em múltiplas réplicas, complementar com rate limiting central no proxy/WAF;
- o padrão `trust proxy=1` pressupõe um proxy confiável à frente da API; revisar se a topologia corporativa tiver mais/menos hops;
- storage deve ser privado, persistente e incluído em backup/restore.

## Deploy

Arquivos de referência:

- `Dockerfile`
- `docker-compose.yml`
- `deploy/segempat-api.service`
- `deploy/nginx-segempat-api.conf`

O container usa usuário não-root e `/health/ready` como healthcheck. O Compose de referência publica a API apenas em `127.0.0.1:8787`, para ser exposta por proxy HTTPS.

## Gates

- `npm run preflight`: ambiente/conexão/storage antes de migration;
- `npm run migrate`: aplica e registra migrations;
- `npm run smoke`: valida schema/invariantes;
- `npm run cutover:audit`: valida integridade depois da carga;
- `/health/ready`: valida DB, TLS, migration atual, schema e storage em runtime.

## Documentação

- `../MYSQL_TI_INPUTS.md`
- `../MYSQL_CORPORATE_HANDOFF.md`
- `../CORPORATE_HOMOLOGATION_CHECKLIST.md`
- `../PRODUCTION_CHECKLIST.md`
- `../SECURITY_AUDIT.md`

O status **SEGEMPAT HOMOLOGADO NO MYSQL DA EMPRESA** só pode ser declarado após os gates reais e o teste ponta a ponta sem pendência crítica.
