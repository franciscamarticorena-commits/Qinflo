// --- EVENTOS -------------------------------------------------

var EVENT_CATEGORIES = {
  salud: 'Salud', colegio: 'Colegio', actividad: 'Actividad',
  cumpleanos: 'Cumpleaños', vacaciones: 'Vacaciones', otro: 'Otro'
};
var EVENT_STATUS_LABELS = {
  pending: 'Pendiente', confirmed: 'Confirmado', completed: 'Realizado', cancelled: 'Cancelado'
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
  var participantsDb = participants === 'mama' ? 'p1' : participants === 'papa' ? 'p2' : 'both';
  var requiresApproval = participants === 'both' && !!($('evRequiresApproval') && $('evRequiresApproval').checked);
  var data = {
    title: title,
    date: date,
    time: $('evTime') ? $('evTime').value : '',
    category: $('evCat') ? $('evCat').value : 'otro',
    participants: participantsDb,
    description: $('evDescription') ? $('evDescription').value.trim() : '',
    reminder: $('evReminder') ? $('evReminder').value : '',
    requiresApproval: requiresApproval
  };
  try {
    var error;
    if (editingEventId) {
      ({ error } = await supa.from('events').update({
        title:                  data.title,
        start_at:               data.date + (data.time ? 'T' + data.time + ':00' : 'T00:00:00'),
        category:               data.category,
        participants:           data.participants,
        description:            data.description,
        reminder:               data.reminder || null,
        requires_confirmation:  data.requiresApproval,
        updated_at:             nowISO()
      }).eq('id', editingEventId));
      if (!error && typeof logActivity === 'function') {
        logActivity('event_edited', myLabel() + ' editó el evento: ' + title + ' (' + date + ')', { title: title, date: date });
      }
    } else {
      ({ error } = await supa.from('events').insert({
        family_id:              FAMILY_ID,
        title:                  data.title,
        start_at:               data.date + (data.time ? 'T' + data.time + ':00' : 'T00:00:00'),
        category:               data.category,
        participants:           data.participants,
        description:            data.description,
        reminder:               data.reminder || null,
        requires_confirmation:  data.requiresApproval,
        status:                 requiresApproval ? 'pending' : 'confirmed',
        created_by:             USER ? USER.id : null,
        created_by_role:        myRole()
      }));
      if (!error && typeof logActivity === 'function') {
        logActivity('event_created', myLabel() + ' creó el evento: ' + title + ' (' + date + ')', { title: title, date: date });
      }
    }
    if (error) {
      console.error('[saveEvent]', error);
      alert('No se pudo guardar el evento: ' + error.message);
      return;
    }
    if (typeof loadEvents === 'function') await loadEvents();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderDayDetail === 'function') renderDayDetail();
    closeEventForm();
  } catch(e) {
    console.error('[saveEvent]', e);
    alert('Error al guardar. Intenta de nuevo.');
  }
}

async function updateEventStatus(eventId, status) {
  var ev = events.find(function(e) { return e.id === eventId; });
  try {
    var upd = { status: status, updated_at: nowISO() };
    if (status === 'cancelled') upd.cancelled_at = nowISO();
    var { error } = await supa.from('events').update(upd).eq('id', eventId);
    if (error) {
      console.error('[updateEventStatus]', error);
      alert('No se pudo actualizar el evento: ' + error.message);
      return;
    }
    if (ev) {
      ev.status = status;
      ev.approvalStatus = status === 'confirmed' ? 'approved' : status;
      if (status === 'cancelled') ev.cancelledAt = upd.cancelled_at;
      if (typeof logActivity === 'function') {
        var verb = status === 'cancelled' ? 'canceló' : status === 'completed' ? 'marcó como realizado' : 'actualizó';
        logActivity('event_' + status, myLabel() + ' ' + verb + ' el evento: ' + (ev.title || '') + ' (' + (ev.date || '') + ')', { eventId: eventId });
      }
    }
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderDayDetail === 'function') renderDayDetail();
  } catch(e) {
    console.error('[updateEventStatus]', e);
    alert('Error al actualizar. Intenta de nuevo.');
  }
}

async function approveEvent(eventId) {
  var ev = events.find(function(e) { return e.id === eventId; });
  if (!ev || ev.approvalStatus !== 'pending') return;
  try {
    var { error } = await supa.from('events').update({
      status:     'confirmed',
      updated_at: nowISO()
    }).eq('id', eventId);
    if (error) {
      console.error('[approveEvent]', error);
      alert('No se pudo confirmar el evento: ' + error.message);
      return;
    }
    ev.status = 'confirmed';
    ev.approvalStatus = 'approved';
    if (typeof logActivity === 'function') {
      logActivity('event_approved', myLabel() + ' confirmó el evento: ' + (ev.title || '') + ' (' + (ev.date || '') + ')', { eventId: eventId });
    }
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderDayDetail === 'function') renderDayDetail();
  } catch(e) {
    console.error('[approveEvent]', e);
    alert('Error al confirmar. Intenta de nuevo.');
  }
}

async function rejectEvent(eventId) {
  var ev = events.find(function(e) { return e.id === eventId; });
  if (!ev || ev.approvalStatus !== 'pending') return;
  try {
    var cancelledAt = nowISO();
    var { error } = await supa.from('events').update({
      status:      'cancelled',
      cancelled_at: cancelledAt,
      updated_at:  cancelledAt
    }).eq('id', eventId);
    if (error) {
      console.error('[rejectEvent]', error);
      alert('No se pudo rechazar el evento: ' + error.message);
      return;
    }
    ev.status = 'cancelled';
    ev.approvalStatus = 'cancelled';
    ev.cancelledAt = cancelledAt;
    if (typeof logActivity === 'function') {
      logActivity('event_rejected', myLabel() + ' rechazó el evento: ' + (ev.title || '') + ' (' + (ev.date || '') + ')', { eventId: eventId });
    }
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderDayDetail === 'function') renderDayDetail();
  } catch(e) {
    console.error('[rejectEvent]', e);
    alert('Error al rechazar. Intenta de nuevo.');
  }
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
    var wasEdited = ev.createdAt && ev.updatedAt && (new Date(ev.updatedAt) - new Date(ev.createdAt)) > 5000;
    var statusBadge = '';
    if (pendingForMe || pendingByMe) {
      statusBadge = '<span style="background:#FEF3C7;color:#D97706;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Pend. confirmación</span>';
    } else if (ev.status === 'completed') {
      statusBadge = '<span style="background:#DCFCE7;color:#166534;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Realizado ✓</span>';
    }
    if (wasEdited && ev.status !== 'cancelled') {
      statusBadge += '<span style="background:rgba(0,0,0,.06);color:var(--text-s);font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Editado</span>';
    }
    var actions = '';
    if (pendingForMe) {
      actions = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn-sm" style="background:var(--success);font-size:11px;padding:5px 12px" onclick="approveEvent(\'' + ev.id + '\')">Confirmar</button>' +
        '<button class="btn-outline" style="font-size:11px;padding:5px 12px" onclick="rejectEvent(\'' + ev.id + '\')">Rechazar</button>' +
        '</div>';
    } else if (ev.status !== 'cancelled' && ev.status !== 'completed') {
      actions = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn-outline" style="font-size:11px;padding:4px 9px" onclick="openEventForm(\'' + ev.id + '\')">Editar</button>' +
        (pendingByMe ? '' : '<button class="btn-outline" style="font-size:11px;padding:4px 9px" onclick="updateEventStatus(\'' + ev.id + '\',\'completed\')">✓ Realizado</button>') +
        '<button class="btn-outline" style="font-size:11px;padding:4px 9px;color:var(--error)" onclick="updateEventStatus(\'' + ev.id + '\',\'cancelled\')">Cancelar</button>' +
        '</div>';
    } else if (ev.status === 'cancelled') {
      var cancelledStr = ev.cancelledAt ? new Date(ev.cancelledAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '';
      actions = '<div style="font-size:11px;color:var(--text-s);margin-top:6px">Evento cancelado' + (cancelledStr ? ' · ' + cancelledStr : '') + '</div>';
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
  // Approval actions are handled inline in the day detail panel (renderEventsForDay).
}

window.renderEventApprovals = renderEventApprovals;
