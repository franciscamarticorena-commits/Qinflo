-- ============================================================
-- QINFLO — Migración 022: modelo centralizado de planes
--
-- La tabla plans existía desde la migración 001 pero nunca se conectó
-- a nada (todo el uso de la app está abierto, sin restricciones).
-- Esta migración reestructura su forma para que coincida con el
-- esquema de planes acordado (features/limits/flags como objetos
-- estructurados, no un array plano de strings), y resiembra los 3
-- planes con sus valores definitivos.
--
-- IMPORTANTE: esto SOLO define el modelo de datos -- no se aplica
-- ninguna restricción funcional todavía. La app sigue funcionando
-- exactamente igual que antes; eso queda para una segunda etapa.
--
-- Nota para la segunda etapa: el booleano "exports" no distingue QUÉ se
-- exporta -- en Coordinación Plus corresponde solo al balance mensual de
-- gastos; en Full Organización (junto con "advanced_exports") habilita
-- además mensajes, acuerdos e historial completo. Eso lo decide la
-- lógica de la app al momento de mostrar cada botón de descarga, no el
-- esquema en sí.
-- Idempotente.
-- ============================================================

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS limits JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS flags  JSONB NOT NULL DEFAULT '{}';

-- Renombra los slugs viejos si todavía existen (no-op si ya se renombraron).
UPDATE public.plans SET slug = 'coordinacion_plus'  WHERE slug = 'coordinacion';
UPDATE public.plans SET slug = 'full_organizacion'  WHERE slug = 'organizacion';

INSERT INTO public.plans (name, slug, price_clp, objective, features, limits, flags) VALUES
(
  'Esencial', 'esencial', 0,
  'Coordinación básica de custodia y comunicación entre padres.',
  '{
    "calendar": true, "child_profiles": true, "custody": true,
    "handoff_confirmation": true, "resources": true,
    "expenses": false, "expense_categories": false, "expense_balance": false,
    "messaging": false, "calendar_change_requests": false,
    "agreements": false, "agreement_versioning": false,
    "reports": "none", "timeline": false,
    "exports": false, "advanced_exports": false,
    "reminders": false, "advanced_reminders": false
  }'::jsonb,
  '{ "max_adults": 2, "expense_history_months": 0 }'::jsonb,
  '{ "ads": "full", "premium_auto_access": false, "monthly_recurrent_expense_notification": false }'::jsonb
),
(
  'Coordinación Plus', 'coordinacion_plus', 4990,
  'Gastos compartidos, acuerdos y solicitudes de cambio de calendario.',
  '{
    "calendar": true, "child_profiles": true, "custody": true,
    "handoff_confirmation": true, "resources": true,
    "expenses": true, "expense_categories": true, "expense_balance": true,
    "messaging": true, "calendar_change_requests": true,
    "agreements": false, "agreement_versioning": false,
    "reports": "partial", "timeline": true,
    "exports": true, "advanced_exports": false,
    "reminders": true, "advanced_reminders": false
  }'::jsonb,
  '{ "max_adults": 2, "expense_history_months": 6 }'::jsonb,
  '{ "ads": "limited", "premium_auto_access": false, "monthly_recurrent_expense_notification": true }'::jsonb
),
(
  'Full Organización', 'full_organizacion', 7990,
  'Registro histórico completo y centro de coordinación de la coparentalidad.',
  '{
    "calendar": true, "child_profiles": true, "custody": true,
    "handoff_confirmation": true, "resources": true,
    "expenses": true, "expense_categories": true, "expense_balance": true,
    "messaging": true, "calendar_change_requests": true,
    "agreements": true, "agreement_versioning": true,
    "reports": "full", "timeline": true,
    "exports": true, "advanced_exports": true,
    "reminders": true, "advanced_reminders": true
  }'::jsonb,
  '{ "max_adults": 2, "expense_history_months": 0 }'::jsonb,
  '{ "ads": "none", "premium_auto_access": true, "monthly_recurrent_expense_notification": true }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name       = EXCLUDED.name,
  price_clp  = EXCLUDED.price_clp,
  objective  = EXCLUDED.objective,
  features   = EXCLUDED.features,
  limits     = EXCLUDED.limits,
  flags      = EXCLUDED.flags;

NOTIFY pgrst, 'reload schema';
