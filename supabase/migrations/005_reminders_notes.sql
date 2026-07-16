-- ============================================================
-- QINFLO — Migración 005: notas en recordatorios
-- Permite dejar un comentario corto asociado a un evento/recordatorio
-- (ej. "las zapatillas de ballet están en tu casa, por favor llévalas").
-- Idempotente: se puede ejecutar múltiples veces.
-- ============================================================

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS notes TEXT;
