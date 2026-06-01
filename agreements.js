// --- ACUERDOS -----------------------------------------------
async function saveAgr() {
  var title = $('agrTitle').value.trim(), content = $('agrContent').value.trim();
  if (!title || !content) return;
  await famCol('agreements').add({
    title: title, content: content,
    category: $('agrCat').value, status: $('agrStatus').value,
    date: new Date().toISOString().slice(0, 10),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: USER.uid
  });
  $('agrTitle').value = ''; $('agrContent').value = '';
  hide('agrForm');
}

function renderAgreements() {
  var el = $('agrList');
  if (!el) return;
  if (!agreements.length) { el.innerHTML = '<div class="empty-state">Sin acuerdos registrados</div>'; return; }
  el.innerHTML = '';
  var sColor = { 'Activo': 'var(--success)', 'En revisión': 'var(--warn)', 'Completado': 'var(--text-s)' };
  agreements.forEach(function(agr) {
    var isExp = expandedAgr === agr.id;
    var sc = sColor[agr.status] || 'var(--text-s)';
    var card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '10px';
    card.innerHTML =
      '<div class="agr-header">' +
        '<div>' +
          '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:7px">' +
            '<span class="badge" style="background:' + sc.replace(')', '').replace('var(', '') + '22' + ';color:' + sc + ';border:1px solid ' + sc + '44">' + agr.status + '</span>' +
            '<span class="badge" style="background:var(--bg);color:var(--text-s);border:1px solid var(--border)">' + agr.category + '</span>' +
          '</div>' +
          '<h3 style="margin:0;font-size:14px;font-weight:600;color:var(--text)">' + agr.title + '</h3>' +
        '</div>' +
        '<div style="display:flex;gap:7px;align-items:center">' +
          '<span class="toggle-agr" style="cursor:pointer;color:var(--text-s);font-size:12px">' + (isExp ? '▲' : '▼') + '</span>' +
          '<button class="btn-danger del-btn"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>' +
        '</div>' +
      '</div>' +
      (isExp ? '<div class="agr-body"><div class="agr-content">' + agr.content + '</div></div>' : '');
    card.querySelector('.toggle-agr').addEventListener('click', function() { expandedAgr = isExp ? null : agr.id; renderAgreements(); });
    card.querySelector('.del-btn').addEventListener('click', function() { famCol('agreements').doc(agr.id).delete(); });
    el.appendChild(card);
  });
}
