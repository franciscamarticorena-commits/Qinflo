-- ============================================================
-- QINFLO — Migración 019: aprobación/rechazo de salidas temporales
--
-- Las salidas temporales se registraban como un simple aviso, sin que
-- el otro padre/madre pudiera aprobarlas o rechazarlas -- a diferencia
-- de los eventos, que sí tienen ese flujo. Se agrega el mismo patrón:
-- status pending/approved/rejected + quién y cuándo respondió.
-- Idempotente.
-- ============================================================

ALTER TABLE public.temporary_outings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS responded_by UUID REFERENCES public.users(id) DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
