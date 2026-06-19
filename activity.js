// --- ACTIVIDAD RECIENTE ----------------------------------------

async function logActivity(type, description, meta) {
  if (!FAMILY_ID || !USER) return;
  try {
    await famCol('activity').add({
      type: type,
      actorUid: USER.uid,
      actorName: USERDATA ? USERDATA.name : '',
      actorRole: myRole(),
      description: description,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      meta: meta || {}
    });
  } catch(e) { console.error('[logActivity]', e); }
}

function _relTime(ts) {
  if (!ts) return '';
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  var diff = Math.round((new Date() - d) / 1000);
  if (diff < 60) return 'Ahora mismo';
  if (diff < 3600) return 'Hace ' + Math.round(diff / 60) + ' min';
  if (diff < 86400) return 'Hace ' + Math.round(diff / 3600) + ' h';
  var days = Math.round(diff / 86400);
  if (days === 1) return 'Ayer';
  if (days <= 7) return 'Hace ' + days + ' días';
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

function renderTodayActivity() {
  var el = $('todayActivityBlock');
  var card = $('todayActivityCard');
  if (!el) return;
  if (!activityLog || !activityLog.length) {
    if (card) card.classList.add('hidden');
    return;
  }
  if (card) card.classList.remove('hidden');
  el.innerHTML = activityLog.slice(0, 10).map(function(a) {
    var time = a.createdAt ? _relTime(a.createdAt) : '';
    var actor = a.actorName ? a.actorName.split(' ')[0] : '';
    return '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<div style="width:6px;height:6px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:6px"></div>' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;color:var(--text)">' + a.description + '</div>' +
        (actor || time ? '<div style="font-size:11px;color:var(--text-s);margin-top:2px">' + [actor, time].filter(Boolean).join(' · ') + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}
