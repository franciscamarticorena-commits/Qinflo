// --- HIJOS --------------------------------------------------
function calcAge(birth) {
  if (!birth) return '';
  var b = new Date(birth), n = new Date();
  var age = n.getFullYear() - b.getFullYear();
  var m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
  return age;
}
function openKidForm(kid) {
  $('kidFormTitle').textContent = kid ? 'Editar hijo' : 'Agregar hijo';
  $('editKidId').value = kid ? kid.id : '';
  $('kidName').value = kid ? kid.name || '' : '';
  $('kidBirth').value = kid ? kid.birthDate || '' : '';
  $('kidAge').value = kid && kid.birthDate ? calcAge(kid.birthDate) + ' años' : (kid ? kid.age || '' : '');
  $('kidSchool').value = kid ? kid.school || '' : '';
  $('kidDoctor').value = kid ? kid.doctor || '' : '';
  $('kidClinic').value = kid ? kid.clinic || '' : '';
  $('kidSchoolInsurance').value = kid ? kid.schoolInsurance || '' : '';
  $('kidAllergies').value = kid ? kid.allergies || '' : '';
  $('kidBlood').value = kid ? kid.bloodType || '' : '';
  $('kidNotes').value = kid ? kid.notes || '' : '';
  show('kidForm');
}

async function saveKid() {
  var name = $('kidName').value.trim();
  if (!name) return;
  var data = {
    name:             name,
    birth_date:       $('kidBirth').value || null,
    school:           $('kidSchool').value,
    doctor:           $('kidDoctor').value,
    clinic:           $('kidClinic').value,
    school_insurance: $('kidSchoolInsurance').value,
    allergies:        $('kidAllergies').value,
    blood_type:       $('kidBlood').value,
    notes:            $('kidNotes').value
  };
  var id = $('editKidId').value;
  if (id) {
    await supa.from('children').update({ ...data, updated_at: nowISO() }).eq('id', id);
  } else {
    await supa.from('children').insert({ ...data, family_id: FAMILY_ID });
  }
  hide('kidForm');
}

function renderChildren() {
  var el = $('kidList');
  if (!el) return;
  if (!children.length) { el.innerHTML = '<div class="empty-state">Agrega el perfil de tus hijos</div>'; return; }
  el.innerHTML = '';
  children.forEach(function(kid) {
    var initials = (kid.name || '?').split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<div class="card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
          '<div style="display:flex;gap:14px;align-items:center">' +
            '<div class="kid-avatar">' + initials + '</div>' +
            '<div>' +
              '<h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text)">' + kid.name + '</h3>' +
              '<p style="margin:3px 0 0;color:var(--text-s);font-size:12px">' + (kid.birthDate ? calcAge(kid.birthDate) + ' años' : ((kid.age || '') + (kid.age ? ' años' : ''))) + '</p>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:7px">' +
            '<button class="btn-outline edit-btn" style="padding:7px 12px"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
            '<button class="btn-danger del-btn"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>' +
          '</div>' +
        '</div>' +
        '<div class="info-grid">' +
          '<div class="info-item"><div class="info-item-label">Fecha nacimiento</div><div class="info-item-val">' + (kid.birthDate || '-') + '</div></div>' +
          '<div class="info-item"><div class="info-item-label">Colegio</div><div class="info-item-val">' + (kid.school || '-') + '</div></div>' +
          '<div class="info-item"><div class="info-item-label">Doctor / Pediatra</div><div class="info-item-val">' + (kid.doctor || '-') + '</div></div>' +
          '<div class="info-item"><div class="info-item-label">Clínica preferente</div><div class="info-item-val">' + (kid.clinic || '-') + '</div></div>' +
          '<div class="info-item"><div class="info-item-label">Seguro escolar</div><div class="info-item-val">' + (kid.schoolInsurance || '-') + '</div></div>' +
          '<div class="info-item"><div class="info-item-label">Grupo sanguíneo</div><div class="info-item-val">' + (kid.bloodType || '-') + '</div></div>' +
          '<div class="info-item"><div class="info-item-label">Alergias</div><div class="info-item-val">' + (kid.allergies || '-') + '</div></div>' +
        '</div>' +
        (kid.notes ? '<div class="notes-box"><div style="font-size:10px;color:var(--primary);font-weight:700;margin-bottom:3px;text-transform:uppercase;letter-spacing:.3px">Notas</div><div style="font-size:12px;color:var(--text);line-height:1.55">' + kid.notes + '</div></div>' : '') +
      '</div>';
    card.querySelector('.edit-btn').addEventListener('click', function() { openKidForm(kid); });
    card.querySelector('.del-btn').addEventListener('click', function() { supa.from('children').update({ deleted_at: nowISO() }).eq('id', kid.id); });
    el.appendChild(card);
  });
}
