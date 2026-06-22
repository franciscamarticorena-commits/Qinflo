-- ============================================================
-- QINFLO — Migración 002: columnas de compatibilidad JS
-- Añade columnas necesarias para la migración desde Firebase
-- Idempotente: se puede ejecutar múltiples veces
-- ============================================================

-- ============================================================
-- EXTENSIONES DE families
-- ============================================================
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS config          JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS p1_uid          UUID         REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS p2_uid          UUID         REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS custody_config  JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS special_rules   JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cal_alg_version INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_pickup     JSONB        DEFAULT NULL;

-- ============================================================
-- EXTENSIONES DE users
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quick_replies        JSONB    NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS fcm_token            TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS legal_acceptance     JSONB    DEFAULT NULL;

-- ============================================================
-- EXTENSIONES DE expenses
-- date = fecha del gasto (ingresada por el usuario, distinta a created_at)
-- voided = anulado (no se borra, queda en historial)
-- treatment = tipo de gasto (shared, pension, mama_only, papa_only)
-- subcat / frequency para filtros
-- ============================================================
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS date      DATE         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS voided    BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS voided_by UUID         REFERENCES public.users(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS treatment TEXT         DEFAULT 'shared'
                                     CHECK (treatment IN ('shared','pension','mama_only','papa_only')),
  ADD COLUMN IF NOT EXISTS subcat    TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS frequency TEXT         DEFAULT 'once'
                                     CHECK (frequency IN ('once','monthly','annual','weekly'));

-- ============================================================
-- TABLA: custody_months
-- Equivalente a /families/{famId}/calendar/{YYYY-MM} en Firestore
-- Almacena la grilla mensual de custodia generada y sus overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custody_months (
  family_id   UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  month_key   TEXT        NOT NULL,   -- 'YYYY-MM'
  custody     JSONB       NOT NULL DEFAULT '{}',   -- { "1": "p1", "15": "p2", ... }
  overrides   JSONB       NOT NULL DEFAULT '{}',   -- { "1": { value, reason, ... }, ... }
  alg_version INTEGER     NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (family_id, month_key)
);

ALTER TABLE public.custody_months ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custody_months_family_member" ON public.custody_months;
CREATE POLICY "custody_months_family_member"
  ON public.custody_months FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- ============================================================
-- TABLA: settlements (liquidaciones de balance de gastos)
-- Equivalente a /families/{famId}/settlements en Firestore
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settlements (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,
  from_role   TEXT         NOT NULL CHECK (from_role IN ('p1', 'p2')),
  to_role     TEXT         NOT NULL CHECK (to_role   IN ('p1', 'p2')),
  date        DATE         NOT NULL DEFAULT CURRENT_DATE,
  created_by  UUID         NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlements_family_member" ON public.settlements;
CREATE POLICY "settlements_family_member"
  ON public.settlements FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- ============================================================
-- FUNCIÓN: set_custody_day
-- Actualiza/inserta un día en la grilla mensual de forma atómica
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_custody_day(
  p_family_id  UUID,
  p_month_key  TEXT,
  p_day        TEXT,
  p_parent     TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.custody_months (family_id, month_key, custody)
    VALUES (p_family_id, p_month_key, jsonb_build_object(p_day, p_parent))
  ON CONFLICT (family_id, month_key) DO UPDATE
    SET custody    = public.custody_months.custody || jsonb_build_object(p_day, p_parent),
        updated_at = NOW();
END;
$$;

-- ============================================================
-- FUNCIÓN: accept_invitation
-- Atómica: acepta invitación, crea membership, actualiza familia
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token    TEXT,
  p_user_id  UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv        public.invitations%ROWTYPE;
  v_family     public.families%ROWTYPE;
  v_inviter_mb public.family_members%ROWTYPE;
  v_join_role  TEXT;
BEGIN
  -- Buscar invitación válida
  SELECT * INTO v_inv FROM public.invitations
  WHERE token = p_token AND status = 'pending' AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invitación no válida o expirada');
  END IF;

  IF v_inv.invited_by = p_user_id THEN
    RETURN jsonb_build_object('error', 'No puedes unirte a tu propia familia');
  END IF;

  -- Verificar que no esté ya en esta familia
  IF EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = v_inv.family_id AND user_id = p_user_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'Ya eres miembro de esta familia');
  END IF;

  -- Obtener el rol del invitante para asignar el opuesto
  SELECT * INTO v_inviter_mb FROM public.family_members
  WHERE family_id = v_inv.family_id AND user_id = v_inv.invited_by AND status = 'active';

  v_join_role := CASE WHEN v_inviter_mb.role = 'p1' THEN 'p2' ELSE 'p1' END;

  -- Crear membresía del nuevo miembro
  INSERT INTO public.family_members (family_id, user_id, role)
  VALUES (v_inv.family_id, p_user_id, v_join_role);

  -- Actualizar familia con p1_uid / p2_uid
  UPDATE public.families SET
    p1_uid = CASE WHEN v_join_role = 'p1' THEN p_user_id ELSE v_inv.invited_by END,
    p2_uid = CASE WHEN v_join_role = 'p2' THEN p_user_id ELSE v_inv.invited_by END,
    updated_at = NOW()
  WHERE id = v_inv.family_id;

  -- Marcar invitación como aceptada
  UPDATE public.invitations SET
    status       = 'accepted',
    accepted_at  = NOW(),
    accepted_by  = p_user_id
  WHERE id = v_inv.id;

  -- Obtener datos de la familia para devolver al cliente
  SELECT * INTO v_family FROM public.families WHERE id = v_inv.family_id;

  RETURN jsonb_build_object(
    'familyId',   v_inv.family_id,
    'role',       v_join_role,
    'familyConfig', v_family.config,
    'inviterId',  v_inv.invited_by
  );
END;
$$;

-- ============================================================
-- EXTENSIONES DE agreements
-- signatures: { "p1": { signedAt, signedBy }, "p2": { ... } }
-- created_by_role: 'p1' | 'p2' para compatibilidad JS
-- ============================================================
ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS signatures      JSONB  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by_role TEXT   DEFAULT NULL;

-- ============================================================
-- ÍNDICES adicionales
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_custody_months_family ON public.custody_months(family_id);
CREATE INDEX IF NOT EXISTS idx_settlements_family    ON public.settlements(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_status    ON public.invitations(status, expires_at);
