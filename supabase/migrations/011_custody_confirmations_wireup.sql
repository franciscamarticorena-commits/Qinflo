-- ============================================================
-- QINFLO — Migración 011: activar custody_confirmations
--
-- La tabla custody_confirmations existe desde la migración 001
-- ("Los niños ya están conmigo") pero nunca fue usada por el
-- frontend — en su lugar, la migración a Supabase dejó un atajo
-- temporal (families.last_pickup) que solo guarda LA ÚLTIMA
-- confirmación y se pierde apenas alguien vuelve a cargar la app.
-- Esta es la funcionalidad que se sentía "perdida" desde Firebase.
--
-- Se agrega context_type para poder usar la misma tabla tanto para
-- confirmar un día de cambio de custodia como para confirmar la
-- recepción de un "retiro/salida temporal" (related_event_id apunta
-- al id del evento o del retiro temporal según corresponda; sigue
-- sin FK propia a propósito, ya que puede referenciar más de una
-- tabla).
-- Idempotente.
-- ============================================================

ALTER TABLE public.custody_confirmations
  ADD COLUMN IF NOT EXISTS context_type TEXT NOT NULL DEFAULT 'custody_day'
    CHECK (context_type IN ('custody_day', 'outing'));

CREATE INDEX IF NOT EXISTS idx_custody_confirmations_family
  ON public.custody_confirmations(family_id);
