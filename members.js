// --- INTEGRANTES -----------------------------------------
var editingMemberId = null;

var MEMBER_ROLES = [
  { value: 'abuelo',    label: 'Abuelo' },
  { value: 'abuela',    label: 'Abuela' },
  { value: 'tio',       label: 'Tío' },
  { value: 'tia',       label: 'Tía' },
  { value: 'cuidador',  label: 'Cuidador/a' },
  { value: 'medico',    label: 'Médico' },
  { value: 'otro',      label: 'Otro' }
];

function memberRoleLabel(v) {
  var r = MEMBER_ROLES.find(function(x) { return x.value === v; });
  return r ? r.label : (v || 'Otro');
}

async function saveMember() {
  var name = $('memberName').value.trim();
  if (!name) { $('memberName').focus(); return; }
  var data = {
    name:       name,
    role:       $('memberRole').value,
    phone:      $('memberPhone').value.trim() || null,
    relatedTo:  $('memberRelatedTo').value,
    notes:      $('memberNotes').value.trim() || null,
    updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
  };
  if (editingMemberId) {
    await famCol('members').doc(editingMemberId).update(data);
    editingMemberId = null;
  } else {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.createdBy = USER.uid;
    await famCol('members').add(data);
  }
  _resetMemberForm();
  hide('memberForm');
}

function openMemberEdit(m) {
  editingMemberId = m.id;
  $('memberName').value      = m.name || '';
  $('memberRole').value      = m.role || 'otro';
  $('memberPhone').value     = m.phone || '';
  $('memberRelatedTo').value = m.relatedTo || 'both';
  $('memberNotes').value     = m.notes || '';
  var hdr = document.querySelector('#memberForm p');
  if (hdr) hdr.textContent = 'Editar integrante';
  $('memberForm').classList.remove('hidden');
  $('memberName').focus();
}

function _resetMemberForm() {
  editingMemberId = null;
  ['memberName','memberPhone','memberNotes'].forEach(function(id) { $(id).value = ''; });
  $('memberRole').value      = 'otro';
  $('memberRelatedTo').value = 'both';
  var hdr = document.querySelector('#memberForm p');
  if (hdr) hdr.textContent = 'Nuevo integrante';
}

function renderMembers() {
  var el = $('memberList');
  if (!el) return;
  if (!members.length) {
    el.innerHTML = '<div class="empty-state">Sin integrantes registrados</div>';
    return;
  }
  var sorted = members.slice().sort(function(a, b) {
    return (a.name || '').localeCompare(b.name || '', 'es');
  });
  el.innerHTML = '';
  var card = document.createElement('div');
  card.className = 'card';
  sorted.forEach(function(m) {
    var relLabel = m.relatedTo === 'p1' ? 'Red de ' + p1()
                 : m.relatedTo === 'p2' ? 'Red de ' + p2()
                 : 'Compartido';
    var relColor = m.relatedTo === 'p1' ? 'var(--accent)'
                 : m.relatedTo === 'p2' ? 'var(--primary-d)'
                 : 'var(--text-s)';
    var row = document.createElement('div');
    row.style.cssText = 'padding:13px 0;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start';
    row.innerHTML =
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px">' +
          '<span style="font-size:10px;font-weight:700;background:rgba(0,0,0,.06);color:var(--text-s);border-radius:6px;padding:2px 7px">' + memberRoleLabel(m.role) + '</span>' +
          '<span style="font-size:10px;font-weight:600;background:rgba(0,0,0,.04);color:' + relColor + ';border-radius:6px;padding:2px 7px">' + relLabel + '</span>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text)">' + m.name + '</div>' +
        (m.phone ? '<a href="tel:' + m.phone + '" style="font-size:12px;color:var(--primary-d);margin-top:3px;display:inline-flex;align-items:center;gap:4px">📞 ' + m.phone + '</a>' : '') +
        (m.notes ? '<div style="font-size:12px;color:var(--text-s);margin-top:3px">' + m.notes + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button class="btn-outline mem-edit" style="padding:5px 8px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
        '<button class="btn-danger mem-del" style="padding:5px 8px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>' +
      '</div>';
    row.querySelector('.mem-edit').addEventListener('click', function() { openMemberEdit(m); });
    row.querySelector('.mem-del').addEventListener('click', function() {
      if (confirm('¿Eliminar a "' + m.name + '"?')) famCol('members').doc(m.id).delete();
    });
    card.appendChild(row);
  });
  el.appendChild(card);
}
