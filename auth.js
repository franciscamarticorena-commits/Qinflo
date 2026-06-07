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
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    showMsg('authMsg', errMsg(e.code), true);
  }
}

async function doRegister() {
  hideMsg('authMsg');

  var name = $('regName').value.trim();
  var email = $('regEmail').value.trim();
  var pass = $('regPass').value;
  var pass2 = $('regPass2').value;

  if (!name || !email || !pass || !pass2) {
    showMsg('authMsg', 'Completa todos los campos', true);
    return;
  }

  if (pass !== pass2) {
    showMsg('authMsg', 'Las contraseñas no coinciden', true);
    return;
  }

  if (pass.length < 6) {
    showMsg('authMsg', 'Mínimo 6 caracteres', true);
    return;
  }

  try {
    IS_REGISTERING = true;
    var cred = await auth.createUserWithEmailAndPassword(email, pass);

    await cred.user.updateProfile({
      displayName: name
    });

    var uid = cred.user.uid;
    var ft = $('regFamType').value;
    var role = $('regRole').value;

    var labels = {
      mama_papa: ['Mamá', 'Papá'],
      papa_papa: ['Papá 1', 'Papá 2'],
      mama_mama: ['Mamá 1', 'Mamá 2']
    };

    var fc = {
      type: ft,
      p1Label: labels[ft][0],
      p2Label: labels[ft][1]
    };

    var famRef = await db.collection('families').add({
      adminUid: uid,
      members: [uid],
      memberRoles: {
        [uid]: role
      },
      hasActivePendingInvitation: false,
      config: fc,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    var inviteCode = genCode();

    await db.collection('users').doc(uid).set({
      name: name,
      email: email,
      role: role,
      familyConfig: fc,
      familyId: famRef.id,
      coparentId: null,
      inviteCode: inviteCode,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    IS_REGISTERING = false;
    USERDATA = { name: name, email: email, role: role, familyConfig: fc, familyId: famRef.id, coparentId: null, inviteCode: inviteCode };
    FAMILY_ID = famRef.id;
    updateLabels();
    loadApp();

  } catch(e) {
    IS_REGISTERING = false;
    console.error('REGISTER ERROR', e);
    console.error('CODE', e.code);
    console.error('MESSAGE', e.message);
    showMsg('authMsg', errMsg(e.code), true);
  }
}
async function doReset() {
  hideMsg('authMsg');

  var email = $('resetEmail').value.trim();

  if (!email) {
    showMsg('authMsg', 'Ingresa tu correo', true);
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    showMsg('authMsg', 'Te enviamos un enlace para restablecer tu contraseña.');
  } catch(e) {
    showMsg('authMsg', errMsg(e.code), true);
  }
}
async function doGoogleLogin() {
  hideMsg('authMsg');
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
   await auth.signInWithRedirect(provider);
  } catch (e) {
    showMsg('authMsg', errMsg(e.code), true);
  }
}
// Listeners de auth registrados exclusivamente en app-shell.js DOMContentLoaded.
// forgotBtn, backBtn, resetBtn y googleLoginBtn NO se registran aquí para evitar duplicados.
