> [!IMPORTANT]
> **DOCUMENTO HISTÓRICO — ARQUITETURA SUPABASE (01/09/2026).**
> Este arquivo preserva evidências da etapa anterior do SEGEMPAT e **não deve ser usado como evidência de homologação do MySQL corporativo**.
> Para o estado atual e a homologação no ambiente da empresa, use `README.md`, `MYSQL_TI_INPUTS.md`, `MYSQL_CORPORATE_HANDOFF.md` e `CORPORATE_HOMOLOGATION_CHECKLIST.md`.

# SEGEMPAT · Status de Homologação

Atualizado em 01/09/2026.

Este documento separa o que já foi comprovado por código, banco, testes transacionais e CI do que ainda depende de uso real em navegador, dispositivo ou ambiente final de produção.

## Automaticamente homologado

### Build e execução
- CI do GitHub verde com `bun install --frozen-lockfile`, typecheck e build de produção.
- Build SSR validado.
- CI falha automaticamente se existirem migrations com versão/timestamp duplicado.
- Lovable em estado `ready` no mesmo HEAD validado pelo CI.
- `bun.lock` alinhado ao `package.json`.

### Segurança e identidade
- RLS habilitada em todas as tabelas públicas auditadas.
- `anon` sem privilégios diretos nas tabelas públicas do SEGEMPAT.
- Nenhuma função `SECURITY DEFINER` pública auditada é executável por `anon`.
- Primeiro acesso restrito a colaborador ativo + código de ativação de uso único.
- Código de ativação com RNG criptográfico, validade de 24h e bcrypt com salt.
- Código em plaintext não é persistido no banco.
- Revogação de código temporário validada.
- Não-admin não consegue gerar código de ativação.
- Matrícula que já possui conta não recebe novo código de primeiro acesso.
- `profiles` e `user_roles` são somente leitura para o cliente.
- Role administrativa é reconciliada com colaborador `Ativo + Inspetor`.
- Teste transacional confirmou: Operacional não possui admin; Inspetor ativo recebe admin; retorno a Operacional ou Inativo remove admin.
- Colaborador inativo é bloqueado no guard, RLS, RPCs e Storage mesmo com sessão/token ainda existente.
- Matrícula de colaborador vinculado a conta não pode ser alterada diretamente.
- Colaborador com conta vinculada não pode ser excluído diretamente; deve ser inativado para preservar histórico.

### Provas e certificados
- Operador não possui `SELECT` direto na tabela `exams`.
- Provas disponíveis são listadas por RPC sanitizada.
- Prova operacional é entregue por RPC sem `correct_index` e sem `model_answer`.
- Leitura administrativa completa ocorre por RPC protegida.
- Nota e aprovação são calculadas no servidor pela RPC `submit_exam_attempt`.
- `authenticated` não possui `INSERT` direto em `exam_attempts`.
- Resposta errada foi testada e retornou nota 0/reprovação no servidor.
- Prova de outro setor foi testada: não aparece, não abre e não aceita submissão.
- Assinatura exige arquivo real no bucket privado e pertencente ao próprio usuário.
- Certificado formal só é emitido após aprovação + assinatura eletrônica completa.
- Fluxo legado de certificados foi alinhado à mesma regra.
- Validação de certificado é administrativa e exige tentativa formalmente assinada.

### Homologação transacional da prova
Fluxo completo aprovado com rollback integral:
1. prova publicada criada temporariamente;
2. identidade técnica simulada como Operador sem role admin;
3. prova compatível ficou visível ao Operador;
4. payload entregue sem chave de resposta;
5. correção server-side de questão objetiva + discursiva retornou nota 10 e aprovação;
6. zero certificado antes da assinatura;
7. assinatura eletrônica validada pela RPC com objeto temporário no bucket privado;
8. exatamente um certificado formal após assinatura;
9. validação administrativa retornou certificado válido.

Casos negativos também aprovados:
- resposta errada → nota 0 e reprovação;
- prova de outro setor → oculta e bloqueada para leitura/submissão;
- `SELECT` direto em `exams` → revogado.

Após os testes: zero prova, tentativa, certificado, objeto de assinatura ou colaborador fictício residual.

### Banco de Questões e atividades rápidas
- Operador não possui acesso direto às colunas de gabarito do Banco de Questões.
- RPC operacional omite `correct_index`, resposta correta e explicação.
- Teste Rápido, Simulador, Stress Test e Desafio Diário são corrigidos no servidor.
- `p_score` enviado pelo navegador não possui autoridade.
- Proteções de setor, tipo, dificuldade, quantidade e IDs são server-side.
- Teste Rápido, Simulador e Stress Test não permitem farm de XP diário.
- Desafio Diário é limitado a uma execução por dia.

### Homologação transacional das atividades
Fluxo aprovado com rollback integral:
1. Teste Rápido: score server-side 10 e 10 XP mesmo recebendo `p_score` diferente;
2. segunda execução do Teste Rápido no mesmo dia: 0 XP;
3. Simulador: score server-side 10 e 20 XP;
4. Stress Test: score server-side 10 e 25 XP;
5. Desafio Diário: score server-side 10 e 15 XP;
6. segunda execução do Desafio Diário bloqueada;
7. total acumulado dentro da transação: 70 pontos, exatamente o esperado.

Após o teste: zero questão, tentativa, log ou alteração de pontos fictícia residual.

### Homologação de autorização como Operador
Como ainda não existe conta Operador real ativa no banco de homologação, foram executadas simulações transacionais usando identidade já existente com remoção temporária da role admin e vínculo operacional temporário. Todos os blocos terminaram em rollback.

Resultado aprovado:
- role administrativa removida durante a simulação;
- provas entregues somente para `Todos`/setor permitido;
- questões operacionais entregues somente para `Todos`/setor permitido;
- RPCs administrativas bloqueadas;
- geração de código de primeiro acesso bloqueada para não-admin;
- usuário inativado deixa de ser considerado colaborador ativo imediatamente;
- atividades operacionais ficam bloqueadas após inativação;
- zero resíduo após rollback.

### Cronograma
- Visões Lista, Calendário e Ano existentes.
- Cabeçalho integrado com `Novo Registro` e `Ações`.
- `Novo Registro` usa `?novo=true` e abre o formulário real existente da Gestão, sem duplicar CRUD.
- Calendário mantém largura legível e scroll horizontal em telas estreitas.
- Visão anual é navegável por mês.
- Importação possui fluxo atômico server-side.
- Criação em massa possui RPC atômica com validações server-side.
- Trigger valida questões vinculadas, existência, atividade e compatibilidade de setor.
- Conclusão de prova sincroniza o Cronograma no servidor.

### Homologação transacional do Cronograma
Fluxos aprovados com rollback integral:
- lote válido criou 2 registros;
- duplicidade no mesmo lote foi bloqueada e deixou 0 registros parciais;
- questão incompatível com o setor foi bloqueada e deixou 0 registros parciais;
- questão compatível foi vinculada corretamente;
- importação válida converteu pendência em `Realizado` com data correta;
- lote de importação contendo uma linha inválida foi bloqueado e deixou 0 atualizações parciais.

### Tema, mobile e shell
- Claro/Escuro/Auto sincronizam `data-theme`, classe `.dark` e `color-scheme`.
- Tema é aplicado antes do primeiro paint para reduzir flash visual.
- Sidebar permanece escura de propósito; conteúdo usa tokens semânticos.
- Heroes de fundo permanentemente escuro usam texto explicitamente claro, inclusive no tema claro.
- Drawer mobile, bottom nav do Operador, safe area e espaçamento inferior foram revisados.
- Logout só limpa cache/redireciona após `supabase.auth.signOut()` bem-sucedido.
- 404 e error boundary estão em português e seguem o tema.
- Assinatura usa Pointer Events, pointer capture, `touch-none` e `devicePixelRatio`.
- Assinatura agora preserva o traço durante resize/orientação do viewport em vez de zerar o canvas.

### Integridade final
Última bateria ampla retornou zero problemas:
- zero duplicidade crítica no Cronograma;
- zero tentativa órfã de prova;
- zero aprovação sem código;
- zero assinatura incompleta marcada como válida;
- zero certificado formal inconsistente;
- zero Desafio Diário duplicado;
- zero vínculo inválido entre Cronograma e Banco de Questões;
- zero Inspetor ativo sem admin;
- zero tabela pública auditada sem RLS;
- zero função `SECURITY DEFINER` executável por `anon`;
- `anon` sem acesso direto a `exams`;
- `authenticated` sem acesso direto ao JSON completo de `exams`.

### Migrations
- Histórico do Supabase reconciliado até `20260901144000_validate_cronograma_question_links`.
- Schema, trigger e privilégios da migration `144000` foram comparados com o arquivo antes da reconciliação do histórico; o SQL não foi reexecutado.
- A colisão histórica de versões anteriores foi eliminada.
- O CI valida padrão de nome e unicidade das versões de todas as migrations.
- Sem drift conhecido entre os objetos auditados do schema e as migrations registradas.

## Pendências que dependem de homologação manual/operacional

- Primeiro acesso com um Operador real usando código de ativação emitido pela Inspetoria.
- Fluxo real de uma prova em navegador autenticado de Operador.
- Assinatura com dedo em touchscreen físico.
- Teste físico em iPhone e Android.
- Conferência de PDFs e impressão no navegador/impressora operacional.
- Teste de navegação Claro → Escuro → Auto nas principais telas em dispositivo real.
- Teste do Cronograma com volume e usuários operacionais reais.
- Backup imediatamente antes da publicação.
- Configuração final de domínio/URLs de autenticação.
- Decisão operacional sobre restrição por IP/VPN.

## Melhorias conhecidas de baixo risco

- `CronogramaSourceParityV2` ainda pode ganhar fallback visual explícito de erro/retry para falhas de rede nas queries de Lista/Calendário/Ano. O núcleo e os dados estão protegidos; trata-se de UX de recuperação.
- Simulador e Stress Test já tratam falha de carregamento inicial; ainda é desejável padronizar feedback visual da falha de submissão e substituir retornos com recarga completa por navegação interna quando aplicável.
- Nos PDFs do Cronograma, quando há quebra de página no meio de um setor, o subtítulo `SETOR:` pode precisar ser repetido antes da primeira linha da nova página. Cabeçalho da tabela e rodapé já são repetidos. Deve ser confirmado/corrigido junto ao teste físico de impressão.

Esses itens são melhorias de UX/documentação e não alteram autoridade server-side, RLS, cálculo de nota ou integridade dos dados.

## Critério de conclusão

O SEGEMPAT está tecnicamente pronto para homologação operacional: CI, banco, migrations e preview permanecem verdes/consistentes, e os fluxos sensíveis foram validados por testes transacionais com rollback. A classificação de 100% homologado para produção só deve ocorrer após concluir os testes manuais acima em contas e dispositivos reais.
