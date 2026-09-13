# SEGEMPAT · Checklist de Produção — MySQL Corporativo

> `[x]` = comprovado no código/CI. `[ ]` = depende do ambiente real da empresa, dados reais ou validação operacional.

## 1. Código, build e artefatos

- [x] frontend passa por typecheck, lint e build de produção no CI;
- [x] build corporativo usa `VITE_SEGEMPAT_REQUIRE_API=true`;
- [x] ausência da API corporativa em modo obrigatório falha explicitamente;
- [x] API Node.js possui validação de configuração de produção;
- [x] imagem Docker da API é construída no CI;
- [x] container roda como usuário não-root;
- [x] Docker healthcheck usa `/health/ready`;
- [x] Nginx e systemd de referência possuem hardening validado pelo CI;
- [x] existe gate dedicado que sobe um MySQL 8 descartável, aplica as migrations, executa `smoke` e confirma `/health/ready` da API contra o banco migrado;
- [x] `smoke` e `cutover:audit` incluem auditoria dedicada da geração recorrente de Avaliação Prática, slots, FK, histórico e vínculo 1:1 com o Cronograma;
- [x] migration `010_granular_access_control.sql` e contrato dedicado protegem níveis, permissões, menor privilégio e concessão explícita de Administrador Master;
- [ ] HEAD final do deploy registrado pela TI.

## 2. MySQL corporativo

- [ ] versão exata MySQL 8.x registrada;
- [ ] host/porta/database confirmados;
- [ ] usuário de aplicação criado com privilégio mínimo;
- [ ] MySQL acessível somente pela rede necessária;
- [ ] TLS negociado de verdade;
- [ ] CA corporativa instalada quando aplicável;
- [ ] `npm run preflight` aprovado;
- [ ] `npm run migrate` aprovado;
- [ ] migrations `001` a `010` registradas com histórico/checksums coerentes;
- [ ] migration `010` confirmou `access_levels`, `access_permissions`, `access_level_permissions`, `user_access_levels` e `user_permission_overrides`;
- [ ] `npm run smoke` aprovado, incluindo auditoria de Avaliação Prática/Cronograma;
- [ ] `FOREIGN_KEY_CHECKS=1`, UTC, modo SQL estrito, InnoDB e `utf8mb4` confirmados.

## 3. Migração/carga de dados

- [ ] fonte oficial dos dados definida;
- [ ] backup da fonte realizado antes da migração;
- [ ] UUIDs, matrículas e vínculos preservados;
- [ ] contas/perfis tratados conforme plano aprovado;
- [ ] contas legadas administrativas não foram promovidas automaticamente para Master;
- [ ] provas, tentativas, certificados, treinamentos, Cronograma e demais históricos migrados;
- [ ] assinaturas/evidências copiadas para storage corporativo;
- [ ] contagens antes/depois registradas por entidade crítica;
- [ ] amostras históricas conferidas;
- [ ] não existem slots recorrentes duplicados nem marcadores `[PRACTICAL:*]` órfãos no Cronograma;
- [ ] `npm run cutover:audit` aprovado sem inconsistência crítica.

## 4. Sessão, autenticação e autorização

- [x] cookie HTTP-only;
- [x] `Secure=true` obrigatório em produção;
- [x] CORS por allowlist HTTPS explícita;
- [x] operações de escrita exigem `Origin` autorizada;
- [x] login/ativação possuem limitação de tentativas na aplicação;
- [x] contexto do usuário é reconstruído do MySQL em toda requisição protegida;
- [x] conta/colaborador inativo perde acesso;
- [x] níveis granulares disponíveis: `master`, `admin`, `inspector` e `operator`;
- [x] permissões efetivas são aplicadas pela API e usadas também para filtrar rotas/menu do frontend;
- [x] permissão `access.permissions.manage` é exclusiva do Administrador Master;
- [x] nenhuma conta legada vira Master automaticamente;
- [x] alteração de nível/permissão invalida sessões anteriores da conta afetada e gera auditoria;
- [x] a própria conta não pode alterar o próprio nível e o último Administrador Master não pode ser removido;
- [x] troca de senha invalida sessões antigas e rotaciona a sessão atual;
- [x] recuperação de senha usa código de uso único armazenado somente como hash, expira em 30 minutos, bloqueia após cinco tentativas incorretas e invalida sessões antigas ao concluir;
- [ ] conta Administrador Master explicitamente aprovada pela TI;
- [ ] `npm run report-privileged-access` revisado sem divergência crítica;
- [ ] login real de Administrador Master validado no domínio final;
- [ ] login real de Inspetor validado no domínio final;
- [ ] login real de Operador validado no domínio final;
- [ ] primeiro acesso real validado;
- [ ] recuperação de senha real validada no ambiente corporativo;
- [ ] troca de senha real validada;
- [ ] logout real validado;
- [ ] política de TTL de sessão aprovada pela TI/gestão.

## 5. Frontend corporativo

- [ ] URL HTTPS final do frontend definida;
- [ ] URL HTTPS final da API definida;
- [ ] build publicado com:

```text
VITE_SEGEMPAT_API_URL=https://<api-corporativa>
VITE_SEGEMPAT_REQUIRE_API=true
```

- [ ] `SEGEMPAT_ALLOWED_ORIGINS` contém exatamente a origem do frontend;
- [ ] nenhuma credencial MySQL foi colocada em variável `VITE_*`;
- [ ] modo demonstração permanece isolado e desabilitado quando a API corporativa está configurada/obrigatória.

## 6. API, proxy e rede

- [ ] API executando no host corporativo;
- [ ] `/health` responde;
- [ ] `/health/ready` permanece verde e reconhece a migration MySQL mais recente (`010` nesta revisão);
- [ ] proxy reverso HTTPS configurado;
- [ ] HTTP redireciona para HTTPS;
- [ ] TLS 1.2/1.3 conforme política corporativa;
- [ ] firewall/VPN/allowlist aplicados conforme decisão da TI;
- [ ] `trust proxy` revisado contra a topologia real; o código padrão assume um proxy confiável;
- [ ] rate limiting central do proxy/WAF configurado se houver múltiplas réplicas da API;
- [ ] logs e monitoramento ativos.

## 7. Storage e evidências

- [ ] caminho absoluto persistente configurado;
- [ ] usuário do processo possui somente as permissões necessárias;
- [ ] `preflight` confirma criar/ler/remover arquivo de teste;
- [ ] storage incluído em backup;
- [ ] restauração do storage testada;
- [ ] assinaturas migradas conferidas pelo `cutover:audit`;
- [ ] evidência de assinatura real validada em navegador.

## 8. Teste funcional ponta a ponta

### Administrador Master

- [ ] login/logout;
- [ ] nível exibido como Administrador Master;
- [ ] Acessos → Níveis e permissões abre somente com permissão Master;
- [ ] alteração de nível/permissões de outra conta funciona e gera auditoria;
- [ ] sessão da conta alterada é invalidada após mudança de privilégio;
- [ ] conta atual não consegue alterar o próprio nível;
- [ ] último Administrador Master não pode ser removido;
- [ ] permissão exclusiva de Master não pode ser delegada por override;
- [ ] `npm run report-privileged-access` confirma o estado esperado após os testes.

### Inspetor

- [ ] Dashboard/Analytics conforme permissões concedidas;
- [ ] Equipe/Colaboradores;
- [ ] geração/revogação de primeiro acesso;
- [ ] geração/revogação de recuperação segura de senha para conta existente;
- [ ] Cronograma individual e em massa;
- [ ] Banco de Questões;
- [ ] criação/publicação de Provas;
- [ ] Treinamentos;
- [ ] Avaliação Prática manual;
- [ ] geração recorrente de Avaliação Prática cria os slots esperados no mês;
- [ ] repetir a geração recorrente não duplica os mesmos slots;
- [ ] mês suspenso impede geração e ausência do operador desloca/impede a data conforme disponibilidade no mesmo mês;
- [ ] cada avaliação recorrente mantém exatamente um lançamento próprio no Cronograma;
- [ ] conclusão da Avaliação Prática transforma o lançamento vinculado em `Realizado` e preserva o histórico;
- [ ] resultado do Cronograma sincronizado aparece em Dashboard, Analytics, Relatórios, Relatório Mensal e Análise Individual conforme os filtros aplicáveis;
- [ ] Ocorrências;
- [ ] Certificados/validação;
- [ ] Auditoria administrativa quando a permissão correspondente estiver concedida.

### Operador

- [ ] primeiro acesso;
- [ ] login/logout;
- [ ] recuperação de senha com código temporário e nova autenticação;
- [ ] visualização de conteúdo permitido pelo setor;
- [ ] realização de Prova;
- [ ] correção server-side conferida;
- [ ] assinatura real;
- [ ] certificado após aprovação + assinatura;
- [ ] Teste Rápido;
- [ ] Simulador;
- [ ] Stress Test;
- [ ] Desafio Diário;
- [ ] Meu Perfil/progresso;
- [ ] Avaliação Prática mostra somente registros do próprio colaborador autenticado;
- [ ] lançamento sincronizado da própria Avaliação Prática aparece no Cronograma/pendências do Operador quando aplicável.

## 9. Navegadores, dispositivos e impressão

- [ ] desktop corporativo;
- [ ] Android real;
- [ ] iPhone/iOS real, quando aplicável;
- [ ] assinatura por mouse;
- [ ] assinatura por touchscreen;
- [ ] PDFs conferidos visualmente;
- [ ] impressão conferida na impressora/navegador operacional;
- [ ] tema Claro/Escuro/Auto revisado nas telas principais.

## 10. Backup, restauração e rollback

- [ ] backup do MySQL imediatamente antes do cutover;
- [ ] backup do storage imediatamente antes do cutover;
- [ ] procedimento de restauração documentado;
- [ ] teste de restore executado em ambiente seguro;
- [ ] commit anterior estável registrado;
- [ ] commit de produção registrado;
- [ ] plano de retorno do frontend/API definido;
- [ ] impacto de rollback de schema avaliado antes de qualquer reversão;
- [ ] responsável técnico pelo rollback definido.

## 11. Bootstrap do primeiro Administrador Master

Executar somente se a carga de dados não trouxer uma conta administrativa válida e depois de schema/dados estarem coerentes. Preferir senha via `stdin`, sem digitá-la na linha de comando/histórico:

```bash
read -rsp 'Senha temporária: ' SENHA_TMP; echo
printf '%s' "$SENHA_TMP" | \
  CONFIRM_BOOTSTRAP_ADMIN=SIM SENHA_STDIN=SIM \
  MATRICULA=<MATRICULA> NOME="<NOME>" SETOR=Administrativo \
  npm run bootstrap-admin
unset SENHA_TMP
```

Se a conta já existir e a TI precisar promovê-la explicitamente a Master sem redefinir senha:

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

- [ ] necessidade do bootstrap ou concessão Master confirmada;
- [ ] execução registrada como evidência sem guardar senha;
- [ ] concessão Master explicitamente autorizada pela TI;
- [ ] relatório de acessos privilegiados revisado;
- [ ] senha temporária trocada no primeiro acesso quando houver bootstrap.

## 12. Ordem oficial do cutover

1. receber dados da TI e preparar secrets/rede/storage;
2. `npm ci`;
3. `npm run preflight`;
4. `npm run migrate` até a migration `010` desta revisão;
5. `npm run smoke`;
6. migrar dados e evidências;
7. `npm run cutover:audit`;
8. bootstrap do primeiro Administrador Master somente se necessário;
9. `npm run grant-master-access` somente quando uma conta existente precisar ser designada Master pela TI;
10. `npm run report-privileged-access` e revisar divergências;
11. subir API e manter `/health/ready` verde;
12. publicar frontend com `VITE_SEGEMPAT_REQUIRE_API=true`;
13. executar E2E Administrador Master + Inspetor + Operador;
14. validar backup, restore e rollback;
15. aprovar o cutover.

## 13. Critério final

Antes de todos os itens corporativos obrigatórios acima estarem aprovados, o status permanece:

**PARTE DO MYSQL NO CÓDIGO CONCLUÍDA — PRONTO PARA CONECTAR AO BANCO DA EMPRESA.**

Somente após os gates e testes reais:

**SEGEMPAT HOMOLOGADO NO MYSQL DA EMPRESA.**
