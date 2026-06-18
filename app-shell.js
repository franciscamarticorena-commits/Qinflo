// --- VISIBLE DEBUG PANEL (phone testing) ---------------------
function dbg(msg) {
  console.log(msg);
  var entry = new Date().toLocaleTimeString('es-CL') + ' ' + msg;
  // persist across reloads so popup-flow logs survive tab reload
  try {
    var saved = JSON.parse(localStorage.getItem('dbgLog') || '[]');
    saved.push(entry);
    if (saved.length > 40) saved = saved.slice(-40);
    localStorage.setItem('dbgLog', JSON.stringify(saved));
  } catch(e) {}
  var overlay = document.getElementById('debugOverlay');
  var lines = document.getElementById('debugLines');
  if (overlay && lines) {
    overlay.style.display = 'block';
    var d = document.createElement('div');
    d.textContent = entry;
    lines.appendChild(d);
    overlay.scrollTop = overlay.scrollHeight;
  }
}

// restore previous session logs on load
(function() {
  try {
    var saved = JSON.parse(localStorage.getItem('dbgLog') || '[]');
    if (!saved.length) return;
    var overlay = document.getElementById('debugOverlay');
    var lines = document.getElementById('debugLines');
    if (!overlay || !lines) return;
    overlay.style.display = 'block';
    var sep = document.createElement('div');
    sep.textContent = '— sesión anterior —';
    sep.style.color = '#888';
    lines.appendChild(sep);
    saved.forEach(function(e) {
      var d = document.createElement('div');
      d.textContent = e;
      d.style.color = '#aaffaa';
      lines.appendChild(d);
    });
    var sep2 = document.createElement('div');
    sep2.textContent = '— sesión actual —';
    sep2.style.color = '#888';
    lines.appendChild(sep2);
    overlay.scrollTop = overlay.scrollHeight;
  } catch(e) {}
  localStorage.removeItem('dbgLog');
})();

dbg('[boot] app-shell loaded');

// --- GOOGLE REDIRECT RESULT (iOS/Safari flow) ----------------
// Must be called on every page load; returns null if no redirect pending.
// onAuthStateChanged fires automatically after a redirect — this is only
// for logging and catching redirect-level errors.
dbg('[google] checking redirect result');
auth.getRedirectResult().then(function(result) {
  if (result && result.user) {
    dbg('[google] redirect result user ' + result.user.uid + ' ' + result.user.email);
  } else {
    dbg('[google] redirect result null (no pending redirect)');
  }
}).catch(function(e) {
  dbg('[google] redirect result ERROR ' + e.code + ' ' + e.message);
  if ($('authMsg')) showMsg('authMsg', errMsg(e.code), true);
});

// --- AUTH LISTENER -------------------------------------------
auth.onAuthStateChanged(function(u) {
  dbg('[auth] state changed ' + (u ? (u.uid + ' ' + u.email) : 'null'));
  USER = u;
  if (!u) {
    show('authScreen');
    document.getElementById('authScreen').style.display = 'flex';
    hide('connectScreen'); hide('app');
    return;
  }
  if (IS_REGISTERING) return;
  var providerIds = u.providerData ? u.providerData.map(function(p) { return p.providerId; }).join(',') : 'unknown';
  dbg('[google] auth state user ' + u.uid + ' ' + u.email + ' providers:' + providerIds);
  hide('authScreen');
  document.getElementById('app').style.display = 'block';

  db.collection('users').doc(u.uid).get().then(async function(snap) {
    if (!snap.exists) {
      var isGoogle = u.providerData && u.providerData.some(function(p) { return p.providerId === 'google.com'; });
      if (isGoogle) {
        try {
          await createGoogleUserProfile(u);
        } catch(e) {
          dbg('[createGoogleUserProfile] ERROR ' + e.message);
          auth.signOut();
          show('authScreen'); hide('app');
          showMsg('authMsg', 'Error al crear tu cuenta. Intenta de nuevo.', true);
        }
        return;
      }
      auth.signOut();
      show('authScreen');
      hide('app');
      showMsg('authMsg', 'No encontramos tu cuenta. Regístrate primero.', true);
      return;
    }

    USERDATA = snap.data();
    FAMILY_ID = USERDATA.familyId;
    if (typeof identifyObservabilityUser === 'function') identifyObservabilityUser(USER, USERDATA);

    // Conectar inviteCode desde URL o localStorage si el usuario aún no tiene coparentId
    var urlParams = new URLSearchParams(window.location.search);
    var inviteCode = urlParams.get('invite') || (!USERDATA.coparentId ? localStorage.getItem('pendingInvite') : null);
    if (inviteCode && !USERDATA.coparentId) {
      localStorage.removeItem('pendingInvite');
      autoConnect(inviteCode);
      return;
    }

    if (USERDATA.coparentId) {
      db.collection('users').doc(USERDATA.coparentId).get().then(function(co) {
        if (co.exists) CODATA = co.data();
        updateLabels();
        loadOrOnboard();
      }).catch(function(e) {
        console.error('[coparent fetch]', e);
        updateLabels();
        loadOrOnboard();
      });
    } else {
      updateLabels();
      loadOrOnboard();
    }
}).catch(function(e) {
  dbg('[app-shell] ERROR ' + e.message);
});
});

function displayNameWithRole(data, role) {
  var nm = data && data.name ? data.name.split(' ')[0] : '';
  var label = role === 'p1' ? p1() : p2();
  return (nm || label) + ' (' + label + ')';
}

function updateLabels() {
  if ($('leg1')) $('leg1').textContent = p1();
  if ($('leg2')) $('leg2').textContent = p2();
  if ($('expOptMama')) $('expOptMama').textContent = 'Pagado por ' + p1();
  if ($('expOptPapa')) $('expOptPapa').textContent = 'Pagado por ' + p2();
  if ($('pctMamaLbl')) $('pctMamaLbl').textContent = p1();
  if ($('pctPapaLbl')) $('pctPapaLbl').textContent = p2();
  if ($('remOptMama')) $('remOptMama').textContent = p1();
  if ($('remOptPapa')) $('remOptPapa').textContent = p2();
  if ($('expPaidBy')) $('expPaidBy').value = myRole() === 'p1' ? 'mama' : 'papa';
  if ($('headerSub')) {
    var sub = USERDATA ? displayNameWithRole(USERDATA, myRole()) : 'by Kindflo';
    if (CODATA && CODATA.name) sub += ' · con ' + CODATA.name.split(' ')[0];
    $('headerSub').textContent = sub;
  }
}

// --- LOAD OR ONBOARD ----------------------------------------
function loadOrOnboard() {
  if (USERDATA && USERDATA.onboardingCompleted === false) {
    if (typeof startOnboarding === 'function') {
      startOnboarding();
    } else {
      loadApp();
    }
  } else {
    loadApp();
  }
}

// --- LOAD APP -----------------------------------------------
function loadApp() {
  try {
    hide('authScreen'); hide('connectScreen'); show('app');
    updateLabels();
    if (!FAMILY_ID) return;
    setupListeners();
    fetchUF();
    renderResources();
    renderQuickReplies();
    renderCalendar();
    checkAndGenerateCalendar();
  } catch(e) {
    console.error('[loadApp crash]', e);
  }
}

function setupListeners() {
  famCol('expenses').orderBy('date', 'desc').onSnapshot(function(s) {
    expenses = s.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderExpenses();
  });
  famCol('messages').orderBy('createdAt', 'asc').onSnapshot(function(s) {
    messages = s.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderMessages();
  });
  famCol('children').onSnapshot(function(s) {
    children = s.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderChildren();
  });
  famCol('agreements').orderBy('date', 'desc').onSnapshot(function(s) {
    agreements = s.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderAgreements();
  });
  famCol('reminders').orderBy('date', 'asc').onSnapshot(function(s) {
    reminders = s.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderReminders();
  });
  famCol('proposals').orderBy('date', 'desc').onSnapshot(function(s) {
    proposals = s.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderProposals();
  });
  famCol('events').orderBy('date', 'asc').onSnapshot(function(s) {
    events = s.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    if (typeof renderEventApprovals === 'function') renderEventApprovals();
    if (selDay && typeof renderDayDetail === 'function') renderDayDetail();
    renderCalendar();
  });
  famCol('calendar').onSnapshot(function(s) {
    custodyMap = {}; calEventsMap = {}; custodyOverridesMap = {};
    s.docs.forEach(function(d) {
      var data = d.data();
      if (data.custody) custodyMap[d.id] = data.custody;
      if (data.events) calEventsMap[d.id] = data.events;
      if (data.custodyOverrides) custodyOverridesMap[d.id] = data.custodyOverrides;
    });
    renderCalendar();
  });
}

// --- EVENT LISTENERS ----------------------------------------
window.addEventListener('DOMContentLoaded', function() {
  lucide.createIcons();

  // Auth
  $('tabLoginBtn').addEventListener('click', switchToLogin);
  $('tabRegisterBtn').addEventListener('click', switchToRegister);
  $('loginBtn').addEventListener('click', doLogin);
  $('registerBtn').addEventListener('click', doRegister);
  $('resetBtn').addEventListener('click', doReset);
  $('forgotBtn').addEventListener('click', switchToForgot);
  $('backBtn').addEventListener('click', switchToLogin);
  if ($('googleLoginBtn')) $('googleLoginBtn').addEventListener('click', doGoogleLogin);
  $('regFamType').addEventListener('change', updateRoleOptions);

  // Connect
  $('skipBtn').addEventListener('click', function() { loadApp(); });

  // App header
  $('inviteBtn').addEventListener('click', showConnectScreen);
  $('logoutBtn').addEventListener('click', function() { auth.signOut(); });

  // Nav tabs
  document.querySelectorAll('#mainNav button').forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab(btn.dataset.tab); });
  });

  // Period filter
  document.querySelectorAll('.period-filter button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      expPeriod = btn.dataset.period;
      document.querySelectorAll('.period-filter button').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderExpenses();
    });
  });

  // Calendar
  $('prevMonthBtn').addEventListener('click', prevMonth);
  $('nextMonthBtn').addEventListener('click', nextMonth);
  if ($('editDayBtn')) $('editDayBtn').addEventListener('click', openEditDay);
  // Filtros de vista del calendario
  document.querySelectorAll('[data-cal-filter]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      calFilter = btn.dataset.calFilter;
      document.querySelectorAll('[data-cal-filter]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderCalendar();
    });
  });
  $('toggleEvBtn').addEventListener('click', function() { openEventForm(null); });
  $('togglePropBtn').addEventListener('click', function() {
    var active = activePendingProposal();
    if (active) {
      var msg = active.createdBy === (USER && USER.uid)
        ? 'Ya tienes una solicitud de cambio pendiente. Debes esperar respuesta antes de crear otra.'
        : 'Tienes una solicitud de cambio pendiente por responder. Debes aprobarla o rechazarla antes de crear una nueva.';
      alert(msg);
      return;
    }
    $('propForm').classList.toggle('hidden');
  });
  $('savePropBtn').addEventListener('click', saveProp);
  $('cancelPropBtn').addEventListener('click', function() { hide('propForm'); });

  // Expenses
  $('toggleExpBtn').addEventListener('click', function() { $('expForm').classList.toggle('hidden'); });
  $('saveExpBtn').addEventListener('click', saveExp);
  $('cancelExpBtn').addEventListener('click', function() { hide('expForm'); });
  $('expCat').addEventListener('change', function(){ updateExpenseSubcats(); updateExpenseTreatmentUI(); });
  if ($('expTreatment')) $('expTreatment').addEventListener('change', updateExpenseTreatmentUI);
  updateExpenseSubcats();
  updateExpenseTreatmentUI();
  $('btnCLP').addEventListener('click', function() { setCurrency('CLP'); });
  $('btnUF').addEventListener('click', function() { setCurrency('UF'); });

  // Messages
  $('sendMsgBtn').addEventListener('click', sendMsg);
  $('msgInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMsg(); });

  // Children
  $('openKidFormBtn').addEventListener('click', function() { openKidForm(null); });
  $('saveKidBtn').addEventListener('click', saveKid);
  if ($('kidBirth')) $('kidBirth').addEventListener('change', function(){ $('kidAge').value = this.value ? calcAge(this.value) + ' años' : ''; });
  $('cancelKidBtn').addEventListener('click', function() { hide('kidForm'); });

  // Agreements
  $('toggleAgrBtn').addEventListener('click', function() { $('agrForm').classList.toggle('hidden'); });
  $('saveAgrBtn').addEventListener('click', saveAgr);
  $('cancelAgrBtn').addEventListener('click', function() { hide('agrForm'); });

  // Reminders
  $('toggleRemBtn').addEventListener('click', function() { $('remForm').classList.toggle('hidden'); });
  $('saveRemBtn').addEventListener('click', saveRem);
  $('cancelRemBtn').addEventListener('click', function() { hide('remForm'); });
});

// --- TABS ---------------------------------------------------
function switchTab(tab) {
  ['calendar', 'expenses', 'messages', 'children', 'agreements', 'reminders', 'recursos'].forEach(function(t) {
    $('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('#mainNav button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}

// --- UF -----------------------------------------------------
function fetchUF() {
  fetch('https://mindicador.cl/api/uf')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      UF = d.serie[0].valor;
      var fecha = new Date(d.serie[0].fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
      $('ufDisplay').textContent = fmtCLP(UF) + ' · ' + fecha;
      $('ufHint').textContent = '1 UF = ' + fmtCLP(UF);
      renderExpenses();
    })
    .catch(function() { $('ufDisplay').textContent = fmtCLP(UF) + ' (referencial)'; });
}
