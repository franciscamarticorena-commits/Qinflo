// --- GASTOS -------------------------------------------------

const EXP_SUBCATS = {
  'Educación': ['Matrícula','Colegiatura mensual','Academias / extra programáticas / refuerzo escolar','Útiles escolares','Uniformes','Transporte escolar','Casino / almuerzo / colación'],
  'Salud': ['Seguro escolar','Isapre / Fonasa','Seguro complementario','Cita a especialistas','Tratamientos','Terapias'],
  'Vida cotidiana': ['Celebraciones','Mesada','Celular / conectividad','Salidas / panoramas'],
  'Gastos extraordinarios': ['Gasto puntual / no recurrente']
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
  var reimburse = $('reimburseBox');
  var distBox = $('expDistributionBox');
  var distHint = $('expDistributionHint');
  var refundBox = $('expHealthRefundBox');
  if (reimburse) reimburse.classList.toggle('hidden', t !== 'shared');
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

async function saveExp() {
  var desc = $('expDesc').value.trim(), amt = $('expAmount').value;
  if (!desc || !amt) return;
  var tval = $('expTreatment') ? $('expTreatment').value : 'shared';
  var pctM = tval === 'shared' ? Number(($('pctMama') && $('pctMama').value) || 50) : (tval === 'mama_only' ? 100 : 0);
  var pctP = tval === 'shared' ? Number(($('pctPapa') && $('pctPapa').value) || 50) : (tval === 'papa_only' ? 100 : 0);
  var f = $('expFile') && $('expFile').files && $('expFile').files[0] ? $('expFile').files[0].name : '';
  var rf = $('expReimburseFile') && $('expReimburseFile').files && $('expReimburseFile').files[0] ? $('expReimburseFile').files[0].name : '';
  await famCol('expenses').add({
    description: desc, amount: Number(amt), currency: expCurrency,
    paidBy: $('expPaidBy').value,
    category: $('expCat').value,
    subcategory: $('expSubcat') ? $('expSubcat').value : '',
    frequency: $('expFrequency') ? $('expFrequency').value : 'unique',
    treatment: $('expTreatment') ? $('expTreatment').value : 'shared',
    attachmentName: f,
    reimbursementAttachmentName: rf,
    healthRefund: $('expHealthRefund') ? $('expHealthRefund').value : '',
    pctMama: pctM,
    pctPapa: pctP,
    date: new Date().toISOString().slice(0, 10), paid: false, voided: false,
    history: [{ action: 'Gasto registrado', at: new Date().toISOString(), by: USERDATA ? USERDATA.name : '' }],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: USER.uid
  });
  $('expDesc').value = ''; $('expAmount').value = ''; if ($('expFile')) $('expFile').value = ''; if ($('expReimburseFile')) $('expReimburseFile').value = '';
  hide('expForm');
}

function renderExpenses() {
  if (!$('expStats')) return;
  var vis = filterPeriod(expenses).filter(function(e){ return !e.voided; });
  var chargeable = vis.filter(function(e) { return e.treatment !== 'pension'; });
  var mT = vis.filter(function(e) { return e.paidBy === 'mama'; }).reduce(function(s, e) { return s + toCLP(e); }, 0);
  var pT = vis.filter(function(e) { return e.paidBy === 'papa'; }).reduce(function(s, e) { return s + toCLP(e); }, 0);
  var tot = vis.reduce(function(s, e) { return s + toCLP(e); }, 0);
  var nonCharge = vis.filter(function(e) { return e.treatment === 'pension'; }).reduce(function(s, e) { return s + toCLP(e); }, 0);
  var unp = chargeable.filter(function(e) { return !e.paid; }).reduce(function(s, e) { return s + toCLP(e); }, 0);
  var netBase = chargeable.filter(function(e){ return e.treatment === 'shared'; });
  var net = netBase.reduce(function(s, e) {
    var amount = toCLP(e);
    var mShould = amount * ((e.pctMama == null ? 50 : e.pctMama) / 100);
    var mPaid = e.paidBy === 'mama' ? amount : 0;
    return s + (mPaid - mShould);
  }, 0);
  $('expStats').innerHTML =
    '<div class="stat-card" style="border-top-color:var(--accent)"><div class="stat-label">' + p1() + '</div><div class="stat-val">' + fmtCLP(mT) + '</div></div>' +
    '<div class="stat-card" style="border-top-color:var(--primary-d)"><div class="stat-label">' + p2() + '</div><div class="stat-val">' + fmtCLP(pT) + '</div></div>' +
    '<div class="stat-card" style="border-top-color:var(--warn)"><div class="stat-label">Total registrado</div><div class="stat-val">' + fmtCLP(tot) + '</div></div>' +
    '<div class="stat-card" style="border-top-color:var(--beige)"><div class="stat-label">Registro no cobrable</div><div class="stat-val">' + fmtCLP(nonCharge) + '</div></div>';
  if (Math.abs(net) < 1) {
    $('balanceBar').innerHTML = '<span style="color:var(--success);font-weight:600">✓ Sin saldos compartidos pendientes</span>';
  } else if (net > 0) {
    $('balanceBar').innerHTML = p2() + ' debe <b style="color:var(--warn)">' + fmtCLP(net) + '</b> a ' + p1() + ' por gastos compartidos';
  } else {
    $('balanceBar').innerHTML = p1() + ' debe <b style="color:var(--warn)">' + fmtCLP(Math.abs(net)) + '</b> a ' + p2() + ' por gastos compartidos';
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
      '<div style="flex:1">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
          '<span style="font-weight:600;font-size:13px;color:var(--text)">' + ex.description + '</span>' +
          '<span class="status-chip ' + chipClass + '">' + treatmentLabel(ex.treatment || 'shared') + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-s)">' + ex.date + ' · ' + ex.category + (ex.subcategory ? ' · ' + ex.subcategory : '') + ' · ' + frequencyLabel(ex.frequency || 'unique') + (ex.treatment === 'shared' ? ' · Distribución: ' + p1() + ' ' + (ex.pctMama == null ? 50 : ex.pctMama) + '% / ' + p2() + ' ' + (ex.pctPapa == null ? 50 : ex.pctPapa) + '%' : '') + (ex.category === 'Salud' && ex.healthRefund ? ' · Reembolso salud: ' + (ex.healthRefund === 'yes' ? 'Sí genera' : ex.healthRefund === 'no' ? 'No genera' : 'Pendiente') : '') + ' · Pagado por: ' + (ex.paidBy === 'mama' ? p1() : p2()) + '</div>' +
        (ex.attachmentName ? '<div class="file-pill">📎 Respaldo gasto: ' + ex.attachmentName + '</div>' : '') +
        (ex.reimbursementAttachmentName ? '<div class="file-pill">📎 Respaldo reembolso: ' + ex.reimbursementAttachmentName + '</div>' : '') +
      '</div>' +
      '<div style="text-align:right;display:flex;align-items:center;gap:9px">' +
        '<div>' +
          '<div style="font-weight:700;font-size:14px;color:var(--text)">' + (ex.currency === 'UF' ? fmtUF(ex.amount) : fmtCLP(ex.amount)) + '</div>' +
          (ex.currency === 'UF' ? '<div style="font-size:10px;color:var(--text-s)">' + fmtCLP(ex.amount * UF) + '</div>' : '') +
        '</div>' +
        '<button class="btn-outline toggle-paid-btn" style="padding:7px 10px">' + (ex.paid ? 'Confirmado' : 'Marcar OK') + '</button>' +
        '<button class="btn-danger void-btn" title="Anular"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
      '</div>';
    row.querySelector('.toggle-paid-btn').addEventListener('click', function() { famCol('expenses').doc(ex.id).update({ paid: !ex.paid, lastActionAt: firebase.firestore.FieldValue.serverTimestamp(), lastActionBy: USER.uid }); });
    row.querySelector('.void-btn').addEventListener('click', function() { if (confirm('Este gasto no se eliminará. Quedará anulado en el historial.')) famCol('expenses').doc(ex.id).update({ voided: true, voidedAt: firebase.firestore.FieldValue.serverTimestamp(), voidedBy: USER.uid }); });
    el.appendChild(row);
  });
}
