-- ============================================================
-- QINFLO — Migración 014: Servicios recomendados
-- Directorio de profesionales/empresas útiles para la crianza,
-- agrupados por categoría. Administrable directo en Supabase
-- (estas dos tablas) sin tocar código — igual que public.resources.
-- El campo "benefits" queda preparado para beneficios exclusivos
-- futuros; no se usa todavía.
-- Idempotente: se puede ejecutar múltiples veces.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_categories (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL UNIQUE,
  icon           TEXT        NOT NULL DEFAULT '⭐',
  display_order  INTEGER     NOT NULL DEFAULT 0,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recommended_services (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    UUID        NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  logo_url       TEXT,
  specialty      TEXT,
  description    TEXT,
  website_url    TEXT,
  email          TEXT,
  benefits       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  display_order  INTEGER     NOT NULL DEFAULT 0,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommended_services_category
  ON public.recommended_services(category_id);

ALTER TABLE public.service_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommended_services ENABLE ROW LEVEL SECURITY;

-- Lectura pública (mismo criterio que public.resources): cualquier
-- usuario autenticado puede leer categorías/servicios activos.
-- No hay políticas de escritura: la administración se hace directo
-- en la tabla (Supabase Studio), no desde la app.
DROP POLICY IF EXISTS "service_categories_public_read" ON public.service_categories;
CREATE POLICY "service_categories_public_read"
  ON public.service_categories FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "recommended_services_public_read" ON public.recommended_services;
CREATE POLICY "recommended_services_public_read"
  ON public.recommended_services FOR SELECT
  USING (is_active = TRUE);

GRANT SELECT ON public.service_categories   TO anon, authenticated;
GRANT SELECT ON public.recommended_services TO anon, authenticated;
GRANT ALL ON public.service_categories      TO service_role;
GRANT ALL ON public.recommended_services    TO service_role;

-- Categorías iniciales sugeridas (sin servicios activos todavía —
-- por diseño no se muestran hasta tener al menos un servicio activo).
INSERT INTO public.service_categories (name, icon, display_order) VALUES
  ('Abogados de familia',              '⚖️', 1),
  ('Mediación familiar',                '🤝', 2),
  ('Psicólogos infantiles y familiares','🧠', 3),
  ('Niñeras y cuidado infantil',        '👶', 4),
  ('Librerías',                         '📚', 5),
  ('Jugueterías',                       '🧸', 6),
  ('Apoyo escolar y clases particulares','📖', 7),
  ('Talleres y actividades',            '🎨', 8),
  ('Academias deportivas',              '⚽', 9),
  ('Salud infantil',                    '🏥', 10)
ON CONFLICT (name) DO NOTHING;
