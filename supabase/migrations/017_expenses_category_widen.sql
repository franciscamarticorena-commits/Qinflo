-- ============================================================
-- QINFLO — Migración 017: expenses.category — categorías reales de la UI
--
-- expenses_category_check solo aceptaba ('educacion','salud','ropa',
-- 'alimentacion','esparcimiento','otro'), pero el formulario de Gastos
-- usa hace tiempo 4 categorías distintas ('Educación','Salud','Vida
-- cotidiana','Gastos extraordinarios') que expenses.js enviaba tal cual
-- (con mayúscula y tilde) -- violando el constraint en cada gasto nuevo.
-- Se amplía el constraint para aceptar las categorías reales (en su
-- forma DB: minúscula, sin tilde, guion bajo) SIN quitar los valores
-- viejos, por si ya existen filas guardadas con ellos.
-- Idempotente.
-- ============================================================

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'educacion', 'salud', 'ropa', 'alimentacion', 'esparcimiento', 'otro',
    'vida_cotidiana', 'gastos_extraordinarios'
  ));

NOTIFY pgrst, 'reload schema';
