-- ============================================================
-- QINFLO — Migración 021: saldo de días de custodia a favor
--
-- Cuando se acepta un cambio de custodia donde un padre/madre se
-- queda con un día extra (ej. "quiero tener a los niños un día
-- más"), el otro padre/madre no recibe automáticamente un día de
-- vuelta ese mismo ciclo -- en vez de forzar una compensación
-- inmediata (frágil: ¿qué día futuro? ¿y si ya está ocupado?), se
-- lleva un saldo simple de "días a favor" por rol, igual de espíritu
-- al balance de gastos. Se puede resolver más adelante con una nueva
-- solicitud de cambio, a criterio de ambos padres.
-- Idempotente.
-- ============================================================

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS p1_day_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p2_day_balance INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.adjust_custody_day_balance(
  p_family_id UUID,
  p_role      TEXT,
  p_delta     INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_role = 'p1' THEN
    UPDATE public.families SET p1_day_balance = GREATEST(0, p1_day_balance + p_delta) WHERE id = p_family_id;
  ELSE
    UPDATE public.families SET p2_day_balance = GREATEST(0, p2_day_balance + p_delta) WHERE id = p_family_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
