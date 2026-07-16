function dbg(msg) { console.log(msg); }

dbg('[boot] app-shell loaded');

// --- CARGAR DATOS DE USUARIO ---------------------------------
async function loadUserData(userId) {
  // Perfil básico
  var { data: user, error: uErr } = await supa.from('users').select('*').eq('id', userId).single();
  if (uErr || !user) return null;

  // Membresía activa con datos de familia
  // (order + limit 1 en vez de maybeSingle: si por alguna razón hubiera más
  // de una fila, no queremos que la consulta falle y dispare la creación
  // de otra familia — nos quedamos con la más antigua)
  var { data: mbRows, error: mbErr } = await supa
    .from('family_members')
    .select('role, family_id, families(id, name, config, custody_config, special_rules, cal_alg_version, p1_uid, p2_uid)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1);
  var mb = mbRows && mbRows[0];
  if (mbErr || !mb) return null;

  // Coparent (otro miembro activo de la misma familia)
  var { data: coMb } = await supa
    .from('family_members')
    .select('user_id, role, users(id, name, email)')
    .eq('family_id', mb.family_id)
    .neq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  // Token de invitación vigente creado por este usuario
  var { data: invite } = await supa
    .from('invitations')
    .select('token')
    .eq('family_id', mb.family_id)
    .eq('invited_by', userId)
    .eq('status', 'pending')
    .maybeSingle();

  var fam = mb.families;
  var fc  = (fam && fam.config) ? fam.config : { p1Label: 'Mamá', p2Label: 'Papá', type: 'mama_papa' };

  // Estructura compatible con el código existente (camelCase)
  return {
    name:               user.name,
    email:              user.email,
    role:               mb.role,
    familyConfig:       fc,
    familyId:           mb.family_id,
    coparentId:         coMb ? coMb.user_id : null,
    inviteCode:         invite ? invite.token : null,
    onboardingCompleted: user.onboarding_completed,
    quickReplies:       user.quick_replies || [],
    _family:            fam   // datos crudos de familia para calendar, etc.
  };
}

// --- AUTH LISTENER -------------------------------------------
supa.auth.onAuthStateChange(async function(event, session) {
  dbg('[auth] event=' + event + ' user=' + (session ? session.user.id : 'null'));

  if (event === 'PASSWORD_RECOVERY') {
    hide('authScreen'); hide('app');
    show('resetPasswordScreen');
    return;
  }

  var u = session ? session.user : null;
  USER = u;

  if (!u) {
    show('authScreen');
    document.getElementById('authScreen').style.display = 'flex';
    hide('connectScreen'); hide('app');
    return;
  }

  if (IS_REGISTERING || IS_ONBOARDING_ACTIVE) return;

  // Limpiar el token de la URL (Google OAuth lo deja como #access_token=...)
  // para que un refresh no vuelva a procesarlo.
  if (window.location.hash.includes('access_token')) {
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }

  // Ocultar pantalla de auth cuanto antes
  hide('authScreen');
  document.getElementById('app').style.display = 'block';

  try {
    var userData = await loadUserData(u.id);

    if (!userData) {
      // Usuario nuevo: no tiene familia todavía
      var isGoogle = u.app_metadata && u.app_metadata.provider === 'google';
      if (isGoogle) {
        await createGoogleUserProfile(u);
      } else {
        await supa.auth.signOut();
        show('authScreen'); hide('app');
        showMsg('authMsg', 'No encontramos tu cuenta. Regístrate primero.', true);
      }
      return;
    }

    USERDATA   = userData;
    FAMILY_ID  = userData.familyId;

    if (typeof identifyObservabilityUser === 'function') identifyObservabilityUser(USER, USERDATA);

    // Cargar datos del coparent
    if (USERDATA.coparentId) {
      var { data: coUser } = await supa.from('users').select('name, email').eq('id', USERDATA.coparentId).single();
      CODATA = coUser || null;
    }

    // Manejar invite code en URL o localStorage
    var urlParams  = new URLSearchParams(window.location.search);
    var inviteCode = urlParams.get('invite') || (!USERDATA.coparentId ? localStorage.getItem('pendingInvite') : null);
    if (inviteCode && !USERDATA.coparentId) {
      localStorage.removeItem('pendingInvite');
      autoConnect(inviteCode);
      return;
    }

    updateLabels();
    loadOrOnboard();

  } catch(e) {
    dbg('[app-shell] ERROR ' + e.message);
    console.error(e);
  }
});

function displayNameWithRole(data, role) {
  var nm    = data && data.name ? data.name.split(' ')[0] : '';
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
    var lastTab = null;
    try { lastTab = sessionStorage.getItem('qinfloLastTab'); } catch(e) {}
    switchTab(APP_TABS.indexOf(lastTab) !== -1 ? lastTab : 'today');
    if (!FAMILY_ID) return;
    setupListeners();
    setupNotifications();
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

// --- REALTIME + CARGA INICIAL --------------------------------
var _realtimeChannel = null;

async function setupListeners() {
  if (!FAMILY_ID) return;

  // Carga inicial de todos los datos
  await Promise.all([
    loadExpenses(),
    loadMessages(),
    loadChildren(),
    loadAgreements(),
    loadReminders(),
    loadProposals(),
    loadEvents(),
    loadCalendar(),
    loadDocuments(),
    loadSettlements(),
    loadActivity(),
    loadTemporaryOutings(),
    loadCustodyConfirmations()
  ]);

  // Suscripción realtime: un canal por tabla
  if (_realtimeChannel) _realtimeChannel.unsubscribe();

  _realtimeChannel = supa.channel('family-' + FAMILY_ID)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses',        filter: 'family_id=eq.' + FAMILY_ID }, loadExpenses)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages',        filter: 'family_id=eq.' + FAMILY_ID }, loadMessages)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'children',        filter: 'family_id=eq.' + FAMILY_ID }, loadChildren)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agreements',      filter: 'family_id=eq.' + FAMILY_ID }, loadAgreements)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders',       filter: 'family_id=eq.' + FAMILY_ID }, loadReminders)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custody_changes', filter: 'family_id=eq.' + FAMILY_ID }, loadProposals)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events',          filter: 'family_id=eq.' + FAMILY_ID }, loadEvents)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custody_months',  filter: 'family_id=eq.' + FAMILY_ID }, loadCalendar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documents',       filter: 'family_id=eq.' + FAMILY_ID }, loadDocuments)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements',     filter: 'family_id=eq.' + FAMILY_ID }, loadSettlements)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs',   filter: 'family_id=eq.' + FAMILY_ID }, loadActivity)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'temporary_outings', filter: 'family_id=eq.' + FAMILY_ID }, loadTemporaryOutings)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custody_confirmations', filter: 'family_id=eq.' + FAMILY_ID }, loadCustodyConfirmations)
    .subscribe();
}

// --- LOADERS POR TABLA --------------------------------------

async function loadExpenses() {
  var { data } = await supa.from('expenses').select('*').eq('family_id', FAMILY_ID).is('deleted_at', null).order('date', { ascending: false });
  expenses = (data || []).map(function(r) {
    var c = toCamel(r);
    c.paidBy = r.paid_by_role === 'p1' ? 'mama' : 'papa';
    c.paid   = r.status === 'paid';
    return c;
  });
  renderExpenses(); renderToday();
}

async function loadMessages() {
  var { data } = await supa.from('messages').select('*').eq('family_id', FAMILY_ID).order('created_at', { ascending: true });
  messages = (data || []).map(function(r) {
    var c = toCamel(r);
    c.text      = r.content;       // renderMessages usa m.text
    c.createdBy = r.author_id;     // renderMessages compara con USER.id
    c.senderRole = r.author_role;
    c.senderName = r.sender_name;
    return c;
  });
  renderMessages();
}

async function loadChildren() {
  var { data } = await supa.from('children').select('*').eq('family_id', FAMILY_ID).is('deleted_at', null);
  children = rowsToCamel(data);
  renderChildren(); renderToday();
}

async function loadAgreements() {
  var { data } = await supa.from('agreements').select('*').eq('family_id', FAMILY_ID).is('deleted_at', null).order('created_at', { ascending: false });
  agreements = rowsToCamel(data);
  renderAgreements();
}

async function loadReminders() {
  var { data } = await supa.from('reminders').select('*').eq('family_id', FAMILY_ID).is('deleted_at', null).order('date', { ascending: true });
  reminders = (data || []).map(function(r) {
    var c = toCamel(r);
    c.for  = r.assigned_to === 'p1' ? 'mama' : r.assigned_to === 'p2' ? 'papa' : 'both';
    c.done = r.status === 'completed';
    return c;
  });
  renderReminders(); renderToday();
}

async function loadProposals() {
  var { data } = await supa.from('custody_changes').select('*').eq('family_id', FAMILY_ID).order('created_at', { ascending: false });
  proposals = (data || []).map(function(r) {
    var c = toCamel(r);
    // Compatibilidad con campos fromDate/toDate que usa calendar.js
    c.fromDate = r.from_date;
    c.toDate   = r.to_date;
    c.date     = r.from_date;
    c.createdByRole  = r.proposed_by_role;
    c.createdBy      = r.proposed_by;
    c.createdByName  = c.createdByName || '';
    c.requestedToRole = r.requested_to_role;
    return c;
  });
  renderProposals(); renderToday();
}

async function loadEvents() {
  var { data } = await supa.from('events').select('*').eq('family_id', FAMILY_ID).is('deleted_at', null).order('start_at', { ascending: true });
  events = (data || []).map(function(r) {
    var c = toCamel(r);
    // date / time para compatibilidad con renderizado existente
    c.date           = r.start_at ? r.start_at.slice(0, 10) : null;
    c.time           = r.start_at ? r.start_at.slice(11, 16) : null;
    c.requiresApproval = r.requires_confirmation;
    c.approvalStatus = r.status === 'pending' ? 'pending' : (r.status === 'confirmed' ? 'approved' : r.status);
    c.createdByRole  = r.created_by_role;
    c.createdBy      = r.created_by;
    c.participants   = r.participants === 'p1' ? 'mama' : r.participants === 'p2' ? 'papa' : 'both';
    return c;
  });
  if (typeof renderEventApprovals === 'function') renderEventApprovals();
  if (selDay && typeof renderDayDetail === 'function') renderDayDetail();
  renderCalendar(); renderToday();
}

async function loadCalendar() {
  var { data } = await supa.from('custody_months').select('*').eq('family_id', FAMILY_ID);
  custodyMap = {}; calEventsMap = {}; custodyOverridesMap = {};
  (data || []).forEach(function(r) {
    if (r.custody)   custodyMap[r.month_key]         = r.custody;
    if (r.overrides) custodyOverridesMap[r.month_key] = r.overrides;
  });
  renderCalendar(); renderToday();
}

async function loadDocuments() {
  var { data } = await supa.from('documents').select('*').eq('family_id', FAMILY_ID).is('deleted_at', null).order('created_at', { ascending: false });
  documents = rowsToCamel(data);
  renderDocuments();
}

async function loadSettlements() {
  var { data } = await supa.from('settlements').select('*').eq('family_id', FAMILY_ID).order('created_at', { ascending: false });
  settlements = (data || []).map(function(r) {
    var c = toCamel(r);
    c.fromRole = r.from_role === 'p1' ? 'mama' : 'papa';
    c.toRole   = r.to_role   === 'p1' ? 'mama' : 'papa';
    return c;
  });
  renderExpenses();
}

async function loadTemporaryOutings() {
  var { data } = await supa.from('temporary_outings').select('*').eq('family_id', FAMILY_ID).is('deleted_at', null).order('date', { ascending: true });
  temporaryOutings = rowsToCamel(data);
  if (typeof renderCalendar === 'function') renderCalendar();
  renderToday();
}

async function loadCustodyConfirmations() {
  var { data } = await supa.from('custody_confirmations').select('*').eq('family_id', FAMILY_ID).order('confirmed_at', { ascending: false });
  custodyConfirmations = rowsToCamel(data);
  renderToday();
  if (typeof renderDayDetail === 'function' && selDay) renderDayDetail();
}

async function loadActivity() {
  var { data } = await supa.from('activity_logs').select('*, users(name)').eq('family_id', FAMILY_ID).order('created_at', { ascending: false }).limit(20);
  activityLog = (data || []).map(function(r) {
    var c = toCamel(r);
    c.createdBy   = r.actor_user_id;
    c.description = r.summary;
    c.actorName   = r.users ? r.users.name : '';
    return c;
  });
  if (typeof renderTodayActivity === 'function') renderTodayActivity();
}

// --- NOTIFICACIONES -----------------------------------------
async function setupNotifications() {
  // FCM no disponible con Supabase — reservado para implementación futura con Web Push
}

// --- EVENT LISTENERS ----------------------------------------
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
  $('logoutBtn').addEventListener('click', function() { supa.auth.signOut(); });

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
      alert(msg);
      return;
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
  if ($('expPaidBy'))    $('expPaidBy').addEventListener('change', updateExpenseTreatmentUI);
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
  if ($('liquidarBtn'))     $('liquidarBtn').addEventListener('click', liquidarBalance);
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

// --- TABS ---------------------------------------------------
var INFO_SUBTABS = ['agreements', 'recursos', 'documents'];

var APP_TABS = ['today', 'calendar', 'expenses', 'messages', 'children', 'agreements', 'recursos', 'documents', 'info'];

function switchTab(tab) {
  APP_TABS.forEach(function(t) {
    $('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('#mainNav button').forEach(function(b) {
    var isActive = b.dataset.tab === tab ||
      (INFO_SUBTABS.indexOf(tab) !== -1 && b.dataset.tab === 'info');
    b.classList.toggle('active', isActive);
  });
  if (tab === 'today') renderToday();
  if (tab === 'info') lucide.createIcons();
  try { sessionStorage.setItem('qinfloLastTab', tab); } catch(e) {}
}

// --- PROFILE PANEL ------------------------------------------
function openProfilePanel() {
  if ($('profileName') && USERDATA)  $('profileName').textContent  = USERDATA.name || '—';
  if ($('profileEmail') && USER)     $('profileEmail').textContent = USER.email || '—';
  if ($('avatarInitial') && USERDATA && USERDATA.name) {
    $('avatarInitial').textContent = USERDATA.name.charAt(0).toUpperCase();
  }
  $('profilePanel').classList.remove('hidden');
  lucide.createIcons();
}
function closeProfilePanel() {
  $('profilePanel').classList.add('hidden');
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
