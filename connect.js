// --- CONNECT ------------------------------------------------
function showConnectScreen() {
  hide('authScreen'); hide('app'); show('connectScreen');

  function buildInviteLink(code) {
    var baseUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
    var link = baseUrl + '?invite=' + code;
    $('inviteLinkDisplay').textContent = link;
    $('whatsappBtn').onclick = function() {
      var msg = encodeURIComponent('Hola! Te invito a conectarte en Qinflo para coordinar mejor los temas de nuestros hijos. Entra aqui: ' + link);
      window.open('https://wa.me/?text=' + msg, '_blank');
    };
  }

  if (USERDATA && USERDATA.inviteCode) {
    buildInviteLink(USERDATA.inviteCode);
  } else {
    var newCode = genCode();
    _supabase.from('invitations').insert({
      family_id: FAMILY_ID, invited_by: USER.id, token: newCode, role: 'p2'
    }).then(function(r) {
      if (!r.error) {
        USERDATA.inviteCode = newCode;
        buildInviteLink(newCode);
      } else {
        $('inviteLinkDisplay').textContent = 'No se pudo generar el link. Intenta de nuevo.';
      }
    });
  }
}

async function autoConnect(token) {
  try {
    // Look up invitation by token
    var { data: inv, error: invErr } = await _supabase
      .from('invitations')
      .select('id, family_id, invited_by, role, status, families(config)')
      .eq('token', token)
      .single();

    if (invErr || !inv) { loadApp(); return; }
    if (inv.status !== 'pending') {
      alert('Este enlace de invitación ya fue utilizado o expiró.');
      loadApp(); return;
    }
    if (inv.invited_by === USER.id) { loadApp(); return; }

    var famId = inv.family_id;
    var joiningRole = inv.role || 'p2';
    var inviterRole = joiningRole === 'p1' ? 'p2' : 'p1';

    // Get the inviter's data
    var { data: inviter } = await _supabase
      .from('users').select('name, email').eq('id', inv.invited_by).single();

    // Check if already a member
    var { data: existing } = await _supabase
      .from('family_members')
      .select('id')
      .eq('family_id', famId)
      .eq('user_id', USER.id)
      .maybeSingle();

    if (!existing) {
      await _supabase.from('family_members').insert({
        family_id: famId, user_id: USER.id, role: joiningRole
      });
    }

    // Mark invitation as accepted
    await _supabase.from('invitations').update({
      status: 'accepted', accepted_by: USER.id, accepted_at: new Date().toISOString()
    }).eq('id', inv.id);

    window.history.replaceState({}, '', './');

    var fc = inv.families && inv.families.config
      ? inv.families.config
      : { type: 'mama_papa', p1Label: 'Mamá', p2Label: 'Papá' };

    USERDATA.coparentId = inv.invited_by;
    USERDATA.familyId   = famId;
    USERDATA.role       = joiningRole;
    USERDATA.familyConfig = fc;
    FAMILY_ID = famId;
    CODATA = inviter || null;

    if (typeof showCoparentWelcome === 'function') showCoparentWelcome();
    else loadApp();

  } catch(e) {
    console.error('[autoConnect]', e);
    loadApp();
  }
}
