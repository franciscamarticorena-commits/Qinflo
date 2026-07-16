-- ============================================================
-- QINFLO — Migración 010: Retiros temporales
--
-- Nuevo tipo de registro para cuando un padre/madre retira a uno o
-- más hijos por algunas horas (ej: papá sale a comer con Augusto un
-- miércoles, o lleva a Clemente al estadio) SIN modificar el día de
-- custodia base. Regla de negocio: un retiro temporal nunca cambia
-- quién tiene la custodia ese día — solo registra una salida por
-- horas dentro de ese día.
--
-- Se guarda por child_id (child_ids UUID[]) en vez de solo por
-- family_id o por jornada completa, para que quede claro a qué
-- hijo(s) específico(s) corresponde cada retiro.
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.temporary_outings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_ids         UUID[]      NOT NULL,
  date              DATE        NOT NULL,
  start_time        TIME        NOT NULL,
  end_time          TIME,
  picked_up_by_role TEXT        NOT NULL CHECK (picked_up_by_role IN ('p1', 'p2')),
  reason            TEXT,
  created_by        UUID        REFERENCES public.users(id),
  created_by_role   TEXT        CHECK (created_by_role IN ('p1', 'p2')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_temp_outings_family_date
  ON public.temporary_outings(family_id, date);

ALTER TABLE public.temporary_outings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temporary_outings_family_member" ON public.temporary_outings;
CREATE POLICY "temporary_outings_family_member"
  ON public.temporary_outings FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

GRANT ALL ON public.temporary_outings TO anon, authenticated, service_role;
