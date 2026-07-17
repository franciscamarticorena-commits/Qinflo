-- ============================================================
-- QINFLO — Migración 015: vigencia de acuerdos (fecha tope)
-- Permite marcar un acuerdo como de duración indefinida o con
-- fecha tope, y avisar N días antes de que venza.
-- Idempotente.
-- ============================================================

ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS deadline_type TEXT NOT NULL DEFAULT 'indefinite'
    CHECK (deadline_type IN ('indefinite', 'fixed')),
  ADD COLUMN IF NOT EXISTS deadline_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deadline_warn_days INTEGER DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
