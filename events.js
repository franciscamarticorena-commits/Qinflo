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

function _evParticipantsToDb(p) {
  if (p === 'mama') return 'p1';
  if (p === 'papa') return 'p2';
  return p;
}

function _evStatusToDb(s) {
  return s === 'done' ? 'completed' : s;
}

function eventsForDay(year, month, day) {
  var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  return events.filter(function(ev) {
    if (ev.date !== dateStr) return false;
    if (ev.status === 'cancelled') return false;
    if (ev.participants === 'mama') return myRole() === 'p1';
    if (ev.participants === 'papa') return myRole() === 'p2';
    return true;
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
    participants: _evParticipantsToDb(participants),
    description: $('evDescription') ? $('evDescription').value.trim() : '',
    reminder: $('evReminder') ? $('evReminder').value : '',
    requires_approval: requiresApproval
  };
  try {
    if (editingEventId) {
      data.modified_by = USER ? USER.id : null;
      data.modified_at = new Date().toISOString();
      await _supabase.from('events').update(data).eq('id', editingEventId);
    } else {
      data.status = requiresApproval ? 'pending' : 'confirmed';
      data.approval_status = requiresApproval ? 'pending' : null;
      data.created_by = USER ? USER.id : null;
      data.created_by_role = myRole();
      data.family_id = FAMILY_ID;
      data.modified_by = null; data.modified_at = null;
      data.cancelled_by = null; data.cancelled_at = null;
      data.approved_by = null; data.approved_at = null;
      data.rejected_by = null; data.rejected_at = null;
      await _supabase.from('events').insert(data);
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
  var dbStatus = _evStatusToDb(status);
  var update = {
    status: dbStatus,
    modified_by: USER ? USER.id : null,
    modified_at: new Date().toISOString()
  };
  if (status === 'cancelled') {
    update.cancelled_by = USER ? USER.id : null;
    update.cancelled_at = new Date().toISOString();
  }
  try {
    await _supabase.from('events').update(update).eq('id', eventId);
  } catch(e) { console.error('[updateEventStatus]', e); }
}

async function approveEvent(eventId) {
  var ev = events.find(function(e) { return e.id === eventId; });
  if (!ev || ev.approvalStatus !== 'pending') return;
  try {
    await _supabase.from('events').update({
      status: 'confirmed',
      approval_status: 'approved',
      approved_by: USER ? USER.id : null,
      approved_at: new Date().toISOString(),
      modified_by: USER ? USER.id : null,
      modified_at: new Date().toISOString()
    }).eq('id', eventId);
    if (typeof logActivity === 'function') {
      logActivity('event_approved', myLabel() + ' confirmó el evento: ' + (ev.title || '') + ' (' + (ev.date || '') + ')', { eventId: eventId });
    }
  } catch(e) { console.error('[approveEvent]', e); }
}

async function rejectEvent(eventId) {
  var ev = events.find(function(e) { return e.id === eventId; });
  if (!ev || ev.approvalStatus !== 'pending') return;
  try {
    await _supabase.from('events').update({
      status: 'cancelled',
      approval_status: 'rejected',
      rejected_by: USER ? USER.id : null,
      rejected_at: new Date().toISOString(),
      modified_by: USER ? USER.id : null,
      modified_at: new Date().toISOString()
    }).eq('id', eventId);
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
    var time = ev.time || '';
    var reminder = ev.reminder ? REMINDER_LABELS[ev.reminder] : '';
    var participantsLbl = ev.participants === 'mama' ? p1() : ev.participants === 'papa' ? p2() : 'Ambos';
    var pendingForMe = ev.requiresApproval && ev.approvalStatus === 'pending' && ev.createdBy !== (USER && USER.id);
    var pendingByMe  = ev.requiresApproval && ev.approvalStatus === 'pending' && ev.createdBy === (USER && USER.id);
    var statusBadge = '';
    if (pendingForMe || pendingByMe) {
      statusBadge = '<span style="background:#FEF3C7;color:#D97706;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Pend. confirmación</span>';
    } else if (ev.status === 'done') {
      statusBadge = '<span style="background:#DCFCE7;color:#166534;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Realizado ✓</span>';
    }
    var actions = '';
    if (pendingForMe) {
      actions = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn-sm" style="background:var(--success);font-size:11px;padding:5px 12px" onclick="approveEvent(\'' + ev.id + '\')">Confirmar</button>' +
        '<button class="btn-outline" style="font-size:11px;padding:5px 12px" onclick="rejectEvent(\'' + ev.id + '\')">Rechazar</button>' +
        '</div>';
    } else if (!pendingByMe && ev.status !== 'cancelled' && ev.status !== 'done') {
      actions = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn-outline" style="font-size:11px;padding:4px 9px" onclick="openEventForm(\'' + ev.id + '\')">Editar</button>' +
        '<button class="btn-outline" style="font-size:11px;padding:4px 9px" onclick="updateEventStatus(\'' + ev.id + '\',\'done\')">✓ Realizado</button>' +
        '<button class="btn-outline" style="font-size:11px;padding:4px 9px;color:var(--error)" onclick="updateEventStatus(\'' + ev.id + '\',\'cancelled\')">Cancelar</button>' +
        '</div>';
    }
    return '<div class="detail-card" style="border-left:2px solid var(--border)">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
      '<strong style="font-size:13px;color:var(--text)">' + ev.title + '</strong>' +
      statusBadge + '</div>' +
      '<div style="font-size:11px;color:var(--text-s)">' +
      cat + (time ? ' · ' + time : '') + ' · ' + participantsLbl +
      (reminder ? ' · ' + reminder : '') + '</div>' +
      (ev.description ? '<div style="font-size:12px;color:var(--text-s);margin-top:4px;line-height:1.4">' + ev.description + '</div>' : '') +
      actions + '</div>';
  }).join('');
}

function renderEventApprovals() {
  var el = $('eventApprovals');
  if (el) el.innerHTML = '';
}

window.renderEventApprovals = renderEventApprovals;
