// --- CALENDARIO ---------------------------------------------

async function checkAndGenerateCalendar() {
  if (!FAMILY_ID) return;
  // Solo genera si el mes actual no tiene datos de custodia
  if (custodyMap[calKey()] && Object.keys(custodyMap[calKey()]).length > 0) return;
  try {
    var famSnap = await db.collection('families').doc(FAMILY_ID).get();
    if (!famSnap.exists) return;
    var config = famSnap.data().custodyConfig;
    if (!config || config.type === 'undefined' || config.type === 'custom') return;
    if (typeof generateOnbCalendar === 'function') {
      await generateOnbCalendar(config, FAMILY_ID);
    }
  } catch(e) {
    console.error('[checkAndGenerateCalendar]', e);
  }
}

function calKey() { return calYear + '-' + String(calMonth + 1).padStart(2, '0'); }
function getCustody(d) { return custodyMap[calKey()] && custodyMap[calKey()][d] ? custodyMap[calKey()][d] : 'none'; }
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

function cycleCustody() {
  if (!selDay) return;
  var o = ['mama', 'papa', 'transition'];
  var cur = getCustody(selDay);
  setCustody(selDay, o[(o.indexOf(cur) + 1) % 3]);
}

var editDaySelectedVal = null;

function openEditDay() {
  if (!selDay) return;
  editDaySelectedVal = getCustody(selDay);
  if ($('editDayNum')) $('editDayNum').textContent = selDay;
  if ($('editOpt_mama')) $('editOpt_mama').textContent = p1();
  if ($('editOpt_papa')) $('editOpt_papa').textContent = p2();
  ['mama', 'papa', 'transition'].forEach(function(v) {
    var b = $('editOpt_' + v);
    if (b) b.classList.toggle('active', v === editDaySelectedVal);
  });
  if ($('editDayReason')) $('editDayReason').value = '';
  show('editDayForm');
}

function selectEditOpt(val) {
  editDaySelectedVal = val;
  ['mama', 'papa', 'transition'].forEach(function(v) {
    var b = $('editOpt_' + v);
    if (b) b.classList.toggle('active', v === val);
  });
}

async function saveManualOverride() {
  if (!selDay || !FAMILY_ID || !editDaySelectedVal) return;
  var reason = $('editDayReason') ? $('editDayReason').value.trim() : '';
  var key = calKey();
  var update = { custody: {}, custodyOverrides: {} };
  update.custody[String(selDay)] = editDaySelectedVal;
  update.custodyOverrides[String(selDay)] = {
    value: editDaySelectedVal,
    reason: reason,
    overriddenBy: USER ? USER.uid : null,
    overriddenAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await db.collection('families').doc(FAMILY_ID).collection('calendar').doc(key)
    .set(update, { merge: true });
  hide('editDayForm');
  editDaySelectedVal = null;
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
function proposalTouchesDay(pr, day) { return String(pr.fromDay) === String(day) || String(pr.toDay) === String(day); }
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
  ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].forEach(function(d) {
    var el = document.createElement('div');
    el.className = 'cal-day-name';
    el.textContent = d;
    namesEl.appendChild(el);
  });
  var grid = $('calGrid');
  grid.innerHTML = '';
  var days = new Date(calYear, calMonth + 1, 0).getDate();
  var first = new Date(calYear, calMonth, 1).getDay();
  var now = new Date();
  for (var i = 0; i < first; i++) grid.appendChild(document.createElement('div'));
  for (var d = 1; d <= days; d++) {
    var c = getCustody(d);
    var evs = getEvs(d);
    var rems = remindersForDay(d);
    var prop = pendingProposalForDay(d);
    var btn = document.createElement('button');
    btn.className = 'cal-day ' + c;
    if (calYear === now.getFullYear() && calMonth === now.getMonth() && d === now.getDate()) btn.classList.add('today');
    if (selDay === d) btn.classList.add('selected');
    // Filtro de vista: atenuar días que no corresponden al padre filtrado
    if (calFilter !== 'both' && c !== 'none' && c !== calFilter && c !== 'transition') {
      btn.style.opacity = '0.25';
    }
    btn.innerHTML = (prop ? '<span class="prop-flag">Pend.</span>' : '') + '<div class="cal-num">' + d + '</div>' + custodySymbol(c) + (evs.length ? '<div class="event-line" title="Evento"></div>' : '') + (rems.length ? '<div class="reminder-line" title="Recordatorio"></div>' : '');
    (function(day) {
      btn.addEventListener('click', function() { selDay = day; renderCalendar(); renderDayDetail(); });
    })(d);
    grid.appendChild(btn);
  }
  if (selDay) renderDayDetail(); else hide('dayDetail');
}

function renderDayDetail() {
  if (!selDay) { hide('dayDetail'); return; }
  show('dayDetail');
  hide('editDayForm');
  editDaySelectedVal = null;
  $('detailDay').textContent = selDay;
  var evs = getEvs(selDay);
  var rems = remindersForDay(selDay);
  var html = '';
  html += '<div class="detail-card"><strong>Custodia:</strong> ' + (getCustody(selDay) === 'mama' ? p1() : getCustody(selDay) === 'papa' ? p2() : 'Cambio de casa ↔') + '</div>';
  if (evs.length) {
    html += evs.map(function(e, idx) { return '<div class="detail-card"><strong>Evento:</strong> ' + e + '<button class="event-delete-btn" onclick="deleteEvent(' + idx + ')">Borrar</button></div>'; }).join('');
  }
  if (rems.length) {
    html += rems.map(function(r) { return '<div class="detail-card"><strong>Recordatorio:</strong> ' + r.title + '<br><strong>Fecha:</strong> ' + fmtDateTime(r.date) + '<br><strong>Para:</strong> ' + fLbl(r.for) + '</div>'; }).join('');
  }
  var dayProps = proposalsForDay(selDay);
  dayProps.forEach(function(pr) {
    var status = pr.status === 'pending' ? 'Pendiente de respuesta' : pr.status === 'accepted' ? 'Aprobada' : 'Rechazada';
    html += '<div class="detail-card"><strong>Solicitud de cambio de custodia:</strong><br>Día ' + pr.fromDay + ' → Día ' + pr.toDay + '<br><strong>Solicitada por:</strong> ' + proposalRequesterLabel(pr) + '<br><strong>Dirigida a:</strong> ' + proposalRequestedLabel(pr) + '<br><strong>Enviada:</strong> ' + fmtDateTime(pr.createdAt || pr.date) + '<br><strong>Estado:</strong> ' + status + (pr.reason ? '<br><strong>Motivo:</strong> ' + pr.reason : '') + '</div>';
  });
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

async function deleteEvent(idx) {
  if (!selDay || !FAMILY_ID) return;
  var arr = getEvs(selDay).slice();
  arr.splice(idx, 1);
  var key = calKey();
  var update = { events: {} };
  update.events[selDay] = arr;
  await db.collection('families').doc(FAMILY_ID).collection('calendar').doc(key).set(update, { merge: true });
}

async function saveEvent() {
  var v = $('evInput').value.trim();
  if (!v || !selDay || !FAMILY_ID) return;
  var existing = getEvs(selDay);
  var key = calKey();
  var update = { events: {} };
  update.events[selDay] = existing.concat([v]);
  await db.collection('families').doc(FAMILY_ID).collection('calendar').doc(key).set(update, { merge: true });
  $('evInput').value = '';
  hide('evForm');
}

async function saveProp() {
  var from = $('propFrom').value, to = $('propTo').value, reason = $('propReason').value;
  if (!from || !to) return;
  var active = activePendingProposal();
  if (active) {
    alert(active.createdBy === (USER && USER.uid)
      ? 'Ya tienes una solicitud pendiente. Espera respuesta antes de crear otra.'
      : 'Primero debes aprobar o rechazar la solicitud pendiente antes de crear una nueva.');
    hide('propForm');
    updateProposalButtonState();
    return;
  }
  await famCol('proposals').add({
    fromDay: from, toDay: to, reason: reason,
    status: 'pending', date: new Date().toISOString().slice(0, 10),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: USER.uid,
    createdByName: USERDATA ? USERDATA.name : '',
    createdByRole: myRole(),
    requestedToRole: oppositeRole(myRole())
  });
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
    div.innerHTML = '<div><strong>Solicitud de cambio de custodia pendiente</strong><br><strong>' + proposalRequesterLabel(pr) + '</strong> solicita a <strong>' + proposalRequestedLabel(pr) + '</strong><br>Cambio solicitado: Día ' + pr.fromDay + ' → Día ' + pr.toDay + '<br>Enviada: ' + fmtDateTime(pr.createdAt || pr.date) + (pr.reason ? '<br>' + pr.reason : '') + '<div class="proposal-flow-note">Debes aprobar o rechazar esta solicitud antes de crear una nueva.</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-sm accept-btn" style="background:var(--success)">Aceptar</button><button class="btn-outline reject-btn">Rechazar</button></div>';
    div.querySelector('.accept-btn').addEventListener('click', async function() { await famCol('proposals').doc(pr.id).update({ status: 'accepted', respondedAt: firebase.firestore.FieldValue.serverTimestamp(), respondedBy: USER.uid }); setCustody(Number(pr.toDay), 'transition'); });
    div.querySelector('.reject-btn').addEventListener('click', function() { famCol('proposals').doc(pr.id).update({ status: 'rejected', respondedAt: firebase.firestore.FieldValue.serverTimestamp(), respondedBy: USER.uid }); });
    el.appendChild(div);
  });
  pendingSent.forEach(function(pr) {
    var div = document.createElement('div');
    div.className = 'proposal-alert';
    div.innerHTML = '<div><strong>Solicitud de cambio de custodia enviada</strong><br><strong>' + proposalRequesterLabel(pr) + '</strong> solicita a <strong>' + proposalRequestedLabel(pr) + '</strong><br>Cambio solicitado: Día ' + pr.fromDay + ' → Día ' + pr.toDay + '<br>Enviada: ' + fmtDateTime(pr.createdAt || pr.date) + '<br>Esperando respuesta.<div class="proposal-flow-note">Mientras esta solicitud esté pendiente, no se pueden crear nuevas solicitudes.</div></div>';
    el.appendChild(div);
  });
  updateProposalButtonState();
}
window.renderCalendar = renderCalendar;

setTimeout(function () {
  renderCalendar();
}, 300);
