# SEGEMPAT — Governança LGPD e segregação de responsabilidades

Atualizado em 08/09/2026.

Este documento descreve controles técnicos e responsabilidades esperadas para operação do SEGEMPAT no ambiente corporativo.

> Esta é uma especificação técnica de governança, não parecer jurídico. A definição final de bases legais, finalidades, retenção, direitos dos titulares e responsabilidades institucionais deve ser aprovada pelo controlador dos dados e, quando aplicável, pelo Encarregado/DPO, Jurídico, Compliance e demais áreas competentes da empresa.

## 1. Princípios

O SEGEMPAT deve operar com:

- menor privilégio;
- necessidade de acesso;
- segregação de funções;
- rastreabilidade;
- minimização de dados;
- revisão humana de indicadores de desempenho;
- proteção contra divulgação e indexação indevida;
- revisão periódica de identidades e permissões.

O sistema separa **perfil funcional** do colaborador e **nível de autorização da aplicação**. Alterar um nível no SEGEMPAT não substitui os procedimentos corporativos da TI para identidades funcionais privilegiadas.

## 2. Modelo de autorização do SEGEMPAT

A aplicação possui quatro níveis:

### Administrador Master

Responsável pela governança de autorização dentro do aplicativo:

- possui todas as permissões da aplicação;
- é o único nível com `access.permissions.manage`;
- pode definir níveis e permissões de outras contas;
- não pode alterar o próprio nível pela tela de Acessos;
- não pode delegar poder superior ao modelo permitido;
- mudanças de nível/permissão invalidam sessões anteriores e geram auditoria;
- o sistema impede que o último Master realmente utilizável seja removido ou inativado por fluxo operacional inadequado.

O título **Administrador Master** representa autoridade técnica dentro do SEGEMPAT. Não transforma o usuário em controlador de dados, DPO, administrador de infraestrutura ou DBA.

### Administrador

Pode exercer funções administrativas concedidas pelo Master. As permissões são efetivas no backend e podem ser reduzidas individualmente.

Não possui a permissão exclusiva de gerenciar níveis e permissões e não pode assumir autoridade de Master por fluxo comum.

### Inspetor

Exerce gestão operacional conforme permissões efetivas, por exemplo equipe, cronograma, treinamentos, avaliações, ocorrências e análises.

O nível de autorização `inspector` não elimina as regras corporativas existentes sobre o **perfil funcional de Inspetor** no cadastro de colaboradores. Alterações funcionais privilegiadas continuam sujeitas aos procedimentos definidos para a TI quando aplicável.

### Operador

Acessa somente recursos pessoais/funcionais autorizados. Não recebe permissões administrativas e não deve acessar registros de terceiros fora dos fluxos explicitamente permitidos.

## 3. TI / Administração técnica

A TI é responsável, conforme política corporativa, por:

- infraestrutura da API, MySQL, proxy, certificados, DNS e Cloudflare;
- secrets, credenciais MySQL e chaves de sessão;
- grants dos usuários de runtime e migration;
- firewall, VPN, allowlists, WAF e segmentação de rede;
- backup, restauração e rollback;
- logs técnicos, disponibilidade e incidentes de infraestrutura;
- implantação e atualização do backend corporativo;
- bootstrap técnico inicial quando necessário;
- concessão explícita do primeiro Administrador Master quando aplicável;
- procedimentos técnicos para identidades funcionais privilegiadas;
- revisão periódica de acessos privilegiados;
- proteção dos runners, pipelines e credenciais de CI/CD.

A TI não necessita de acesso rotineiro ao conteúdo operacional de avaliações, ocorrências, notas ou análises individuais apenas para manter a infraestrutura.

## 4. Governança de privilégio funcional

A Gestão de Equipe operacional não deve ser usada para contornar a governança de identidades privilegiadas.

O backend mantém barreiras para impedir alterações destrutivas ou inconsistentes em cadastros privilegiados. Scripts técnicos como `manage-inspector-access`, `grant-master-access` e `report-privileged-access` existem para procedimentos controlados de TI quando aplicáveis.

A concessão de Master deve ser explícita, auditável e realizada apenas por responsável técnico autorizado. A recuperação de senha de conta Master não é autorizada pelo fluxo administrativo comum do app; é procedimento exclusivo da TI.

## 5. Recuperação de senha e segregação de autoridade

A recuperação administrativa de senha segue hierarquia rígida:

- conta Master: recuperação somente pela TI;
- Administrador pode recuperar Inspetor e Operador, desde que mantenha `access.password_reset`;
- Inspetor pode recuperar Operador, desde que mantenha `access.password_reset`;
- não é permitido recuperar conta de nível igual ou superior.

O código:

- possui 8 dígitos;
- é armazenado apenas como hash bcrypt;
- expira em 30 minutos;
- é de uso único;
- bloqueia após cinco tentativas incorretas;
- revalida autoridade do emissor no momento do consumo;
- invalida sessões anteriores após sucesso;
- gera trilha de auditoria.

A pessoa que autoriza a recuperação não define nem visualiza a nova senha do titular.

## 6. Revisão periódica de privilégios

A TI deve executar periodicamente:

```bash
npm run report-privileged-access
```

A revisão deve considerar, no mínimo:

- conta e cadastro funcional ativos;
- nível granular atual;
- permissões efetivas;
- existência de Administradores Master utilizáveis;
- roles legadas mantidas somente por compatibilidade;
- divergências entre perfil funcional, nível e role;
- últimas alterações privilegiadas e respectivos responsáveis.

A periodicidade deve ser definida pela política interna da empresa.

## 7. Dados pessoais tratados

Conforme os módulos utilizados, o SEGEMPAT pode armazenar:

- nome e matrícula funcional;
- setor, perfil funcional, nível e permissões;
- histórico de provas, notas e aprovações;
- respostas e tentativas;
- certificados;
- assinatura/evidência funcional;
- treinamentos e atividades;
- avaliações práticas;
- cronograma e histórico de execução;
- ocorrências operacionais associadas a colaborador;
- logs de auditoria e identidade de responsáveis por alterações.

A empresa deve documentar finalidade e prazo de retenção de cada categoria. O código não deve inventar prazo jurídico de retenção sem aprovação institucional.

## 8. Minimização e acesso

- credenciais MySQL nunca são entregues ao navegador;
- secrets permanecem no servidor/secrets manager;
- Operadores recebem apenas escopo pessoal/funcional;
- usuários privilegiados recebem somente as permissões necessárias;
- leituras gerenciais não devem expor gabaritos ou respostas-modelo sem permissão específica;
- endpoints de Dashboard, Analytics, Risco, Atenção e Relatórios devem retornar apenas dados necessários ao propósito da tela;
- TI administra infraestrutura sem necessidade de consulta rotineira ao conteúdo operacional;
- acesso excepcional a conteúdo deve possuir finalidade justificada e seguir procedimento corporativo;
- exportações e relatórios devem ser usados somente para finalidade institucional autorizada.

## 9. Publicação e indexação

O SEGEMPAT é aplicação corporativa e não deve ser indexado como website público.

O frontend mantém:

- `robots.txt` com `Disallow: /`;
- metadados `robots` e `googlebot` com `noindex, nofollow, noarchive, nosnippet, noimageindex`.

Esses mecanismos reduzem indexação acidental, mas **não substituem controle de acesso**. A TI deve definir domínio, autenticação, proxy, Cloudflare/WAF, firewall, VPN/allowlist e demais barreiras adequadas ao ambiente real.

## 10. Análises de desempenho

Recursos como Evolução de Desempenho, Zona de Risco, “Precisa Melhorar”, indicadores, rankings e análises individuais devem funcionar como **apoio à decisão humana**.

O SEGEMPAT não deve ser tratado como mecanismo autônomo de punição, promoção, afastamento ou outra decisão trabalhista exclusivamente automatizada. Decisões com impacto relevante devem possuir análise humana e possibilidade de revisão conforme política interna e legislação aplicável.

## 11. Segurança e rastreabilidade

O ambiente corporativo deve manter:

- HTTPS para frontend e API;
- TLS entre API e MySQL em produção;
- cookies de sessão `HttpOnly` e `Secure`;
- CORS e origem de escrita em allowlist;
- storage privado para evidências;
- usuário MySQL de runtime com privilégio mínimo;
- usuário de migration separado;
- backups protegidos e restauração testada;
- logs técnicos e auditoria funcional;
- revisão periódica de usuários e privilégios;
- inativação imediata de contas quando perderem autorização;
- monitoramento e processo de resposta a incidentes.

A migration `006_governance_audit_session_hardening.sql` protege `audit_logs` contra `UPDATE` e `DELETE` operacionais e usa `RESTRICT` para preservar autoria. `app_users.session_epoch` permite revogação imediata de sessões quando credenciais, status ou privilégios mudam.

## 12. Retenção e descarte

Antes da produção, o controlador deve preencher uma matriz de retenção contendo no mínimo:

| Categoria | Finalidade | Base legal definida pela empresa | Prazo | Evento de descarte | Responsável |
| --- | --- | --- | --- | --- | --- |
| Cadastro funcional | A definir | A definir | A definir | A definir | A definir |
| Contas, níveis e permissões | A definir | A definir | A definir | A definir | A definir |
| Provas e tentativas | A definir | A definir | A definir | A definir | A definir |
| Certificados | A definir | A definir | A definir | A definir | A definir |
| Avaliações práticas | A definir | A definir | A definir | A definir | A definir |
| Ocorrências | A definir | A definir | A definir | A definir | A definir |
| Evidências/assinaturas | A definir | A definir | A definir | A definir | A definir |
| Auditoria | A definir | A definir | A definir | A definir | A definir |

Nenhum prazo deve ser inventado pelo aplicativo sem aprovação do controlador.

Como `audit_logs` é tecnicamente imutável para preservar rastreabilidade, eventual descarte de auditoria aprovado pela política corporativa deve usar procedimento excepcional da TI/DBA, previamente autorizado, documentado e com preservação de evidência da execução.

## 13. Direitos dos titulares

A empresa deve definir canal e procedimento para solicitações relacionadas a dados pessoais. Quando uma solicitação exigir correção, bloqueio, exportação ou outra providência no SEGEMPAT, a execução deve preservar integridade, histórico obrigatório e evidência de quem realizou a ação.

Solicitações de exclusão não devem apagar automaticamente histórico cuja manutenção seja necessária por obrigação legal/regulatória, contrato ou exercício regular de direitos. Essa decisão pertence ao controlador, com orientação jurídica/DPO quando necessária.

## 14. Incidentes

A TI e as áreas responsáveis devem possuir procedimento para:

1. identificar e conter o incidente;
2. preservar logs e evidências;
3. avaliar sistemas, dados e titulares potencialmente afetados;
4. comunicar os responsáveis internos por segurança e privacidade;
5. executar recuperação/rollback de forma controlada;
6. registrar causa, impacto, providências e ações preventivas;
7. avaliar comunicações externas exigidas pela legislação e pela política da empresa.

O código do SEGEMPAT não decide sozinho se um incidente é notificável à ANPD ou aos titulares.

## 15. Homologação antes da produção

A governança não deve ser considerada concluída apenas porque o código compilou. Antes da entrada em produção real devem ser comprovados:

- MySQL corporativo e migrations aplicadas;
- TLS/CA real;
- grants mínimos;
- domínio final e política de cookies;
- CORS/origens;
- proxy e IP de origem;
- firewall/WAF/VPN/allowlists;
- storage persistente;
- backup e restauração testada;
- logs e monitoramento;
- E2E de Master, Administrador, Inspetor e Operador;
- matriz de retenção e responsabilidades aprovada institucionalmente;
- procedimento de resposta a incidentes;
- revisão de acessos privilegiados.

## 16. Princípio de responsabilidade

O SEGEMPAT fornece controles técnicos para autenticação, autorização, auditoria e minimização, mas a conformidade depende também de processos organizacionais. Nenhum nível da aplicação substitui as responsabilidades legais do controlador, do operador de dados, do Encarregado/DPO ou das áreas corporativas competentes.
