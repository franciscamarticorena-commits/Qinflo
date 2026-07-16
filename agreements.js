// --- ACUERDOS -----------------------------------------------
var editingAgrId = null;

var AGR_STATUS_COLORS = {
  'Activo':      { bg: 'rgba(107,171,107,.15)', color: 'var(--success)',  border: 'rgba(107,171,107,.35)' },
  'En revisión': { bg: 'rgba(216,164,95,.15)',  color: 'var(--warn)',     border: 'rgba(216,164,95,.35)' },
  'Completado':  { bg: 'rgba(0,0,0,.06)',       color: 'var(--text-s)',   border: 'rgba(0,0,0,.12)' }
};

async function saveAgr() {
  var title   = $('agrTitle').value.trim();
  var content = $('agrContent').value.trim();
  if (!title || !content) return;

  var error;
  if (editingAgrId) {
    ({ error } = await supa.from('agreements').update({
      title:      title,
      content:    content,
      category:   $('agrCat').value,
      status:     $('agrStatus').value,
      updated_at: nowISO()
    }).eq('id', editingAgrId));
    editingAgrId = null;
  } else {
    var initSig = {};
    initSig[USER.id] = new Date().toISOString();
    ({ error } = await supa.from('agreements').insert({
      family_id:      FAMILY_ID,
      title:          title,
      content:        content,
      category:       $('agrCat').value,
      status:         $('agrStatus').value,
      created_by:     USER.id,
      created_by_role: myRole(),
      signatures:     initSig
    }));
  }
  if (error) {
    console.error('[saveAgr]', error);
    alert('No se pudo guardar el acuerdo: ' + error.message);
    return;
  }
  if (typeof loadAgreements === 'function') await loadAgreements();
  _resetAgrForm();
  hide('agrForm');
}

function openAgrEdit(agr) {
  editingAgrId      = agr.id;
  $('agrTitle').value   = agr.title   || '';
  $('agrContent').value = agr.content || '';
  $('agrCat').value     = agr.category || 'Otro';
  $('agrStatus').value  = agr.status  || 'Activo';
  var hdr = $('agrFormTitle');
  if (hdr) hdr.textContent = 'Editar acuerdo';
  $('agrForm').classList.remove('hidden');
  $('agrTitle').focus();
}

function _resetAgrForm() {
  editingAgrId = null;
  $('agrTitle').value = ''; $('agrContent').value = '';
  $('agrCat').value = 'Custodia'; $('agrStatus').value = 'Activo';
  var hdr = $('agrFormTitle');
  if (hdr) hdr.textContent = 'Nuevo acuerdo';
}

async function signAgreement(agrId) {
  // Obtener el acuerdo actual para hacer merge del campo signatures
  var { data: agr, error: selErr } = await supa.from('agreements').select('signatures').eq('id', agrId).single();
  if (selErr) { console.error('[signAgreement]', selErr); alert('No se pudo firmar: ' + selErr.message); return; }
  var sigs = (agr && agr.signatures) ? agr.signatures : {};
  sigs[USER.id] = new Date().toISOString();
  var { error } = await supa.from('agreements').update({ signatures: sigs, updated_at: nowISO() }).eq('id', agrId);
  if (error) { console.error('[signAgreement]', error); alert('No se pudo firmar: ' + error.message); return; }
  var local = agreements.find(function(a) { return a.id === agrId; });
  if (local) local.signatures = sigs;
  renderAgreements();
}

async function changeAgrStatus(agrId, status) {
  var { error } = await supa.from('agreements').update({ status: status, updated_at: nowISO() }).eq('id', agrId);
  if (error) { console.error('[changeAgrStatus]', error); alert('No se pudo cambiar el estado: ' + error.message); return; }
  var local = agreements.find(function(a) { return a.id === agrId; });
  if (local) local.status = status;
  renderAgreements();
}

function renderAgreements() {
  var el = $('agrList');
  if (!el) return;
  if (!agreements.length) {
    el.innerHTML = '<div class="empty-state">Sin acuerdos registrados</div>';
    return;
  }
  el.innerHTML = '';

  agreements.forEach(function(agr) {
    var sc     = AGR_STATUS_COLORS[agr.status] || AGR_STATUS_COLORS['Activo'];
    var sigs   = agr.signatures || {};
    var myUid  = USER && USER.id;
    var coUid  = USERDATA && USERDATA.coparentId;
    var iSigned  = !!sigs[myUid];
    var coSigned = coUid ? !!sigs[coUid] : false;
    var bothSigned = iSigned && (coUid ? coSigned : true);

    var sigHtml = '';
    if (bothSigned) {
      sigHtml = '<span style="font-size:11px;color:var(--success);font-weight:600">✓ Confirmado por ambos</span>';
    } else if (iSigned) {
      sigHtml = '<span style="font-size:11px;color:var(--text-s)">Tú confirmaste · esperando a ' + (CODATA && CODATA.name ? CODATA.name.split(' ')[0] : p2()) + '</span>';
    } else {
      sigHtml = '<button class="btn-sm sign-btn" style="font-size:11px;padding:5px 12px;background:var(--primary)">Confirmar acuerdo</button>';
    }

    var dateStr = agr.date ? new Date(agr.date + 'T12:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var updStr  = agr.updatedAt ? ' · Editado' : '';
    var creatorLabel = agr.createdByRole === myRole() ? 'Tú' : (CODATA && CODATA.name ? CODATA.name.split(' ')[0] : (agr.createdByRole === 'p1' ? p1() : p2()));

    // Next status cycle
    var nextStatus = agr.status === 'Activo' ? 'En revisión' : agr.status === 'En revisión' ? 'Completado' : 'Activo';
    var nextIcon   = agr.status === 'Activo' ? '🔄' : agr.status === 'En revisión' ? '✓' : '↺';

    var card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '10px';
    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<span style="font-size:10px;font-weight:700;border-radius:6px;padding:2px 8px;background:' + sc.bg + ';color:' + sc.color + ';border:1px solid ' + sc.border + '">' + agr.status + '</span>' +
          '<span style="font-size:10px;font-weight:600;border-radius:6px;padding:2px 8px;background:var(--border);color:var(--text-s)">' + agr.category + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">' +
          '<button class="btn-outline edit-btn" title="Editar" style="padding:4px 8px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
          '<button class="btn-danger del-btn" title="Eliminar" style="padding:4px 8px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:var(--text);line-height:1.3">' + agr.title + '</h3>' +
      '<p style="font-size:13px;color:var(--text-s);line-height:1.6;margin:0 0 12px;white-space:pre-wrap">' + agr.content + '</p>' +
      '<div style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
        '<div>' +
          sigHtml +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
          (agr.status !== 'Completado'
            ? '<button class="btn-outline status-btn" style="font-size:11px;padding:4px 10px" title="Cambiar estado">' + nextIcon + ' ' + nextStatus + '</button>'
            : '') +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px;font-size:11px;color:var(--text-s)">' +
        (dateStr ? dateStr + ' · ' : '') + 'Creado por ' + creatorLabel + updStr +
      '</div>';

    card.querySelector('.edit-btn').addEventListener('click', function() { openAgrEdit(agr); });
    card.querySelector('.del-btn').addEventListener('click', async function() {
      if (!confirm('¿Eliminar el acuerdo "' + agr.title + '"?')) return;
      var { error } = await supa.from('agreements').update({ deleted_at: nowISO() }).eq('id', agr.id);
      if (error) { console.error('[delete agreement]', error); alert('No se pudo eliminar: ' + error.message); return; }
      agreements = agreements.filter(function(a) { return a.id !== agr.id; });
      renderAgreements();
    });
    if (!iSigned) {
      var signBtn = card.querySelector('.sign-btn');
      if (signBtn) signBtn.addEventListener('click', function() { signAgreement(agr.id); });
    }
    var statusBtn = card.querySelector('.status-btn');
    if (statusBtn) statusBtn.addEventListener('click', function() { changeAgrStatus(agr.id, nextStatus); });

    el.appendChild(card);
  });
}
