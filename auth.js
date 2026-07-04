// --- AUTH FUNCIONES ------------------------------------------
function switchToLogin() {
  show('loginForm'); hide('registerForm'); hide('forgotForm');
  $('tabLoginBtn').classList.add('active');
  $('tabRegisterBtn').classList.remove('active');
  hideMsg('authMsg');
}
function switchToRegister() {
  hide('loginForm'); show('registerForm'); hide('forgotForm');
  $('tabLoginBtn').classList.remove('active');
  $('tabRegisterBtn').classList.add('active');
  hideMsg('authMsg');
}
function switchToForgot() {
  hide('loginForm'); hide('registerForm'); show('forgotForm');
  hideMsg('authMsg');
}

function updateRoleOptions() {
  var ft = $('regFamType').value;
  var labels = { mama_papa: ['Mamá', 'Papá'], papa_papa: ['Papá 1', 'Papá 2'], mama_mama: ['Mamá 1', 'Mamá 2'] };
  $('roleP1Opt').textContent = labels[ft][0];
  $('roleP2Opt').textContent = labels[ft][1];
}

async function doLogin() {
  hideMsg('authMsg');
  var email = $('loginEmail').value.trim();
  var pass = $('loginPass').value;
  if (!email || !pass) { showMsg('authMsg', 'Completa todos los campos', true); return; }
  var { error } = await _supabase.auth.signInWithPassword({ email: email, password: pass });
  if (error) showMsg('authMsg', errMsg(error.message || error.code), true);
}

async function doRegister() {
  hideMsg('authMsg');
  var name  = $('regName').value.trim();
  var email = $('regEmail').value.trim();
  var pass  = $('regPass').value;
  var pass2 = $('regPass2').value;

  if (!name || !email || !pass || !pass2) { showMsg('authMsg', 'Completa todos los campos', true); return; }
  if (pass !== pass2) { showMsg('authMsg', 'Las contraseñas no coinciden', true); return; }
  if (pass.length < 6) { showMsg('authMsg', 'Mínimo 6 caracteres', true); return; }

  var urlParams = new URLSearchParams(window.location.search);
  var pendingInviteParam = urlParams.get('invite');
  if (pendingInviteParam) localStorage.setItem('pendingInvite', pendingInviteParam);

  IS_REGISTERING = true;
  try {
    var { data: signUpData, error: signUpErr } = await _supabase.auth.signUp({
      email: email, password: pass,
      options: { data: { name: name } }
    });
    if (signUpErr) { showMsg('authMsg', errMsg(signUpErr.message || signUpErr.code), true); return; }

    var uid = signUpData.user.id;
    var ft  = $('regFamType').value;
    var role = $('regRole').value;
    var labels = { mama_papa: ['Mamá', 'Papá'], papa_papa: ['Papá 1', 'Papá 2'], mama_mama: ['Mamá 1', 'Mamá 2'] };
    var fc = { type: ft, p1Label: labels[ft][0], p2Label: labels[ft][1] };

    var famId = await _createFamilyForUser(uid, role, fc);
    if (!famId) { showMsg('authMsg', 'Error al crear la familia. Intenta de nuevo.', true); return; }

    var inviteCode = genCode();
    await _supabase.from('invitations').insert({
      family_id: famId, invited_by: uid, token: inviteCode, role: 'p2'
    });

    IS_REGISTERING = false;
    USERDATA = { name: name, email: email, role: role, familyConfig: fc, familyId: famId,
      coparentId: null, inviteCode: inviteCode, onboardingCompleted: false, quickReplies: [] };
    FAMILY_ID = famId;
    USER = signUpData.user;
    USER.uid = USER.id;
    updateLabels();

    var storedInvite = localStorage.getItem('pendingInvite');
    if (storedInvite) { localStorage.removeItem('pendingInvite'); autoConnect(storedInvite); }
    else startOnboarding();

  } catch(e) {
    IS_REGISTERING = false;
    console.error('[doRegister]', e);
    showMsg('authMsg', 'Error inesperado. Intenta de nuevo.', true);
  }
}

async function _createFamilyForUser(uid, role, fc) {
  var { data: fam, error: famErr } = await _supabase.from('families')
    .insert({ created_by: uid, config: fc }).select('id').single();
  if (famErr || !fam) return null;
  var famId = fam.id;
  await _supabase.from('family_members').insert({ family_id: famId, user_id: uid, role: role });
  return famId;
}

async function doReset() {
  hideMsg('authMsg');
  var email = $('resetEmail').value.trim();
  if (!email) { showMsg('authMsg', 'Ingresa tu correo', true); return; }
  var { error } = await _supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) showMsg('authMsg', errMsg(error.message || error.code), true);
  else showMsg('authMsg', 'Te enviamos un enlace para restablecer tu contraseña.');
}

async function doGoogleLogin() {
  hideMsg('authMsg');
  var urlParams = new URLSearchParams(window.location.search);
  var pendingInvite = urlParams.get('invite');
  if (pendingInvite) localStorage.setItem('pendingInvite', pendingInvite);
  var { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) showMsg('authMsg', errMsg(error.message || error.code), true);
}

async function createGoogleUserProfile(u) {
  var ft = 'mama_papa';
  var role = 'p1';
  var fc = { type: ft, p1Label: 'Mamá', p2Label: 'Papá' };
  var name = (u.user_metadata && u.user_metadata.full_name)
    || (u.user_metadata && u.user_metadata.name)
    || (u.email ? u.email.split('@')[0] : 'Usuario');

  var famId = await _createFamilyForUser(u.id, role, fc);
  if (!famId) { await _supabase.auth.signOut(); show('authScreen'); hide('app'); showMsg('authMsg', 'Error al crear tu cuenta. Intenta de nuevo.', true); return; }

  var inviteCode = genCode();
  await _supabase.from('invitations').insert({ family_id: famId, invited_by: u.id, token: inviteCode, role: 'p2' });

  USERDATA = { name: name, email: u.email || '', role: role, familyConfig: fc,
    familyId: famId, coparentId: null, inviteCode: inviteCode, onboardingCompleted: false, quickReplies: [] };
  FAMILY_ID = famId;
  USER = u;
  USER.uid = USER.id;
  updateLabels();

  var pending = localStorage.getItem('pendingInvite');
  if (pending) { localStorage.removeItem('pendingInvite'); autoConnect(pending); }
  else startOnboarding();
}
