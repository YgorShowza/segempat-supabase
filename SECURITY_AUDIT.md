# SEGEMPAT · Auditoria de Segurança — Arquitetura MySQL/API

Atualizado em 08/09/2026.

> Este documento representa a arquitetura corporativa atual do SEGEMPAT. Versões anteriores baseadas em Supabase/RLS/RPC ou no modelo binário Inspetor/Operador permanecem apenas no histórico do Git e não representam o desenho de produção atual.

## 1. Escopo auditado

Arquitetura:

```text
Frontend SEGEMPAT / Cloudflare
      |
      | HTTPS + cookie HTTP-only
      v
API SEGEMPAT — Node.js / Express
      |
      +--> MySQL 8 corporativo via TLS
      +--> storage privado persistente
```

O navegador não recebe host, usuário, senha ou CA do MySQL. A autorização é executada pela API própria. Supabase e Lovable não fazem parte do runtime corporativo.

## 2. Banco, transporte e configuração

Controles implementados:

- credenciais MySQL somente no backend;
- `NODE_ENV=production` exige `MYSQL_SSL=true`;
- CA própria precisa usar caminho absoluto em produção;
- cliente MySQL usa `rejectUnauthorized: true`;
- conexões usam UTC, `FOREIGN_KEY_CHECKS=1`, modo SQL estrito e `utf8mb4_unicode_ci`;
- `preflight`, `migrate`, `smoke`, `cutover:audit` e `/health/ready` verificam invariantes do ambiente real;
- readiness valida o histórico completo de migrations, nomes e checksums;
- migrations versionadas chegam atualmente até `010_granular_access_control.sql`.

## 3. Sessão, identidade e autenticação

- cookie de sessão `HttpOnly`; `Secure` obrigatório em produção;
- token usa HMAC-SHA256 e expiração;
- contexto funcional é reconstruído do MySQL em toda requisição protegida;
- conta e cadastro funcional precisam permanecer `Ativo`;
- `session_epoch` permite revogação imediata de sessões após mudanças sensíveis;
- troca e recuperação de senha invalidam sessões anteriores;
- tokens malformados, expirados, sem versão ou excessivamente grandes são rejeitados;
- login utiliza mensagem genérica para matrícula/senha inválida;
- primeiro acesso usa código de 8 dígitos, bcrypt, expiração e uso único;
- senha é armazenada somente como bcrypt.

## 4. Modelo atual de autorização

O controle de acesso é granular e possui quatro níveis:

1. `master` — Administrador Master, rank 100;
2. `admin` — Administrador, rank 80;
3. `inspector` — Inspetor, rank 60;
4. `operator` — Operador, rank 10.

As permissões efetivas são calculadas no backend a partir do nível e de overrides individuais. O frontend não é fonte de autoridade.

### Administrador Master

- possui todas as permissões;
- `access.permissions.manage` é exclusiva desse nível;
- pode definir nível e permissões de outras contas;
- não pode alterar o próprio nível pela tela de Acessos;
- o backend bloqueia remoção do último Master realmente utilizável;
- para esse guard, somente contam contas com `app_users.status='Ativo'` e cadastro funcional `employees.status='Ativo'`;
- a Gestão de Equipe não pode inativar diretamente cadastro vinculado a nível Master;
- recuperação de senha de conta Master é exclusiva da TI e não passa pelo fluxo administrativo do app.

### Administrador e Inspetor

- recebem permissões padrão coerentes com seu nível;
- permissões podem ser removidas ou concedidas individualmente pelo Master, exceto permissões exclusivas do Master;
- não podem conceder privilégios acima da própria autoridade;
- operações continuam protegidas pela API mesmo que a interface seja manipulada.

### Operador

- não recebe permissões administrativas;
- rotas pessoais derivam identidade, matrícula e vínculo funcional da sessão/banco;
- não confiam em identidade enviada pelo navegador.

## 5. Permissões e menor privilégio

A API aplica autorização por domínio, incluindo:

- `dashboard.view`;
- `attention.view`;
- `team.view` e `team.manage`;
- `risk.view`;
- `schedule.manage`;
- `occurrences.manage`;
- `practical.manage`;
- `exams.manage`;
- `question_bank.manage`;
- `training.manage`;
- `knowledge.manage`;
- `certificates.manage`;
- `analytics.view`;
- `reports.view`;
- `ai.view`;
- `access.identity.manage`;
- `access.password_reset`;
- `audit.view`;
- `security.document.view`;
- `access.permissions.manage` — Master only.

Mudanças de nível/permissão são transacionais, auditadas e incrementam `session_epoch` para revogar sessões anteriores.

## 6. Leituras gerenciais e proteção de conteúdo sensível

O SEGEMPAT separa leitura gerencial de conteúdo sensível de avaliações.

- Dashboard, Analytics, Risco, Central de Atenção e Relatórios usam consultas coerentes com as permissões de visualização;
- essas telas não dependem de permissões de gestão que o usuário não recebeu;
- leituras administrativas sem `exams.manage` recebem prova sanitizada, sem questões/gabarito;
- banco de questões sem `question_bank.manage`/`exams.manage` não entrega `correct_index`, `correct_answer` ou `explanation`;
- análise/evidência gerencial não recebe resposta-modelo sem autoridade específica;
- correção de prova e cálculo de nota permanecem no servidor.

Isso evita que uma permissão de Dashboard ou Analytics vire acesso indireto ao gabarito.

## 7. Recuperação segura de senha

A migration 009 implementa `password_reset_codes`.

Controles:

- código numérico de 8 dígitos;
- apenas hash bcrypt é armazenado;
- TTL de 30 minutos;
- uso único;
- máximo de 5 tentativas incorretas;
- bloqueio após exceder tentativas;
- sucesso incrementa `session_epoch`;
- emissão, revogação e consumo são auditados.

### Hierarquia obrigatória

A recuperação administrativa exige que o emissor esteja em nível estritamente superior ao alvo e mantenha `access.password_reset`.

- Master: recuperação somente pela TI;
- Admin pode recuperar Inspetor e Operador;
- Inspetor pode recuperar Operador;
- ninguém pode recuperar conta de nível igual ou superior pelo fluxo administrativo.

No consumo do código, a API revalida o emissor original (`created_by`), a conta, o cadastro funcional, o nível atual e as permissões atuais. Se o emissor perder autoridade, for inativado ou o alvo subir de nível, o código é bloqueado definitivamente.

## 8. Proteção contra CSRF e origem indevida

- CORS usa allowlist explícita e `credentials: true`;
- wildcard é rejeitado com cookies de sessão;
- em produção, origens CORS precisam ser HTTPS;
- toda escrita em `/api` exige cabeçalho `Origin` presente e autorizado;
- API funcional usa JSON e não depende de formulários URL-encoded;
- o controle permanece necessário mesmo se a topologia futura exigir `SameSite=None`.

## 9. Auditoria e rastreabilidade

A migration `006_governance_audit_session_hardening.sql` torna `audit_logs` append-only:

- `UPDATE` é bloqueado por trigger;
- `DELETE` é bloqueado por trigger;
- referência ao ator usa `RESTRICT`;
- mudanças de privilégio, recuperação de senha e operações críticas deixam trilha auditável.

Eventos relevantes incluem concessões/revogações técnicas, mudanças de nível/permissão, emissão/consumo de recuperação, mudanças de senha e ações funcionais críticas.

## 10. Assinaturas e evidências

- storage é privado e controlado pela API;
- produção exige caminho absoluto e persistente;
- assinatura é vinculada à tentativa e ao usuário autenticado;
- nome físico do arquivo não é fornecido pelo navegador;
- leitura administrativa verifica vínculo no banco, confinamento de caminho e tipo esperado;
- `cutover:audit` confirma existência/coerência das evidências migradas.

## 11. Privacidade de publicação e indexação

O SEGEMPAT é sistema corporativo e não deve ser tratado como website público.

Controles no frontend:

- `public/robots.txt` usa `User-agent: *` e `Disallow: /`;
- o `<head>` inclui `robots` e `googlebot` com `noindex, nofollow, noarchive, nosnippet, noimageindex`.

Esses mecanismos reduzem indexação acidental, mas não são controle de acesso. Produção continua dependendo de autenticação, autorização, DNS, proxy, firewall/WAF, políticas Cloudflare e regras corporativas da TI.

## 12. Infraestrutura de execução

O pacote de referência inclui:

- container executando como usuário não-root;
- Compose com `no-new-privileges` e remoção de capabilities;
- API publicada localmente atrás de proxy no modelo fornecido;
- healthcheck em `/health/ready`;
- exemplo systemd com `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome` e escrita restrita ao storage;
- exemplo Nginx forçando HTTPS e TLS 1.2/1.3.

## 13. Controles automáticos no CI

O repositório contém gates para:

- migrations MySQL e integridade de foreign keys;
- sintaxe do backend e scripts;
- configuração segura de produção;
- sessão/CSRF/origem;
- arquitetura API-only e Cloudflare;
- primeiro acesso e recuperação segura de senha;
- redaction de leituras sensíveis;
- coerência de permissões em insights gerenciais;
- integridade do último Master utilizável;
- controle granular de acesso;
- frontend/typecheck/lint/build;
- integração com MySQL 8 descartável quando o runner GitHub estiver disponível.

A presença do workflow não substitui sua execução. O HEAD final deve ser revalidado quando a infraestrutura de runners estiver operacional.

## 14. Limitações que só podem ser encerradas no ambiente da empresa

Ainda dependem da TI e do ambiente real:

- versão/configuração exata do MySQL corporativo;
- cadeia TLS/CA realmente negociada;
- grants reais do usuário MySQL de aplicação e do usuário de migration;
- firewall, VPN, allowlists e segmentação;
- domínio final de frontend/API e política de cookies;
- proxy corporativo e `trust proxy` adequado à topologia;
- backup/restauração do MySQL e storage;
- monitoramento, retenção de logs e resposta a incidentes;
- rate limiting centralizado em cenários com múltiplas réplicas;
- E2E real com Master, Administrador, Inspetor e Operador;
- restauração de backup e rollback aprovados.

## 15. Riscos residuais e recomendações

- rate limiting de autenticação na aplicação é por instância; múltiplas réplicas exigem limitação central no proxy/WAF ou infraestrutura compartilhada;
- `trust proxy=1` pressupõe topologia compatível e deve ser confirmado pela TI;
- dependências externas de frontend, como fontes e ativos remotos, devem ser avaliadas para produção corporativa;
- `workers.dev` e previews são adequados para demonstração, mas o domínio/controle de acesso final devem ser definidos pela TI;
- proteção de branch e políticas de merge devem ser habilitadas depois que os runners do GitHub estiverem confiáveis.

## 16. Critério de aceite de segurança

A auditoria de código pode ser considerada concluída quando:

1. os itens de hardening identificados estiverem integrados ao `main`;
2. os gates do HEAD final executarem e ficarem verdes;
3. o Cloudflare/publicação do mesmo HEAD for confirmado quando aplicável.

A **homologação de segurança de produção** somente termina depois de TLS, grants, rede, backup, restore, proxy, cookies, CORS, storage, segregação de acessos e E2E serem comprovados no ambiente corporativo.

A aprovação técnica deste documento não constitui certificação jurídica de conformidade com a LGPD; governança final depende do controlador, Encarregado/DPO e áreas responsáveis da empresa.
