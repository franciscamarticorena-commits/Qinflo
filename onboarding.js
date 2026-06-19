// --- ONBOARDING -----------------------------------------------

var onbCustodyConfig = {};
var onbKidsList = [];
var _coparentWatcher = null;

var ONB_PANELS = [
  'onbPanelDisclaimer',
  'onbPanelType', 'onbPanelAltWeeks', 'onbPanelFixedDays',
  'onbPanelCustom', 'onbPanelUndefined', 'onbPanelLocation',
  'onbPanelKids', 'onbPanelInvite'
];

var ONB_DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function parseDateInput(str) {
  if (!str) return '';
  var s = str.replace(/\s/g, '');
  var parts = s.split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    var d = parts[0].padStart(2, '0');
    var m = parts[1].padStart(2, '0');
    var y = parts[2];
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return y + '-' + m + '-' + d;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

function _todayDDMMAAAA() {
  var t = new Date();
  return String(t.getDate()).padStart(2, '0') + '/' + String(t.getMonth() + 1).padStart(2, '0') + '/' + t.getFullYear();
}

function _initOnbHourSelect() {
  var hSel = $('onbChangeHour');
  if (!hSel || hSel.options.length > 0) return;
  for (var h = 0; h < 24; h++) {
    var opt = document.createElement('option');
    opt.value = String(h).padStart(2, '0');
    opt.textContent = String(h).padStart(2, '0');
    hSel.appendChild(opt);
  }
  hSel.value = '08';
}

function startOnboarding() {
  hide('authScreen'); hide('app'); hide('connectScreen');
  if ($('coparentWelcomeScreen')) hide('coparentWelcomeScreen');
  show('onboardingScreen');
  onbCustodyConfig = {};
  onbKidsList = [];
  _coparentWatcher = null;
  _initOnbHourSelect();
  renderOnbFixedDaysTable();
  renderOnbAltDays();
  showOnbPanel('onbPanelDisclaimer');
  if ($('onbProgressFill')) $('onbProgressFill').style.width = '0%';
  if ($('onbStepLabel')) $('onbStepLabel').textContent = '';
  if ($('onbStepNum')) $('onbStepNum').textContent = '';
  updateOnbLabels();
}

function onbAcceptDisclaimer() {
  showOnbPanel('onbPanelType');
  updateOnbProgress(1, 4, 'Configuración de cuidado');
}

function showOnbPanel(panelId) {
  ONB_PANELS.forEach(function(id) { if ($(id)) hide(id); });
  if ($(panelId)) show(panelId);
  hideMsg('onbMsg');
}

function updateOnbProgress(step, total, label) {
  if ($('onbProgressFill')) $('onbProgressFill').style.width = (step / total * 100) + '%';
  if ($('onbStepLabel')) $('onbStepLabel').textContent = label || '';
  if ($('onbStepNum')) $('onbStepNum').textContent = 'Paso ' + step + ' de ' + total;
}

function updateOnbLabels() {
  var lbl1 = p1(), lbl2 = p2();
  var map = {
    onbFWMama: lbl1, onbFWPapa: lbl2,
    onbWTFMama: lbl1, onbWTFPapa: lbl2,
    onbWTCMama: lbl1, onbWTCPapa: lbl2,
    onbAFMama: lbl1, onbAFPapa: lbl2,
    onbLocMama: lbl1, onbLocPapa: lbl2
  };
  Object.keys(map).forEach(function(id) { if ($(id)) $(id).textContent = map[id]; });
}

function selectOnbCustodyType(type) {
  onbCustodyConfig = { type: type };
  if (type === 'alternating_weeks') {
    if ($('onbStartDate') && !$('onbStartDate').value) {
      $('onbStartDate').value = _todayDDMMAAAA();
    }
    showOnbPanel('onbPanelAltWeeks');
    updateOnbProgress(1, 4, 'Semana por medio');
  } else if (type === 'fixed_days') {
    showOnbPanel('onbPanelFixedDays');
    updateOnbProgress(1, 4, 'Días fijos por semana');
  } else if (type === 'custom') {
    showOnbPanel('onbPanelCustom');
    updateOnbProgress(1, 4, 'Calendario personalizado');
  } else {
    showOnbPanel('onbPanelUndefined');
    updateOnbProgress(1, 4, 'Sin rutina definida');
  }
}

function saveOnbAltWeeks() {
  var changeDay = $('onbChangeDay') ? parseInt($('onbChangeDay').value) : 1;
  var hour = $('onbChangeHour') ? $('onbChangeHour').value : '08';
  var min = $('onbChangeMin') ? $('onbChangeMin').value : '00';
  var changeTime = hour + ':' + min;
  var rawStartDate = $('onbStartDate') ? $('onbStartDate').value : '';
  var startDate = parseDateInput(rawStartDate);
  var firstWeekEl = document.querySelector('input[name="onbFirstWeek"]:checked');
  if (!startDate) { showOnbMsg('Ingresa la fecha de inicio en formato DD/MM/AAAA.'); return; }
  if (!firstWeekEl) { showOnbMsg('Indica quién tiene a los niños la primera semana.'); return; }
  Object.assign(onbCustodyConfig, {
    changeDay: changeDay,
    changeTime: changeTime,
    startDate: startDate,
    firstWeek: firstWeekEl.value
  });
  showOnbPanel('onbPanelLocation');
  updateOnbProgress(2, 4, '¿Dónde ocurre el cambio?');
}

function renderOnbFixedDaysTable() {
  var table = $('onbFixedDaysTable');
  if (!table) return;
  var lbl1 = p1(), lbl2 = p2();
  var html = '';
  for (var i = 1; i <= 7; i++) {
    var dow = i % 7;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">' +
      '<span style="font-size:13px;font-weight:600;color:var(--text);min-width:90px">' + ONB_DAY_NAMES[dow] + '</span>' +
      '<select class="sel" id="onbFixedDay_' + dow + '" style="width:130px">' +
        '<option value="mama">' + lbl1 + '</option>' +
        '<option value="papa">' + lbl2 + '</option>' +
      '</select></div>';
  }
  table.innerHTML = html;
}

function renderOnbAltDays() {
  var el = $('onbAltDays');
  if (!el) return;
  var html = '';
  for (var i = 1; i <= 7; i++) {
    var dow = i % 7;
    html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">' +
      '<input type="checkbox" id="onbAltDay_' + dow + '"/> ' + ONB_DAY_NAMES[dow] + '</label>';
  }
  el.innerHTML = html;
}

function toggleOnbAltSection() {
  var el = document.querySelector('input[name="onbHasAlt"]:checked');
  var sec = $('onbAltSection');
  if (sec) sec.classList.toggle('hidden', !(el && el.value === 'yes'));
}

function saveOnbFixedDays() {
  var schedule = {};
  for (var d = 0; d < 7; d++) {
    var sel = $('onbFixedDay_' + d);
    if (sel) schedule[String(d)] = { parent: sel.value, alternating: false };
  }
  var hasAltEl = document.querySelector('input[name="onbHasAlt"]:checked');
  var hasAlt = hasAltEl && hasAltEl.value === 'yes';
  var altWeekParent = null, altAnchorDate = null;
  if (hasAlt) {
    for (var d2 = 0; d2 < 7; d2++) {
      var cb = $('onbAltDay_' + d2);
      if (cb && cb.checked && schedule[String(d2)]) schedule[String(d2)].alternating = true;
    }
    var altFirstEl = document.querySelector('input[name="onbAltFirst"]:checked');
    if (!altFirstEl) { showOnbMsg('Indica quién tiene los días alternados esta semana.'); return; }
    altWeekParent = altFirstEl.value;
    altAnchorDate = new Date().toISOString().slice(0, 10);
  }
  var whoTodayEl = document.querySelector('input[name="onbWhoTodayFixed"]:checked');
  if (!whoTodayEl) { showOnbMsg('Indica quién tiene a los niños hoy.'); return; }
  Object.assign(onbCustodyConfig, {
    weeklySchedule: schedule,
    hasAlternatingDays: hasAlt,
    alternatingCurrentWeekParent: altWeekParent,
    alternatingAnchorDate: altAnchorDate,
    whoHasThemToday: whoTodayEl.value,
    whoHasTodayDate: new Date().toISOString().slice(0, 10)
  });
  showOnbPanel('onbPanelLocation');
  updateOnbProgress(2, 4, '¿Dónde ocurre el cambio?');
}

function saveOnbCustom() {
  var whoTodayEl = document.querySelector('input[name="onbWhoTodayCustom"]:checked');
  if (!whoTodayEl) { showOnbMsg('Indica quién tiene a los niños hoy.'); return; }
  Object.assign(onbCustodyConfig, {
    whoHasThemToday: whoTodayEl.value,
    whoHasTodayDate: new Date().toISOString().slice(0, 10)
  });
  showOnbPanel('onbPanelLocation');
  updateOnbProgress(2, 4, '¿Dónde ocurre el cambio?');
}

function goToOnbKids() {
  showOnbPanel('onbPanelKids');
  updateOnbProgress(3, 4, 'Hijos');
}

function toggleOnbLocationOther() {
  var locEl = document.querySelector('input[name="onbLocation"]:checked');
  var other = $('onbLocationOther');
  if (other) other.classList.toggle('hidden', !(locEl && locEl.value === 'other'));
}

function saveOnbLocation() {
  var locEl = document.querySelector('input[name="onbLocation"]:checked');
  Object.assign(onbCustodyConfig, {
    changeLocation: locEl ? locEl.value : null,
    changeLocationOther: (locEl && locEl.value === 'other' && $('onbLocationOther')) ? $('onbLocationOther').value : ''
  });
  goToOnbKids();
}

function updateOnbKidAge() {
  var raw = $('onbKidBirth') ? $('onbKidBirth').value : '';
  var iso = parseDateInput(raw);
  if ($('onbKidAgeDisplay')) $('onbKidAgeDisplay').textContent = iso ? calcAge(iso) + ' años' : '';
}

function addOnbKid() {
  var name = $('onbKidName') ? $('onbKidName').value.trim() : '';
  var rawBirth = $('onbKidBirth') ? $('onbKidBirth').value : '';
  var birth = parseDateInput(rawBirth);
  if (!name) { showOnbMsg('El nombre del niño es requerido.'); return; }
  onbKidsList.push({ name: name, birthDate: birth || null, age: birth ? calcAge(birth) + ' años' : '' });
  if ($('onbKidName')) $('onbKidName').value = '';
  if ($('onbKidBirth')) $('onbKidBirth').value = '';
  if ($('onbKidAgeDisplay')) $('onbKidAgeDisplay').textContent = '';
  renderOnbKidsList();
  hideMsg('onbMsg');
}

function removeOnbKid(i) {
  onbKidsList.splice(i, 1);
  renderOnbKidsList();
}

function renderOnbKidsList() {
  var el = $('onbKidsList');
  if (!el) return;
  el.innerHTML = onbKidsList.map(function(k, i) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0">' + k.name.charAt(0).toUpperCase() + '</div>' +
      '<div style="flex:1"><div style="font-weight:600;font-size:13px">' + k.name + '</div>' + (k.age ? '<div style="font-size:11px;color:var(--text-s)">' + k.age + '</div>' : '') + '</div>' +
      '<button onclick="removeOnbKid(' + i + ')" style="background:none;border:none;cursor:pointer;color:#e05;font-size:20px;line-height:1;padding:4px 8px">×</button>' +
    '</div>';
  }).join('');
}

async function saveOnbKids() {
  await saveOnboardingData(true);
}

async function skipOnbKids() {
  await saveOnboardingData(false);
}

async function saveOnboardingData(includeKids) {
  try {
    var config = Object.assign({}, onbCustodyConfig, {
      configuredAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // specialRules: estructura reservada para lógica futura de fechas especiales.
    // La lógica de prioridad (ej. Navidad con papá si esta semana era de mamá) no está
    // implementada — solo se persiste la estructura para no tener que migrar el schema después.
    var specialRules = {
      mothersDay:  { enabled: false, override: null },
      fathersDay:  { enabled: false, override: null },
      christmas:   { enabled: false, override: null },
      newYear:     { enabled: false, override: null },
      vacations:   []
    };
    await db.collection('families').doc(FAMILY_ID).update({ custodyConfig: config, specialRules: specialRules });
    if (config.type === 'alternating_weeks' || config.type === 'fixed_days') {
      await generateOnbCalendar(config, FAMILY_ID);
    }
    if (includeKids && onbKidsList.length > 0) {
      await Promise.all(onbKidsList.map(function(kid) {
        return db.collection('families').doc(FAMILY_ID).collection('children').add(
          Object.assign({}, kid, { createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: USER ? USER.uid : null })
        );
      }));
    }
    showOnbPanel('onbPanelInvite');
    updateOnbProgress(4, 4, 'Invitar al otro padre/madre');
    buildOnbInviteLink();
  } catch(e) {
    console.error('[onboarding save]', e);
    showOnbMsg('Error guardando la configuración. Intenta de nuevo.');
  }
}

function buildOnbInviteLink() {
  if (!USERDATA || !USERDATA.inviteCode) return;
  var baseUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
  var link = baseUrl + '?invite=' + USERDATA.inviteCode;
  if ($('onbInviteLinkDisplay')) $('onbInviteLinkDisplay').textContent = link;
  if ($('onbWhatsappBtn')) {
    $('onbWhatsappBtn').onclick = function() {
      var msg = encodeURIComponent('Hola! Te invito a conectarte en Qinflo para coordinar el cuidado de nuestros hijos. Entra aquí: ' + link);
      window.open('https://wa.me/?text=' + msg, '_blank');
    };
  }
  _watchForCoparentJoin();
}

function _watchForCoparentJoin() {
  if (_coparentWatcher || !USER) return;
  _coparentWatcher = db.collection('users').doc(USER.uid).onSnapshot(function(snap) {
    if (!snap.exists) return;
    var data = snap.data();
    if (data.coparentId && !USERDATA.coparentId) {
      if (typeof _coparentWatcher === 'function') { _coparentWatcher(); _coparentWatcher = null; }
      USERDATA.coparentId = data.coparentId;
      db.collection('users').doc(data.coparentId).get().then(function(co) {
        var coName = co.exists && co.data().name ? co.data().name.split(' ')[0] : 'Tu co-padre/madre';
        if (co.exists) CODATA = co.data();
        var waitEl = $('onbWaitingForCoparent');
        if (waitEl) waitEl.style.display = 'none';
        var connEl = $('onbCoparentConnected');
        if (connEl) {
          connEl.classList.remove('hidden');
          connEl.textContent = '🎉 ¡' + coName + ' se conectó! Entrando…';
        }
        setTimeout(function() { finishOnboarding(); }, 1800);
      }).catch(function() { finishOnboarding(); });
    }
  });
}

async function finishOnboarding() {
  if (typeof _coparentWatcher === 'function') { _coparentWatcher(); _coparentWatcher = null; }
  try {
    await db.collection('users').doc(USER.uid).update({ onboardingCompleted: true });
    USERDATA.onboardingCompleted = true;
  } catch(e) {
    console.error('[onboarding finish]', e);
  }
  hide('onboardingScreen');
  loadApp();
}

function showOnbMsg(txt) { showMsg('onbMsg', txt, true); }

// --- CALENDAR GENERATION -------------------------------------

async function generateOnbCalendar(config, familyId) {
  var today = new Date();
  var writes = [];
  for (var m = 0; m < 24; m++) {
    var target = new Date(today.getFullYear(), today.getMonth() + m, 1);
    var year = target.getFullYear();
    var month = target.getMonth();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var custody = {};
    for (var day = 1; day <= daysInMonth; day++) {
      var date = new Date(year, month, day);
      var c = getOnbCustodyForDate(date, config);
      if (c) custody[String(day)] = c;
    }
    var key = year + '-' + String(month + 1).padStart(2, '0');
    writes.push(
      db.collection('families').doc(familyId).collection('calendar').doc(key)
        .set({ custody: custody }, { merge: true })
    );
  }
  await Promise.all(writes);
}

function getOnbCustodyForDate(date, config) {
  if (!config || config.type === 'undefined' || config.type === 'custom') return null;

  if (config.type === 'alternating_weeks') {
    // Parse startDate as LOCAL midnight to match how date objects are created below.
    // new Date('YYYY-MM-DD') parses as UTC midnight; in UTC-3/4 that rolls back to the
    // previous local day, shifting every 7-day block boundary by one day and causing
    // Sunday to land in the wrong block.
    var sp = config.startDate.split('-');
    var start = new Date(Number(sp[0]), Number(sp[1]) - 1, Number(sp[2]));
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var diff = Math.round((d - start) / 86400000);
    if (diff < 0) return null;
    var week = Math.floor(diff / 7);
    var isFirst = week % 2 === 0;
    if (date.getDay() === config.changeDay) return 'transition';
    var parent = isFirst ? config.firstWeek : (config.firstWeek === 'mama' ? 'papa' : 'mama');
    return parent;
  }

  if (config.type === 'fixed_days') {
    var dow = date.getDay();
    var dc = config.weeklySchedule && config.weeklySchedule[String(dow)];
    if (!dc) return null;
    if (!dc.alternating) return dc.parent;
    if (!config.alternatingAnchorDate || !config.alternatingCurrentWeekParent) return dc.parent;
    var anchor = new Date(config.alternatingAnchorDate);
    anchor.setHours(0, 0, 0, 0);
    var d2 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var weeksDiff = Math.floor(Math.round((d2 - anchor) / 86400000) / 7);
    var isAnchorWeek = weeksDiff % 2 === 0;
    return isAnchorWeek
      ? config.alternatingCurrentWeekParent
      : (config.alternatingCurrentWeekParent === 'mama' ? 'papa' : 'mama');
  }

  return null;
}

// --- COPARENT WELCOME ----------------------------------------

async function showCoparentWelcome() {
  hide('authScreen'); hide('app'); hide('connectScreen'); hide('onboardingScreen');
  show('coparentWelcomeScreen');
  if ($('copInviterName') && CODATA && CODATA.name) {
    $('copInviterName').textContent = CODATA.name.split(' ')[0];
  }
  try {
    var famSnap = await db.collection('families').doc(FAMILY_ID).get();
    if (famSnap.exists) {
      var cfg = famSnap.data().custodyConfig;
      var labels = { alternating_weeks: 'Semana por medio', fixed_days: 'Días fijos', custom: 'Calendario personalizado', undefined: 'Sin rutina definida' };
      if ($('copCustodyType')) $('copCustodyType').textContent = cfg ? (labels[cfg.type] || 'Por configurar') : 'Por configurar';
      if ($('copChangeDay') && cfg && cfg.changeDay != null) {
        $('copChangeDay').textContent = ONB_DAY_NAMES[cfg.changeDay] || '';
        if ($('copChangeDayRow')) $('copChangeDayRow').classList.remove('hidden');
      }
    }
  } catch(e) { console.error('[cop welcome]', e); }
  if ($('copKidsList')) {
    $('copKidsList').textContent = children && children.length > 0
      ? children.map(function(k) { return k.name; }).join(', ')
      : 'Aún no hay hijos registrados';
  }
}

async function acceptCoparentInvite() {
  try {
    await db.collection('users').doc(USER.uid).update({ onboardingCompleted: true });
    USERDATA.onboardingCompleted = true;
  } catch(e) { console.error('[cop accept]', e); }
  hide('coparentWelcomeScreen');
  loadApp();
}
