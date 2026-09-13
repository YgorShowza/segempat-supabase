-- SEGEMPAT · permite UPDATE/DELETE por chave sem reabrir conteúdo sensível
-- PostgreSQL exige SELECT nas colunas usadas em condições WHERE de UPDATE/DELETE.

GRANT SELECT (id) ON public.exams TO authenticated;
GRANT SELECT (id) ON public.question_bank TO authenticated;
