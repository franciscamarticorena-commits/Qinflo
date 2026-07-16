-- ============================================================
-- QINFLO — Migración 004: columnas faltantes en children
-- El formulario de "Agregar/editar hijo" (children.js) ya pedía estos
-- datos, pero la tabla nunca tuvo las columnas — la escritura fallaba
-- con 400 Bad Request.
-- Idempotente: se puede ejecutar múltiples veces.
-- ============================================================

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS clinic           TEXT,
  ADD COLUMN IF NOT EXISTS school_insurance TEXT,
  ADD COLUMN IF NOT EXISTS blood_type       TEXT;
