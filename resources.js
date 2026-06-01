// --- RECURSOS -----------------------------------------------
function renderResources() {
  var el = $('resourcesList');
  if (!el) return;
  var resources = [
    { icon: '⚖️', title: 'Mediación Familiar', sub: 'mediacion.cl', desc: 'Servicio gratuito del Estado para resolver conflictos sin ir a juicio.', tag: 'Gratuito', link: 'https://www.mediacion.cl' },
    { icon: '🏛', title: 'Poder Judicial', sub: 'pjud.cl', desc: 'Tribunales de Familia. Consulta causas y agenda horas.', tag: 'Oficial', link: 'https://www.pjud.cl' },
    { icon: '👶', title: 'Fono Niños - 147', sub: 'SENAME', desc: 'Protección de derechos de niños. Atención gratuita y confidencial.', tag: 'Emergencia', link: 'tel:147' },
    { icon: '📋', title: 'Corp. Asistencia Judicial', sub: '600 442 2000', desc: 'Asesoría legal gratuita.', tag: 'Gratuito', link: 'tel:6004422000' }
  ];
  el.innerHTML = '';
  resources.forEach(function(r) {
    var card = document.createElement('div');
    card.className = 'resource-card';
    card.innerHTML =
      '<div class="resource-icon" style="background:rgba(95,124,110,.1)">' + r.icon + '</div>' +
      '<div style="flex:1">' +
        '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:5px">' +
          '<div><div class="resource-title">' + r.title + '</div><div class="resource-sub">' + r.sub + '</div></div>' +
          '<span class="badge" style="background:rgba(95,124,110,.1);color:var(--primary);border:1px solid rgba(95,124,110,.2);height:fit-content">' + r.tag + '</span>' +
        '</div>' +
        '<div class="resource-desc">' + r.desc + '</div>' +
        '<a href="' + r.link + '" target="_blank" class="resource-link">Acceder</a>' +
      '</div>';
    el.appendChild(card);
  });
}
