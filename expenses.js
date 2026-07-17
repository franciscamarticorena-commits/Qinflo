// --- GASTOS -------------------------------------------------

var editingExpId = null;

const EXP_SUBCATS = {
  'Educación': ['Matrícula','Colegiatura mensual','Academias / extra programáticas / refuerzo escolar','Útiles escolares','Uniformes','Transporte escolar','Casino / almuerzo / colación'],
  'Salud': ['Seguro escolar','Isapre / Fonasa','Seguro complementario','Cita a especialistas','Tratamientos','Terapias'],
  'Vida cotidiana': ['Celebraciones','Mesada','Celular / conectividad','Salidas / panoramas'],
  'Gastos extraordinarios': ['Gasto puntual / no recurrente']
};

// expenses.category / expenses.frequency en la DB solo aceptan valores en
// minúscula sin tilde (CHECK constraint) -- el formulario usa etiquetas en
// español, así que se convierten al escribir/leer.
var EXP_CAT_TO_DB = {
  'Educación': 'educacion', 'Salud': 'salud',
  'Vida cotidiana': 'vida_cotidiana', 'Gastos extraordinarios': 'gastos_extraordinarios'
};
var DB_TO_EXP_CAT = {
  educacion: 'Educación', salud: 'Salud',
  vida_cotidiana: 'Vida cotidiana', gastos_extraordinarios: 'Gastos extraordinarios',
  ropa: 'Vida cotidiana', alimentacion: 'Vida cotidiana', esparcimiento: 'Vida cotidiana', otro: 'Gastos extraordinarios'
};
function updateExpenseSubcats() {
  var cat = $('expCat') ? $('expCat').value : 'Educación';
  var sel = $('expSubcat');
  if (!sel) return;
  sel.innerHTML = '';
  (EXP_SUBCATS[cat] || []).forEach(function(v) {
    var opt = document.createElement('option'); opt.value = v; opt.textContent = v; sel.appendChild(opt);
  });
}
function treatmentLabel(v) {
  if (v === 'pension') return 'Considerada en la pensión de alimentos · Registro no cobrable';
  if (v === 'shared') return 'Compartido entre ambos';
  if (v === 'mama_only') return 'Pagado solo por ' + p1();
  if (v === 'papa_only') return 'Pagado solo por ' + p2();
  return 'Compartido entre ambos';
}
function treatmentShortLabel(v) {
  if (v === 'pension') return 'Pensión';
  if (v === 'shared') return 'Compartido';
  if (v === 'mama_only') return 'Solo ' + p1();
  if (v === 'papa_only') return 'Solo ' + p2();
  return 'Compartido';
}
function treatmentClass(v, paid) {
  if (v === 'pension') return 'no-charge';
  if (paid) return 'closed';
  if (v === 'shared') return 'shared';
  return 'pending';
}

function frequencyLabel(v) {
  if (v === 'monthly') return 'Mensual';
  if (v === 'annual') return 'Anual';
  if (v === 'weekly') return 'Semanal';
  return 'Único / puntual';
}


function fillPercentSelectors() {
  var pm = $('pctMama'), pp = $('pctPapa');
  if (!pm || !pp || pm.options.length) return;
  for (var i = 0; i <= 100; i += 5) {
    var om = document.createElement('option'); om.value = i; om.textContent = i + '%'; pm.appendChild(om);
    var op = document.createElement('option'); op.value = i; op.textContent = i + '%'; pp.appendChild(op);
  }
  pm.value = 50; pp.value = 50;
  pm.addEventListener('change', function(){ pp.value = 100 - Number(pm.value); updateExpenseTreatmentUI(); });
  pp.addEventListener('change', function(){ pm.value = 100 - Number(pp.value); updateExpenseTreatmentUI(); });
}

function updateExpenseTreatmentUI() {
  fillPercentSelectors();
  var t = $('expTreatment') ? $('expTreatment').value : 'shared';
  var cat = $('expCat') ? $('expCat').value : '';
  var paidBy = $('expPaidBy') ? $('expPaidBy').value : '';
  var reimburse = $('reimburseBox');
  var distBox = $('expDistributionBox');
  var distHint = $('expDistributionHint');
  var refundBox = $('expHealthRefundBox');
  // Hide reimbursement proof from the creditor (the one who paid)
  var isCreditor = (myRole() === 'p1' && paidBy === 'mama') || (myRole() === 'p2' && paidBy === 'papa');
  if (reimburse) reimburse.classList.toggle('hidden', t !== 'shared' || isCreditor);
  if (distBox) distBox.classList.toggle('hidden', t !== 'shared');
  if (refundBox) refundBox.classList.toggle('hidden', cat !== 'Salud');
  if (distHint) {
    if (t === 'shared') distHint.textContent = 'Distribución: ' + p1() + ' ' + ($('pctMama') ? $('pctMama').value : 50) + '% · ' + p2() + ' ' + ($('pctPapa') ? $('pctPapa').value : 50) + '%';
    else if (t === 'mama_only') distHint.textContent = 'Distribución: ' + p1() + ' 100%';
    else if (t === 'papa_only') distHint.textContent = 'Distribución: ' + p2() + ' 100%';
    else if (t === 'pension') distHint.textContent = 'Registro no cobrable considerado en la pensión de alimentos';
    else distHint.textContent = '';
  }
}


function setCurrency(c) {
  expCurrency = c;
  $('btnCLP').classList.toggle('cur-active', c === 'CLP');
  $('btnUF').classList.toggle('cur-active', c === 'UF');
  if (c === 'UF') show('ufHint'); else hide('ufHint');
}

function filterPeriod(list) {
  var now = new Date(), y = now.getFullYear(), m = now.getMonth();
  return list.filter(function(e) {
    var d = new Date(e.date);
    if (expPeriod === 'week') { var w = new Date(now); w.setDate(now.getDate() - 7); return d >= w; }
    if (expPeriod === 'month') return d.getFullYear() === y && d.getMonth() === m;
    if (expPeriod === 'year') return d.getFullYear() === y;
    return true;
  });
}

function toCLP(e) { return e.currency === 'UF' ? e.amount * UF : e.amount; }

function _computeSharedNet(visList) {
  return visList.filter(function(e){ return e.treatment === 'shared'; }).reduce(function(s, e) {
    var amount = toCLP(e);
    var mShould = amount * ((e.pctMama == null ? 50 : e.pctMama) / 100);
    var mPaid = e.paidBy === 'mama' ? amount : 0;
    return s + (mPaid - mShould);
  }, 0);
}

function _computeSettlAdjust(settlList) {
  return settlList.reduce(function(s, sl) {
    return s + (sl.fromRole === 'papa' ? sl.amount : -sl.amount);
  }, 0);
}

// El saldo pendiente es un acumulado histórico -- no depende del filtro de
// período que el usuario tenga elegido para simplemente mirar la lista
// (semana/mes/año/todo). Siempre se calcula sobre el historial completo,
// igual que la tarjeta de Balance en Hoy.
function _trueAdjNet() {
  var allVis = (expenses || []).filter(function(e) { return !e.voided; });
  return _computeSharedNet(allVis) - _computeSettlAdjust(settlements || []);
}

function _resetExpForm() {
  editingExpId = null;
  if ($('expFormTitle')) $('expFormTitle').textContent = 'Agregar gasto';
  $('expDesc').value = '';
  $('expAmount').value = '';
  if ($('expFile')) $('expFile').value = '';
  if ($('expReimburseFile')) $('expReimburseFile').value = '';
  if ($('expFrequency')) $('expFrequency').value = 'once';
  if ($('expCat')) { $('expCat').value = 'Educación'; updateExpenseSubcats(); }
  if ($('expTreatment')) $('expTreatment').value = 'shared';
  if ($('expPaidBy')) $('expPaidBy').value = myRole() === 'p1' ? 'mama' : 'papa';
  setCurrency('CLP');
  if ($('pctMama') && $('pctMama').options.length) $('pctMama').value = 50;
  if ($('pctPapa') && $('pctPapa').options.length) $('pctPapa').value = 50;
  if ($('expAttachBox')) $('expAttachBox').style.display = 'none';
  if ($('expAttachToggle')) $('expAttachToggle').textContent = '📎 Adjuntar archivos (opcional)';
  updateExpenseTreatmentUI();
}

function openExpEdit(exp) {
  editingExpId = exp.id;
  if ($('expFormTitle')) $('expFormTitle').textContent = 'Editar gasto';
  $('expDesc').value = exp.description || '';
  $('expAmount').value = exp.amount || '';
  if ($('expFrequency')) $('expFrequency').value = exp.frequency || 'once';
  if ($('expCat')) { $('expCat').value = exp.category || 'Educación'; updateExpenseSubcats(); }
  if ($('expSubcat')) $('expSubcat').value = exp.subcategory || '';
  if ($('expTreatment')) $('expTreatment').value = exp.treatment || 'shared';
  if ($('expPaidBy')) $('expPaidBy').value = exp.paidBy || 'mama';
  if ($('expHealthRefund')) $('expHealthRefund').value = exp.healthRefund || 'pending';
  setCurrency(exp.currency || 'CLP');
  fillPercentSelectors();
  if ($('pctMama') && $('pctMama').options.length) $('pctMama').value = exp.pctMama != null ? exp.pctMama : 50;
  if ($('pctPapa') && $('pctPapa').options.length) $('pctPapa').value = exp.pctPapa != null ? exp.pctPapa : 50;
  // Show attach section if expense has files
  if ($('expAttachBox')) {
    var hasFiles = exp.attachmentName || exp.reimbursementAttachmentName;
    $('expAttachBox').style.display = hasFiles ? 'grid' : 'none';
    if ($('expAttachToggle')) $('expAttachToggle').textContent = hasFiles ? '📎 Adjuntar archivos ▲' : '📎 Adjuntar archivos (opcional)';
  }
  updateExpenseTreatmentUI();
  $('expForm').classList.remove('hidden');
  $('expForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveExp() {
  var btn = $('saveExpBtn');
  var desc = $('expDesc').value.trim(), amt = $('expAmount').value;
  if (!desc || !amt) return;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    var tval = $('expTreatment') ? $('expTreatment').value : 'shared';
    var pctM = tval === 'shared' ? Number(($('pctMama') && $('pctMama').value) || 50) : (tval === 'mama_only' ? 100 : 0);
    var pctP = tval === 'shared' ? Number(($('pctPapa') && $('pctPapa').value) || 50) : (tval === 'papa_only' ? 100 : 0);
    var f = $('expFile') && $('expFile').files && $('expFile').files[0] ? $('expFile').files[0].name : '';
    var rf = $('expReimburseFile') && $('expReimburseFile').files && $('expReimburseFile').files[0] ? $('expReimburseFile').files[0].name : '';

    var data = {
      description: desc, amount: Number(amt), currency: expCurrency,
      paidBy: $('expPaidBy').value,
      category: $('expCat').value,
      subcategory: $('expSubcat') ? $('expSubcat').value : '',
      frequency: $('expFrequency') ? $('expFrequency').value : 'once',
      treatment: tval,
      healthRefund: $('expHealthRefund') ? $('expHealthRefund').value : '',
      pctMama: pctM, pctPapa: pctP
    };

    var paidByRole = data.paidBy === 'mama' ? 'p1' : 'p2';
    var amountClp  = data.currency === 'UF' ? data.amount * UF : data.amount;
    var categoryDb = EXP_CAT_TO_DB[data.category] || 'otro';

    if (editingExpId) {
      if (f)  data.attachmentName = f;
      if (rf) data.reimbursementAttachmentName = rf;
      var { error: upErr } = await supa.from('expenses').update({
        description:                    data.description,
        amount:                         data.amount,
        currency:                       data.currency,
        amount_clp:                     amountClp,
        paid_by:                        USER.id,
        paid_by_role:                   paidByRole,
        split_percentage_p1:            data.pctMama,
        split_percentage_p2:            data.pctPapa,
        category:                       categoryDb,
        subcat:                         data.subcategory,
        frequency:                      data.frequency,
        treatment:                      data.treatment,
        health_refund:                  data.healthRefund || null,
        attachment_name:                f || undefined,
        reimbursement_attachment_name:  rf || undefined,
        updated_at:                     nowISO()
      }).eq('id', editingExpId);
      if (upErr) throw upErr;
    } else {
      var { error: insErr } = await supa.from('expenses').insert({
        family_id:                      FAMILY_ID,
        description:                    data.description,
        amount:                         data.amount,
        currency:                       data.currency,
        amount_clp:                     amountClp,
        paid_by:                        USER.id,
        paid_by_role:                   paidByRole,
        split_percentage_p1:            data.pctMama,
        split_percentage_p2:            data.pctPapa,
        category:                       categoryDb,
        subcat:                         data.subcategory,
        frequency:                      data.frequency,
        treatment:                      data.treatment,
        health_refund:                  data.healthRefund || null,
        date:                           new Date().toISOString().slice(0, 10),
        attachment_name:                data.attachmentName || null,
        reimbursement_attachment_name:  data.reimbursementAttachmentName || null,
        status:                         'pending_review',
        voided:                         false,
        created_by:                     USER.id
      });
      if (insErr) throw insErr;
    }
    if (typeof loadExpenses === 'function') await loadExpenses();
    _resetExpForm();
    hide('expForm');
  } catch(e) {
    console.error('[saveExp]', e);
    alert('No se pudo guardar el gasto: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

async function liquidarBalance() {
  var adjNet = _trueAdjNet();
  if (Math.abs(adjNet) < 1) return;

  var debtorRole = adjNet > 0 ? 'papa' : 'mama';
  var creditorRole = adjNet > 0 ? 'mama' : 'papa';
  var debtor = adjNet > 0 ? p2() : p1();
  var creditor = adjNet > 0 ? p1() : p2();
  var amount = Math.round(Math.abs(adjNet));

  if (!confirm('Confirmar liquidación\n\n' + debtor + ' pagó ' + fmtCLP(amount) + ' a ' + creditor + '.\n\n¿Registrar este pago?')) return;

  var { error: sErr } = await supa.from('settlements').insert({
    family_id:  FAMILY_ID,
    amount:     amount,
    from_role:  debtorRole === 'mama' ? 'p1' : 'p2',
    to_role:    creditorRole === 'mama' ? 'p1' : 'p2',
    date:       new Date().toISOString().slice(0, 10),
    created_by: USER.id
  });
  if (sErr) {
    console.error('[liquidarBalance]', sErr);
    alert('No se pudo registrar la liquidación: ' + sErr.message);
    return;
  }
  if (typeof loadSettlements === 'function') await loadSettlements();
}

function exportarResumen() {
  var vis = filterPeriod(expenses).filter(function(e){ return !e.voided; });
  var periodLabel = { week: 'Última semana', month: 'Este mes', year: 'Este año', all: 'Todo el historial' }[expPeriod] || 'Este período';
  var mT = vis.filter(function(e){ return e.paidBy === 'mama'; }).reduce(function(s, e){ return s + toCLP(e); }, 0);
  var pT = vis.filter(function(e){ return e.paidBy === 'papa'; }).reduce(function(s, e){ return s + toCLP(e); }, 0);
  var filteredSettl = filterPeriod(settlements);
  var adjNet = _trueAdjNet();

  var balanceLine = Math.abs(adjNet) < 1
    ? '✓ Sin saldos compartidos pendientes'
    : (adjNet > 0
        ? p2() + ' debe ' + fmtCLP(adjNet) + ' a ' + p1()
        : p1() + ' debe ' + fmtCLP(Math.abs(adjNet)) + ' a ' + p2());

  var lines = [
    '═══════════════════════════════════',
    'Resumen Qinflo — ' + periodLabel,
    new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }),
    '═══════════════════════════════════',
    '',
    p1() + ' pagó:  ' + fmtCLP(mT),
    p2() + ' pagó:  ' + fmtCLP(pT),
    'Total:        ' + fmtCLP(mT + pT),
    '',
    'Balance compartido (saldo total acumulado):',
    balanceLine
  ];

  if (filteredSettl.length) {
    lines.push('');
    lines.push('Liquidaciones (' + filteredSettl.length + '):');
    filteredSettl.forEach(function(sl) {
      var debtor = sl.fromRole === 'papa' ? p2() : p1();
      var creditor = sl.fromRole === 'papa' ? p1() : p2();
      lines.push('• ' + (sl.date || '') + ' — ' + debtor + ' pagó ' + fmtCLP(sl.amount) + ' a ' + creditor);
    });
  }

  if (vis.length) {
    lines.push('');
    lines.push('Gastos (' + vis.length + '):');
    vis.forEach(function(ex) {
      var paidByLabel = ex.paidBy === 'mama' ? p1() : p2();
      var amtStr = ex.currency === 'UF' ? fmtUF(ex.amount) + ' (' + fmtCLP(toCLP(ex)) + ')' : fmtCLP(ex.amount);
      lines.push('• ' + (ex.date || '') + ' — ' + ex.description + ' — ' + amtStr + ' — ' + paidByLabel);
    });
  }

  lines.push('');
  lines.push('Generado por Qinflo.cl');

  var text = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      alert('✓ Resumen copiado al portapapeles');
    }).catch(function() { prompt('Copia este resumen:', text); });
  } else {
    prompt('Copia este resumen:', text);
  }
}

function renderExpenses() {
  if (!$('expStats')) return;
  var vis = filterPeriod(expenses).filter(function(e){ return !e.voided; });
  var mT = vis.filter(function(e) { return e.paidBy === 'mama'; }).reduce(function(s, e) { return s + toCLP(e); }, 0);
  var pT = vis.filter(function(e) { return e.paidBy === 'papa'; }).reduce(function(s, e) { return s + toCLP(e); }, 0);
  var tot = vis.reduce(function(s, e) { return s + toCLP(e); }, 0);
  var nonCharge = vis.filter(function(e) { return e.treatment === 'pension'; }).reduce(function(s, e) { return s + toCLP(e); }, 0);

  var adjNet = _trueAdjNet();

  $('expStats').innerHTML =
    '<div class="stat-card" style="border-top-color:var(--accent)"><div class="stat-label">' + p1() + '</div><div class="stat-val">' + fmtCLP(mT) + '</div></div>' +
    '<div class="stat-card" style="border-top-color:var(--primary-d)"><div class="stat-label">' + p2() + '</div><div class="stat-val">' + fmtCLP(pT) + '</div></div>' +
    '<div class="stat-card" style="border-top-color:var(--warn)"><div class="stat-label">Total registrado</div><div class="stat-val">' + fmtCLP(tot) + '</div></div>' +
    '<div class="stat-card" style="border-top-color:var(--beige)"><div class="stat-label">Registro no cobrable</div><div class="stat-val">' + fmtCLP(nonCharge) + '</div></div>';

  if (Math.abs(adjNet) < 1) {
    $('balanceBar').innerHTML = '<span style="color:var(--success);font-weight:600">✓ Sin saldos compartidos pendientes</span>';
  } else if (adjNet > 0) {
    $('balanceBar').innerHTML = p2() + ' debe <b style="color:var(--warn)">' + fmtCLP(adjNet) + '</b> a ' + p1() + ' por gastos compartidos';
  } else {
    $('balanceBar').innerHTML = p1() + ' debe <b style="color:var(--warn)">' + fmtCLP(Math.abs(adjNet)) + '</b> a ' + p2() + ' por gastos compartidos';
  }

  if ($('liquidarBtn')) $('liquidarBtn').classList.toggle('hidden', Math.abs(adjNet) < 1);

  // settlements history (listado del período elegido, distinto del saldo real de arriba)
  var filteredSettl = filterPeriod(settlements);
  var sh = $('settlementsHistory');
  if (sh) {
    if (filteredSettl.length) {
      var sRows = filteredSettl.map(function(sl) {
        var debtor = sl.fromRole === 'papa' ? p2() : p1();
        var creditor = sl.fromRole === 'papa' ? p1() : p2();
        var dateStr = sl.date ? new Date(sl.date + 'T12:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">' +
          '<span style="color:var(--text-s)">' + dateStr + ' — ' + debtor + ' pagó a ' + creditor + '</span>' +
          '<span style="font-weight:700;color:var(--success)">' + fmtCLP(sl.amount) + '</span>' +
          '</div>';
      }).join('');
      sh.innerHTML = '<div style="margin-top:14px;background:rgba(107,171,107,.07);border:1px solid rgba(107,171,107,.25);border-radius:12px;padding:12px 16px">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--success);margin-bottom:4px">Liquidaciones del período</div>' +
        sRows +
        '</div>';
    } else {
      sh.innerHTML = '';
    }
  }

  $('expCount').textContent = vis.length + ' registros';
  var el = $('expList');
  if (!vis.length) { el.innerHTML = '<p class="empty-state">Sin gastos en este período</p>'; return; }
  el.innerHTML = '';
  vis.forEach(function(ex) {
    var row = document.createElement('div');
    row.className = 'exp-row';
    var isPaid = ex.paid || ex.treatment === 'pension';
    var chipClass = treatmentClass(ex.treatment || 'shared', isPaid);
    row.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">' +
        '<span style="font-weight:600;font-size:14px;color:var(--text);flex:1;line-height:1.3">' + ex.description + '</span>' +
        '<div style="text-align:right;flex-shrink:0">' +
          '<div style="font-weight:700;font-size:15px;color:var(--text)">' + (ex.currency === 'UF' ? fmtUF(ex.amount) : fmtCLP(ex.amount)) + '</div>' +
          (ex.currency === 'UF' ? '<div style="font-size:10px;color:var(--text-s);margin-top:1px">' + fmtCLP(ex.amount * UF) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<span class="status-chip ' + chipClass + '" style="flex-shrink:0">' + treatmentShortLabel(ex.treatment || 'shared') + '</span>' +
        '<span style="font-size:11px;color:var(--text-s);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ex.date + ' · ' + ex.category + (ex.subcategory ? ' · ' + ex.subcategory : '') + '</span>' +
        '<div style="display:flex;gap:5px;flex-shrink:0">' +
          '<button class="exp-act-btn toggle-paid-btn" style="' + (ex.paid ? 'color:var(--success);border-color:#A7F3D0;background:#ECFDF5' : '') + '" title="' + (ex.paid ? 'Confirmado' : 'Marcar como pagado') + '">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</button>' +
          '<button class="exp-act-btn edit-btn" title="Editar">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button class="exp-act-btn exp-act-danger void-btn" title="Anular">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-s);margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">' +
        '<span>Pagado por ' + (ex.paidBy === 'mama' ? p1() : p2()) + '</span>' +
        (ex.treatment === 'shared' ? '<span style="color:var(--border)">·</span><span>' + p1() + ' ' + (ex.pctMama == null ? 50 : ex.pctMama) + '% / ' + p2() + ' ' + (ex.pctPapa == null ? 50 : ex.pctPapa) + '%</span>' : '') +
        (ex.frequency && ex.frequency !== 'once' ? '<span style="color:var(--border)">·</span><span>' + frequencyLabel(ex.frequency) + '</span>' : '') +
        (ex.category === 'Salud' && ex.healthRefund ? '<span style="color:var(--border)">·</span><span>Reembolso: ' + (ex.healthRefund === 'yes' ? 'Sí' : ex.healthRefund === 'no' ? 'No' : 'Pendiente') + '</span>' : '') +
      '</div>' +
      (ex.attachmentName ? '<div class="file-pill" style="margin-top:5px">📎 ' + ex.attachmentName + '</div>' : '') +
      (ex.reimbursementAttachmentName ? '<div class="file-pill" style="margin-top:3px">📎 Reembolso: ' + ex.reimbursementAttachmentName + '</div>' : '');
    row.querySelector('.toggle-paid-btn').addEventListener('click', async function() {
      var newStatus = ex.paid ? 'pending_review' : 'paid';
      var { error } = await supa.from('expenses').update({ status: newStatus, updated_at: nowISO() }).eq('id', ex.id);
      if (error) { console.error('[toggle paid]', error); alert('No se pudo actualizar: ' + error.message); return; }
      ex.paid = newStatus === 'paid';
      renderExpenses(); renderToday();
    });
    row.querySelector('.edit-btn').addEventListener('click', function() { openExpEdit(ex); });
    row.querySelector('.void-btn').addEventListener('click', async function() {
      if (!confirm('Este gasto no se eliminará. Quedará anulado en el historial.')) return;
      var { error } = await supa.from('expenses').update({ voided: true, voided_at: nowISO(), voided_by: USER.id, updated_at: nowISO() }).eq('id', ex.id);
      if (error) { console.error('[void expense]', error); alert('No se pudo anular: ' + error.message); return; }
      ex.voided = true;
      renderExpenses(); renderToday();
    });
    el.appendChild(row);
  });
}
