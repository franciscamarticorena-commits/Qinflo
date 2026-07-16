-- ============================================================
-- QINFLO — Migración 008: aviso previo en eventos
-- El formulario de eventos ya pedía "avisar 2h/1 día/1 semana antes",
-- pero la tabla nunca tuvo dónde guardarlo — se descartaba en
-- silencio al crear/editar el evento.
-- Idempotente: se puede ejecutar múltiples veces.
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reminder TEXT CHECK (reminder IN (NULL, '2h', '1d', '1w'));
