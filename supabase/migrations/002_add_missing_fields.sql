-- ============================================================
-- Migration 002 — Campos de compatibilidad Firebase → Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ---- families -----------------------------------------------
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS config          JSONB NOT NULL DEFAULT '{"type":"mama_papa","p1Label":"Mamá","p2Label":"Papá"}';
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS custody_config  JSONB;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS cal_alg_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS last_pickup     JSONB;

-- ---- users --------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS quick_replies        JSONB   NOT NULL DEFAULT '[]';

-- Actualizar trigger para incluir onboarding_completed
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, auth_provider, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, ''), '@', 1)),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---- custody_calendar (valores precalculados por día) --------
CREATE TABLE IF NOT EXISTS public.custody_calendar (
  family_id       UUID    NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  date            DATE    NOT NULL,
  custodian       TEXT    NOT NULL CHECK (custodian IN ('p1', 'p2', 'transition')),
  is_override     BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  PRIMARY KEY (family_id, date)
);
ALTER TABLE public.custody_calendar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custody_calendar_member" ON public.custody_calendar;
CREATE POLICY "custody_calendar_member"
  ON public.custody_calendar FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));
CREATE INDEX IF NOT EXISTS idx_custody_calendar ON public.custody_calendar(family_id, date);

-- ---- settlements (liquidaciones de balance) -----------------
CREATE TABLE IF NOT EXISTS public.settlements (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  UUID          NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  amount     NUMERIC(12,2) NOT NULL,
  from_role  TEXT          NOT NULL CHECK (from_role IN ('mama', 'papa')),
  to_role    TEXT          NOT NULL CHECK (to_role   IN ('mama', 'papa')),
  date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID          NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlements_member" ON public.settlements;
CREATE POLICY "settlements_member"
  ON public.settlements FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- ---- expenses: campos de compatibilidad ---------------------
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS date                           DATE          NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_by                        TEXT          NOT NULL DEFAULT 'mama' CHECK (paid_by IN ('mama','papa'));
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS treatment                      TEXT          NOT NULL DEFAULT 'shared' CHECK (treatment IN ('shared','pension','mama_only','papa_only'));
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS pct_mama                       NUMERIC(5,2)  NOT NULL DEFAULT 50;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS pct_papa                       NUMERIC(5,2)  NOT NULL DEFAULT 50;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid                           BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS voided                         BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS history                        JSONB         NOT NULL DEFAULT '[]';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS subcategory                    TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS frequency                      TEXT          DEFAULT 'unique';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS health_refund                  TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS modified_by                    UUID          REFERENCES public.users(id);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS attachment_name                TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS reimbursement_attachment_name  TEXT;

-- ---- children: campos adicionales ---------------------------
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS clinic           TEXT;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS school_insurance TEXT;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS blood_type       TEXT;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS age              TEXT;

-- ---- agreements: campos de compatibilidad -------------------
ALTER TABLE public.agreements ADD COLUMN IF NOT EXISTS date       DATE;
ALTER TABLE public.agreements ADD COLUMN IF NOT EXISTS signatures JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.agreements ADD COLUMN IF NOT EXISTS updated_by UUID  REFERENCES public.users(id);

-- ---- reminders: campos de compatibilidad --------------------
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS assigned TEXT    NOT NULL DEFAULT 'both' CHECK (assigned IN ('both','mama','papa'));
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS done     BOOLEAN NOT NULL DEFAULT FALSE;

-- ---- events: campos de compatibilidad -----------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS date             DATE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS time             TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS approval_status   TEXT    CHECK (approval_status IN ('pending','approved','rejected'));
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminder          TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS modified_by       UUID    REFERENCES public.users(id);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS modified_at       TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancelled_by      UUID    REFERENCES public.users(id);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS approved_by       UUID    REFERENCES public.users(id);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rejected_by       UUID    REFERENCES public.users(id);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rejected_at       TIMESTAMPTZ;

-- ---- documents: campos de compatibilidad --------------------
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS doc_type   TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS child_id   UUID REFERENCES public.children(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS url        TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ---- activity_logs: campos de compatibilidad ----------------
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS actor_name  TEXT;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS meta        JSONB NOT NULL DEFAULT '{}';

-- ---- custody_changes: campo extra ---------------------------
ALTER TABLE public.custody_changes ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- ---- invitations: RLS ampliado para lookup por token --------
DROP POLICY IF EXISTS "invitations_select" ON public.invitations;
CREATE POLICY "invitations_select"
  ON public.invitations FOR SELECT
  USING (
    public.is_family_member(family_id)
    OR auth.uid() IS NOT NULL
  );
