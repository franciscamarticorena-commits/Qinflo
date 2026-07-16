-- ============================================================
-- QINFLO — Migración 009: accept_invitation() autosanador
--
-- Problema detectado en pruebas en vivo: cuando la persona invitada
-- se registraba (email/password o Google) ANTES de que el front-end
-- llamara a accept_invitation(), el flujo de registro ya le había
-- creado su propia familia + family_members. Al intentar unirla
-- luego a la familia del invitante, el INSERT chocaba con la
-- restricción UNIQUE(user_id) de family_members (migración 006) y
-- fallaba en silencio: la persona invitada terminaba "atrapada" en
-- su propia familia recién creada, con su propio onboarding desde
-- cero (custodia, hijos, etc.), en vez de sumarse al espacio
-- compartido del invitante.
--
-- Esta migración corrige accept_invitation() para que:
-- 1. Desactive cualquier otra membresía activa que el usuario ya
--    tuviera (en una familia distinta a la del invitante) antes de
--    insertar la nueva, evitando el choque con la restricción única.
-- 2. Marque onboarding_completed = true para quien se une, ya que
--    la familia que está uniendo ya tiene su configuración (custodia,
--    hijos) hecha por quien invitó — no debe volver a pasar por el
--    onboarding de cero.
--
-- El fix del front-end (auth.js) evita crear esa familia "de sobra"
-- para nuevos registros que llegan con un link de invitación, pero
-- esta migración es la que realmente hace el proceso robusto sin
-- importar por qué camino se llegó a este estado.
-- Idempotente: CREATE OR REPLACE.
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

  -- Marcar como 'removed' cualquier otra membresía activa que este
  -- usuario tuviera en OTRA familia (p.ej. si se registró solo antes
  -- de recibir la invitación). Sin esto, el INSERT de abajo choca con
  -- UNIQUE(user_id) y la unión falla en silencio.
  UPDATE public.family_members
  SET status = 'removed'
  WHERE user_id = p_user_id AND status = 'active' AND family_id != v_inv.family_id;

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

  -- Quien se une entra a una familia ya configurada (custodia, hijos) por
  -- el invitante: no debe repetir el onboarding desde cero.
  UPDATE public.users SET onboarding_completed = true WHERE id = p_user_id;

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
