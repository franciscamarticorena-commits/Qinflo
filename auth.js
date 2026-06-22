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
  try {
    var { error } = await supa.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  } catch(e) {
    showMsg('authMsg', supaAuthErr(e), true);
  }
}

async function doRegister() {
  hideMsg('authMsg');

  var name  = $('regName').value.trim();
  var email = $('regEmail').value.trim();
  var pass  = $('regPass').value;
  var pass2 = $('regPass2').value;

  if (!name || !email || !pass || !pass2) {
    showMsg('authMsg', 'Completa todos los campos', true); return;
  }
  if (pass !== pass2) {
    showMsg('authMsg', 'Las contraseñas no coinciden', true); return;
  }
  if (pass.length < 6) {
    showMsg('authMsg', 'Mínimo 6 caracteres', true); return;
  }

  var urlParams = new URLSearchParams(window.location.search);
  var pendingInviteParam = urlParams.get('invite');
  if (pendingInviteParam) localStorage.setItem('pendingInvite', pendingInviteParam);

  try {
    IS_REGISTERING = true;

    // 1. Crear usuario en Supabase Auth
    // El trigger handle_new_user crea automáticamente la fila en public.users
    var { data: authData, error: authErr } = await supa.auth.signUp({
      email,
      password: pass,
      options: { data: { name } }
    });
    if (authErr) throw authErr;

    var uid = authData.user.id;
    var ft   = $('regFamType').value;
    var role = $('regRole').value;

    var labels = {
      mama_papa: ['Mamá', 'Papá'],
      papa_papa: ['Papá 1', 'Papá 2'],
      mama_mama: ['Mamá 1', 'Mamá 2']
    };
    var fc = { type: ft, p1Label: labels[ft][0], p2Label: labels[ft][1] };

    // 2. Crear familia
    var { data: family, error: famErr } = await supa.from('families').insert({
      name:       'Familia ' + name.split(' ')[0],
      created_by: uid,
      config:     fc,
      p1_uid:     role === 'p1' ? uid : null,
      p2_uid:     role === 'p2' ? uid : null
    }).select().single();
    if (famErr) throw famErr;

    // 3. Crear membresía
    var { error: mbErr } = await supa.from('family_members').insert({
      family_id: family.id,
      user_id:   uid,
      role:      role
    });
    if (mbErr) throw mbErr;

    // 4. Actualizar perfil de usuario (onboarding pendiente)
    await supa.from('users').update({ onboarding_completed: false }).eq('id', uid);

    // 5. Crear token de invitación
    var inviteCode = genCode();
    await supa.from('invitations').insert({
      family_id:  family.id,
      invited_by: uid,
      token:      inviteCode,
      role:       role === 'p1' ? 'p2' : 'p1'
    });

    IS_REGISTERING = false;

    USERDATA = {
      name, email, role, familyConfig: fc,
      familyId:           family.id,
      coparentId:         null,
      inviteCode:         inviteCode,
      onboardingCompleted: false
    };
    FAMILY_ID = family.id;
    updateLabels();

    var storedInvite = localStorage.getItem('pendingInvite');
    if (storedInvite) {
      localStorage.removeItem('pendingInvite');
      autoConnect(storedInvite);
    } else {
      startOnboarding();
    }

  } catch(e) {
    IS_REGISTERING = false;
    console.error('REGISTER ERROR', e);
    showMsg('authMsg', supaAuthErr(e), true);
  }
}

async function doReset() {
  hideMsg('authMsg');
  var email = $('resetEmail').value.trim();
  if (!email) { showMsg('authMsg', 'Ingresa tu correo', true); return; }
  try {
    var { error } = await supa.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    showMsg('authMsg', 'Te enviamos un enlace para restablecer tu contraseña.');
  } catch(e) {
    showMsg('authMsg', supaAuthErr(e), true);
  }
}

async function doGoogleLogin() {
  hideMsg('authMsg');
  var urlParams = new URLSearchParams(window.location.search);
  var pendingInvite = urlParams.get('invite');
  if (pendingInvite) localStorage.setItem('pendingInvite', pendingInvite);
  try {
    var { error } = await supa.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:  window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'select_account' }
      }
    });
    if (error) throw error;
    // La redirección ocurre automáticamente — onAuthStateChange manejará la sesión de retorno
  } catch(e) {
    showMsg('authMsg', supaAuthErr(e), true);
  }
}

async function doUpdatePassword() {
  var pass  = $('newPassInput')  ? $('newPassInput').value  : '';
  var pass2 = $('newPassInput2') ? $('newPassInput2').value : '';
  if (!pass || pass.length < 6) { showMsg('resetPassMsg', 'Mínimo 6 caracteres', true); return; }
  if (pass !== pass2)           { showMsg('resetPassMsg', 'Las contraseñas no coinciden', true); return; }
  try {
    var { error } = await supa.auth.updateUser({ password: pass });
    if (error) throw error;
    hide('resetPasswordScreen');
    show('authScreen');
    switchToLogin();
    showMsg('authMsg', 'Contraseña actualizada. Inicia sesión.');
  } catch(e) {
    showMsg('resetPassMsg', supaAuthErr(e), true);
  }
}

async function createGoogleUserProfile(user) {
  dbg('[google] creating profile ' + user.id + ' ' + user.email);
  var ft   = 'mama_papa';
  var role = 'p1';
  var fc   = { type: ft, p1Label: 'Mamá', p2Label: 'Papá' };
  var name = user.user_metadata?.full_name ||
             user.user_metadata?.name ||
             (user.email ? user.email.split('@')[0] : 'Usuario');
  var inviteCode = genCode();

  try {
    var { data: family, error: famErr } = await supa.from('families').insert({
      name:       'Familia ' + name.split(' ')[0],
      created_by: user.id,
      config:     fc,
      p1_uid:     user.id
    }).select().single();
    if (famErr) throw famErr;

    await supa.from('family_members').insert({ family_id: family.id, user_id: user.id, role });

    await supa.from('invitations').insert({
      family_id:  family.id,
      invited_by: user.id,
      token:      inviteCode,
      role:       'p2'
    });

    await supa.from('users').update({ onboarding_completed: false }).eq('id', user.id);

    USERDATA = {
      name, email: user.email || '', role, familyConfig: fc,
      familyId:           family.id,
      coparentId:         null,
      inviteCode:         inviteCode,
      onboardingCompleted: false
    };
    FAMILY_ID = family.id;
    updateLabels();

    var pending = localStorage.getItem('pendingInvite');
    if (pending) {
      localStorage.removeItem('pendingInvite');
      autoConnect(pending);
    } else {
      startOnboarding();
    }
  } catch(e) {
    dbg('[createGoogleUserProfile] ERROR ' + e.message);
    await supa.auth.signOut();
    show('authScreen'); hide('app');
    showMsg('authMsg', 'Error al crear tu cuenta. Intenta de nuevo.', true);
  }
}
