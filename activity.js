// --- ACTIVIDAD RECIENTE ----------------------------------------

async function logActivity(type, description, meta) {
  if (!FAMILY_ID || !USER) return;
  try {
    await supa.from('activity_logs').insert({
      family_id:     FAMILY_ID,
      actor_user_id: USER.id,
      actor_role:    myRole(),
      type:          type,
      summary:       description,
      metadata:      meta || {}
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

// Colapsada por defecto; se expande al tocar el encabezado. Muestra una
// burbuja con la cantidad de hechos nuevos desde la última vez que se abrió
// (estilo WhatsApp), guardada en localStorage por familia.
var _activityExpanded = false;

function _activitySeenKey() { return 'qinflo_activity_seen_' + (FAMILY_ID || ''); }
function _getActivitySeenAt() {
  try { return localStorage.getItem(_activitySeenKey()) || null; } catch(e) { return null; }
}
function _setActivitySeenNow() {
  try { localStorage.setItem(_activitySeenKey(), nowISO()); } catch(e) {}
}

function toggleTodayActivity() {
  _activityExpanded = !_activityExpanded;
  if (_activityExpanded) _setActivitySeenNow();
  renderTodayActivity();
}

function renderTodayActivity() {
  var el       = $('todayActivityBlock');
  var card     = $('todayActivityCard');
  var badgeEl  = $('todayActivityBadge');
  var chevronEl = $('todayActivityChevron');
  if (!el) return;
  if (!activityLog || !activityLog.length) {
    if (card) card.classList.add('hidden');
    return;
  }
  if (card) card.classList.remove('hidden');

  var seenAt = _getActivitySeenAt();
  var unreadCount = activityLog.filter(function(a) {
    return a.createdAt && (!seenAt || new Date(a.createdAt) > new Date(seenAt));
  }).length;

  if (badgeEl) {
    if (unreadCount > 0 && !_activityExpanded) {
      badgeEl.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }
  if (chevronEl) chevronEl.textContent = _activityExpanded ? '▲' : '▼';
  el.classList.toggle('hidden', !_activityExpanded);
  if (!_activityExpanded) return;

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
