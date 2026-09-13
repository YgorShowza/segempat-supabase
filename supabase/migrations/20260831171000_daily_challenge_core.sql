-- SEGEMPAT · Desafio Diário
-- Uma recompensa por usuário/dia + banco inicial de treinamento dinâmico.

ALTER TABLE public.training_activity_attempts
  ADD COLUMN IF NOT EXISTS activity_day date;

UPDATE public.training_activity_attempts
SET activity_day = (created_at AT TIME ZONE 'America/Maceio')::date
WHERE activity_day IS NULL;

ALTER TABLE public.training_activity_attempts
  ALTER COLUMN activity_day SET DEFAULT ((now() AT TIME ZONE 'America/Maceio')::date);

CREATE UNIQUE INDEX IF NOT EXISTS training_activity_daily_challenge_unique_idx
  ON public.training_activity_attempts(user_id, activity_type, activity_day)
  WHERE activity_type = 'Desafio Diário';

CREATE OR REPLACE FUNCTION public.submit_training_activity(
  p_activity_type text,
  p_activity_title text,
  p_answers jsonb DEFAULT '[]'::jsonb,
  p_score numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_matricula text;
  v_nome text;
  v_employee public.employees%rowtype;
  v_score numeric;
  v_passed boolean;
  v_points integer;
  v_new_points integer;
  v_level integer;
  v_attempt_id uuid;
  v_activity_day date := (now() AT TIME ZONE 'America/Maceio')::date;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_activity_type not in ('Simulador','Stress Test','Desafio Diário','Teste Rápido','Treinamento') then
    raise exception 'Tipo de atividade inválido';
  end if;

  if p_activity_type = 'Desafio Diário' and exists (
    select 1
    from public.training_activity_attempts a
    where a.user_id = v_user_id
      and a.activity_type = 'Desafio Diário'
      and a.activity_day = v_activity_day
  ) then
    raise exception 'Desafio Diário já realizado hoje';
  end if;

  select p.matricula, p.nome
    into v_matricula, v_nome
  from public.profiles p
  where p.id = v_user_id;

  if v_matricula is null then
    raise exception 'Perfil sem matrícula vinculada';
  end if;

  select e.*
    into v_employee
  from public.employees e
  where e.matricula = v_matricula
    and e.status = 'Ativo'
  limit 1;

  if v_employee.id is null then
    raise exception 'Colaborador ativo não encontrado';
  end if;

  v_score := greatest(0, least(10, coalesce(p_score, 0)));
  v_passed := v_score >= 7;
  v_points := case p_activity_type
    when 'Teste Rápido' then 10
    when 'Desafio Diário' then 15
    when 'Simulador' then 20
    when 'Stress Test' then 25
    when 'Treinamento' then 10
    else 0
  end;

  insert into public.training_activity_attempts (
    user_id, employee_id, employee_name, employee_matricula, employee_sector,
    activity_type, activity_title, answers, score, max_score, passed, points_earned, activity_day
  ) values (
    v_user_id, v_employee.id, coalesce(v_employee.full_name, v_nome, 'Colaborador'),
    v_employee.matricula, v_employee.sector, p_activity_type,
    coalesce(nullif(btrim(p_activity_title), ''), p_activity_type),
    coalesce(p_answers, '[]'::jsonb), v_score, 10, v_passed, v_points, v_activity_day
  ) returning id into v_attempt_id;

  v_new_points := coalesce(v_employee.points, 0) + v_points;
  v_level := case
    when v_new_points >= 2000 then 5
    when v_new_points >= 1000 then 4
    when v_new_points >= 500 then 3
    when v_new_points >= 200 then 2
    else 1
  end;

  update public.employees
  set points = v_new_points,
      level = v_level
  where id = v_employee.id;

  return jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'score', v_score,
    'passed', v_passed,
    'points_earned', v_points,
    'new_points', v_new_points,
    'level', v_level,
    'activity_day', v_activity_day
  );
exception
  when unique_violation then
    if p_activity_type = 'Desafio Diário' then
      raise exception 'Desafio Diário já realizado hoje';
    end if;
    raise;
end;
$function$;

-- Banco inicial para Teste Rápido e Desafio Diário.
INSERT INTO public.question_bank
  (bank_type, question_text, options, correct_index, correct_answer, explanation, target_sector, difficulty, theme, active)
SELECT * FROM (VALUES
  ('treinamento_dinamico','Ao identificar uma pessoa sem credencial em área controlada, qual deve ser a primeira conduta?', '["Abordar conforme o procedimento e verificar a autorização","Ignorar se a pessoa parecer conhecida","Permitir a passagem e registrar depois","Fotografar e divulgar no grupo"]'::jsonb, 0, 'Abordar conforme o procedimento e verificar a autorização', 'O controle de acesso deve ser restabelecido imediatamente, com abordagem segura e verificação da autorização.', 'Todos', 'Básico', 'Controle de Acesso', true),
  ('treinamento_dinamico','Durante uma ronda, um portão que deveria estar fechado é encontrado aberto sem justificativa. O que fazer?', '["Fechar, verificar a causa e comunicar a anormalidade","Apenas fechar e seguir a ronda","Deixar aberto para não interferir na operação","Esperar outra equipe verificar"]'::jsonb, 0, 'Fechar, verificar a causa e comunicar a anormalidade', 'A anormalidade deve ser corrigida, verificada e comunicada para manter rastreabilidade e segurança.', 'Vigilância', 'Básico', 'Ronda Patrimonial', true),
  ('treinamento_dinamico','No CFTV, uma câmera crítica perde sinal de forma repentina. Qual é a resposta mais adequada?', '["Registrar a falha, comunicar e intensificar o monitoramento por meios alternativos","Esperar o sinal voltar sozinho","Reiniciar todos os equipamentos sem comunicar","Ignorar se outras câmeras estiverem funcionando"]'::jsonb, 0, 'Registrar a falha, comunicar e intensificar o monitoramento por meios alternativos', 'Falhas em pontos críticos exigem registro, comunicação e compensação operacional enquanto o recurso não é restabelecido.', 'CFTV', 'Básico', 'Videomonitoramento', true),
  ('treinamento_dinamico','Uma informação sobre vulnerabilidade operacional deve ser compartilhada com quem?', '["Somente com pessoas autorizadas e que necessitem da informação","Com qualquer colega do turno","Em grupos pessoais para agilizar","Com visitantes de confiança"]'::jsonb, 0, 'Somente com pessoas autorizadas e que necessitem da informação', 'Informações sensíveis devem seguir o princípio da necessidade de conhecimento.', 'Todos', 'Intermediário', 'Proteção da Informação', true),
  ('treinamento_dinamico','Ao receber uma comunicação de possível ameaça, o profissional deve priorizar:', '["Coletar dados essenciais, manter a calma e seguir o protocolo de acionamento","Discutir a credibilidade da ameaça antes de registrar","Encerrar rapidamente a comunicação","Divulgar a informação para todos no local"]'::jsonb, 0, 'Coletar dados essenciais, manter a calma e seguir o protocolo de acionamento', 'A resposta inicial deve preservar informações, reduzir ruído e acionar a cadeia prevista.', 'Todos', 'Intermediário', 'Comunicação de Emergência', true),
  ('treinamento_dinamico','Qual prática melhora a confiabilidade do rádio no início do serviço?', '["Realizar teste funcional e verificar condições que possam prejudicar a comunicação","Usar o rádio apenas quando ocorrer emergência","Manter o volume no mínimo para economizar bateria","Trocar de canal sem coordenação"]'::jsonb, 0, 'Realizar teste funcional e verificar condições que possam prejudicar a comunicação', 'O teste preventivo reduz a chance de descobrir uma falha somente durante uma ocorrência.', 'Vigilância', 'Básico', 'Radiocomunicação', true),
  ('treinamento_dinamico','Em uma ocorrência observada pelo CFTV, qual registro é mais útil para análise posterior?', '["Horário, local, sequência dos fatos e referências das câmeras envolvidas","Somente uma opinião sobre quem parecia suspeito","Apenas o horário inicial","Somente uma captura de tela sem contexto"]'::jsonb, 0, 'Horário, local, sequência dos fatos e referências das câmeras envolvidas', 'Registros objetivos e cronológicos permitem reconstruir o evento e apoiar auditoria.', 'CFTV', 'Intermediário', 'Registro de Ocorrências', true),
  ('treinamento_dinamico','Quando uma orientação operacional conflita com um procedimento de segurança vigente, a conduta adequada é:', '["Solicitar esclarecimento pela cadeia responsável antes de executar uma ação insegura","Ignorar o procedimento automaticamente","Executar qualquer ordem sem questionamento","Alterar o procedimento por conta própria"]'::jsonb, 0, 'Solicitar esclarecimento pela cadeia responsável antes de executar uma ação insegura', 'Conflitos devem ser escalados à autoridade responsável; o profissional não deve improvisar mudança de procedimento.', 'Todos', 'Avançado', 'Tomada de Decisão', true),
  ('treinamento_dinamico','Uma tentativa de acesso utiliza credencial aparentemente válida, mas o comportamento e os dados não correspondem ao portador. O que fazer?', '["Interromper a liberação e realizar a verificação prevista no procedimento","Liberar porque a credencial foi reconhecida pelo sistema","Reter a pessoa sem comunicar ninguém","Devolver a credencial e não registrar"]'::jsonb, 0, 'Interromper a liberação e realizar a verificação prevista no procedimento', 'Credencial válida não substitui a validação de identidade quando existem inconsistências observáveis.', 'Vigilância', 'Avançado', 'Controle de Acesso', true),
  ('treinamento_dinamico','Em situação crítica, por que mensagens de rádio devem ser objetivas e padronizadas?', '["Para reduzir ambiguidades e acelerar a compreensão da equipe","Para impedir que outros profissionais respondam","Para diminuir o número de registros","Para evitar o uso de códigos operacionais"]'::jsonb, 0, 'Para reduzir ambiguidades e acelerar a compreensão da equipe', 'Comunicação curta, clara e padronizada melhora coordenação e reduz erros sob pressão.', 'Todos', 'Intermediário', 'Radiocomunicação', true),
  ('treinamento_dinamico','Ao perceber movimentação incomum em área restrita pelas câmeras, o operador deve:', '["Manter acompanhamento, registrar referências e acionar a resposta prevista","Abandonar a câmera para procurar pessoalmente","Esperar confirmação de um visitante","Desligar gravação para focar na imagem ao vivo"]'::jsonb, 0, 'Manter acompanhamento, registrar referências e acionar a resposta prevista', 'O operador deve preservar continuidade de observação e coordenar a resposta sem perder evidência.', 'CFTV', 'Avançado', 'Videomonitoramento', true),
  ('treinamento_dinamico','Qual é a melhor forma de tratar uma anormalidade pequena que ainda não causou incidente?', '["Registrar e corrigir ou encaminhar antes que evolua","Ignorar porque ainda não houve dano","Esperar o próximo turno","Registrar apenas se houver cobrança posterior"]'::jsonb, 0, 'Registrar e corrigir ou encaminhar antes que evolua', 'A atuação preventiva reduz risco e cria histórico para identificação de recorrências.', 'Todos', 'Básico', 'Prevenção', true)
) AS seed(bank_type, question_text, options, correct_index, correct_answer, explanation, target_sector, difficulty, theme, active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.question_bank q WHERE q.question_text = seed.question_text
);
