// --- RECORDATORIOS ------------------------------------------
var editingRemId = null;

async function saveRem() {
  var title = $('remTitle').value.trim(), date = $('remDate').value;
  if (!title || !date) return;
  if (editingRemId) {
    await supa.from('reminders').update({ title: title, date: date, assigned_to: $('remFor').value }).eq('id', editingRemId);
    editingRemId = null;
  } else {
    await supa.from('reminders').insert({
      family_id:   FAMILY_ID,
      title:       title,
      date:        date,
      assigned_to: $('remFor').value,
      status:      'pending',
      created_by:  USER.id
    });
  }
  $('remTitle').value = ''; $('remDate').value = '';
  var hdr = document.querySelector('#remForm p');
  if (hdr) hdr.textContent = 'Nuevo aviso';
  hide('remForm');
}

function cancelRemForm() {
  editingRemId = null;
  $('remTitle').value = ''; $('remDate').value = '';
  var hdr = document.querySelector('#remForm p');
  if (hdr) hdr.textContent = 'Nuevo aviso';
  hide('remForm');
}

function openRemEdit(r) {
  editingRemId = r.id;
  $('remTitle').value = r.title || '';
  $('remDate').value = r.date || '';
  $('remFor').value = r.for || 'both';
  var hdr = document.querySelector('#remForm p');
  if (hdr) hdr.textContent = 'Editar aviso';
  $('remForm').classList.remove('hidden');
  $('remTitle').focus();
}

function fLbl(f) { return f === 'both' ? 'Ambos' : f === 'mama' ? p1() : p2(); }
function fColor(f) { return f === 'both' ? '#8A8A78' : f === 'mama' ? 'var(--accent)' : 'var(--primary-d)'; }

function renderReminders() {
  var el = $('remList');
  if (!el) return;
  var up = reminders.filter(function(r) { return !r.done; }).sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  var done = reminders.filter(function(r) { return r.done; });
  if (!reminders.length) { el.innerHTML = '<div class="empty-state">Sin avisos</div>'; return; }
  el.innerHTML = '';
  if (up.length) {
    var hdr = document.createElement('p');
    hdr.className = 'section-lbl';
    hdr.textContent = 'Próximos';
    el.appendChild(hdr);
    var card = document.createElement('div');
    card.className = 'card';
    up.forEach(function(r) {
      var d = new Date(r.date);
      var near = (d - new Date()) < 86400000 * 3;
      var fc = fColor(r.for);
      var row = document.createElement('div');
      row.className = 'rem-row';
      row.innerHTML =
        '<div style="flex:1">' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px">' +
            (near ? '<span class="badge" style="background:rgba(216,164,95,.15);color:var(--warn);border:1px solid rgba(216,164,95,.3)">Pronto</span>' : '') +
            '<span class="badge" style="background:rgba(0,0,0,.05);color:' + fc + '">' + fLbl(r.for) + '</span>' +
          '</div>' +
          '<div class="rem-title">' + r.title + '</div>' +
          '<div class="rem-meta">' + d.toLocaleDateString('es-CL', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:7px">' +
          '<button class="btn-outline edit-rem-btn" style="padding:5px 8px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
          '<button class="btn-done done-btn"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>' +
          '<button class="btn-danger del-btn"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>' +
        '</div>';
      row.querySelector('.edit-rem-btn').addEventListener('click', function() { openRemEdit(r); });
      row.querySelector('.done-btn').addEventListener('click', function() { supa.from('reminders').update({ status: 'completed' }).eq('id', r.id); });
      row.querySelector('.del-btn').addEventListener('click', function() { supa.from('reminders').update({ deleted_at: nowISO() }).eq('id', r.id); });
      card.appendChild(row);
    });
    el.appendChild(card);
  }
  if (done.length) {
    var hdr2 = document.createElement('p');
    hdr2.className = 'section-lbl';
    hdr2.style.marginTop = '16px';
    hdr2.textContent = 'Completados';
    el.appendChild(hdr2);
    done.forEach(function(r) {
      var row = document.createElement('div');
      row.style.cssText = 'background:var(--surface);border-radius:11px;padding:11px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;opacity:.45;border:1px solid var(--border)';
      row.innerHTML = '<div style="font-weight:600;font-size:12px;text-decoration:line-through;color:var(--text-s)">' + r.title + '</div><button class="btn-undo undone-btn"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13C5.5 7 12 5 17 8s6.5 9.5 2 14"/></svg></button>';
      row.querySelector('.undone-btn').addEventListener('click', function() { supa.from('reminders').update({ status: 'pending' }).eq('id', r.id); });
      el.appendChild(row);
    });
  }
}
