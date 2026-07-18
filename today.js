// today.js — Dashboard "Hoy"

var TODAY_DAYS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
var TODAY_DAYS_S = ['dom','lun','mar','mié','jue','vie','sáb'];
var TODAY_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

function renderToday() {
  if (!$('tab-today')) return;
  // Evita pintar "Calendario no configurado"/"Sin eventos" con los datos
  // todavía sin cargar justo tras un reload -- se corrige solo apenas
  // setupListeners() marque _dataReady = true y llame de nuevo.
  if (typeof _dataReady !== 'undefined' && !_dataReady && FAMILY_ID) return;
  var now = new Date();
  var todayStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  if ($('todayDateLbl')) {
    $('todayDateLbl').textContent =
      TODAY_DAYS[now.getDay()] + ', ' + now.getDate() + ' de ' + TODAY_MONTHS[now.getMonth()];
  }

  _todayCustody(now);
  _todayPendingRequests();
  _todayBalance();
  _todayDayBalance();
  _todayEvents(todayStr);
  _todayReminders(now, todayStr);
  if (typeof renderTodayActivity === 'function') renderTodayActivity();
}

function _todayDayBalance() {
  var card = $('todayDayBalanceCard');
  var el = $('todayDayBalanceBlock');
  if (!card || !el) return;
  var p1Bal = (typeof familyDayBalance !== 'undefined' && familyDayBalance.p1) || 0;
  var p2Bal = (typeof familyDayBalance !== 'undefined' && familyDayBalance.p2) || 0;
  if (!p1Bal && !p2Bal) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  var row = function(label, color, n, role) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<span style="font-size:14px"><strong style="color:' + color + '">' + label + '</strong> tiene ' + n + ' día' + (n > 1 ? 's' : '') + ' a favor</span>' +
      '<button class="btn-outline" style="font-size:11px;padding:4px 9px" onclick="settleDayBalance(\'' + role + '\')">Marcar usado</button>' +
      '</div>';
  };
  el.innerHTML = (p1Bal ? row(p1(), 'var(--accent)', p1Bal, 'p1') : '') + (p2Bal ? row(p2(), 'var(--primary-d)', p2Bal, 'p2') : '');
}

async function confirmKidsWithMe(btnEl) {
  if (!FAMILY_ID || !USER) return;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '…'; }
  try {
    var childIds = (children || []).map(function(c) { return c.id; });
    var res = await recordCustodyConfirmation('custody_day', null, childIds);
    if (res.error) throw res.error;
    if (typeof logActivity === 'function') {
      logActivity('custody_confirmed', myLabel() + ' confirmó que los niños ya están en casa');
    }
    renderToday();
    if (typeof renderDayDetail === 'function') renderDayDetail();
  } catch(e) {
    console.error('[confirmKidsWithMe]', e);
    alert('No se pudo confirmar. Intenta de nuevo.');
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Los niños ya están conmigo ✓'; }
  }
}

function _badge(label, color) {
  return '<span style="background:' + color + ';color:#fff;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;flex-shrink:0">' + label + '</span>';
}

function _pendingRow(badge, title, sub, actions) {
  return '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
    '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:' + (actions ? '8' : '0') + 'px">' +
      badge +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:600;color:var(--text)">' + title + '</div>' +
        (sub ? '<div style="font-size:12px;color:var(--text-s);margin-top:2px">' + sub + '</div>' : '') +
      '</div>' +
    '</div>' +
    (actions ? '<div style="display:flex;gap:8px">' + actions + '</div>' : '') +
    '</div>';
}

async function acceptPropInline(propId) {
  var p = (proposals || []).find(function(x) { return x.id === propId; });
  if (!p) return;
  var { error } = await supa.from('custody_changes').update({ status: 'accepted', responded_at: nowISO(), responded_by: USER.id }).eq('id', propId);
  if (error) { console.error('[acceptPropInline]', error); alert('No se pudo aceptar: ' + error.message); return; }
  if (typeof setCustody === 'function') await setCustody(Number(p.toDay), 'transition');
  if (typeof logActivity === 'function') {
    logActivity('proposal_accepted', myLabel() + ' aprobó cambio de custodia: Día ' + p.fromDay + ' → Día ' + p.toDay, { proposalId: propId });
  }
  if (typeof loadProposals === 'function') await loadProposals();
}

async function rejectPropInline(propId) {
  var p = (proposals || []).find(function(x) { return x.id === propId; });
  var { error } = await supa.from('custody_changes').update({ status: 'rejected', responded_at: nowISO(), responded_by: USER.id }).eq('id', propId);
  if (error) { console.error('[rejectPropInline]', error); alert('No se pudo rechazar: ' + error.message); return; }
  if (typeof logActivity === 'function' && p) {
    logActivity('proposal_rejected', myLabel() + ' rechazó cambio de custodia: Día ' + p.fromDay + ' → Día ' + p.toDay, { proposalId: propId });
  }
  if (typeof loadProposals === 'function') await loadProposals();
}

function _todayPendingRequests() {
  var el = $('todayPendingBlock');
  var card = $('todayPendingCard');
  var countEl = $('todayPendingCount');
  if (!el) return;

  var now = new Date();
  var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var role = myRole();

  var propsReceived = (proposals || []).filter(function(p) { return p.status === 'pending' && p.createdBy !== (USER && USER.id); });
  var propsSent     = (proposals || []).filter(function(p) { return p.status === 'pending' && p.createdBy === (USER && USER.id); });
  var evtsToApprove = (events || []).filter(function(ev) { return ev.requiresApproval && ev.approvalStatus === 'pending' && ev.createdBy !== (USER && USER.id); });
  var evtsSent      = (events || []).filter(function(ev) { return ev.requiresApproval && ev.approvalStatus === 'pending' && ev.createdBy === (USER && USER.id); });
  var remsToday     = (reminders || []).filter(function(r) {
    if (!r.date || r.done) return false;
    var d = (r.date + '').split('T')[0];
    if (d !== todayStr) return false;
    if (r.for !== 'both' && r.for !== (role === 'p1' ? 'mama' : 'papa')) return false;
    return true;
  });
  var coUid = USERDATA && USERDATA.coparentId;
  var agrsToSign = (agreements || []).filter(function(a) {
    var sigs = a.signatures || {};
    return a.status === 'Activo' && !sigs[USER && USER.id];
  });
  var agrsWaiting = (agreements || []).filter(function(a) {
    var sigs = a.signatures || {};
    return a.status === 'Activo' && !!sigs[USER && USER.id] && coUid && !sigs[coUid];
  });

  var total = propsReceived.length + propsSent.length + evtsToApprove.length + evtsSent.length + remsToday.length + agrsToSign.length + agrsWaiting.length;

  if (total === 0) {
    if (card) card.classList.add('hidden');
    return;
  }
  if (card) card.classList.remove('hidden');
  if (countEl) countEl.textContent = total;

  var html = '';

  propsReceived.forEach(function(p) {
    var label = typeof fmtProposalDates === 'function' ? fmtProposalDates(p) : 'día ' + p.fromDay + ' → ' + p.toDay;
    html += _pendingRow(
      _badge('RESPONDER', 'var(--warn)'),
      'Cambio de custodia — ' + label,
      p.reason || null,
      '<button class="btn-sm" style="background:var(--success);font-size:12px;padding:6px 14px" onclick="acceptPropInline(\'' + p.id + '\')">Aceptar</button>' +
      '<button class="btn-outline" style="font-size:12px;padding:6px 14px" onclick="rejectPropInline(\'' + p.id + '\')">Rechazar</button>'
    );
  });

  evtsToApprove.forEach(function(ev) {
    html += _pendingRow(
      _badge('CONFIRMAR', 'var(--warn)'),
      ev.title,
      ev.date + (ev.time ? ' · ' + ev.time : ''),
      '<button class="btn-sm" style="background:var(--success);font-size:12px;padding:6px 14px" onclick="approveEvent(\'' + ev.id + '\')">Confirmar</button>' +
      '<button class="btn-outline" style="font-size:12px;padding:6px 14px" onclick="rejectEvent(\'' + ev.id + '\')">Rechazar</button>'
    );
  });

  propsSent.forEach(function(p) {
    var label = typeof fmtProposalDates === 'function' ? fmtProposalDates(p) : 'día ' + p.fromDay + ' → ' + p.toDay;
    html += _pendingRow(
      _badge('ESPERANDO', 'var(--primary)'),
      'Cambio de custodia — ' + label,
      'Esperando respuesta',
      null
    );
  });

  evtsSent.forEach(function(ev) {
    html += _pendingRow(
      _badge('ESPERANDO', 'var(--primary)'),
      ev.title,
      ev.date + (ev.time ? ' · ' + ev.time : '') + ' · Esperando confirmación',
      null
    );
  });

  remsToday.forEach(function(r) {
    html += _pendingRow(
      _badge('HOY', 'var(--accent)'),
      r.title,
      fLbl(r.for),
      null
    );
  });

  agrsToSign.forEach(function(a) {
    html += _pendingRow(
      _badge('REVISAR', 'var(--warn)'),
      'Acuerdo — ' + a.title,
      a.category || null,
      '<button class="btn-sm" style="background:var(--success);font-size:12px;padding:6px 14px" onclick="signAgreement(\'' + a.id + '\')">Confirmar</button>'
    );
  });

  agrsWaiting.forEach(function(a) {
    html += _pendingRow(
      _badge('ESPERANDO', 'var(--primary)'),
      'Acuerdo — ' + a.title,
      'Esperando confirmación',
      null
    );
  });

  el.innerHTML = html;
}

function _todayGetCustody(date) {
  var key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate());
  if (custodyOverridesMap[key] && custodyOverridesMap[key][day]) {
    return custodyOverridesMap[key][day].value;
  }
  return (custodyMap[key] && custodyMap[key][day]) ? custodyMap[key][day] : null;
}

function _todayNextChange(fromDate) {
  for (var i = 1; i <= 45; i++) {
    var d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
    if (_todayGetCustody(d) === 'transition') return { days: i, date: d };
  }
  return null;
}

function _todayCustody(now) {
  var el = $('todayCustodyBlock');
  if (!el) return;

  var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var custody = _todayGetCustody(now);

  if (!custody) {
    el.innerHTML = '<span style="color:var(--text-s);font-size:14px">Calendario no configurado aún</span>' +
      '<div style="margin-top:10px"><button class="btn-sm" style="font-size:12px;padding:8px 16px" onclick="switchTab(\'calendar\')">Ir al Calendario →</button></div>';
    return;
  }

  var mainHtml, color, subHtml = '', nextHtml = '';

  if (custody === 'transition') {
    // Find who had them before and who gets them after this change day
    var fromCustody = null, toCustody = null;
    for (var bi = 1; bi <= 14; bi++) {
      var bd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - bi);
      var bc = _todayGetCustody(bd);
      if (bc && bc !== 'transition') { fromCustody = bc; break; }
    }
    for (var fi = 1; fi <= 14; fi++) {
      var fd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + fi);
      var fc = _todayGetCustody(fd);
      if (fc && fc !== 'transition') { toCustody = fc; break; }
    }

    mainHtml = '<span style="color:var(--accent)">↔ Día de cambio de casa</span>';

    if (fromCustody && toCustody) {
      var fromWho = fromCustody === 'mama' ? p1() : p2();
      var toWho = toCustody === 'mama' ? p1() : p2();
      var fromColor = fromCustody === 'mama' ? 'var(--accent)' : 'var(--primary-d)';
      var toColor = toCustody === 'mama' ? 'var(--accent)' : 'var(--primary-d)';
      subHtml += '<div style="font-size:16px;font-weight:600;margin-top:8px">' +
        '<span style="color:' + fromColor + '">' + fromWho + '</span>' +
        ' <span style="color:var(--text-s);font-weight:400">→</span> ' +
        '<span style="color:' + toColor + '">' + toWho + '</span>' +
        '</div>';
    }

    if (children && children.length) {
      var tNames = children.map(function(c) { return c.name ? c.name.trim().split(' ')[0] : ''; }).filter(Boolean);
      if (tNames.length) {
        subHtml += '<div style="font-size:13px;color:var(--text-s);margin-top:5px">' + tNames.join(' · ') + '</div>';
      }
    }
  } else {
    var who = custody === 'mama' ? p1() : p2();
    color = custody === 'mama' ? 'var(--accent)' : 'var(--primary-d)';
    mainHtml = 'Con <span style="color:' + color + '">' + who + '</span>';

    if (children && children.length) {
      var names = children.map(function(c) {
        return c.name ? c.name.trim().split(' ')[0] : '';
      }).filter(Boolean);
      if (names.length) {
        subHtml = '<div style="font-size:13px;color:var(--text-s);margin-top:5px">' +
          names.join(' · ') + '</div>';
      }
    }

    var next = _todayNextChange(now);
    if (next) {
      var label = next.days === 1 ? 'mañana' : 'en ' + next.days + ' días';
      var dlabel = TODAY_DAYS_S[next.date.getDay()] + ' ' + next.date.getDate();
      nextHtml = '<div style="font-size:12px;color:var(--text-s);margin-top:12px;display:flex;align-items:center;gap:6px">' +
        '<span style="color:var(--accent)">↻</span> Próximo cambio ' + label +
        ' <span style="background:var(--border);border-radius:6px;padding:1px 8px;font-size:11px;font-weight:700">' +
        dlabel + '</span></div>';
    }
  }

  var kidsBtn = '';
  if (custody === 'transition') {
    var dayConf = typeof custodyDayConfirmation === 'function' ? custodyDayConfirmation(todayStr) : null;
    kidsBtn = dayConf
      ? '<div style="margin-top:14px;font-size:12px;color:var(--success);font-weight:600">' + _confirmationLabel(dayConf) + '</div>'
      : '<button class="btn-outline" style="margin-top:14px;font-size:12px;padding:8px 16px" onclick="confirmKidsWithMe(this)">Los niños ya están conmigo ✓</button>';
  }
  var outingsHtml = _todayOutingsHtml(now);
  el.innerHTML =
    '<div style="font-size:24px;font-weight:700;color:var(--text);letter-spacing:-.4px">' +
    mainHtml + '</div>' + subHtml + outingsHtml + nextHtml + kidsBtn;
}

function _todayOutingsHtml(now) {
  if (typeof outingsForDay !== 'function') return '';
  var outs = outingsForDay(now.getFullYear(), now.getMonth(), now.getDate());
  if (!outs.length) return '';
  return outs.map(function(o) {
    var who = o.pickedUpByRole === 'p1' ? p1() : p2();
    var names = typeof _outingChildNames === 'function' ? _outingChildNames(o.childIds) : '';
    var timeRange = o.startTime + (o.endTime ? ' – ' + o.endTime : '');
    var isCreator = o.createdBy === (USER && USER.id);

    var actionHtml = '';
    if (o.status === 'pending') {
      actionHtml = !isCreator
        ? '<div style="display:flex;gap:6px;margin-top:5px">' +
            '<button class="btn-sm" style="background:var(--success);font-size:10px;padding:3px 10px" onclick="respondOuting(\'' + o.id + '\',\'approved\')">Aprobar</button>' +
            '<button class="btn-outline" style="font-size:10px;padding:3px 10px" onclick="respondOuting(\'' + o.id + '\',\'rejected\')">Rechazar</button>' +
          '</div>'
        : '<div style="margin-top:5px;font-size:11px;color:var(--text-s);font-style:italic">Esperando aprobación</div>';
    } else if (o.status === 'rejected') {
      actionHtml = '<div style="margin-top:5px;font-size:11px;color:var(--error)">Rechazada</div>';
    } else {
      var conf = typeof outingConfirmation === 'function' ? outingConfirmation(o.id) : null;
      actionHtml = conf
        ? '<span style="color:var(--success);font-weight:600">' + _confirmationLabel(conf) + '</span>'
        : (typeof _outingReadyToConfirm !== 'function' || _outingReadyToConfirm(o))
          ? '<button class="btn-outline" style="font-size:10px;padding:2px 8px" onclick="confirmOutingReceived(\'' + o.id + '\')">Los niños ya están conmigo ✓</button>'
          : '<span style="color:var(--text-s);font-size:11px">Podrás confirmar desde las ' + o.startTime + '</span>';
    }
    return '<div style="font-size:12px;color:var(--accent);margin-top:8px;background:rgba(216,164,95,.1);border-radius:8px;padding:7px 10px">' +
      '🚗 ' + who + ' retira a ' + names + ' · ' + timeRange + '<div style="margin-top:5px">' + actionHtml + '</div></div>';
  }).join('');
}

function _todayBalance() {
  var el = $('todayBalanceBlock');
  if (!el) return;

  var allExp = (expenses || []).filter(function(e) { return !e.voided; });
  var net = typeof _computeSharedNet === 'function'
    ? _computeSharedNet(allExp)
    : allExp.filter(function(e) { return e.treatment === 'shared'; }).reduce(function(s, e) {
        var amount = e.currency === 'UF' ? Math.round((e.amount || 0) * UF) : (e.amount || 0);
        var pct = (e.pctMama == null) ? 50 : e.pctMama;
        return s + ((e.paidBy === 'mama' ? amount : 0) - amount * pct / 100);
      }, 0);
  var adjNet = typeof _computeSettlAdjust === 'function'
    ? net - _computeSettlAdjust(settlements || [])
    : net;

  if (Math.abs(adjNet) < 1) {
    el.innerHTML = '<span style="color:var(--success)">✓ Sin saldo pendiente</span>';
  } else if (adjNet > 0) {
    el.innerHTML = p2() + ' debe <b style="color:var(--warn)">' + fmtCLP(Math.round(adjNet)) + '</b> a ' + p1();
  } else {
    el.innerHTML = p1() + ' debe <b style="color:var(--warn)">' + fmtCLP(Math.round(-adjNet)) + '</b> a ' + p2();
  }
}

function _todayEvents(todayStr) {
  var el = $('todayEventsBlock');
  if (!el) return;

  var role = myRole();
  var todayEvts = (events || []).filter(function(e) {
    if (e.date !== todayStr || e.status === 'cancelled') return false;
    if (e.participants === 'mama' && role !== 'p1') return false;
    if (e.participants === 'papa' && role !== 'p2') return false;
    return true;
  }).sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });

  if (!todayEvts.length) {
    el.innerHTML = '<span style="color:var(--text-s);font-size:13px">Sin eventos hoy</span>';
    return;
  }

  el.innerHTML = todayEvts.map(function(e) {
    var t = e.time ? '<span style="color:var(--text-s);font-size:11px;min-width:38px;display:inline-block">' + e.time + '</span>' : '';
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">' +
      t + '<span style="font-weight:600;color:var(--text)">' + e.title + '</span></div>';
  }).join('');
}

function _todayReminders(now, todayStr) {
  var el = $('todayRemindersBlock');
  if (!el) return;

  var cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8)
    .toISOString().split('T')[0];

  var items = (reminders || []).filter(function(r) {
    return r.date && r.date >= todayStr && r.date < cutoff;
  }).map(function(r) {
    return { sortKey: r.date, isToday: r.date === todayStr, label: (r.text || r.title || '') };
  });

  // Salidas temporales futuras (las de hoy ya se muestran en su propia
  // tarjeta de custodia) para que no queden invisibles hasta el día mismo.
  (temporaryOutings || []).filter(function(o) {
    return o.date && o.date > todayStr && o.date < cutoff && o.status !== 'rejected';
  }).forEach(function(o) {
    var names = typeof _outingChildNames === 'function' ? _outingChildNames(o.childIds) : '';
    var pendTag = o.status === 'pending' ? ' (pend. aprobación)' : '';
    items.push({ sortKey: o.date + 'T' + (o.startTime || '00:00'), isToday: false, label: '🚗 Salida: ' + names + pendTag });
  });

  items.sort(function(a, b) { return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0; });
  items = items.slice(0, 4);

  if (!items.length) {
    el.innerHTML = '<span style="color:var(--text-s);font-size:13px">Sin avisos esta semana</span>';
    return;
  }

  el.innerHTML = items.map(function(item) {
    var d = new Date(item.sortKey.slice(0, 10) + 'T12:00:00');
    var dayLabel = item.isToday ? 'Hoy' : TODAY_DAYS_S[d.getDay()] + ' ' + d.getDate();
    var labelColor = item.isToday ? 'var(--accent)' : 'var(--primary-d)';
    return '<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">' +
      '<span style="color:' + labelColor + ';font-size:11px;font-weight:700;min-width:34px">' + dayLabel + '</span>' +
      '<span style="color:var(--text)">' + item.label + '</span></div>';
  }).join('');
}
