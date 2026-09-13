# SEGEMPAT

Sistema de Gestão, Operações e Desempenho da Unidade de Segurança Portuária da EMPAT.

O SEGEMPAT reúne gestão operacional, desenvolvimento profissional, avaliações, registros, evidências, governança de acesso e acompanhamento da equipe em uma única aplicação.

## Status do projeto

**FRONTEND API-ONLY + API SEGEMPAT + MYSQL PRONTOS NO CÓDIGO — PREPARADO PARA CLOUDFLARE E HOMOLOGAÇÃO NO BANCO DA EMPRESA.**

O frontend não possui fallback de backend. Supabase e Lovable não fazem parte do runtime, autenticação, persistência, build ou hospedagem-alvo do SEGEMPAT. A homologação final continua dependendo da conexão com o MySQL real da empresa e dos testes ponta a ponta no ambiente corporativo.

## Arquitetura definitiva

```text
Cloudflare Workers / SEGEMPAT
        |
        | HTTPS / JSON
        v
API SEGEMPAT — Node.js / Express
        |
        +--> MySQL 8.0 corporativo
        +--> storage privado de assinaturas/evidências
        +--> autenticação, autorização e regras de negócio
```

O navegador nunca acessa o MySQL diretamente e não recebe host, usuário, senha ou CA do banco.

O frontend corporativo usa:

```text
VITE_SEGEMPAT_API_URL=https://api.segempat.empresa.local
VITE_SEGEMPAT_REQUIRE_API=true
```

Se a API estiver ausente ou indisponível, a aplicação apresenta indisponibilidade em vez de trocar de backend. O modo demonstração é isolado e desabilitado quando a API corporativa é configurada ou exigida.

## Stack principal

### Frontend / hospedagem

- React 19
- TypeScript
- TanStack Router / TanStack Query
- TanStack Start / Vite
- Tailwind CSS
- Bun
- Cloudflare Workers (`@cloudflare/vite-plugin` + Wrangler)

### Backend corporativo

- Node.js 20+
- Express
- MySQL 8.0+
- `mysql2`
- autenticação por sessão assinada em cookie
- bcrypt para senhas e códigos sensíveis
- Helmet e CORS por allowlist
- storage privado controlado pelo servidor

## Modelo de acesso

O SEGEMPAT usa controle granular de autorização. O nível define a posição hierárquica e as permissões efetivas definem o que cada conta pode fazer. A API é a fonte de verdade; esconder um botão no frontend não concede nem remove acesso por si só.

### Administrador Master

- nível máximo do SEGEMPAT;
- possui todas as permissões;
- é o único nível autorizado a usar `access.permissions.manage`;
- pode definir níveis e permissões de outras contas;
- não pode alterar o próprio nível pela tela de Acessos;
- o sistema protege a existência de pelo menos um Master realmente utilizável, com conta e cadastro funcional ativos;
- recuperação de senha de identidade Master não é feita pelo fluxo administrativo do app: é procedimento exclusivo da TI.

### Administrador

- nível administrativo abaixo do Master;
- recebe as permissões administrativas padrão, exceto permissões exclusivas do Master e Auditoria por padrão;
- pode ter permissões concedidas ou removidas individualmente pelo Master;
- não pode conceder ou assumir poderes exclusivos do Master.

### Inspetor

- nível de gestão operacional;
- recebe por padrão as permissões operacionais e gerenciais previstas para Inspetoria, exceto permissões reservadas de Segurança/Auditoria;
- também pode ter permissões ajustadas individualmente pelo Master;
- permanece sujeito às barreiras funcionais e às regras de governança da API.

### Operador

- nível operacional pessoal;
- não recebe permissões administrativas;
- acessa somente os próprios recursos e fluxos autorizados, derivados da sessão e da identidade funcional no backend.

### Princípios aplicados

- negação por padrão fora das permissões efetivas;
- `access.permissions.manage` é exclusiva do Master;
- mudanças de privilégios invalidam sessões anteriores;
- alterações de nível/permissão são auditadas;
- um usuário não pode usar recuperação de senha para assumir conta de nível igual ou superior;
- contas Master ficam fora do fluxo administrativo de recuperação de senha;
- leituras gerenciais não expõem gabaritos ou respostas-modelo sem a permissão específica do domínio.

## Módulos principais

- Dashboard e Central de Atenção
- Equipe / Colaboradores
- Cronograma mensal e anual
- planejamento em massa e recorrências
- Banco de Questões
- Provas e tentativas
- assinatura eletrônica e evidências
- certificados e validação
- Treinamentos
- Teste Rápido
- Simulador
- Stress Test
- Desafio Diário
- XP e nível
- Avaliações Práticas
- Ocorrências
- Base de Conhecimento
- Analytics, Risco, Relatórios e Análise Individual
- Meu Perfil
- Acessos, recuperação segura de senha e Auditoria
- Documento de Segurança

## Segurança no modo API/MySQL

Os principais controles implementados incluem:

- credenciais MySQL exclusivamente no servidor;
- sessão assinada reconstruída a partir do banco a cada requisição protegida;
- bloqueio de conta ou colaborador inativo;
- autorização granular validada no backend;
- identidade funcional derivada da sessão/banco;
- correção de provas no servidor;
- gabaritos e respostas-modelo removidos de leituras sem permissão específica;
- endpoints gerenciais coerentes com as permissões de Dashboard, Analytics, Risco, Atenção e Relatórios;
- XP e nível calculados no servidor;
- operações críticas protegidas por transação quando aplicável;
- assinatura vinculada à tentativa do próprio usuário;
- evidências armazenadas fora do banco em storage privado;
- códigos de ativação com hash, expiração e uso único;
- recuperação segura de senha com código de uso único, hash, TTL de 30 minutos, limite de tentativas, hierarquia de autoridade e invalidação de sessões;
- proteção do último Administrador Master utilizável;
- CORS com origens explícitas;
- cookies seguros exigidos em produção;
- suporte a TLS/CA corporativa para MySQL;
- auditoria de operações críticas;
- frontend com API obrigatória e HTTPS;
- bloqueio de indexação pública por `robots.txt` e metadados `noindex`;
- readiness que revalida o histórico completo e os checksums das migrations do banco contra o deploy.

## MySQL e migrations

O baseline MySQL está em:

```text
database/mysql/001_schema.sql
```

O runner mantém versão, checksum e histórico e rejeita divergências ou lacunas. O schema foi preparado para MySQL 8, InnoDB, `utf8mb4`, foreign keys e índices críticos.

As migrations versionadas chegam atualmente até:

```text
database/mysql/010_granular_access_control.sql
```

A migration 009 implementa recuperação segura de senha e a migration 010 implementa níveis e permissões granulares.

## Validação do ambiente corporativo

Antes de executar qualquer comando no ambiente da empresa, a TI deve preencher os dados de infraestrutura solicitados em [`MYSQL_TI_INPUTS.md`](MYSQL_TI_INPUTS.md). Senhas reais não devem ser colocadas no GitHub, em documentação ou no frontend.

Dentro de `server/`, a sequência técnica inicial é:

```bash
npm ci
npm run preflight
npm run migrate
npm run smoke
```

Depois do `smoke`, a TI deve carregar/migrar os dados oficiais e as evidências. Em seguida:

```bash
npm run cutover:audit
npm run bootstrap-admin        # somente quando necessário
npm run grant-master-access    # concessão explícita do Master pela TI quando aplicável
npm run report-privileged-access
npm start
```

Após iniciar a API, `GET /health/ready` precisa permanecer saudável. O readiness compara o histórico de `schema_migrations`, incluindo versão, nome e checksum, com os arquivos de migration presentes no deploy.

## Privacidade de publicação

O SEGEMPAT é aplicação corporativa, não website público. O repositório mantém:

- `public/robots.txt` com `Disallow: /`;
- meta `robots` e `googlebot` com `noindex, nofollow, noarchive, nosnippet, noimageindex`.

Esses controles reduzem indexação acidental, mas não substituem autenticação, autorização, firewall, proxy, Cloudflare Access/WAF ou demais controles corporativos definidos pela TI.

## Cloudflare

A configuração do Worker está em `wrangler.jsonc` e o Vite usa o plugin oficial do Cloudflare.

A autenticação do Cloudflare deve ser feita pelo proprietário/administrador da conta via Wrangler, dashboard ou pipeline corporativo. Tokens de API não devem ser colocados no repositório ou enviados em chat.

## Backend e governança

Documentação relacionada:

- [`server/README.md`](server/README.md)
- [`server/.env.example`](server/.env.example)
- [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md)
- [`LGPD_GOVERNANCE.md`](LGPD_GOVERNANCE.md)
- [`MYSQL_TI_INPUTS.md`](MYSQL_TI_INPUTS.md)
- [`CORPORATE_HOMOLOGATION_CHECKLIST.md`](CORPORATE_HOMOLOGATION_CHECKLIST.md)

Secrets reais nunca devem ser versionados.
