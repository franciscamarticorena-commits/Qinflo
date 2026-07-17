// --- DOCUMENTOS ÚTILES (Información clave) -------------------
// Recursos informativos estáticos y de solo lectura. Qinflo no guarda
// autorizaciones, no almacena documentos legales y no valida nada —
// solo orienta y enlaza a fuentes oficiales. Para agregar un nuevo
// documento útil en el futuro basta con sumar un objeto a DOC_UTILES;
// el render es genérico y no requiere tocar esta arquitectura.

var DOC_UTILES = [
  {
    id: 'viaje-extranjero',
    icon: '✈️',
    title: 'Viaje al extranjero con un hijo o hija',
    summary: 'Qué documentos preparar cuando un hijo o hija viaja fuera de Chile con un solo padre o madre.',
    intro: 'Si un niño, niña o adolescente sale de Chile acompañado por solo uno de sus padres, normalmente será necesario contar con una autorización otorgada por el padre o madre que no viaja (o por quien corresponda según la situación familiar). Los requisitos pueden variar según cada caso, por lo que siempre es recomendable revisar la información oficial antes del viaje.',
    checklist: [
      'Pasaporte o documento de identidad vigente (según el país de destino)',
      'Visa, si el país la exige',
      'Autorización para salir del país cuando corresponda',
      'Certificado de nacimiento u otro documento que permita acreditar la filiación, si fuese necesario',
      'Revisar si el país de destino exige documentación sanitaria o requisitos especiales',
      'Llevar copias digitales de todos los documentos importantes',
      'Guardar una copia impresa en un lugar distinto de los originales'
    ],
    download: {
      title: 'Modelo de autorización',
      desc: 'Qinflo pone a disposición un modelo referencial que puede servir como apoyo al momento de preparar la autorización correspondiente.',
      label: 'Descargar modelo PDF',
      url: 'assets/docs/modelo-autorizacion-viaje-menor.pdf'
    },
    sites: [
      { icon: '🪪', name: 'Registro Civil e Identificación', sub: 'registrocivil.cl', url: 'https://www.registrocivil.cl' },
      { icon: '🕵️', name: 'Policía de Investigaciones (PDI)', sub: 'pdichile.cl', url: 'https://www.pdichile.cl' },
      { icon: '🏛️', name: 'ChileAtiende', sub: 'chileatiende.gob.cl', url: 'https://www.chileatiende.gob.cl' },
      { icon: '🛂', name: 'Consulado de Chile', sub: 'Requisitos cuando viaja un menor de edad', url: 'https://www.consulado.gob.cl/cuando-viaja-un-menor-de-edad' },
      { icon: '🌎', name: 'Ministerio de Relaciones Exteriores', sub: 'minrel.gob.cl', url: 'https://www.minrel.gob.cl' }
    ],
    warning: 'La información publicada por Qinflo tiene un carácter exclusivamente informativo y busca orientar a las familias en la preparación de un viaje internacional. Los requisitos pueden variar dependiendo de la situación familiar, resoluciones judiciales, país de destino y cambios en la normativa vigente. Antes de viajar, verifica siempre la información directamente en los organismos oficiales correspondientes.'
  }
];

var _currentDocUtilId = null;

function renderDocUtilesList() {
  var el = $('docutilesList');
  if (!el) return;
  el.innerHTML = DOC_UTILES.map(function(d) {
    return '<div class="resource-card" style="cursor:pointer" onclick="openDocUtil(\'' + d.id + '\')">' +
      '<div class="resource-icon" style="background:rgba(107,122,87,.12)">' + d.icon + '</div>' +
      '<div style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:10px">' +
        '<div>' +
          '<div class="resource-title">' + d.title + '</div>' +
          '<div class="resource-desc" style="margin-bottom:0">' + d.summary + '</div>' +
        '</div>' +
        '<span style="color:var(--text-s);font-size:18px;font-weight:300;flex-shrink:0">›</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openDocUtil(id) {
  _currentDocUtilId = id;
  switchTab('docutil-detail');
  renderDocUtilDetail();
}

function _checklistKey(docId, i) { return 'qinflo_checklist_' + docId + '_' + i; }

function _toggleChecklistItem(docId, i, checked) {
  try { localStorage.setItem(_checklistKey(docId, i), checked ? '1' : '0'); } catch(e) {}
}

function renderDocUtilDetail() {
  var el = $('docutilDetailContent');
  if (!el || !_currentDocUtilId) return;
  var d = DOC_UTILES.find(function(x) { return x.id === _currentDocUtilId; });
  if (!d) return;

  if ($('docutilDetailTitle')) $('docutilDetailTitle').textContent = d.title;

  var checklistHtml = d.checklist.map(function(item, i) {
    var checked = false;
    try { checked = localStorage.getItem(_checklistKey(d.id, i)) === '1'; } catch(e) {}
    return '<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer">' +
      '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="_toggleChecklistItem(\'' + d.id + '\',' + i + ',this.checked)" style="width:18px;height:18px;margin-top:1px;accent-color:var(--primary);flex-shrink:0"/>' +
      '<span style="font-size:13px;color:var(--text);line-height:1.4">' + item + '</span>' +
    '</label>';
  }).join('');

  var sitesHtml = d.sites.map(function(s) {
    return '<div class="resource-card">' +
      '<div class="resource-icon" style="background:rgba(95,124,110,.1)">' + s.icon + '</div>' +
      '<div style="flex:1">' +
        '<div class="resource-title">' + s.name + '</div>' +
        '<div class="resource-sub">' + s.sub + '</div>' +
        '<a href="' + s.url + '" class="resource-link">Ir al sitio oficial</a>' +
      '</div>' +
    '</div>';
  }).join('');

  el.innerHTML =
    '<p style="font-size:13px;color:var(--text-s);line-height:1.6;margin:0 0 20px">' + d.intro + '</p>' +

    '<p class="section-lbl">Antes de viajar, verifica que tengas</p>' +
    '<div class="card" style="padding:0;overflow:hidden;margin-bottom:22px">' + checklistHtml + '</div>' +

    (d.download ?
      '<p class="section-lbl">' + d.download.title + '</p>' +
      '<div class="resource-card" style="margin-bottom:22px">' +
        '<div class="resource-icon" style="background:rgba(107,122,87,.12)">📄</div>' +
        '<div style="flex:1">' +
          '<div class="resource-desc" style="margin-bottom:12px">' + d.download.desc + '</div>' +
          '<a class="resource-link" href="' + d.download.url + '" download>' + d.download.label + '</a>' +
        '</div>' +
      '</div>'
    : '') +

    '<p class="section-lbl">Sitios de interés</p>' +
    sitesHtml +

    '<div style="background:rgba(216,164,95,.08);border:1px solid rgba(216,164,95,.28);border-radius:16px;padding:16px 18px;margin-top:8px">' +
      '<div style="font-weight:700;font-size:13px;color:var(--warn);margin-bottom:6px">⚠️ Importante</div>' +
      '<div style="font-size:12px;color:var(--text-s);line-height:1.6">' + d.warning + '</div>' +
    '</div>';
}

window.renderDocUtilesList = renderDocUtilesList;
window.renderDocUtilDetail = renderDocUtilDetail;
