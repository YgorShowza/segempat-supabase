ALTER TABLE practical_evaluations
  ADD COLUMN template_id CHAR(36) NULL AFTER title,
  ADD COLUMN template_slot VARCHAR(64) NULL AFTER template_id;

CREATE UNIQUE INDEX practical_evaluations_template_slot_unique_idx
  ON practical_evaluations (employee_id, template_id, template_slot);

CREATE INDEX practical_evaluations_template_idx
  ON practical_evaluations (template_id, evaluation_date);

ALTER TABLE practical_evaluations
  ADD CONSTRAINT practical_evaluations_template_fk
  FOREIGN KEY (template_id) REFERENCES practical_eval_templates(id) ON DELETE RESTRICT;
