# SEGEMPAT — Handoff para Homologação no MySQL Corporativo

Este documento é o roteiro operacional de entrega do SEGEMPAT para a TI conectar o backend ao MySQL real de homologação da empresa sem expor credenciais no frontend ou no GitHub.

## 1. Objetivo

Concluir a etapa que não pode ser validada apenas pelo código versionado: conexão real com o ambiente corporativo, aplicação controlada do schema, auditoria dos dados, corte do frontend para API própria e teste ponta a ponta.

```text
Frontend SEGEMPAT
      |
      | HTTPS
      v
API SEGEMPAT (Node.js / Express)
      |
      +--> MySQL 8.0+ corporativo via TLS
      +--> storage privado persistente
```

O navegador não deve receber host, usuário, senha, CA ou qualquer outro segredo do MySQL.

## 2. Entrada da TI

Usar `MYSQL_TI_INPUTS.md` como formulário oficial de coleta. Senhas, segredo de sessão, certificados privados e conteúdo de CA não devem ser registrados no repositório.

Em `NODE_ENV=production`, a conexão MySQL deve usar TLS. Se o ambiente corporativo não disponibilizar TLS para a API, a homologação deve parar até a TI definir a solução; não enfraquecer a configuração apenas para passar os gates.

## 3. Preparação do ambiente

No host da API:

1. disponibilizar Node.js 20+ ou Docker conforme padrão da TI;
2. implantar exatamente a revisão aprovada do GitHub;
3. usar `server/.env.example` somente como modelo;
4. cadastrar os valores reais em arquivo protegido/secrets manager;
5. garantir acesso de rede da API ao MySQL;
6. garantir storage persistente com backup para assinaturas/evidências;
7. garantir HTTPS no proxy reverso e firewall/allowlist apropriados.

Nunca copiar credenciais reais para variáveis `VITE_*`, frontend, issues, commits ou documentação versionada.

## 4. Gate 1 — Preflight

```bash
cd server
npm ci
npm run preflight
```

Só continuar se terminar com `OK`. O preflight valida, entre outros itens, conexão real, MySQL 8+, database correto, `utf8mb4`, UTC, SQL estrito, InnoDB, `FOREIGN_KEY_CHECKS=1`, TLS negociado e storage gravável.

**Regra de parada:** se falhar, não executar migrations.

## 5. Gate 2 — Migration e baseline

```bash
npm run migrate
```

O runner protege histórico/checksums e, quando existe estrutura legada antes do registro do baseline, exige compatibilidade com `database/mysql/001_schema.sql` antes de aceitar o baseline.

A validação cobre tabelas, colunas, tipos, nulabilidade, defaults, charset/collation, atributos de coluna, PKs, índices, unicidade, colunas geradas, `CHECK constraints`, triggers, FKs e órfãos.

A migration `010_granular_access_control.sql` cria os níveis **Administrador Master, Administrador, Inspetor e Operador** e as permissões granulares. Ela aplica menor privilégio às contas existentes e **não promove automaticamente nenhuma conta legada para Master**. A concessão de Master é uma decisão explícita e auditável da TI.

**Regra de parada:** qualquer divergência estrutural deve ser corrigida explicitamente; não alterar o runner para mascará-la.

## 6. Gate 3 — Smoke estrutural

```bash
npm run smoke
```

Só continuar sem erro. Registrar data/hora, commit implantado, ambiente, resultado e responsável técnico.

## 7. Carga/migração dos dados

Definir a fonte oficial antes da carga. Preservar UUIDs, matrículas, vínculos de usuários/colaboradores, provas, tentativas, certificados, verificações, treinamentos, registros operacionais e assinaturas/evidências.

Registrar contagens antes/depois e validar amostras críticas.

## 8. Gate 4 — Auditoria pós-carga

```bash
npm run cutover:audit
```

Corrigir qualquer inconsistência antes de liberar usuários.

## 9. Conta administrativa e Administrador Master

Se ainda não existir nenhuma conta administrativa, preparar a primeira conta somente depois do schema estar aprovado:

```bash
npm run bootstrap-admin
```

O bootstrap cria a conta inicial como **Administrador Master**, exige confirmação explícita e deve receber a senha temporária por mecanismo seguro. Credenciais temporárias devem ser tratadas como segredo e trocadas no primeiro acesso.

Se a conta já existir e a TI precisar designá-la como Master sem redefinir senha, usar o procedimento específico:

```bash
CONFIRM_MASTER_ACCESS=SIM \
MATRICULA=<MATRICULA_AUTORIZADA> \
TI_OPERATOR="<RESPONSAVEL_TI>" \
npm run grant-master-access
```

Esse comando não recebe senha. Ele exige conta e cadastro funcional ativos, grava o nível Master, remove exceções individuais incompatíveis, invalida sessões anteriores e registra `TI_GRANT_MASTER_ACCESS` na auditoria.

Depois da definição dos privilégios, executar:

```bash
npm run report-privileged-access
```

A TI deve revisar qualquer divergência antes da liberação. O nível Master deve ser restrito às contas formalmente autorizadas; novos Inspetores não se tornam Master automaticamente.

## 10. Subida da API

```bash
npm start
```

Ou utilizar o runtime corporativo preparado em `server/docker-compose.yml` / `server/deploy/segempat-api.service`.

Validar:

```text
GET /health
GET /health/ready
```

`/health/ready` deve permanecer saudável antes do cutover do frontend e deve indicar a migration esperada mais recente.

## 11. Cutover do frontend

No build corporativo configurar obrigatoriamente:

```text
VITE_SEGEMPAT_API_URL=<URL HTTPS DA API>
VITE_SEGEMPAT_REQUIRE_API=true
```

`VITE_SEGEMPAT_REQUIRE_API=true` impede fallback silencioso para o modo demonstração. O build corporativo não deve ser publicado se a URL da API estiver ausente, inválida ou sem HTTPS.

Configurar na API `SEGEMPAT_ALLOWED_ORIGINS` com as origens HTTPS exatas do frontend de homologação/produção.

## 12. Teste ponta a ponta

Executar pelo menos um ciclo com **Administrador Master**, um com **Inspetor** e um com **Operador**.

Para o Master, validar a tela de **Acessos → Níveis e permissões**, proteção contra alteração do próprio nível, proteção do último Master, aplicação das permissões e invalidação de sessão após mudanças. Para Inspetor e Operador, validar que telas e operações não autorizadas permanecem bloqueadas pela API, além da navegação compatível com o nível concedido.

Cobrir também login/logout, primeiro acesso, Equipe, Cronograma, Banco de Questões, Provas, tentativas/correção, assinatura/evidências, certificados, Treinamentos, Simulador, Stress Test, Teste Rápido, Desafio Diário, Avaliação Prática, Ocorrências, Base de Conhecimento, Meu Perfil e Auditoria conforme as permissões de cada conta.

Também validar CORS, cookies `Secure`, HTTPS, firewall, storage, backup e comportamento de `/health/ready` durante indisponibilidade controlada de dependências quando a TI puder testar isso com segurança.

## 13. Evidências da homologação

Guardar em local corporativo:

- commit/revisão implantado;
- resultado do `preflight`;
- resultado da migration;
- resultado do `smoke`;
- contagens/evidências da carga;
- resultado do `cutover:audit`;
- evidência da conta Master explicitamente aprovada pela TI;
- saída do `report-privileged-access`;
- evidências dos testes Master/Inspetor/Operador;
- validação de TLS, firewall, CORS e cookies;
- validação de backup/storage;
- plano e aprovação de rollback/cutover.

Não armazenar senhas, segredo de sessão ou chaves privadas nas evidências.

## 14. Ordem oficial resumida

```text
TI inputs
  -> configurar secrets/rede/storage
  -> npm ci
  -> preflight
  -> migrate (até a migration 010 ou superior aprovada)
  -> smoke
  -> migrar dados/evidências
  -> cutover:audit
  -> bootstrap-admin (se não houver conta administrativa)
  -> grant-master-access (se a conta Master já existir e precisar ser designada)
  -> report-privileged-access
  -> subir API
  -> /health/ready verde
  -> build frontend com REQUIRE_API=true
  -> E2E Master + Inspetor + Operador
  -> aceite/rollback
```

## 15. Critério de aceite

A frase abaixo só pode ser utilizada depois de todos os gates obrigatórios aprovados no ambiente real:

**SEGEMPAT HOMOLOGADO NO MYSQL DA EMPRESA**

Até esse momento:

**PARTE DO MYSQL NO CÓDIGO CONCLUÍDA — PRONTO PARA CONECTAR AO BANCO DA EMPRESA.**
