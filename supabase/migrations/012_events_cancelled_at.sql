-- ============================================================
-- QINFLO — Migración 012: events.cancelled_at
--
-- events.js guarda cancelled_at al cancelar/rechazar un evento (para
-- mostrar "Evento cancelado · fecha" como registro visible), pero la
-- columna nunca existió en la tabla events — solo en subscriptions,
-- que es otra tabla. Causaba "Could not find the 'cancelled_at'
-- column of 'events'" al cancelar o rechazar cualquier evento.
-- Idempotente.
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;
