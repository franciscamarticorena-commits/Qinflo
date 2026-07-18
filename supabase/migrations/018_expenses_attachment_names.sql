-- ============================================================
-- QINFLO — Migración 018: expenses.attachment_name / reimbursement_attachment_name
--
-- expenses.js guarda el nombre del archivo adjunto (boleta) y del
-- comprobante de reembolso, pero estas columnas nunca fueron creadas
-- en ninguna migración anterior -- la 016 asumía por error que ya
-- existían. Sin ellas, cualquier intento de guardar un gasto falla
-- con "Could not find the 'attachment_name' column of 'expenses'".
-- Idempotente.
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS attachment_name               TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reimbursement_attachment_name TEXT DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
