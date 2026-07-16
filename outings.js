// --- SALIDAS TEMPORALES ---------------------------------------
// Una salida temporal registra que un padre/madre retira a uno o más
// hijos por algunas horas (ej: comida, partido, cine). NUNCA modifica
// el día de custodia base — solo queda como un registro por horas
// dentro de ese día, asociado a child_id(s) específicos.

var editingOutingId = null;

function outingsForDay(year, month, day) {
  var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  return (temporaryOutings || []).filter(function(o) { return o.date === dateStr; });
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

function openOutingForm(outingId) {
  editingOutingId = outingId || null;
  var o = outingId ? (temporaryOutings || []).find(function(x) { return x.id === outingId; }) : null;
  var dateStr = selDay
    ? calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(selDay).padStart(2, '0')
    : new Date().toISOString().slice(0, 10);
  if ($('outDate')) $('outDate').value = o ? (o.date || dateStr) : dateStr;
  if ($('outStart')) $('outStart').value = o ? (o.startTime || '') : '';
  if ($('outEnd')) $('outEnd').value = o ? (o.endTime || '') : '';
  if ($('outWho')) {
    $('outWho').value = o ? (o.pickedUpByRole || myRole()) : myRole();
    if ($('outOptMama')) $('outOptMama').textContent = p1();
    if ($('outOptPapa')) $('outOptPapa').textContent = p2();
  }
  if ($('outReason')) $('outReason').value = o ? (o.reason || '') : '';
  if ($('outFormTitle')) $('outFormTitle').textContent = outingId ? 'Editar salida temporal' : 'Nueva salida temporal';
  _populateOutingChildren(o ? o.childIds : null);
  show('outingModal');
}

function closeOutingForm() {
  hide('outingModal');
  editingOutingId = null;
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
    updated_at:        nowISO()
  };

  try {
    var error, savedRow;
    if (editingOutingId) {
      var res = await supa.from('temporary_outings').update(data).eq('id', editingOutingId).select().single();
      error = res.error; savedRow = res.data;
    } else {
      data.created_by = USER ? USER.id : null;
      data.created_by_role = myRole();
      var res2 = await supa.from('temporary_outings').insert(data).select().single();
      error = res2.error; savedRow = res2.data;
    }
    if (error) {
      console.error('[saveOuting]', error);
      alert('No se pudo guardar la salida temporal: ' + error.message);
      return;
    }
    var camelRow = toCamel(savedRow);
    var idx = temporaryOutings.findIndex(function(o) { return o.id === camelRow.id; });
    if (idx !== -1) temporaryOutings[idx] = camelRow; else temporaryOutings.push(camelRow);

    if (typeof logActivity === 'function') {
      var names = _outingChildNames(childIds);
      var verb = editingOutingId ? 'actualizó' : 'registró';
      logActivity('outing_' + (editingOutingId ? 'edited' : 'created'),
        myLabel() + ' ' + verb + ' una salida temporal: ' + names + ' (' + date + ' ' + startTime + (endTime ? '–' + endTime : '') + ')',
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

async function deleteOuting(outingId) {
  if (!confirm('¿Eliminar esta salida temporal?')) return;
  var { error } = await supa.from('temporary_outings').update({ deleted_at: nowISO() }).eq('id', outingId);
  if (error) {
    console.error('[deleteOuting]', error);
    alert('No se pudo eliminar: ' + error.message);
    return;
  }
  temporaryOutings = temporaryOutings.filter(function(o) { return o.id !== outingId; });
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof renderDayDetail === 'function') renderDayDetail();
  if (typeof renderToday === 'function') renderToday();
}

function renderOutingsForDay(day) {
  var dayOuts = outingsForDay(calYear, calMonth, day);
  if (!dayOuts.length) return '';
  return dayOuts.map(function(o) {
    var who = o.pickedUpByRole === 'p1' ? p1() : p2();
    var names = _outingChildNames(o.childIds);
    var timeRange = o.startTime + (o.endTime ? ' – ' + o.endTime : ' (regreso estimado sin definir)');
    var conf = typeof outingConfirmation === 'function' ? outingConfirmation(o.id) : null;
    var confirmHtml = conf
      ? '<div style="font-size:11px;color:var(--success);font-weight:600;margin-top:6px">' + _confirmationLabel(conf) + '</div>'
      : '<button class="btn-outline" style="font-size:11px;padding:4px 9px;margin-top:6px" onclick="confirmOutingReceived(\'' + o.id + '\')">Los niños ya están conmigo ✓</button>';
    return '<div class="detail-card" style="border-left:2px solid var(--accent)">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
      '<strong style="font-size:13px;color:var(--text)">🚗 Salida temporal — ' + names + '</strong></div>' +
      '<div style="font-size:11px;color:var(--text-s)">' + who + ' · ' + timeRange + '</div>' +
      (o.reason ? '<div style="font-size:12px;color:var(--text-s);margin-top:4px;line-height:1.4">' + o.reason + '</div>' : '') +
      '<div style="font-size:10px;color:var(--text-s);margin-top:4px;font-style:italic">No modifica la custodia del día</div>' +
      confirmHtml +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
      '<button class="btn-outline" style="font-size:11px;padding:4px 9px" onclick="openOutingForm(\'' + o.id + '\')">Editar</button>' +
      '<button class="btn-outline" style="font-size:11px;padding:4px 9px;color:var(--error)" onclick="deleteOuting(\'' + o.id + '\')">Eliminar</button>' +
      '</div></div>';
  }).join('');
}

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
