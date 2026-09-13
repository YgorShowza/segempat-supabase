# SEGEMPAT — Registro de Evidências da Homologação MySQL Corporativa

> Preencher no ambiente real da empresa. Este documento é um **modelo**; não registrar senhas, segredo de sessão, chaves privadas ou conteúdo sensível de certificados.

## 1. Identificação da homologação

- Data/hora de início:
- Data/hora de conclusão:
- Ambiente: homologação / produção
- Responsável técnico TI:
- Responsável pelo aceite funcional:
- Commit/HEAD implantado:
- URL do frontend:
- URL da API:
- Versão Node.js:
- Versão MySQL:
- Database utilizado:
- Storage corporativo utilizado:

## 2. Rede, TLS e infraestrutura

- [ ] API alcança o MySQL pela rede corporativa prevista;
- [ ] MySQL não é acessível diretamente pelo navegador;
- [ ] usuário MySQL de aplicação possui privilégio mínimo;
- [ ] TLS MySQL negociado;
- [ ] cadeia/CA validada quando aplicável;
- [ ] HTTPS do frontend válido;
- [ ] HTTPS da API válido;
- [ ] firewall/VPN/allowlist conferidos;
- [ ] topologia de proxy compatível com `trust proxy` configurado;
- [ ] rate limiting central configurado quando houver múltiplas réplicas;
- [ ] logs e monitoramento ativos.

Observações/evidências:

```text

```

## 3. Gate 1 — Preflight

Comando:

```bash
cd server
npm run preflight
```

Resultado:

- [ ] APROVADO
- [ ] REPROVADO — homologação interrompida

Registrar sem secrets:

- MySQL 8+:
- database correto:
- timezone UTC:
- SQL estrito:
- `utf8mb4`:
- InnoDB:
- `FOREIGN_KEY_CHECKS=1`:
- TLS negociado:
- storage leitura/escrita:

Trecho de evidência:

```text

```

## 4. Gate 2 — Migrations

Comando:

```bash
npm run migrate
```

Resultado:

- [ ] APROVADO
- [ ] REPROVADO — homologação interrompida

Registrar:

- última migration aplicada: `010_granular_access_control.sql` nesta revisão
- quantidade esperada de migrations versionadas: `10` nesta revisão
- histórico sem lacunas:
- checksums íntegros:
- baseline compatível quando aplicável:
- nenhuma conta legada foi promovida automaticamente para Master:

Trecho de evidência:

```text

```

## 5. Gate 3 — Smoke

Comando:

```bash
npm run smoke
```

Resultado:

- [ ] APROVADO
- [ ] REPROVADO — homologação interrompida

Confirmar:

- [ ] tabelas essenciais;
- [ ] PKs/FKs/UNIQUE críticos;
- [ ] índices críticos;
- [ ] constraints/triggers esperados;
- [ ] ausência de órfãos;
- [ ] integridade das migrations 003/004/005 de Avaliação Prática;
- [ ] geração recorrente sem slot duplicado;
- [ ] vínculo 1:1 da Avaliação Prática gerada com o Cronograma.

Trecho de evidência:

```text

```

## 6. Carga/migração dos dados

Fonte oficial utilizada:

- Origem:
- Data do backup pré-carga:
- Responsável:

Contagens antes/depois:

| Entidade | Antes | Depois | Conferido |
| --- | ---: | ---: | --- |
| Colaboradores |  |  | [ ] |
| Contas |  |  | [ ] |
| Perfis/roles |  |  | [ ] |
| Níveis de acesso |  |  | [ ] |
| Overrides de permissão |  |  | [ ] |
| Cronograma |  |  | [ ] |
| Provas |  |  | [ ] |
| Tentativas |  |  | [ ] |
| Certificados |  |  | [ ] |
| Banco de Questões |  |  | [ ] |
| Módulos de treinamento |  |  | [ ] |
| Tentativas de treinamento |  |  | [ ] |
| Modelos de Avaliação Prática |  |  | [ ] |
| Avaliações Práticas |  |  | [ ] |
| Ocorrências |  |  | [ ] |
| Base de Conhecimento |  |  | [ ] |
| Auditoria |  |  | [ ] |
| Assinaturas/evidências |  |  | [ ] |

- [ ] UUIDs preservados;
- [ ] matrículas preservadas;
- [ ] vínculos entre entidades preservados;
- [ ] níveis de acesso coerentes com a regra de menor privilégio;
- [ ] nenhuma conta foi promovida automaticamente para Administrador Master;
- [ ] arquivos de evidência copiados para storage corporativo;
- [ ] amostras históricas conferidas.

Observações:

```text

```

## 7. Gate 4 — Auditoria pós-carga

Comando:

```bash
npm run cutover:audit
npm run report-privileged-access
```

Resultado:

- [ ] APROVADO sem inconsistência crítica
- [ ] REPROVADO — homologação interrompida

Confirmar:

- [ ] identidade contas/colaboradores;
- [ ] níveis e roles administrativas;
- [ ] Administrador Master restrito às contas explicitamente aprovadas pela TI;
- [ ] permissões efetivas coerentes com níveis/overrides;
- [ ] relatório de acessos privilegiados sem divergência crítica;
- [ ] cobertura operacional do Banco de Questões;
- [ ] tentativas/certificados/assinaturas coerentes;
- [ ] arquivos de assinatura presentes e válidos;
- [ ] modelos e avaliações práticas coerentes;
- [ ] cada avaliação prática gerada possui data operacional;
- [ ] cada avaliação recorrente possui exatamente um vínculo no Cronograma;
- [ ] colaborador, tema e data coincidem entre avaliação e Cronograma;
- [ ] nenhum marcador `[PRACTICAL:<id>]` órfão.

Trecho de evidência:

```text

```

## 8. Readiness da API

Após subir a API:

```text
GET /health
GET /health/ready
```

- [ ] `/health` = saudável;
- [ ] `/health/ready` = saudável;
- [ ] MySQL conectado;
- [ ] TLS pronto;
- [ ] schema pronto;
- [ ] storage pronto;
- [ ] migration esperada mais recente = `010` nesta revisão;
- [ ] histórico **completo** de migrations corresponde aos arquivos do deploy;
- [ ] nenhum registro extra/ausente em `schema_migrations`;
- [ ] nenhum checksum divergente.

Resposta sanitizada registrada:

```json

```

## 9. Cutover do frontend

Build utilizado:

```text
VITE_SEGEMPAT_API_URL=https://<api-corporativa>
VITE_SEGEMPAT_REQUIRE_API=true
```

- [ ] URL HTTPS correta;
- [ ] API obrigatória habilitada;
- [ ] `SEGEMPAT_ALLOWED_ORIGINS` contém a origem exata do frontend;
- [ ] nenhuma credencial MySQL está no frontend;
- [ ] backend legado não é usado na publicação corporativa.

## 10. E2E — Administrador Master

Conta de teste: registrar somente matrícula/identificador não sensível.

- Identificador:

- [ ] login/logout;
- [ ] nível exibido como Administrador Master;
- [ ] tela Acessos → Níveis e permissões acessível;
- [ ] alteração de nível/permissões de outra conta funciona;
- [ ] alteração gera `UPDATE_ACCESS_CONTROL` na auditoria;
- [ ] sessão da conta afetada é invalidada após mudança de privilégio;
- [ ] própria conta não consegue alterar o próprio nível;
- [ ] último Administrador Master não pode ser removido;
- [ ] permissão `access.permissions.manage` não pode ser delegada indevidamente;
- [ ] `npm run report-privileged-access` confirma o estado esperado depois dos testes.

## 11. E2E — Inspetor

Conta de teste: registrar somente matrícula/identificador não sensível.

- Identificador:

- [ ] login;
- [ ] logout;
- [ ] troca de senha;
- [ ] Dashboard/Analytics conforme permissões;
- [ ] Equipe;
- [ ] primeiro acesso de Operador;
- [ ] Cronograma individual;
- [ ] Cronograma em massa/recorrência;
- [ ] Banco de Questões;
- [ ] criação/publicação de Prova;
- [ ] Treinamentos;
- [ ] criação de modelo de Avaliação Prática;
- [ ] geração recorrente de Avaliação Prática;
- [ ] segunda execução idempotente sem duplicação;
- [ ] suspensão respeitada;
- [ ] vínculo da avaliação com Cronograma e indicadores;
- [ ] bloqueio de exclusão quando histórico estiver formalizado;
- [ ] Ocorrências;
- [ ] Certificados/assinaturas;
- [ ] Auditoria administrativa quando autorizada.

## 12. E2E — Operador

Conta de teste: registrar somente matrícula/identificador não sensível.

- Identificador:

- [ ] primeiro acesso;
- [ ] login/logout;
- [ ] conteúdo filtrado por setor;
- [ ] realização de Prova;
- [ ] correção server-side conferida;
- [ ] assinatura;
- [ ] certificado após aprovação + assinatura;
- [ ] Teste Rápido;
- [ ] Simulador;
- [ ] Stress Test;
- [ ] Desafio Diário;
- [ ] Treinamentos;
- [ ] Avaliação Prática pessoal;
- [ ] Ocorrências pessoais;
- [ ] Meu Perfil/progresso.

## 13. Dispositivos, impressão e visual

- [ ] desktop corporativo;
- [ ] Android real;
- [ ] iPhone/iOS real quando aplicável;
- [ ] assinatura por mouse;
- [ ] assinatura por touchscreen;
- [ ] PDF/certificado conferido visualmente;
- [ ] impressão conferida;
- [ ] tema Claro/Escuro/Auto revisado nas telas principais.

## 14. Backup, restore e rollback

- [ ] backup MySQL imediatamente antes do cutover;
- [ ] backup do storage imediatamente antes do cutover;
- [ ] procedimento de restore documentado;
- [ ] restore testado em ambiente seguro;
- [ ] commit anterior estável registrado;
- [ ] commit implantado registrado;
- [ ] procedimento de retorno do frontend definido;
- [ ] procedimento de retorno da API definido;
- [ ] impacto de eventual rollback de schema avaliado;
- [ ] responsável técnico pelo rollback definido.

Commit anterior estável:

```text

```

Commit implantado:

```text

```

## 15. Pendências encontradas

| # | Pendência | Severidade | Responsável | Situação |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |

Regra: nenhuma pendência crítica pode permanecer aberta no aceite.

## 16. Aceite final

- [ ] Todos os gates obrigatórios aprovados;
- [ ] E2E Administrador Master aprovado;
- [ ] E2E Inspetor aprovado;
- [ ] E2E Operador aprovado;
- [ ] `report-privileged-access` revisado;
- [ ] TLS/rede/CORS/cookies/storage aprovados;
- [ ] backup/restore/rollback aprovados;
- [ ] nenhuma pendência crítica aberta.

Responsável técnico TI:

```text
Nome:
Data/hora:
Aceite:
```

Responsável funcional/gestão:

```text
Nome:
Data/hora:
Aceite:
```

Somente após todos os itens obrigatórios acima estarem comprovados:

**SEGEMPAT HOMOLOGADO NO MYSQL DA EMPRESA**
