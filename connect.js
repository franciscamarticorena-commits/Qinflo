// --- CONNECT ------------------------------------------------
function showConnectScreen() {
  hide('authScreen'); hide('app'); show('connectScreen');

  function inviteMessage(link) {
    var otherName = $('connectInviteName') ? $('connectInviteName').value.trim().split(' ')[0] : '';
    var myName = USERDATA && USERDATA.name ? USERDATA.name.split(' ')[0] : '';
    var greeting = otherName ? ('Hola ' + otherName + '! ') : 'Hola! ';
    var from = myName ? (myName + ' te invita') : 'Te invito';
    return greeting + from + ' a conectarte en Qinflo para coordinar mejor los temas de nuestros hijos. Entra aqui: ' + link;
  }

  function buildInviteLink(code) {
    var baseUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
    var link = baseUrl + '?invite=' + code;
    $('inviteLinkDisplay').textContent = link;
    if ($('connectInviteMsgPreview')) $('connectInviteMsgPreview').textContent = inviteMessage(link);
    if ($('connectInviteName')) $('connectInviteName').oninput = function() {
      if ($('connectInviteMsgPreview')) $('connectInviteMsgPreview').textContent = inviteMessage(link);
    };
    $('whatsappBtn').onclick = function() {
      if (!$('connectInviteName') || !$('connectInviteName').value.trim()) {
        showMsg('connectMsg', 'Escribe el nombre del otro padre/madre antes de invitar.', true);
        return;
      }
      var msg = encodeURIComponent(inviteMessage(link));
      window.open('https://wa.me/?text=' + msg, '_blank');
    };
  }

  if (USERDATA && USERDATA.inviteCode) {
    buildInviteLink(USERDATA.inviteCode);
  } else {
    // Fallback: generar nuevo token de invitación
    var newCode = genCode();
    supa.from('invitations').insert({
      family_id:  FAMILY_ID,
      invited_by: USER.id,
      token:      newCode,
      role:       myRole() === 'p1' ? 'p2' : 'p1'
    }).then(function(res) {
      if (res.error) {
        $('inviteLinkDisplay').textContent = 'No se pudo generar el link. Intenta de nuevo.';
        console.error('Error generando inviteCode (fallback):', res.error);
        return;
      }
      USERDATA.inviteCode = newCode;
      buildInviteLink(newCode);
    });
  }
}

async function autoConnect(code) {
  try {
    // Llamar función SQL atómica que maneja todo el proceso de invitación
    var { data: result, error } = await supa.rpc('accept_invitation', {
      p_token:   code,
      p_user_id: USER.id
    });

    if (error || !result || result.error) {
      var msg = (result && result.error) || (error && error.message) || 'Error al conectar';
      if (msg.includes('no válida') || msg.includes('expirada') || msg.includes('not found')) {
        loadApp();
        return;
      }
      alert(msg);
      loadApp();
      return;
    }

    // Actualizar estado local
    window.history.replaceState({}, '', './');

    var newFamilyId = result.familyId;
    var newRole     = result.role;
    var newFc       = result.familyConfig || USERDATA.familyConfig;
    var inviterId   = result.inviterId;

    USERDATA.coparentId  = inviterId;
    USERDATA.familyId    = newFamilyId;
    USERDATA.role        = newRole;
    USERDATA.familyConfig = newFc;
    FAMILY_ID = newFamilyId;

    // Cargar datos del coparent
    var { data: coUser } = await supa.from('users').select('name, email').eq('id', inviterId).single();
    CODATA = coUser || null;

    if (typeof showCoparentWelcome === 'function') {
      showCoparentWelcome();
    } else {
      loadApp();
    }
  } catch(e) {
    console.error('[autoConnect]', e);
    loadApp();
  }
}
