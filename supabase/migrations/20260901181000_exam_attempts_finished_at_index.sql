-- Acelera recortes anuais e históricos recentes usados por Dashboard/Analytics.
CREATE INDEX IF NOT EXISTS exam_attempts_finished_at_idx
  ON public.exam_attempts (finished_at DESC);
