ALTER TABLE public.practical_evaluations
  ADD COLUMN IF NOT EXISTS min_approval_score numeric NOT NULL DEFAULT 7;

UPDATE public.practical_evaluations
SET min_approval_score = 7
WHERE min_approval_score IS NULL OR min_approval_score < 0 OR min_approval_score > 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'practical_evaluations_min_approval_score_check'
       AND conrelid = 'public.practical_evaluations'::regclass
  ) THEN
    ALTER TABLE public.practical_evaluations
      ADD CONSTRAINT practical_evaluations_min_approval_score_check
      CHECK (min_approval_score >= 0 AND min_approval_score <= 10);
  END IF;
END;
$$;
