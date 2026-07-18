-- ============================================================
-- QINFLO — Migración 020: set_custody_override + intercambio real de días
--
-- Un cambio de custodia aceptado NO debía convertir a un padre/madre
-- en "dueño" de un día extra sin devolver nada -- es un intercambio:
-- el día que se cede y el día que se recibe se intercambian entre
-- ambos padres, sin que quede ningún día "debido". Además, según la
-- arquitectura documentada, estos cambios puntuales deben ir a
-- custody_months.overrides (una excepción sobre el patrón base), no
-- sobreescribir la grilla recurrente en custody_months.custody.
--
-- set_custody_override() es el equivalente de set_custody_day() pero
-- para overrides. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_custody_override(
  p_family_id  UUID,
  p_month_key  TEXT,
  p_day        TEXT,
  p_value      TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.custody_months (family_id, month_key, overrides)
    VALUES (p_family_id, p_month_key, jsonb_build_object(p_day, jsonb_build_object('value', p_value)))
  ON CONFLICT (family_id, month_key) DO UPDATE
    SET overrides  = public.custody_months.overrides || jsonb_build_object(p_day, jsonb_build_object('value', p_value)),
        updated_at = NOW();
END;
$$;
