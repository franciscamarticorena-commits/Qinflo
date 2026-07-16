-- ============================================================
-- QINFLO — Migración 007: una familia no puede tener más de 2 miembros
-- accept_invitation() no verificaba cuántos miembros activos ya tenía
-- la familia — si el link se compartía con más de una persona, o se
-- reenviaba después de que el coparent ya se hubiera unido, una
-- tercera persona podía sumarse igual. Ahora se bloquea.
-- Idempotente: se puede ejecutar múltiples veces (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token    TEXT,
  p_user_id  UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv          public.invitations%ROWTYPE;
  v_family       public.families%ROWTYPE;
  v_inviter_mb   public.family_members%ROWTYPE;
  v_join_role    TEXT;
  v_member_count INT;
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

  -- Bloquear la fila de la familia para evitar que dos aceptaciones
  -- concurrentes pasen ambas el conteo antes de insertar.
  PERFORM 1 FROM public.families WHERE id = v_inv.family_id FOR UPDATE;

  SELECT COUNT(*) INTO v_member_count FROM public.family_members
  WHERE family_id = v_inv.family_id AND status = 'active';

  IF v_member_count >= 2 THEN
    -- Invalida el link para que no se pueda reintentar
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN jsonb_build_object('error', 'Esta familia ya tiene dos miembros conectados');
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
