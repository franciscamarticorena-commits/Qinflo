// --- SALIDAS TEMPORALES ---------------------------------------
// Una salida temporal registra que un padre/madre retira a uno o más
// hijos por algunas horas (ej: comida, partido, cine). NUNCA modifica
// el día de custodia base — solo queda como un registro por horas
// dentro de ese día, asociado a child_id(s) específicos. Requiere
// aprobación del otro padre/madre y, una vez creada, no se puede
// editar ni eliminar: queda como hecho fijo, para eso está el rechazo.

function outingsForDay(year, month, day) {
  var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  return (temporaryOutings || []).filter(function(o) { return o.date === dateStr; });
}

// No tiene sentido confirmar "los niños ya están conmigo" antes de que la
// salida siquiera haya empezado -- solo se habilita desde su hora de inicio.
function _outingReadyToConfirm(o) {
  if (!o || !o.date) return true;
  var dt = new Date(o.date + 'T' + (o.startTime || '00:00') + ':00');
  return new Date() >= dt;
}

function _outingChildNames(childIds) {
  return (childIds || []).map(function(id) {
    var c = (children || []).find(function(k) { return k.id === id; });
    return c && c.name ? c.name.trim().split(' ')[0] : '';
  }).filter(Boolean).join(', ');
}

function _populateOutingChildren(selectedIds) {
  var el = $('outChildren');
  if (!el) return;
  if (!children || !children.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-s)">Agrega primero a tus hijos en la pestaña Hijos.</div>';
    return;
  }
  el.innerHTML = children.map(function(c) {
    var checked = selectedIds && selectedIds.indexOf(c.id) !== -1 ? 'checked' : '';
    return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:6px 0">' +
      '<input type="checkbox" class="out-child-chk" value="' + c.id + '" ' + checked + ' style="width:16px;height:16px;accent-color:var(--primary)"/>' +
      '<span>' + (c.name || '') + '</span></label>';
  }).join('');
}

// Redondea a los próximos 30 min para que el campo de hora casi nunca
// necesite tocarse a mano.
function _roundedTimeStr(minsAhead) {
  var d = new Date(Date.now() + (minsAhead || 0) * 60000);
  var m = d.getMinutes() < 30 ? 30 : 0;
  if (m === 0) d.setHours(d.getHours() + 1);
  d.setMinutes(m);
  return String(d.getHours()).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function openOutingForm() {
  var dateStr = selDay
    ? calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(selDay).padStart(2, '0')
    : new Date().toISOString().slice(0, 10);
  if ($('outDate')) $('outDate').value = dateStr;
  if ($('outStart')) $('outStart').value = _roundedTimeStr(0);
  if ($('outEnd')) $('outEnd').value = _roundedTimeStr(120);
  if ($('outWho')) {
    $('outWho').value = myRole();
    if ($('outOptMama')) $('outOptMama').textContent = p1();
    if ($('outOptPapa')) $('outOptPapa').textContent = p2();
  }
  if ($('outReason')) $('outReason').value = '';
  if ($('outFormTitle')) $('outFormTitle').textContent = 'Nueva salida temporal';
  _populateOutingChildren(null);
  show('outingModal');
}

function closeOutingForm() {
  hide('outingModal');
}

async function saveOuting() {
  var date = $('outDate') ? $('outDate').value : '';
  var startTime = $('outStart') ? $('outStart').value : '';
  var endTime = $('outEnd') ? $('outEnd').value : '';
  var pickedUpByRole = $('outWho') ? $('outWho').value : myRole();
  var reason = $('outReason') ? $('outReason').value.trim() : '';
  var childIds = Array.prototype.slice.call(document.querySelectorAll('.out-child-chk:checked')).map(function(el) { return el.value; });

  if (!date || !startTime) { alert('Fecha y hora de inicio son obligatorias.'); return; }
  if (!childIds.length) { alert('Selecciona al menos un hijo.'); return; }
  if (!FAMILY_ID) return;

  var data = {
    family_id:         FAMILY_ID,
    child_ids:         childIds,
    date:              date,
    start_time:        startTime,
    end_time:          endTime || null,
    picked_up_by_role: pickedUpByRole,
    reason:            reason || null,
    status:            'pending',
    created_by:        USER ? USER.id : null,
    created_by_role:   myRole()
  };

  try {
    var { error, data: savedRow } = await supa.from('temporary_outings').insert(data).select().single();
    if (error) {
      console.error('[saveOuting]', error);
      alert('No se pudo guardar la salida temporal: ' + error.message);
      return;
    }
    var camelRow = toCamel(savedRow);
    temporaryOutings.push(camelRow);

    if (typeof logActivity === 'function') {
      var names = _outingChildNames(childIds);
      logActivity('outing_created',
        myLabel() + ' propuso una salida temporal: ' + names + ' (' + date + ' ' + startTime + (endTime ? '–' + endTime : '') + ')',
        { date: date, childIds: childIds });
    }

    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderDayDetail === 'function') renderDayDetail();
    if (typeof renderToday === 'function') renderToday();
    closeOutingForm();
  } catch(e) {
    console.error('[saveOuting]', e);
    alert('Error al guardar. Intenta de nuevo.');
  }
}

async function respondOuting(outingId, status) {
  var o = (temporaryOutings || []).find(function(x) { return x.id === outingId; });
  if (!o || o.status !== 'pending') return;
  try {
    var respondedAt = nowISO();
    var { error } = await supa.from('temporary_outings').update({
      status:        status,
      responded_at:  respondedAt,
      responded_by:  USER.id
    }).eq('id', outingId);
    if (error) {
      console.error('[respondOuting]', error);
      alert('No se pudo actualizar: ' + error.message);
      return;
    }
    o.status = status;
    o.respondedAt = respondedAt;
    o.respondedBy = USER.id;
    if (typeof logActivity === 'function') {
      var verb = status === 'approved' ? 'aprobó' : 'rechazó';
      logActivity('outing_' + status, myLabel() + ' ' + verb + ' la salida temporal: ' + _outingChildNames(o.childIds), { outingId: outingId });
    }
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderDayDetail === 'function') renderDayDetail();
    if (typeof renderToday === 'function') renderToday();
  } catch(e) {
    console.error('[respondOuting]', e);
    alert('Error al actualizar. Intenta de nuevo.');
  }
}

function _toggleOutingReply(id) {
  var box = document.getElementById('out-reply-box-' + id);
  if (box) box.classList.toggle('hidden');
}

async function sendOutingReply(outingId) {
  var box = document.getElementById('out-reply-text-' + outingId);
  var text = box ? box.value.trim() : '';
  if (!text) return;
  var o = (temporaryOutings || []).find(function(x) { return x.id === outingId; });
  if (typeof logActivity === 'function') {
    await logActivity('outing_reply', myLabel() + ' comentó en la salida temporal "' + (o ? _outingChildNames(o.childIds) : '') + '": ' + text, { outingId: outingId });
  }
  if (box) box.value = '';
  _toggleOutingReply(outingId);
  if (typeof loadActivity === 'function') await loadActivity();
}

function renderOutingsForDay(day) {
  var dayOuts = outingsForDay(calYear, calMonth, day);
  if (!dayOuts.length) return '';
  return dayOuts.map(function(o) {
    var who = o.pickedUpByRole === 'p1' ? p1() : p2();
    var names = _outingChildNames(o.childIds);
    var timeRange = o.startTime + (o.endTime ? ' – ' + o.endTime : ' (regreso estimado sin definir)');
    var isCreator = o.createdBy === (USER && USER.id);
    var pendingForMe = o.status === 'pending' && !isCreator;
    var pendingByMe  = o.status === 'pending' && isCreator;

    var statusBadge = '';
    if (o.status === 'approved') statusBadge = '<span style="background:#DCFCE7;color:#166534;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Aprobada ✓</span>';
    else if (o.status === 'rejected') statusBadge = '<span style="background:#FEE2E2;color:#B91C1C;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Rechazada</span>';
    else statusBadge = '<span style="background:#FEF3C7;color:#D97706;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:4px">Pend. aprobación</span>';

    var conf = typeof outingConfirmation === 'function' ? outingConfirmation(o.id) : null;
    var confirmHtml = '';
    if (o.status === 'approved') {
      confirmHtml = conf
        ? '<div style="font-size:11px;color:var(--success);font-weight:600;margin-top:6px">' + _confirmationLabel(conf) + '</div>'
        : _outingReadyToConfirm(o)
          ? '<button class="btn-outline" style="font-size:11px;padding:4px 9px;margin-top:6px" onclick="confirmOutingReceived(\'' + o.id + '\')">Los niños ya están conmigo ✓</button>'
          : '<div style="font-size:11px;color:var(--text-s);margin-top:6px">Podrás confirmar desde las ' + o.startTime + '</div>';
    }

    var approvalActions = '';
    if (pendingForMe) {
      approvalActions = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn-sm" style="background:var(--success);font-size:11px;padding:5px 12px" onclick="respondOuting(\'' + o.id + '\',\'approved\')">Aprobar</button>' +
        '<button class="btn-outline" style="font-size:11px;padding:5px 12px" onclick="respondOuting(\'' + o.id + '\',\'rejected\')">Rechazar</button>' +
        '</div>';
    } else if (pendingByMe) {
      approvalActions = '<div style="font-size:11px;color:var(--text-s);margin-top:6px;font-style:italic">Esperando aprobación</div>';
    }

    var replyHtml =
      '<button class="btn-outline out-reply-btn" style="font-size:11px;padding:4px 9px;margin-top:8px">💬 Comentar</button>' +
      '<div id="out-reply-box-' + o.id + '" class="hidden" style="margin-top:8px">' +
        '<textarea id="out-reply-text-' + o.id + '" class="inp" placeholder="Escribe un comentario…" style="min-height:50px;font-size:12px;resize:vertical"></textarea>' +
        '<button class="btn-sm out-reply-send" style="font-size:11px;padding:5px 12px;margin-top:6px">Enviar</button>' +
      '</div>';

    return '<div class="detail-card out-card" data-out-id="' + o.id + '" style="border-left:2px solid var(--accent)">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">' +
      '<strong style="font-size:13px;color:var(--text)">🚗 Salida temporal — ' + names + '</strong>' + statusBadge + '</div>' +
      '<div style="font-size:11px;color:var(--text-s)">' + who + ' · ' + timeRange + '</div>' +
      (o.reason ? '<div style="font-size:12px;color:var(--text-s);margin-top:4px;line-height:1.4">' + o.reason + '</div>' : '') +
      '<div style="font-size:10px;color:var(--text-s);margin-top:4px;font-style:italic">No modifica la custodia del día</div>' +
      approvalActions +
      confirmHtml +
      replyHtml +
      '</div>';
  }).join('');
}

// Delegación de eventos para los botones "Comentar"/"Enviar" (el HTML se
// regenera seguido y volver a buscar querySelector por fila es más frágil
// que delegar sobre el contenedor del detalle del día).
document.addEventListener('click', function(e) {
  var card = e.target.closest && e.target.closest('.out-card');
  if (!card) return;
  var outId = card.getAttribute('data-out-id');
  if (e.target.classList.contains('out-reply-btn')) _toggleOutingReply(outId);
  if (e.target.classList.contains('out-reply-send')) sendOutingReply(outId);
});

async function confirmOutingReceived(outingId) {
  var o = (temporaryOutings || []).find(function(x) { return x.id === outingId; });
  if (!o) return;
  var res = await recordCustodyConfirmation('outing', outingId, o.childIds);
  if (res.error) {
    console.error('[confirmOutingReceived]', res.error);
    alert('No se pudo confirmar: ' + res.error.message);
    return;
  }
  if (typeof logActivity === 'function') {
    logActivity('outing_confirmed', myLabel() + ' confirmó que los niños ya están de vuelta: ' + _outingChildNames(o.childIds));
  }
  if (typeof renderDayDetail === 'function') renderDayDetail();
  if (typeof renderToday === 'function') renderToday();
}
