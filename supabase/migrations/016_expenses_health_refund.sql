-- ============================================================
-- QINFLO — Migración 016: expenses.health_refund
--
-- expenses.js recolecta el estado de reembolso de salud ("pending",
-- "yes", "no") en el formulario, pero nunca se enviaba a la base de
-- datos -- el valor se descartaba en silencio al guardar. Esta columna
-- probablemente nunca existió (no aparece en ninguna migración previa,
-- a diferencia de attachment_name / reimbursement_attachment_name que
-- sí están en uso). Idempotente.
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS health_refund TEXT DEFAULT NULL
    CHECK (health_refund IN ('pending', 'yes', 'no'));

NOTIFY pgrst, 'reload schema';
