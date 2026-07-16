-- ============================================================
-- QINFLO — Migración 013: unicidad de family_members solo para activos
--
-- La migración 006 agregó UNIQUE(user_id) sobre TODA la tabla, sin
-- importar el status. La migración 009 hizo que accept_invitation()
-- marcara como 'removed' cualquier membresía anterior del usuario
-- antes de insertar la nueva — pero como la restricción de 006 es
-- incondicional, la fila con status='removed' sigue "ocupando" ese
-- user_id para siempre, y el INSERT de la nueva membresía activa
-- sigue chocando con "duplicate key value violates unique
-- constraint family_members_user_id_unique". Por eso la persona
-- invitada seguía sin poder unirse aunque ya se había corrido la
-- migración 009.
--
-- Esta migración reemplaza esa restricción por un índice único
-- parcial: solo puede haber UNA fila con status='active' por
-- usuario, pero puede tener cualquier cantidad de filas históricas
-- con otro status (p.ej. 'removed').
-- Idempotente.
-- ============================================================

ALTER TABLE public.family_members
  DROP CONSTRAINT IF EXISTS family_members_user_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS family_members_user_id_active_unique
  ON public.family_members(user_id)
  WHERE status = 'active';
