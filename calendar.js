// --- CALENDARIO ---------------------------------------------

// Increment when the custody algorithm changes to force a full calendar regeneration.
var CAL_ALG_VERSION = 2;

async function checkAndGenerateCalendar() {
  if (!FAMILY_ID) return;
  try {
    var famSnap = await db.collection('families').doc(FAMILY_ID).get();
    if (!famSnap.exists) return;
    var data = famSnap.data();
    var config = data.custodyConfig;
    if (!config || config.type === 'undefined' || config.type === 'custom') return;
    // Regenerate if the stored algorithm version is outdated (fixes wrong-Sunday bug),
    // or if the current month simply has no data yet.
    var storedVersion = data.calAlgVersion || 0;
    var monthHasData = custodyMap[calKey()] && Object.keys(custodyMap[calKey()]).length > 0;
    if (storedVersion >= CAL_ALG_VERSION && monthHasData) return;
    if (typeof generateOnbCalendar === 'function') {
      await generateOnbCalendar(config, FAMILY_ID);
      if (storedVersion < CAL_ALG_VERSION) {
        await db.collection('families').doc(FAMILY_ID).update({ calAlgVersion: CAL_ALG_VERSION });
      }
    }
  } catch(e) {
    console.error('[checkAndGenerateCalendar]', e);
  }
}

function calKey() { return calYear + '-' + String(calMonth + 1).padStart(2, '0'); }
function getCustody(d) {
  var key = calKey();
  var mo = custodyOverridesMap[key];
  if (mo && mo[String(d)]) return mo[String(d)].value;
  return custodyMap[key] && custodyMap[key][d] ? custodyMap[key][d] : 'none';
}
function getEvs(d) { return calEventsMap[calKey()] && calEventsMap[calKey()][d] ? calEventsMap[calKey()][d] : []; }
function remindersForDay(day) {
  return reminders.filter(function(r) {
    if (!r.date) return false;
    var rd = new Date(r.date);
    return rd.getFullYear() === calYear && rd.getMonth() === calMonth && rd.getDate() === day && !r.done;
  });
}

function setCustody(d, val) {
  if (!FAMILY_ID) return;
  var key = calKey();
  var update = { custody: {} };
  update.custody[d] = val;
  db.collection('families').doc(FAMILY_ID).collection('calendar').doc(key).set(update, { merge: true });
}

function prevMonth() {
  if (calMonth === 0) { calYear--; calMonth = 11; } else calMonth--;
  selDay = null; renderCalendar();
}
function nextMonth() {
  if (calMonth === 11) { calYear++; calMonth = 0; } else calMonth++;
  selDay = null; renderCalendar();
}


function fmtDateTime(v) {
  try {
    var d = v && v.toDate ? v.toDate() : v ? new Date(v) : new Date();
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch(e) { return ''; }
}
function fmtShortDate(isoStr) {
  try {
    var p = isoStr.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch(e) { return isoStr; }
}
function fmtProposalDates(pr) {
  var from = pr.fromDate ? fmtShortDate(pr.fromDate) : 'día ' + pr.fromDay;
  var to   = pr.toDate   ? fmtShortDate(pr.toDate)   : 'día ' + pr.toDay;
  return from + ' → ' + to;
}
function proposalTouchesDay(pr, day) {
  var dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  if (pr.fromDate === dateStr || pr.toDate === dateStr) return true;
  return String(pr.fromDay) === String(day) || String(pr.toDay) === String(day);
}
function activePendingProposal() { return proposals.find(function(pr) { return pr.status === 'pending'; }); }
function pendingProposalForDay(day) { return proposals.find(function(pr) { return pr.status === 'pending' && proposalTouchesDay(pr, day); }); }
function proposalsForDay(day) { return proposals.filter(function(pr) { return proposalTouchesDay(pr, day); }); }
function roleLabel(role) { return role === 'p1' ? p1() : p2(); }
function oppositeRole(role) { return role === 'p1' ? 'p2' : 'p1'; }
function proposalRequesterLabel(pr) {
  if (pr.createdBy === (USER && USER.uid)) return displayNameWithRole(USERDATA, myRole());
  if (CODATA && pr.createdBy === (USERDATA && USERDATA.coparentId)) return displayNameWithRole(CODATA, oppositeRole(myRole()));
  return (pr.createdByName || roleLabel(pr.createdByRole || 'p1')) + ' (' + roleLabel(pr.createdByRole || 'p1') + ')';
}
function proposalRequestedLabel(pr) {
  var targetRole = pr.requestedToRole || oppositeRole(pr.createdByRole || myRole());
  if (targetRole === myRole()) return displayNameWithRole(USERDATA, myRole());
  if (CODATA && CODATA.name) return displayNameWithRole(CODATA, targetRole);
  return roleLabel(targetRole);
}
function custodySymbol(c) {
  if (c === 'mama') return '<span class="custody-mark mama">M</span>';
  if (c === 'papa') return '<span class="custody-mark papa">P</span>';
  if (c === 'none') return '<span class="custody-mark" style="opacity:0.2">·</span>';
  return '<span class="custody-mark transition">↔</span>';
}

function renderCalendar() {
  var months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if (!$('calMonthTitle')) return;
  $('calMonthTitle').textContent = months[calMonth] + ' ' + calYear;
  // Actualizar labels dinámicos de los botones de filtro
  if ($('calFilterMama')) $('calFilterMama').textContent = p1();
  if ($('calFilterPapa')) $('calFilterPapa').textContent = p2();
  renderProposals();
  var namesEl = $('calDayNames');
  namesEl.innerHTML = '';
  ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach(function(d) {
    var el = document.createElement('div');
    el.className = 'cal-day-name';
    el.textContent = d;
    namesEl.appendChild(el);
  });
  var grid = $('calGrid');
  grid.innerHTML = '';
  var days = new Date(calYear, calMonth + 1, 0).getDate();
  var first = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  var now = new Date();
  for (var i = 0; i < first; i++) grid.appendChild(document.createElement('div'));
  for (var d = 1; d <= days; d++) {
    var c = getCustody(d);
    var rems = remindersForDay(d);
    var prop = pendingProposalForDay(d);
    var hasEv = typeof eventsForDay === 'function' && eventsForDay(calYear, calMonth, d).length > 0;
    var btn = document.createElement('button');
    btn.className = 'cal-day ' + c;
    if (calYear === now.getFullYear() && calMonth === now.getMonth() && d === now.getDate()) btn.classList.add('today');
    if (selDay === d) btn.classList.add('selected');
    if (calFilter !== 'both' && c !== 'none' && c !== calFilter && c !== 'transition') {
      btn.style.opacity = '0.25';
    }
    btn.innerHTML = (prop ? '<span class="prop-flag">Pend.</span>' : '') + '<div class="cal-num">' + d + '</div>' + custodySymbol(c) + (hasEv ? '<div class="event-line" title="Evento"></div>' : '') + (rems.length ? '<div class="reminder-line" title="Recordatorio"></div>' : '');
    (function(day) {
      btn.addEventListener('click', function() { selDay = day; renderCalendar(); renderDayDetail(); });
    })(d);
    grid.appendChild(btn);
  }
  if (selDay) renderDayDetail(); else hide('dayDetail');
}

function _detailSectionHdr(label) {
  return '<div style="font-size:10px;font-weight:700;color:var(--text-s);text-transform:uppercase;letter-spacing:.6px;margin:14px 0 6px;padding-left:2px">' + label + '</div>';
}

function renderDayDetail() {
  if (!selDay) { hide('dayDetail'); return; }
  show('dayDetail');
  setTimeout(function() { $('dayDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 80);
  hide('propForm');
  $('detailDay').textContent = selDay;

  var rems = remindersForDay(selDay);
  var html = '';

  // Custody section
  var custodyVal = getCustody(selDay);
  var custodyLabel, custodyColor;
  if (custodyVal === 'mama') { custodyLabel = p1(); custodyColor = 'var(--accent)'; }
  else if (custodyVal === 'papa') { custodyLabel = p2(); custodyColor = 'var(--primary-d)'; }
  else { custodyLabel = 'Cambio de casa ↔'; custodyColor = 'var(--text)'; }
  html += _detailSectionHdr('Custodia');
  html += '<div class="detail-card" style="font-weight:700;font-size:15px;color:' + custodyColor + '">' + custodyLabel + '</div>';

  // Events section
  if (typeof renderEventsForDay === 'function') {
    var evHtml = renderEventsForDay(selDay);
    if (evHtml) html += _detailSectionHdr('Eventos') + evHtml;
  }

  // Reminders section
  if (rems.length) {
    html += _detailSectionHdr('Avisos');
    html += rems.map(function(r) {
      return '<div class="detail-card">' +
        '<div style="font-weight:600;font-size:13px">' + r.title + '</div>' +
        '<div style="font-size:12px;color:var(--text-s);margin-top:3px">' + fmtDateTime(r.date) + ' · ' + fLbl(r.for) + '</div>' +
        '</div>';
    }).join('');
  }

  // Proposals section
  var dayProps = proposalsForDay(selDay);
  if (dayProps.length) {
    html += _detailSectionHdr('Solicitudes de cambio');
    dayProps.forEach(function(pr) {
      var statusLabel = pr.status === 'pending' ? '⏳ Pendiente' : pr.status === 'accepted' ? '✓ Aprobada' : '✗ Rechazada';
      html += '<div class="detail-card">' +
        '<div style="font-size:13px;font-weight:600">' + fmtProposalDates(pr) + '</div>' +
        '<div style="font-size:12px;color:var(--text-s);margin-top:3px">' +
        proposalRequesterLabel(pr) + ' · ' + fmtDateTime(pr.createdAt || pr.date) + '</div>' +
        '<div style="font-size:12px;margin-top:3px">' + statusLabel +
        (pr.reason ? ' · ' + pr.reason : '') + '</div>' +
        '</div>';
    });
  }

  $('detailEvents').innerHTML = html;
  updateProposalButtonState();
  lucide.createIcons();
}

function updateProposalButtonState() {
  var btn = $('togglePropBtn');
  if (!btn) return;
  var active = activePendingProposal();
  if (!active) {
    btn.disabled = false;
    btn.classList.remove('btn-disabled-proposal');
    btn.innerHTML = '<i data-lucide="refresh-ccw"></i> Proponer cambio';
    return;
  }
  btn.disabled = true;
  btn.classList.add('btn-disabled-proposal');
  var label = active.createdBy === (USER && USER.uid) ? 'Esperando respuesta' : 'Responder solicitud pendiente';
  btn.innerHTML = '<i data-lucide="lock"></i> ' + label;
  hide('propForm');
}

async function saveProp() {
  var fromDate = $('propFrom') ? $('propFrom').value : '';
  var toDate   = $('propTo')   ? $('propTo').value   : '';
  var reason   = $('propReason') ? $('propReason').value.trim() : '';
  if (!fromDate || !toDate) { alert('Selecciona ambas fechas.'); return; }
  var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  var minDate = tomorrow.toISOString().slice(0, 10);
  if (fromDate < minDate || toDate < minDate) {
    alert('Las fechas deben ser a partir de mañana. No es posible solicitar cambios para hoy o días anteriores.');
    return;
  }
  var active = activePendingProposal();
  if (active) {
    alert(active.createdBy === (USER && USER.uid)
      ? 'Ya tienes una solicitud pendiente. Espera respuesta antes de crear otra.'
      : 'Primero debes responder la solicitud pendiente antes de crear una nueva.');
    hide('propForm');
    updateProposalButtonState();
    return;
  }
  var fromParts = fromDate.split('-'), toParts = toDate.split('-');
  await famCol('proposals').add({
    fromDate: fromDate, toDate: toDate,
    fromDay: Number(fromParts[2]), toDay: Number(toParts[2]),
    reason: reason,
    status: 'pending', date: new Date().toISOString().slice(0, 10),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: USER.uid,
    createdByName: USERDATA ? USERDATA.name : '',
    createdByRole: myRole(),
    requestedToRole: oppositeRole(myRole())
  });
  if (typeof logActivity === 'function') {
    logActivity('proposal_created', myLabel() + ' solicitó cambio de custodia: Día ' + from + ' → Día ' + to, { fromDay: from, toDay: to });
  }
  $('propFrom').value = ''; $('propTo').value = ''; $('propReason').value = '';
  hide('propForm');
}

function renderProposals() {
  var el = $('pendingProposals');
  if (!el) return;
  var pendingReceived = proposals.filter(function(p) { return p.status === 'pending' && p.createdBy !== (USER && USER.uid); });
  var pendingSent = proposals.filter(function(p) { return p.status === 'pending' && p.createdBy === (USER && USER.uid); });
  if (!pendingReceived.length && !pendingSent.length) { el.innerHTML = ''; updateProposalButtonState(); return; }
  el.innerHTML = '';
  pendingReceived.forEach(function(pr) {
    var div = document.createElement('div');
    div.className = 'proposal-alert';
    div.innerHTML = '<div><strong>Solicitud de cambio de custodia</strong><br><strong>' + proposalRequesterLabel(pr) + '</strong> solicita a <strong>' + proposalRequestedLabel(pr) + '</strong><br>Cambio: ' + fmtProposalDates(pr) + '<br>Enviada: ' + fmtDateTime(pr.createdAt || pr.date) + (pr.reason ? '<br>' + pr.reason : '') + '<div class="proposal-flow-note">Debes aprobar o rechazar esta solicitud antes de crear una nueva.</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-sm accept-btn" style="background:var(--success)">Aceptar</button><button class="btn-outline reject-btn">Rechazar</button></div>';
    div.querySelector('.accept-btn').addEventListener('click', async function() {
      await famCol('proposals').doc(pr.id).update({ status: 'accepted', respondedAt: firebase.firestore.FieldValue.serverTimestamp(), respondedBy: USER.uid });
      setCustody(Number(pr.toDay), 'transition');
      if (typeof logActivity === 'function') logActivity('proposal_accepted', myLabel() + ' aprobó cambio de custodia: Día ' + pr.fromDay + ' → Día ' + pr.toDay, { proposalId: pr.id });
    });
    div.querySelector('.reject-btn').addEventListener('click', function() {
      famCol('proposals').doc(pr.id).update({ status: 'rejected', respondedAt: firebase.firestore.FieldValue.serverTimestamp(), respondedBy: USER.uid });
      if (typeof logActivity === 'function') logActivity('proposal_rejected', myLabel() + ' rechazó cambio de custodia: Día ' + pr.fromDay + ' → Día ' + pr.toDay, { proposalId: pr.id });
    });
    el.appendChild(div);
  });
  pendingSent.forEach(function(pr) {
    var div = document.createElement('div');
    div.className = 'proposal-alert';
    div.innerHTML = '<div><strong>Solicitud de cambio de custodia enviada</strong><br><strong>' + proposalRequesterLabel(pr) + '</strong> solicita a <strong>' + proposalRequestedLabel(pr) + '</strong><br>Cambio: ' + fmtProposalDates(pr) + '<br>Enviada: ' + fmtDateTime(pr.createdAt || pr.date) + '<br>Esperando respuesta.<div class="proposal-flow-note">Mientras esta solicitud esté pendiente, no se pueden crear nuevas solicitudes.</div></div><div style="margin-top:8px"><button class="btn-outline cancel-prop-btn" style="font-size:11px;padding:5px 12px;color:var(--error)">Retirar solicitud</button></div>';
    div.querySelector('.cancel-prop-btn').addEventListener('click', async function() {
      if (!confirm('¿Retirar esta solicitud de cambio?')) return;
      await famCol('proposals').doc(pr.id).delete();
    });
    el.appendChild(div);
  });
  updateProposalButtonState();
}
window.renderCalendar = renderCalendar;

setTimeout(function () {
  renderCalendar();
}, 300);
