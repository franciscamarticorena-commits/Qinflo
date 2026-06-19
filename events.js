// --- EVENTOS -------------------------------------------------

var EVENT_CATEGORIES = {
  salud: 'Salud', colegio: 'Colegio', actividad: 'Actividad',
  cumpleanos: 'Cumpleaños', vacaciones: 'Vacaciones', otro: 'Otro'
};
var EVENT_STATUS_LABELS = {
  pending: 'Pendiente', confirmed: 'Confirmado', done: 'Realizado', cancelled: 'Cancelado'
};
var REMINDER_LABELS = { '2h': '2 h antes', '1d': '1 día antes', '1w': '1 semana antes' };
var CAT_ICONS = {
  salud: '🏥', colegio: '🏫', actividad: '⚽', cumpleanos: '🎂', vacaciones: '✈️', otro: '📋'
};

var editingEventId = null;

function eventsForDay(year, month, day) {
  var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  return events.filter(function(ev) {
    if (ev.date !== dateStr) return false;
    if (ev.status === 'cancelled') return false;
    if (ev.participants === 'mama') return myRole() === 'p1';
    if (ev.participants === 'papa') return myRole() === 'p2';
    return true; // 'both'
  });
}

function openEventForm(eventId) {
  editingEventId = eventId || null;
  var ev = eventId ? events.find(function(e) { return e.id === eventId; }) : null;
  var dateStr = selDay
    ? calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(selDay).padStart(2, '0')
    : new Date().toISOString().slice(0, 10);
  if ($('evTitle')) $('evTitle').value = ev ? (ev.title || '') : '';
  if ($('evDate')) $('evDate').value = ev ? (ev.date || dateStr) : dateStr;
  if ($('evTime')) $('evTime').value = ev ? (ev.time || '') : '';
  if ($('evCat')) $('evCat').value = ev ? (ev.category || 'otro') : 'otro';
  if ($('evParticipants')) {
    $('evParticipants').value = ev ? (ev.participants || 'both') : 'both';
    if ($('evOptMama')) $('evOptMama').textContent = p1();
    if ($('evOptPapa')) $('evOptPapa').textContent = p2();
  }
  if ($('evDescription')) $('evDescription').value = ev ? (ev.description || '') : '';
  if ($('evReminder')) $('evReminder').value = ev ? (ev.reminder || '') : '';
  if ($('evRequiresApproval')) $('evRequiresApproval').checked = ev ? !!ev.requiresApproval : false;
  if ($('evFormTitle')) $('evFormTitle').textContent = eventId ? 'Editar evento' : 'Nuevo evento';
  updateEventFormUI();
  show('evModal');
}

function closeEventForm() {
  hide('evModal');
  editingEventId = null;
}

function updateEventFormUI() {
  var participants = $('evParticipants') ? $('evParticipants').value : 'both';
  var row = $('evApprovalRow');
  if (row) row.classList.toggle('hidden', participants !== 'both');
}

async function saveEvent() {
  var title = $('evTitle') ? $('evTitle').value.trim() : '';
  var date = $('evDate') ? $('evDate').value : '';
  if (!title || !date) { alert('Título y fecha son obligatorios.'); return; }
  if (!FAMILY_ID) return;
  var participants = $('evParticipants') ? $('evParticipants').value : 'both';
  var requiresApproval = participants === 'both' && !!($('evRequiresApproval') && $('evRequiresApproval').checked);
  var data = {
    title: title,
    date: date,
    time: $('evTime') ? $('evTime').value : '',
    category: $('evCat') ? $('evCat').value : 'otro',
    participants: participants,
    description: $('evDescription') ? $('evDescription').value.trim() : '',
    reminder: $('evReminder') ? $('evReminder').value : '',
    requiresApproval: requiresApproval
  };
  try {
    if (editingEventId) {
      data.modifiedBy = USER ? USER.uid : null;
      data.modifiedAt = firebase.firestore.FieldValue.serverTimestamp();
      await famCol('events').doc(editingEventId).update(data);
    } else {
      data.status = requiresApproval ? 'pending' : 'confirmed';
      data.approvalStatus = requiresApproval ? 'pending' : null;
      data.createdBy = USER ? USER.uid : null;
      data.createdByRole = myRole();
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.modifiedBy = null; data.modifiedAt = null;
      data.cancelledBy = null; data.cancelledAt = null;
      data.approvedBy = null; data.approvedAt = null;
      data.rejectedBy = null; data.rejectedAt = null;
      await famCol('events').add(data);
      if (typeof logActivity === 'function') {
        logActivity('event_created', myLabel() + ' creó el evento: ' + title + ' (' + date + ')', { title: title, date: date });
      }
    }
    closeEventForm();
  } catch(e) {
    console.error('[saveEvent]', e);
    alert('Error al guardar. Intenta de nuevo.');
  }
}

async function updateEventStatus(eventId, status) {
  var update = {
    status: status,
    modifiedBy: USER ? USER.uid : null,
    modifiedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (status === 'cancelled') {
    update.cancelledBy = USER ? USER.uid : null;
    update.cancelledAt = firebase.firestore.FieldValue.serverTimestamp();
  }
  try {
    await famCol('events').doc(eventId).update(update);
  } catch(e) { console.error('[updateEventStatus]', e); }
}

async function approveEvent(eventId) {
  var ev = events.find(function(e) { return e.id === eventId; });
  if (!ev || ev.approvalStatus !== 'pending') return;
  try {
    await famCol('events').doc(eventId).update({
      status: 'confirmed', approvalStatus: 'approved',
      approvedBy: USER ? USER.uid : null,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      modifiedBy: USER ? USER.uid : null,
      modifiedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (typeof logActivity === 'function') {
      logActivity('event_approved', myLabel() + ' confirmó el evento: ' + (ev.title || '') + ' (' + (ev.date || '') + ')', { eventId: eventId });
    }
  } catch(e) { console.error('[approveEvent]', e); }
}

async function rejectEvent(eventId) {
  var ev = events.find(function(e) { return e.id === eventId; });
  if (!ev || ev.approvalStatus !== 'pending') return;
  try {
    await famCol('events').doc(eventId).update({
      status: 'cancelled', approvalStatus: 'rejected',
      rejectedBy: USER ? USER.uid : null,
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      modifiedBy: USER ? USER.uid : null,
      modifiedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (typeof logActivity === 'function') {
      logActivity('event_rejected', myLabel() + ' rechazó el evento: ' + (ev.title || '') + ' (' + (ev.date || '') + ')', { eventId: eventId });
    }
  } catch(e) { console.error('[rejectEvent]', e); }
}

function renderEventsForDay(day) {
  var dayEvs = eventsForDay(calYear, calMonth, day);
  if (!dayEvs.length) return '';
  return dayEvs.map(function(ev) {
    var cat = EVENT_CATEGORIES[ev.category] || 'Otro';
    var icon = CAT_ICONS[ev.category] || '📋';
    var time = ev.time || '';
    var reminder = ev.reminder ? REMINDER_LABELS[ev.reminder] : '';
    var participantsLbl = ev.participants === 'mama' ? p1() : ev.participants === 'papa' ? p2() : 'Ambos';
    var statusBadge = '';
    if (ev.requiresApproval && ev.approvalStatus === 'pending') {
      statusBadge = '<span style="background:#FEF3C7;color:#D97706;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Pend. confirmación</span>';
    } else if (ev.status === 'done') {
      statusBadge = '<span style="background:#DCFCE7;color:#166534;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Realizado ✓</span>';
    }
    var canEdit = ev.status !== 'cancelled' && ev.status !== 'done';
    var actions = canEdit
      ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn-outline" style="font-size:11px;padding:4px 9px" onclick="openEventForm(\'' + ev.id + '\')">Editar</button>' +
        '<button class="btn-outline" style="font-size:11px;padding:4px 9px" onclick="updateEventStatus(\'' + ev.id + '\',\'done\')">✓ Realizado</button>' +
        '<button class="btn-outline" style="font-size:11px;padding:4px 9px;color:var(--error)" onclick="updateEventStatus(\'' + ev.id + '\',\'cancelled\')">Cancelar</button>' +
        '</div>'
      : '';
    return '<div class="detail-card" style="border-left:3px solid var(--primary)">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
      '<span>' + icon + '</span>' +
      '<strong style="font-size:14px">' + ev.title + '</strong>' +
      statusBadge + '</div>' +
      '<div style="font-size:12px;color:var(--text-s)">' +
      cat + (time ? ' · ' + time : '') + ' · ' + participantsLbl +
      (reminder ? ' · ⏰ ' + reminder : '') + '</div>' +
      (ev.description ? '<div style="font-size:12px;color:var(--text);margin-top:4px;line-height:1.4">' + ev.description + '</div>' : '') +
      actions + '</div>';
  }).join('');
}

function renderEventApprovals() {
  var el = $('eventApprovals');
  if (!el) return;
  var pendingForMe = events.filter(function(ev) {
    return ev.requiresApproval && ev.approvalStatus === 'pending' && ev.createdBy !== (USER && USER.uid);
  });
  var pendingByMe = events.filter(function(ev) {
    return ev.requiresApproval && ev.approvalStatus === 'pending' && ev.createdBy === (USER && USER.uid);
  });
  if (!pendingForMe.length && !pendingByMe.length) { el.innerHTML = ''; return; }
  el.innerHTML = '';
  pendingForMe.forEach(function(ev) {
    var icon = CAT_ICONS[ev.category] || '📋';
    var div = document.createElement('div');
    div.className = 'proposal-alert';
    div.innerHTML = '<div><strong>' + icon + ' Evento requiere tu confirmación</strong><br>' +
      '<strong>' + ev.title + '</strong> — ' + (EVENT_CATEGORIES[ev.category] || 'Otro') + '<br>' +
      ev.date + (ev.time ? ' · ' + ev.time : '') +
      (ev.description ? '<br><em style="font-size:12px;color:var(--text-s)">' + ev.description + '</em>' : '') +
      '<div class="proposal-flow-note">Confirma o rechaza para actualizar el calendario.</div>' +
      '</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
      '<button class="btn-sm accept-btn" style="background:var(--success)" onclick="approveEvent(\'' + ev.id + '\')">Confirmar</button>' +
      '<button class="btn-outline reject-btn" onclick="rejectEvent(\'' + ev.id + '\')">Rechazar</button>' +
      '</div>';
    el.appendChild(div);
  });
  pendingByMe.forEach(function(ev) {
    var icon = CAT_ICONS[ev.category] || '📋';
    var div = document.createElement('div');
    div.className = 'proposal-alert';
    div.innerHTML = '<div><strong>' + icon + ' Esperando confirmación</strong><br>' +
      '<strong>' + ev.title + '</strong> — ' + ev.date + (ev.time ? ' · ' + ev.time : '') + '<br>' +
      '<em style="font-size:12px;color:var(--text-s)">Esperando respuesta del otro padre/madre.</em></div>';
    el.appendChild(div);
  });
}

window.renderEventApprovals = renderEventApprovals;
