-- ============================================================
-- QINFLO — Schema inicial PostgreSQL
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Orden: ejecutar este archivo completo de una vez
-- ============================================================

-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- búsqueda de texto

-- ============================================================
-- HELPER: verificar membresía a familia
-- Usado en políticas RLS para evitar repetición
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_family_member(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = p_family_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- ============================================================
-- 1. USERS
-- Extiende auth.users de Supabase (no reemplaza)
-- ============================================================
CREATE TABLE public.users (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  auth_provider TEXT        NOT NULL DEFAULT 'email', -- email | google | apple
  avatar_url    TEXT,
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================
-- 2. LEGAL ACCEPTANCES
-- Separada de users para auditoría y versionado de términos
-- ============================================================
CREATE TABLE public.legal_acceptances (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tos_version      TEXT        NOT NULL,
  privacy_version  TEXT        NOT NULL,
  tos_accepted     BOOLEAN     NOT NULL DEFAULT FALSE,
  privacy_accepted BOOLEAN     NOT NULL DEFAULT FALSE,
  newsletter       BOOLEAN     NOT NULL DEFAULT FALSE,
  accepted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address       TEXT,
  device_info      JSONB       NOT NULL DEFAULT '{}'
);

-- ============================================================
-- 3. FAMILIES
-- ============================================================
CREATE TABLE public.families (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT,
  created_by UUID        NOT NULL REFERENCES public.users(id),
  status     TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================
-- 4. FAMILY MEMBERS
-- Relación muchos-a-muchos User ↔ Family con rol
-- ============================================================
CREATE TABLE public.family_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('p1', 'p2')),
  relation   TEXT        NOT NULL DEFAULT 'otro', -- mamá | papá | otro
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status     TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'removed')),
  UNIQUE (family_id, user_id)
);

-- ============================================================
-- 5. INVITATIONS
-- Token único por invitación, expira en 7 días
-- ============================================================
CREATE TABLE public.invitations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  invited_by      UUID        NOT NULL REFERENCES public.users(id),
  token           TEXT        NOT NULL UNIQUE,
  invited_email   TEXT,
  role            TEXT        NOT NULL DEFAULT 'p2'
                              CHECK (role IN ('p1', 'p2')),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at     TIMESTAMPTZ DEFAULT NULL,
  accepted_by     UUID        REFERENCES public.users(id) DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. CHILDREN
-- ============================================================
CREATE TABLE public.children (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  birth_date DATE,
  school     TEXT,
  doctor     TEXT,
  allergies  TEXT,
  notes      TEXT,
  avatar_url TEXT,
  status     TEXT        NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================
-- 7. CUSTODY PATTERNS
-- Define la regla base de custodia de la familia
-- type: alternating_weeks | fixed_days | custom
-- ============================================================
CREATE TABLE public.custody_patterns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL
                               CHECK (type IN ('alternating_weeks', 'fixed_days', 'custom')),
  start_date       DATE        NOT NULL,
  change_day       INTEGER     CHECK (change_day BETWEEN 0 AND 6), -- 0=Dom
  change_time      TIME,
  change_location  TEXT,
  first_week_role  TEXT        CHECK (first_week_role IN ('p1', 'p2')),
  weekly_schedule  JSONB       DEFAULT NULL, -- {"0":"p1","1":"p2",...} para fixed_days
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. CUSTODY CHANGES (propuestas de intercambio)
-- Inmutables una vez creadas; estado cambia pero no se borran
-- ============================================================
CREATE TABLE public.custody_changes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  from_date         DATE        NOT NULL,
  to_date           DATE        NOT NULL,
  reason            TEXT,
  proposed_by       UUID        NOT NULL REFERENCES public.users(id),
  proposed_by_role  TEXT        NOT NULL CHECK (proposed_by_role IN ('p1', 'p2')),
  requested_to_role TEXT        NOT NULL CHECK (requested_to_role IN ('p1', 'p2')),
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  responded_by      UUID        REFERENCES public.users(id) DEFAULT NULL,
  responded_at      TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. CUSTODY CONFIRMATIONS ("Los niños ya están conmigo")
-- Registro verificable de recepción de los hijos
-- ============================================================
CREATE TABLE public.custody_confirmations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  confirmed_by      UUID        NOT NULL REFERENCES public.users(id),
  confirmed_by_role TEXT        NOT NULL CHECK (confirmed_by_role IN ('p1', 'p2')),
  child_ids         UUID[]      NOT NULL DEFAULT '{}',
  confirmation_text TEXT,
  confirmed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  related_event_id  UUID        REFERENCES public.events(id) DEFAULT NULL
);

-- ============================================================
-- 10. EVENTS
-- ============================================================
CREATE TABLE public.events (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_ids             UUID[]      NOT NULL DEFAULT '{}',
  title                 TEXT        NOT NULL,
  description           TEXT,
  category              TEXT        NOT NULL DEFAULT 'otro'
                                    CHECK (category IN ('salud','colegio','actividad','cumpleanos','vacaciones','otro')),
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ,
  location              TEXT,
  participants          TEXT        NOT NULL DEFAULT 'both'
                                    CHECK (participants IN ('both', 'p1', 'p2')),
  requires_confirmation BOOLEAN     NOT NULL DEFAULT FALSE,
  status                TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('draft','pending','confirmed','rejected','completed','cancelled')),
  source                TEXT        NOT NULL DEFAULT 'qinflo'
                                    CHECK (source IN ('qinflo', 'google_calendar')),
  google_event_id       TEXT        DEFAULT NULL,
  created_by            UUID        NOT NULL REFERENCES public.users(id),
  created_by_role       TEXT        NOT NULL CHECK (created_by_role IN ('p1', 'p2')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================
-- 11. EVENT CONFIRMATIONS
-- Respuesta de cada miembro a un evento compartido
-- ============================================================
CREATE TABLE public.event_confirmations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.users(id),
  response     TEXT        NOT NULL CHECK (response IN ('approved', 'rejected')),
  comment      TEXT,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

-- ============================================================
-- 12. CURRENCY RATES (UF, USD, etc.)
-- Valor diario para calcular gastos en UF
-- ============================================================
CREATE TABLE public.currency_rates (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  currency     TEXT         NOT NULL CHECK (currency IN ('UF', 'USD', 'EUR')),
  date         DATE         NOT NULL,
  value_in_clp NUMERIC(12,2) NOT NULL,
  source       TEXT         NOT NULL DEFAULT 'mindicador',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (currency, date)
);

-- ============================================================
-- 13. EXPENSES
-- amount_clp siempre en pesos para el cálculo de balance
-- ============================================================
CREATE TABLE public.expenses (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           UUID         NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id            UUID         REFERENCES public.children(id) DEFAULT NULL,
  category            TEXT         NOT NULL DEFAULT 'otro'
                                   CHECK (category IN ('educacion','salud','ropa','alimentacion','esparcimiento','otro')),
  description         TEXT         NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT         NOT NULL DEFAULT 'CLP' CHECK (currency IN ('CLP', 'UF')),
  amount_clp          NUMERIC(12,2) NOT NULL, -- siempre en CLP
  paid_by             UUID         NOT NULL REFERENCES public.users(id),
  paid_by_role        TEXT         NOT NULL CHECK (paid_by_role IN ('p1', 'p2')),
  split_percentage_p1 NUMERIC(5,2) NOT NULL DEFAULT 50
                                   CHECK (split_percentage_p1 BETWEEN 0 AND 100),
  split_percentage_p2 NUMERIC(5,2) NOT NULL DEFAULT 50
                                   CHECK (split_percentage_p2 BETWEEN 0 AND 100),
  receipt_url         TEXT         DEFAULT NULL,
  has_receipt         BOOLEAN      NOT NULL DEFAULT FALSE,
  status              TEXT         NOT NULL DEFAULT 'pending_review'
                                   CHECK (status IN ('pending_review','confirmed','paid','disputed')),
  confirmed_by        UUID         REFERENCES public.users(id) DEFAULT NULL,
  confirmed_at        TIMESTAMPTZ  DEFAULT NULL,
  created_by          UUID         NOT NULL REFERENCES public.users(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ  DEFAULT NULL,
  CONSTRAINT split_must_total_100
    CHECK (split_percentage_p1 + split_percentage_p2 = 100)
);

-- ============================================================
-- 14. EXPENSE BALANCE (VIEW — no tabla)
-- El balance siempre es correcto porque lo calcula la DB
-- ============================================================
CREATE OR REPLACE VIEW public.expense_balance AS
SELECT
  family_id,
  SUM(amount_clp * split_percentage_p2 / 100)
    FILTER (WHERE paid_by_role = 'p1' AND status IN ('pending_review','confirmed'))
    AS p2_owes_p1,
  SUM(amount_clp * split_percentage_p1 / 100)
    FILTER (WHERE paid_by_role = 'p2' AND status IN ('pending_review','confirmed'))
    AS p1_owes_p2
FROM public.expenses
WHERE deleted_at IS NULL
GROUP BY family_id;

-- ============================================================
-- 15. AGREEMENTS
-- Requieren doble aprobación (p1 + p2) para activarse
-- ============================================================
CREATE TABLE public.agreements (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  category            TEXT        NOT NULL DEFAULT 'otro'
                                  CHECK (category IN ('custodia','economico','salud','educacion','vacaciones','otro')),
  title               TEXT        NOT NULL,
  content             TEXT        NOT NULL,
  version             INTEGER     NOT NULL DEFAULT 1,
  status              TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','pending','active','archived')),
  approved_by_p1      BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_by_p2      BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_by_p1_at   TIMESTAMPTZ DEFAULT NULL,
  approved_by_p2_at   TIMESTAMPTZ DEFAULT NULL,
  created_by          UUID        NOT NULL REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================
-- 16. REMINDERS
-- ============================================================
CREATE TABLE public.reminders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id            UUID        REFERENCES public.children(id) DEFAULT NULL,
  title               TEXT        NOT NULL,
  date                DATE        NOT NULL,
  assigned_to         TEXT        NOT NULL DEFAULT 'both'
                                  CHECK (assigned_to IN ('p1', 'p2', 'both')),
  recurrence          TEXT        DEFAULT NULL
                                  CHECK (recurrence IN (NULL, 'none', 'daily', 'weekly', 'monthly')),
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'completed', 'cancelled')),
  related_entity_type TEXT        DEFAULT NULL,
  related_entity_id   UUID        DEFAULT NULL,
  created_by          UUID        NOT NULL REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================
-- 17. MESSAGES
-- Sin deleted_at: los mensajes NO se pueden eliminar por diseño
-- RLS lo enforcea a nivel de base de datos
-- ============================================================
CREATE TABLE public.messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES public.users(id),
  author_role TEXT        NOT NULL CHECK (author_role IN ('p1', 'p2')),
  content     TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'message'
                          CHECK (type IN ('message', 'divider', 'template')),
  sender_name TEXT,
  is_edited   BOOLEAN     NOT NULL DEFAULT FALSE,
  edited_at   TIMESTAMPTZ DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 18. MESSAGE EDIT HISTORY
-- Registro inmutable de cada edición
-- ============================================================
CREATE TABLE public.message_edit_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       UUID        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  previous_content TEXT        NOT NULL,
  new_content      TEXT        NOT NULL,
  edited_by        UUID        NOT NULL REFERENCES public.users(id),
  edited_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 19. MESSAGE TEMPLATES (respuestas rápidas)
-- user_id = NULL → plantilla global del sistema
-- ============================================================
CREATE TABLE public.message_templates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES public.users(id) DEFAULT NULL,
  family_id  UUID        REFERENCES public.families(id) DEFAULT NULL,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  category   TEXT        DEFAULT 'general',
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 20. DOCUMENTS
-- upload_allowed = false para documentos legales sensibles
-- ============================================================
CREATE TABLE public.documents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id          UUID        REFERENCES public.children(id) DEFAULT NULL,
  category          TEXT        NOT NULL DEFAULT 'otro'
                                CHECK (category IN ('salud','colegio','identidad','seguros','autorizacion','referencia_legal','otro')),
  title             TEXT        NOT NULL,
  type              TEXT        NOT NULL DEFAULT 'reference'
                                CHECK (type IN ('file', 'reference')),
  file_url          TEXT        DEFAULT NULL,
  external_location TEXT        DEFAULT NULL,
  notes             TEXT        DEFAULT NULL,
  sensitivity_level TEXT        NOT NULL DEFAULT 'normal'
                                CHECK (sensitivity_level IN ('normal', 'sensitive', 'legal_sensitive')),
  upload_allowed    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by        UUID        NOT NULL REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================
-- 21. RESOURCES (guías de apoyo — Chile)
-- Administrables desde la DB, no hardcodeadas en el código
-- ============================================================
CREATE TABLE public.resources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  url         TEXT,
  category    TEXT,
  country     TEXT        NOT NULL DEFAULT 'CL',
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 22. PENDING ACTIONS
-- Centraliza todo "Esperando respuesta" del Dashboard Hoy
-- ============================================================
CREATE TABLE public.pending_actions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  target_user_id  UUID        NOT NULL REFERENCES public.users(id),
  type            TEXT        NOT NULL
                              CHECK (type IN ('event_confirmation','custody_change','expense_review','agreement_approval','reminder')),
  entity_type     TEXT        NOT NULL,
  entity_id       UUID        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'resolved', 'expired')),
  created_by      UUID        NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ DEFAULT NULL,
  expires_at      TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================
-- 23. ACTIVITY LOG
-- Inmutable. Alimenta Dashboard Hoy y Timeline histórico.
-- ============================================================
CREATE TABLE public.activity_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  actor_user_id UUID        NOT NULL REFERENCES public.users(id),
  actor_role    TEXT        NOT NULL CHECK (actor_role IN ('p1', 'p2')),
  type          TEXT        NOT NULL,
  entity_type   TEXT,
  entity_id     UUID        DEFAULT NULL,
  summary       TEXT        NOT NULL,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 24. NOTIFICATIONS
-- Historial de notificaciones enviadas a cada usuario
-- ============================================================
CREATE TABLE public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  family_id  UUID        REFERENCES public.families(id) DEFAULT NULL,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  status     TEXT        NOT NULL DEFAULT 'sent'
                         CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  read_at    TIMESTAMPTZ DEFAULT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 25. NOTIFICATION TOKENS
-- Multi-device: un usuario puede tener varios dispositivos
-- ============================================================
CREATE TABLE public.notification_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id  TEXT        NOT NULL,
  token      TEXT        NOT NULL,
  platform   TEXT        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

-- ============================================================
-- 26. PLANS
-- ============================================================
CREATE TABLE public.plans (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  price_clp  INTEGER     NOT NULL DEFAULT 0,
  features   JSONB       NOT NULL DEFAULT '[]',
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.plans (name, slug, price_clp, features) VALUES
  ('Esencial',     'esencial',     0,     '["calendario","custodia","mensajes"]'),
  ('Coordinación', 'coordinacion', 4990,  '["calendario","custodia","mensajes","gastos","eventos","acuerdos"]'),
  ('Organización', 'organizacion', 9990,  '["calendario","custodia","mensajes","gastos","eventos","acuerdos","documentos","recordatorios","google_calendar"]');

-- ============================================================
-- 27. SUBSCRIPTIONS
-- ============================================================
CREATE TABLE public.subscriptions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                UUID        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  plan_id                  UUID        NOT NULL REFERENCES public.plans(id),
  payment_provider         TEXT        NOT NULL DEFAULT 'free'
                                       CHECK (payment_provider IN ('mercadopago', 'apple', 'google', 'free')),
  provider_subscription_id TEXT        DEFAULT NULL,
  status                   TEXT        NOT NULL DEFAULT 'active'
                                       CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at               TIMESTAMPTZ DEFAULT NULL,
  cancelled_at             TIMESTAMPTZ DEFAULT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 28. AUDIT LOG (seguridad y compliance)
-- Inmutable. Registra cambios críticos con before/after.
-- ============================================================
CREATE TABLE public.audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID        REFERENCES public.users(id) DEFAULT NULL,
  family_id     UUID        REFERENCES public.families(id) DEFAULT NULL,
  action        TEXT        NOT NULL
                            CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'ACCESS', 'INVITE')),
  entity_type   TEXT        NOT NULL,
  entity_id     UUID        DEFAULT NULL,
  before_data   JSONB       DEFAULT NULL,
  after_data    JSONB       DEFAULT NULL,
  ip_address    TEXT,
  device_info   JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_family_members_user    ON public.family_members(user_id);
CREATE INDEX idx_family_members_family  ON public.family_members(family_id);
CREATE INDEX idx_expenses_family        ON public.expenses(family_id);
CREATE INDEX idx_expenses_status        ON public.expenses(status);
CREATE INDEX idx_events_family          ON public.events(family_id);
CREATE INDEX idx_events_start_at        ON public.events(start_at);
CREATE INDEX idx_messages_family        ON public.messages(family_id, created_at DESC);
CREATE INDEX idx_pending_actions_target ON public.pending_actions(target_user_id, status);
CREATE INDEX idx_activity_logs_family   ON public.activity_logs(family_id, created_at DESC);
CREATE INDEX idx_notifications_user     ON public.notifications(user_id, read_at);
CREATE INDEX idx_custody_changes_family ON public.custody_changes(family_id, status);
CREATE INDEX idx_invitations_token      ON public.invitations(token);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_patterns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_changes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_rates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_edit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_actions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- USERS: solo tu propio perfil
-- El lookup de invitación se hace vía Edge Function (no expone datos de otros)
-- ------------------------------------------------------------
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- ------------------------------------------------------------
-- LEGAL ACCEPTANCES: solo las propias
-- ------------------------------------------------------------
CREATE POLICY "legal_select_own"
  ON public.legal_acceptances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "legal_insert_own"
  ON public.legal_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- FAMILIES: solo miembros
-- ------------------------------------------------------------
CREATE POLICY "families_select_member"
  ON public.families FOR SELECT
  USING (public.is_family_member(id));

CREATE POLICY "families_insert_own"
  ON public.families FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "families_update_member"
  ON public.families FOR UPDATE
  USING (public.is_family_member(id));

-- ------------------------------------------------------------
-- FAMILY MEMBERS: ver los de tu familia; crear el tuyo propio
-- ------------------------------------------------------------
CREATE POLICY "family_members_select"
  ON public.family_members FOR SELECT
  USING (public.is_family_member(family_id));

CREATE POLICY "family_members_insert_own"
  ON public.family_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- INVITATIONS: ver las de tu familia o las que apuntan a tu email
-- ------------------------------------------------------------
CREATE POLICY "invitations_select"
  ON public.invitations FOR SELECT
  USING (
    public.is_family_member(family_id)
    OR token = current_setting('app.invite_token', true)
  );

CREATE POLICY "invitations_insert_member"
  ON public.invitations FOR INSERT
  WITH CHECK (public.is_family_member(family_id));

CREATE POLICY "invitations_update_member"
  ON public.invitations FOR UPDATE
  USING (public.is_family_member(family_id) OR auth.uid() = accepted_by);

-- ------------------------------------------------------------
-- TODAS LAS SUBENTIDADES DE FAMILIA
-- Patrón común: solo miembros de la familia
-- ------------------------------------------------------------

-- Children
CREATE POLICY "children_family_member"
  ON public.children FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Custody patterns
CREATE POLICY "custody_patterns_family_member"
  ON public.custody_patterns FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Custody changes
CREATE POLICY "custody_changes_family_member"
  ON public.custody_changes FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Custody confirmations
CREATE POLICY "custody_confirmations_family_member"
  ON public.custody_confirmations FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Events
CREATE POLICY "events_family_member"
  ON public.events FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Event confirmations (via event's family_id)
CREATE POLICY "event_confirmations_family_member"
  ON public.event_confirmations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND public.is_family_member(e.family_id)
    )
  )
  WITH CHECK (auth.uid() = user_id);

-- Expenses
CREATE POLICY "expenses_family_member"
  ON public.expenses FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Agreements
CREATE POLICY "agreements_family_member"
  ON public.agreements FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Reminders
CREATE POLICY "reminders_family_member"
  ON public.reminders FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Messages: leer y crear, NUNCA eliminar
CREATE POLICY "messages_select"
  ON public.messages FOR SELECT
  USING (public.is_family_member(family_id));

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  WITH CHECK (public.is_family_member(family_id) AND auth.uid() = author_id);

CREATE POLICY "messages_update_own"
  ON public.messages FOR UPDATE
  USING (auth.uid() = author_id);

-- DELETE intencionalmente sin política → nadie puede borrar mensajes

-- Message edit history: leer los de tu familia, insertar los propios
CREATE POLICY "msg_history_select"
  ON public.message_edit_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_family_member(m.family_id)
    )
  );

CREATE POLICY "msg_history_insert_own"
  ON public.message_edit_history FOR INSERT
  WITH CHECK (auth.uid() = edited_by);

-- Message templates: propias o globales (user_id IS NULL)
CREATE POLICY "msg_templates_select"
  ON public.message_templates FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id OR public.is_family_member(family_id));

CREATE POLICY "msg_templates_insert_own"
  ON public.message_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Documents
CREATE POLICY "documents_family_member"
  ON public.documents FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Resources: lectura pública (guías de apoyo Chile)
CREATE POLICY "resources_public_read"
  ON public.resources FOR SELECT
  USING (active = TRUE);

-- Pending actions
CREATE POLICY "pending_actions_family_member"
  ON public.pending_actions FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Activity logs: solo lectura para miembros, sin delete
CREATE POLICY "activity_logs_select"
  ON public.activity_logs FOR SELECT
  USING (public.is_family_member(family_id));

CREATE POLICY "activity_logs_insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (public.is_family_member(family_id) AND auth.uid() = actor_user_id);

-- Notifications: solo las propias
CREATE POLICY "notifications_own"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Notification tokens: solo los propios
CREATE POLICY "notification_tokens_own"
  ON public.notification_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Currency rates: lectura pública (son datos públicos del Banco Central)
CREATE POLICY "currency_rates_public_read"
  ON public.currency_rates FOR SELECT
  USING (TRUE);

-- Plans: lectura pública
CREATE POLICY "plans_public_read"
  ON public.plans FOR SELECT
  USING (active = TRUE);

-- Subscriptions: solo miembros de la familia
CREATE POLICY "subscriptions_family_member"
  ON public.subscriptions FOR ALL
  USING (public.is_family_member(family_id))
  WITH CHECK (public.is_family_member(family_id));

-- Audit logs: solo lectura para miembros de la familia
CREATE POLICY "audit_logs_select"
  ON public.audit_logs FOR SELECT
  USING (
    auth.uid() = actor_user_id
    OR (family_id IS NOT NULL AND public.is_family_member(family_id))
  );

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_families
  BEFORE UPDATE ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_children
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_events
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_expenses
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_agreements
  BEFORE UPDATE ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_custody_patterns
  BEFORE UPDATE ON public.custody_patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_notification_tokens
  BEFORE UPDATE ON public.notification_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TRIGGER: crear usuario en public.users al registrarse
-- Se ejecuta automáticamente cuando Supabase Auth crea un usuario
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, auth_provider)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
