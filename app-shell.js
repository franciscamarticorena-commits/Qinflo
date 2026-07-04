function dbg(msg) { console.log(msg); }
dbg('[boot] app-shell loaded');

// ---- USERDATA synthesis from Supabase tables ----------------
async function loadUserData(userId) {
  var [uRes, mRes] = await Promise.all([
    _supabase.from('users').select('*').eq('id', userId).single(),
    _supabase.from('family_members')
      .select('family_id, role, families(config, custody_config, cal_alg_version)')
      .eq('user_id', userId).eq('status', 'active').maybeSingle()
  ]);
  if (uRes.error || !uRes.data) return null;
  var u = uRes.data;
  if (!mRes.data) {
    return { name: u.name, email: u.email, role: 'p1', familyId: null,
      familyConfig: { type: 'mama_papa', p1Label: 'Mamá', p2Label: 'Papá' },
      coparentId: null, inviteCode: null,
      onboardingCompleted: u.onboarding_completed || false, quickReplies: u.quick_replies || [] };
  }
  var m = mRes.data;
  var famId = m.family_id;
  var fam = m.families || {};
  var config = fam.config || { type: 'mama_papa', p1Label: 'Mamá', p2Label: 'Papá' };
  var [coRes, invRes] = await Promise.all([
    _supabase.from('family_members').select('user_id').eq('family_id', famId).eq('status', 'active').neq('user_id', userId),
    _supabase.from('invitations').select('token').eq('family_id', famId).eq('invited_by', userId).eq('status', 'pending').maybeSingle()
  ]);
  var coparentId = coRes.data && coRes.data.length > 0 ? coRes.data[0].user_id : null;
  return {
    name: u.name, email: u.email, role: m.role, familyId: famId,
    familyConfig: config, coparentId: coparentId,
    inviteCode: invRes.data ? invRes.data.token : null,
    onboardingCompleted: u.onboarding_completed || false,
    quickReplies: u.quick_replies || [],
    custodyConfig: fam.custody_config,
    calAlgVersion: fam.cal_alg_version || 0
  };
}

// ---- AUTH LISTENER ------------------------------------------
_supabase.auth.onAuthStateChange(async function(event, session) {
  dbg('[auth] state changed event=' + event + ' user=' + (session ? session.user.id : 'null'));
  USER = session ? session.user : null;
  if (!USER) {
    show('authScreen');
    document.getElementById('authScreen').style.display = 'flex';
    hide('connectScreen'); hide('app');
    return;
  }
  USER.uid = USER.id;
  if (IS_REGISTERING) return;

  hide('authScreen');
  document.getElementById('app').style.display = 'block';

  try {
    var userData = await loadUserData(USER.id);
    if (!userData) {
      var isGoogle = USER.app_metadata && USER.app_metadata.provider === 'google';
      if (isGoogle) { await createGoogleUserProfile(USER); return; }
      await _supabase.auth.signOut(); show('authScreen'); hide('app');
      showMsg('authMsg', 'No encontramos tu cuenta. Regístrate primero.', true); return;
    }

    USERDATA = userData;
    FAMILY_ID = USERDATA.familyId;
    if (typeof identifyObservabilityUser === 'function') identifyObservabilityUser(USER, USERDATA);

    var urlParams = new URLSearchParams(window.location.search);
    var urlInvite = urlParams.get('invite');
    var pendingInvite = urlInvite || (!USERDATA.coparentId ? localStorage.getItem('pendingInvite') : null);
    if (pendingInvite && !USERDATA.coparentId) {
      localStorage.removeItem('pendingInvite');
      autoConnect(pendingInvite); return;
    }

    if (!FAMILY_ID) {
      var isGoogle2 = USER.app_metadata && USER.app_metadata.provider === 'google';
      if (isGoogle2) { await createGoogleUserProfile(USER); return; }
      startOnboarding(); return;
    }

    if (USERDATA.coparentId) {
      var { data: coData } = await _supabase.from('users').select('name, email').eq('id', USERDATA.coparentId).single();
      if (coData) CODATA = coData;
    }
    updateLabels();
    loadOrOnboard();
  } catch(e) {
    dbg('[app-shell] ERROR ' + e.message);
    console.error(e);
  }
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
    var sub = USERDATA ? displayNameWithRole(USERDATA, myRole()) : 'Qinflo';
    if (CODATA && CODATA.name) sub += ' · con ' + CODATA.name.split(' ')[0];
    $('headerSub').textContent = sub;
  }
  if ($('avatarInitial') && USERDATA && USERDATA.name) {
    $('avatarInitial').textContent = USERDATA.name.charAt(0).toUpperCase();
  }
  if ($('inviteBtn')) $('inviteBtn').classList.toggle('hidden', !!(USERDATA && USERDATA.coparentId));
}

function loadOrOnboard() {
  if (USERDATA && USERDATA.onboardingCompleted === false) {
    if (typeof startOnboarding === 'function') startOnboarding();
    else loadApp();
  } else {
    loadApp();
  }
}

function loadApp() {
  try {
    hide('authScreen'); hide('connectScreen'); show('app');
    updateLabels();
    switchTab('today');
    if (!FAMILY_ID) return;
    setupListeners();
    fetchUF();
    renderResources();
    renderQuickReplies();
    renderCalendar();
    checkAndGenerateCalendar();
    renderToday();
  } catch(e) {
    console.error('[loadApp crash]', e);
  }
}

// ---- REALTIME LISTENERS ------------------------------------
var _channels = [];

function _fetchAndListen(table, orderCol, asc, limit, onData) {
  var q = _supabase.from(table).select('*').eq('family_id', FAMILY_ID).order(orderCol, { ascending: asc });
  if (limit) q = q.limit(limit);
  q.then(function(r) { if (!r.error) onData(r.data || []); });

  var ch = _supabase.channel('rt-' + table + '-' + FAMILY_ID)
    .on('postgres_changes', { event: '*', schema: 'public', table: table, filter: 'family_id=eq.' + FAMILY_ID },
      function() {
        var q2 = _supabase.from(table).select('*').eq('family_id', FAMILY_ID).order(orderCol, { ascending: asc });
        if (limit) q2 = q2.limit(limit);
        q2.then(function(r) { if (!r.error) onData(r.data || []); });
      })
    .subscribe();
  _channels.push(ch);
}

function _processCustody(rows) {
  custodyMap = {}; custodyOverridesMap = {};
  (rows || []).forEach(function(row) {
    var key = row.date.slice(0, 7);
    if (!custodyMap[key]) custodyMap[key] = {};
    var day = parseInt(row.date.slice(8));
    var val = row.custodian === 'p1' ? 'mama' : row.custodian === 'p2' ? 'papa' : row.custodian;
    custodyMap[key][day] = val;
    if (row.is_override) {
      if (!custodyOverridesMap[key]) custodyOverridesMap[key] = {};
      custodyOverridesMap[key][day] = { value: val };
    }
  });
}

function _processProposals(rows) {
  return mapRows(rows).map(function(p) {
    p.createdBy = p.proposedBy || p.createdBy;
    p.createdByRole = p.proposedByRole || p.createdByRole;
    p.fromDay = p.fromDate ? parseInt(p.fromDate.slice(8)) : null;
    p.toDay   = p.toDate   ? parseInt(p.toDate.slice(8))   : null;
    return p;
  });
}

function _processEvents(rows) {
  return mapRows(rows).map(function(ev) {
    if (ev.participants === 'p1') ev.participants = 'mama';
    else if (ev.participants === 'p2') ev.participants = 'papa';
    if (ev.status === 'completed') ev.status = 'done';
    return ev;
  });
}

function _processMessages(rows) {
  return mapRows(rows).map(function(m) {
    m.text = m.content;
    m.senderRole = m.authorRole;
    m.createdBy = m.authorId;
    return m;
  });
}

function setupListeners() {
  _channels.forEach(function(ch) { _supabase.removeChannel(ch); });
  _channels = [];

  _fetchAndListen('expenses', 'date', false, null, function(data) {
    expenses = mapRows(data);
    renderExpenses(); renderToday();
  });

  _fetchAndListen('messages', 'created_at', true, null, function(data) {
    messages = _processMessages(data);
    renderMessages();
  });

  _fetchAndListen('children', 'created_at', true, null, function(data) {
    children = mapRows(data);
    renderChildren(); renderToday();
  });

  _fetchAndListen('agreements', 'date', false, null, function(data) {
    agreements = mapRows(data);
    renderAgreements();
  });

  _fetchAndListen('reminders', 'date', true, null, function(data) {
    reminders = mapRows(data).map(function(r) { r.for = r.assigned; return r; });
    renderReminders(); renderToday();
  });

  _fetchAndListen('custody_changes', 'created_at', false, null, function(data) {
    proposals = _processProposals(data);
    renderProposals(); renderToday();
  });

  _fetchAndListen('events', 'date', true, null, function(data) {
    events = _processEvents(data);
    if (typeof renderEventApprovals === 'function') renderEventApprovals();
    if (selDay && typeof renderDayDetail === 'function') renderDayDetail();
    renderCalendar(); renderToday();
  });

  _fetchAndListen('documents', 'created_at', false, null, function(data) {
    documents = mapRows(data);
    renderDocuments();
  });

  _fetchAndListen('settlements', 'created_at', false, null, function(data) {
    settlements = mapRows(data);
    renderExpenses();
  });

  // Activity logs (limit 20)
  _fetchAndListen('activity_logs', 'created_at', false, 20, function(data) {
    activityLog = mapRows(data);
    if (typeof renderTodayActivity === 'function') renderTodayActivity();
  });

  // Custody calendar — wider range, no family_id filter per row needed
  var custodyFetch = function() {
    _supabase.from('custody_calendar').select('*').eq('family_id', FAMILY_ID)
      .then(function(r) {
        if (!r.error) { _processCustody(r.data || []); renderCalendar(); renderToday(); }
      });
  };
  custodyFetch();
  var custodyCh = _supabase.channel('rt-custody_calendar-' + FAMILY_ID)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custody_calendar', filter: 'family_id=eq.' + FAMILY_ID },
      custodyFetch)
    .subscribe();
  _channels.push(custodyCh);
}

// ---- EVENT LISTENERS ----------------------------------------
window.addEventListener('DOMContentLoaded', function() {
  lucide.createIcons();
  if (typeof initTheme === 'function') initTheme();

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
  $('avatarBtn').addEventListener('click', openProfilePanel);
  $('logoutBtn').addEventListener('click', function() { _supabase.auth.signOut(); });

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
      var msg = active.createdBy === (USER && USER.id)
        ? 'Ya tienes una solicitud de cambio pendiente. Debes esperar respuesta antes de crear otra.'
        : 'Tienes una solicitud de cambio pendiente por responder. Debes aprobarla o rechazarla antes de crear una nueva.';
      alert(msg); return;
    }
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var minDate = tomorrow.toISOString().slice(0, 10);
    if ($('propFrom')) $('propFrom').min = minDate;
    if ($('propTo'))   $('propTo').min   = minDate;
    $('propForm').classList.toggle('hidden');
  });
  $('savePropBtn').addEventListener('click', saveProp);
  $('cancelPropBtn').addEventListener('click', function() { hide('propForm'); });

  // Expenses
  $('toggleExpBtn').addEventListener('click', function() {
    var willOpen = $('expForm').classList.contains('hidden');
    if (willOpen) _resetExpForm();
    $('expForm').classList.toggle('hidden');
    if (willOpen) $('expForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('saveExpBtn').addEventListener('click', saveExp);
  $('cancelExpBtn').addEventListener('click', function() { _resetExpForm(); hide('expForm'); });
  $('expCat').addEventListener('change', function(){ updateExpenseSubcats(); updateExpenseTreatmentUI(); });
  if ($('expTreatment')) $('expTreatment').addEventListener('change', updateExpenseTreatmentUI);
  if ($('expPaidBy')) $('expPaidBy').addEventListener('change', updateExpenseTreatmentUI);
  if ($('expAttachToggle')) $('expAttachToggle').addEventListener('click', function() {
    var box = $('expAttachBox');
    var isOpen = box.style.display === 'grid';
    box.style.display = isOpen ? 'none' : 'grid';
    this.textContent = isOpen ? '📎 Adjuntar archivos (opcional)' : '📎 Adjuntar archivos ▲';
  });
  [$('expDesc'), $('expAmount')].forEach(function(el) {
    if (el) el.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveExp(); });
  });
  updateExpenseSubcats();
  updateExpenseTreatmentUI();
  $('btnCLP').addEventListener('click', function() { setCurrency('CLP'); });
  $('btnUF').addEventListener('click', function() { setCurrency('UF'); });
  if ($('liquidarBtn')) $('liquidarBtn').addEventListener('click', liquidarBalance);
  if ($('exportResumenBtn')) $('exportResumenBtn').addEventListener('click', exportarResumen);

  // Messages
  $('sendMsgBtn').addEventListener('click', sendMsg);
  $('msgInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMsg(); });

  // Children
  $('openKidFormBtn').addEventListener('click', function() { openKidForm(null); });
  $('saveKidBtn').addEventListener('click', saveKid);
  if ($('kidBirth')) $('kidBirth').addEventListener('change', function(){ $('kidAge').value = this.value ? calcAge(this.value) + ' años' : ''; });
  $('cancelKidBtn').addEventListener('click', function() { hide('kidForm'); });

  // Agreements
  $('toggleAgrBtn').addEventListener('click', function() {
    var willOpen = $('agrForm').classList.contains('hidden');
    if (willOpen) _resetAgrForm();
    $('agrForm').classList.toggle('hidden');
  });
  $('saveAgrBtn').addEventListener('click', saveAgr);
  $('cancelAgrBtn').addEventListener('click', function() { _resetAgrForm(); hide('agrForm'); });

  // Reminders
  $('toggleRemBtn').addEventListener('click', function() {
    var willOpen = $('remForm').classList.contains('hidden');
    if (willOpen) {
      editingRemId = null;
      $('remTitle').value = ''; $('remDate').value = '';
      var hdr = document.querySelector('#remForm p');
      if (hdr) hdr.textContent = 'Nuevo recordatorio';
    }
    $('remForm').classList.toggle('hidden');
  });
  $('saveRemBtn').addEventListener('click', saveRem);
  $('cancelRemBtn').addEventListener('click', cancelRemForm);

  // Documents
  $('toggleDocBtn').addEventListener('click', function() {
    var willOpen = $('docForm').classList.contains('hidden');
    if (willOpen) _resetDocForm();
    $('docForm').classList.toggle('hidden');
  });
  $('saveDocBtn').addEventListener('click', saveDoc);
  $('cancelDocBtn').addEventListener('click', function() { _resetDocForm(); hide('docForm'); });
});

// ---- TABS --------------------------------------------------
var INFO_SUBTABS = ['children', 'agreements', 'reminders', 'recursos', 'documents'];

function switchTab(tab) {
  ['today', 'calendar', 'expenses', 'messages', 'children', 'agreements', 'reminders', 'recursos', 'documents', 'info'].forEach(function(t) {
    $('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('#mainNav button').forEach(function(b) {
    var isActive = b.dataset.tab === tab || (INFO_SUBTABS.indexOf(tab) !== -1 && b.dataset.tab === 'info');
    b.classList.toggle('active', isActive);
  });
  if (tab === 'today') renderToday();
  if (tab === 'info') lucide.createIcons();
}

// ---- PROFILE PANEL -----------------------------------------
function openProfilePanel() {
  if ($('profileName') && USERDATA) $('profileName').textContent = USERDATA.name || '—';
  if ($('profileEmail') && USER) $('profileEmail').textContent = USER.email || '—';
  if ($('avatarInitial') && USERDATA && USERDATA.name) {
    $('avatarInitial').textContent = USERDATA.name.charAt(0).toUpperCase();
  }
  $('profilePanel').classList.remove('hidden');
  lucide.createIcons();
}
function closeProfilePanel() { $('profilePanel').classList.add('hidden'); }

// ---- UF ----------------------------------------------------
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
