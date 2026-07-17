// --- SERVICIOS RECOMENDADOS -----------------------------------
// Directorio de profesionales y empresas de utilidad para familias
// que coordinan la crianza entre dos hogares. No es un marketplace:
// solo enlaza a sitios/correos de terceros. Categorías y servicios
// se administran directo en las tablas service_categories /
// recommended_services (Supabase), sin tocar código — igual que
// public.resources. El campo "benefits" de cada servicio queda
// reservado para beneficios exclusivos futuros; todavía no se usa.

var _serviceCategories = [];
var _recommendedServices = [];
var _servicesLoaded = false;

function loadServiceCatalog(cb) {
  Promise.all([
    supa.from('service_categories').select('*').eq('is_active', true).order('display_order'),
    supa.from('recommended_services').select('*').eq('is_active', true).order('display_order')
  ]).then(function(results) {
    _serviceCategories = rowsToCamel(results[0].data);
    _recommendedServices = rowsToCamel(results[1].data);
    _servicesLoaded = true;
    if (typeof cb === 'function') cb();
  }).catch(function(e) {
    console.error('[loadServiceCatalog]', e);
    _servicesLoaded = true;
    if (typeof cb === 'function') cb();
  });
}

function _serviceCard(s, fallbackIcon) {
  var logo = s.logoUrl
    ? '<img src="' + s.logoUrl + '" alt="" style="width:44px;height:44px;border-radius:12px;object-fit:cover;flex-shrink:0">'
    : '<div class="resource-icon" style="background:rgba(107,122,87,.12)">' + (fallbackIcon || '⭐') + '</div>';
  var linksHtml = '';
  if (s.websiteUrl) linksHtml += '<a href="' + s.websiteUrl + '" class="resource-link">Visitar sitio web</a>';
  if (s.email) linksHtml += '<a href="mailto:' + s.email + '" class="resource-link" style="margin-left:14px">Enviar correo</a>';
  return '<div class="resource-card">' +
    logo +
    '<div style="flex:1">' +
      '<div class="resource-title">' + s.name + '</div>' +
      (s.specialty ? '<div class="resource-sub">' + s.specialty + '</div>' : '') +
      (s.description ? '<div class="resource-desc" style="margin:4px 0 10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + s.description + '</div>' : '') +
      (linksHtml ? '<div style="margin-top:2px">' + linksHtml + '</div>' : '') +
    '</div>' +
  '</div>';
}

function renderServiciosList() {
  var el = $('serviciosList');
  if (!el) return;

  if (!_servicesLoaded) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-s);padding:20px 0;text-align:center">Cargando…</p>';
    loadServiceCatalog(renderServiciosList);
    return;
  }

  var groups = _serviceCategories.map(function(cat) {
    var services = _recommendedServices.filter(function(s) { return s.categoryId === cat.id; });
    return { cat: cat, services: services };
  }).filter(function(g) { return g.services.length > 0; });

  if (!groups.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-s);padding:20px 0;text-align:center">Todavía no hay servicios disponibles.</p>';
    return;
  }

  el.innerHTML = groups.map(function(g) {
    return '<p class="section-lbl">' + g.cat.icon + ' ' + g.cat.name + '</p>' +
      g.services.map(function(s) { return _serviceCard(s, g.cat.icon); }).join('');
  }).join('') +
  '<div style="background:rgba(216,164,95,.08);border:1px solid rgba(216,164,95,.28);border-radius:16px;padding:16px 18px;margin-top:8px">' +
    '<div style="font-weight:700;font-size:13px;color:var(--warn);margin-bottom:6px">⚠️ Importante</div>' +
    '<div style="font-size:12px;color:var(--text-s);line-height:1.6">Los servicios publicados en esta sección buscan facilitar el acceso a profesionales y empresas que pueden ser de utilidad para las familias. Qinflo no participa en la contratación ni en la prestación de los servicios ofrecidos. La relación se establece directamente entre el usuario y el proveedor correspondiente.</div>' +
  '</div>';
}

window.renderServiciosList = renderServiciosList;
