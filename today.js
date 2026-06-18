// today.js — Dashboard "Hoy"

var TODAY_DAYS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
var TODAY_DAYS_S = ['dom','lun','mar','mié','jue','vie','sáb'];
var TODAY_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

function renderToday() {
  if (!$('tab-today')) return;
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
  _todayEvents(todayStr);
  _todayReminders(now, todayStr);
}

async function confirmKidsWithMe() {
  if (!FAMILY_ID || !USER) return;
  var btn = $('kidsWithMeBtn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await db.collection('families').doc(FAMILY_ID).update({
      lastPickup: {
        uid: USER.uid,
        role: myRole(),
        at: firebase.firestore.FieldValue.serverTimestamp()
      }
    });
    if (btn) {
      btn.textContent = '✓ Confirmado';
      setTimeout(function() {
        btn.textContent = 'Los niños ya están conmigo';
        btn.disabled = false;
      }, 3000);
    }
  } catch(e) {
    console.error('[confirmKidsWithMe]', e);
    if (btn) { btn.textContent = 'Los niños ya están conmigo'; btn.disabled = false; }
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

function acceptPropInline(propId) {
  var p = (proposals || []).find(function(x) { return x.id === propId; });
  if (!p) return;
  famCol('proposals').doc(propId).update({ status: 'accepted', respondedAt: firebase.firestore.FieldValue.serverTimestamp(), respondedBy: USER.uid });
  if (typeof setCustody === 'function') setCustody(Number(p.toDay), 'transition');
}

function rejectPropInline(propId) {
  famCol('proposals').doc(propId).update({ status: 'rejected', respondedAt: firebase.firestore.FieldValue.serverTimestamp(), respondedBy: USER.uid });
}

function _todayPendingRequests() {
  var el = $('todayPendingBlock');
  var card = $('todayPendingCard');
  var countEl = $('todayPendingCount');
  if (!el) return;

  var now = new Date();
  var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var role = myRole();

  var propsReceived = (proposals || []).filter(function(p) { return p.status === 'pending' && p.createdBy !== (USER && USER.uid); });
  var propsSent     = (proposals || []).filter(function(p) { return p.status === 'pending' && p.createdBy === (USER && USER.uid); });
  var evtsToApprove = (events || []).filter(function(ev) { return ev.requiresApproval && ev.approvalStatus === 'pending' && ev.createdBy !== (USER && USER.uid); });
  var evtsSent      = (events || []).filter(function(ev) { return ev.requiresApproval && ev.approvalStatus === 'pending' && ev.createdBy === (USER && USER.uid); });
  var remsToday     = (reminders || []).filter(function(r) {
    if (!r.date || r.done) return false;
    var d = (r.date + '').split('T')[0];
    if (d !== todayStr) return false;
    if (r.for !== 'both' && r.for !== (role === 'p1' ? 'mama' : 'papa')) return false;
    return true;
  });

  var total = propsReceived.length + propsSent.length + evtsToApprove.length + evtsSent.length + remsToday.length;

  if (total === 0) {
    if (card) card.classList.add('hidden');
    return;
  }
  if (card) card.classList.remove('hidden');
  if (countEl) countEl.textContent = total;

  var html = '';

  propsReceived.forEach(function(p) {
    html += _pendingRow(
      _badge('RESPONDER', 'var(--warn)'),
      'Cambio de custodia — día ' + p.fromDay + ' → ' + p.toDay,
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
    html += _pendingRow(
      _badge('ESPERANDO', 'var(--primary)'),
      'Cambio de custodia — día ' + p.fromDay + ' → ' + p.toDay,
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

  var custody = _todayGetCustody(now);

  if (!custody) {
    el.innerHTML = '<span style="color:var(--text-s);font-size:14px">Calendario no configurado aún</span>';
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

  el.innerHTML =
    '<div style="font-size:24px;font-weight:700;color:var(--text);letter-spacing:-.4px">' +
    mainHtml + '</div>' + subHtml + nextHtml;
}

function _todayBalance() {
  var el = $('todayBalanceBlock');
  if (!el) return;

  var net = expenses.filter(function(e) {
    return !e.voided && e.treatment === 'shared';
  }).reduce(function(s, e) {
    var amount = e.currency === 'UF' ? Math.round((e.amount || 0) * UF) : (e.amount || 0);
    var pct = (e.pctMama == null) ? 50 : e.pctMama;
    var mPaid = e.paidBy === 'mama' ? amount : 0;
    return s + (mPaid - amount * pct / 100);
  }, 0);

  if (Math.abs(net) < 1) {
    el.innerHTML = '<span style="color:var(--success)">✓ Sin saldo pendiente</span>';
  } else if (net > 0) {
    el.innerHTML = p2() + ' debe <b style="color:var(--warn)">' + fmtCLP(Math.round(net)) + '</b> a ' + p1();
  } else {
    el.innerHTML = p1() + ' debe <b style="color:var(--warn)">' + fmtCLP(Math.round(-net)) + '</b> a ' + p2();
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

  var upcoming = (reminders || []).filter(function(r) {
    return r.date && r.date >= todayStr && r.date < cutoff;
  }).slice(0, 4);

  if (!upcoming.length) {
    el.innerHTML = '<span style="color:var(--text-s);font-size:13px">Sin recordatorios esta semana</span>';
    return;
  }

  el.innerHTML = upcoming.map(function(r) {
    var isToday = r.date === todayStr;
    var d = new Date(r.date + 'T12:00:00');
    var dayLabel = isToday ? 'Hoy' : TODAY_DAYS_S[d.getDay()] + ' ' + d.getDate();
    var labelColor = isToday ? 'var(--accent)' : 'var(--primary-d)';
    return '<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">' +
      '<span style="color:' + labelColor + ';font-size:11px;font-weight:700;min-width:34px">' + dayLabel + '</span>' +
      '<span style="color:var(--text)">' + (r.text || r.title || '') + '</span></div>';
  }).join('');
}
