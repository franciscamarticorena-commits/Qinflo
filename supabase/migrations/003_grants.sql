-- ============================================================
-- QINFLO — Migración 003: permisos base para PostgREST
-- Otorga GRANT a anon/authenticated/service_role sobre el schema public.
-- Las políticas RLS de cada tabla siguen controlando el acceso por fila;
-- esto solo habilita el permiso base que faltaba (causaba
-- "permission denied for table X" al registrar usuarios nuevos).
-- Idempotente: se puede ejecutar múltiples veces.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
