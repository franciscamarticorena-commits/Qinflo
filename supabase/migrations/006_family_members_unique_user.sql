-- ============================================================
-- QINFLO — Migración 006: un usuario solo puede pertenecer a una familia
-- Sin esta restricción, una sesión que fallara en encontrar la
-- membresía existente (ver loadUserData) creaba una familia nueva en
-- vez de reusar la real — y con múltiples membresías, la consulta
-- que solo espera una fila fallaba, alimentando el ciclo. Esta
-- restricción hace que ese segundo insert falle de forma clara en
-- vez de multiplicar familias en silencio.
-- Idempotente: se puede ejecutar múltiples veces.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'family_members_user_id_unique'
  ) then
    alter table public.family_members
      add constraint family_members_user_id_unique unique (user_id);
  end if;
end $$;
