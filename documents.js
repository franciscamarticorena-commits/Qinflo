// --- DOCUMENTOS ------------------------------------------
var editingDocId = null;

var DOC_TYPES = [
  { value: 'rut',          label: 'RUT / Cédula' },
  { value: 'carnet_salud', label: 'Carnet de salud' },
  { value: 'vacunas',      label: 'Vacunas' },
  { value: 'colegio',      label: 'Colegio' },
  { value: 'legal',        label: 'Legal' },
  { value: 'seguro',       label: 'Seguro' },
  { value: 'otro',         label: 'Otro' }
];

function docTypeLabel(v) {
  var t = DOC_TYPES.find(function(x) { return x.value === v; });
  return t ? t.label : (v || 'Otro');
}

async function saveDoc() {
  var title = $('docTitle').value.trim();
  if (!title) { $('docTitle').focus(); return; }
  var data = {
    title:    title,
    type:     $('docType').value,
    childId:  $('docChild').value || null,
    url:      $('docUrl').value.trim() || null,
    notes:    $('docNotes').value.trim() || null,
    updated_at: nowISO()
  };
  if (editingDocId) {
    await supa.from('documents').update(data).eq('id', editingDocId);
    editingDocId = null;
  } else {
    await supa.from('documents').insert({
      ...data,
      family_id:  FAMILY_ID,
      child_id:   data.childId || null,
      created_by: USER.id
    });
  }
  _resetDocForm();
  hide('docForm');
}

function openDocEdit(doc) {
  editingDocId = doc.id;
  $('docTitle').value = doc.title || '';
  $('docType').value  = doc.type || 'otro';
  $('docChild').value = doc.childId || '';
  $('docUrl').value   = doc.url || '';
  $('docNotes').value = doc.notes || '';
  var hdr = document.querySelector('#docForm p');
  if (hdr) hdr.textContent = 'Editar documento';
  $('docForm').classList.remove('hidden');
  $('docTitle').focus();
}

function _resetDocForm() {
  editingDocId = null;
  ['docTitle','docUrl','docNotes'].forEach(function(id) { $(id).value = ''; });
  $('docType').value  = 'otro';
  $('docChild').value = '';
  var hdr = document.querySelector('#docForm p');
  if (hdr) hdr.textContent = 'Nuevo documento';
}

function _populateDocChildSelect() {
  var sel = $('docChild');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">Todos / General</option>';
  (children || []).forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name ? c.name.split(' ')[0] : c.id;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

function renderDocuments() {
  var el = $('docList');
  if (!el) return;
  _populateDocChildSelect();
  if (!documents.length) {
    el.innerHTML = '<div class="empty-state">Sin documentos guardados</div>';
    return;
  }
  var sorted = documents.slice().sort(function(a, b) {
    return (a.title || '').localeCompare(b.title || '', 'es');
  });
  el.innerHTML = '';
  var card = document.createElement('div');
  card.className = 'card';
  sorted.forEach(function(doc) {
    var child = (children || []).find(function(c) { return c.id === doc.childId; });
    var childName = child ? (child.name ? child.name.split(' ')[0] : '') : '';
    var row = document.createElement('div');
    row.style.cssText = 'padding:13px 0;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start';
    row.innerHTML =
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px">' +
          '<span style="font-size:10px;font-weight:700;background:rgba(107,122,87,.12);color:var(--primary-d);border-radius:6px;padding:2px 7px">' + docTypeLabel(doc.type) + '</span>' +
          (childName ? '<span style="font-size:10px;font-weight:600;background:var(--border);color:var(--text-s);border-radius:6px;padding:2px 7px">' + childName + '</span>' : '') +
        '</div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text)">' + doc.title + '</div>' +
        (doc.notes ? '<div style="font-size:12px;color:var(--text-s);margin-top:3px">' + doc.notes + '</div>' : '') +
        (doc.url ? '<a href="' + doc.url + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--primary-d);margin-top:4px;display:inline-block">Ver documento ↗</a>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button class="btn-outline doc-edit" style="padding:5px 8px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
        '<button class="btn-danger doc-del" style="padding:5px 8px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>' +
      '</div>';
    row.querySelector('.doc-edit').addEventListener('click', function() { openDocEdit(doc); });
    row.querySelector('.doc-del').addEventListener('click', function() {
      if (confirm('¿Eliminar "' + doc.title + '"?')) supa.from('documents').update({ deleted_at: nowISO() }).eq('id', doc.id);
    });
    card.appendChild(row);
  });
  el.appendChild(card);
}
