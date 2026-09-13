ALTER TABLE practical_evaluations
  ADD COLUMN min_approval_score DECIMAL(6,2) NOT NULL DEFAULT 7 AFTER max_score;

UPDATE practical_evaluations
SET min_approval_score = 7
WHERE min_approval_score IS NULL OR min_approval_score < 0 OR min_approval_score > 10;
