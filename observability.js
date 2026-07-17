// --- OBSERVABILIDAD -----------------------------------------
// Preparado para Sentry + PostHog sin romper la app si aún no hay llaves.
// 1) Reemplaza SENTRY_DSN cuando tengas el DSN del proyecto.
// 2) Reemplaza POSTHOG_KEY cuando tengas la project API key.
// 3) Descomenta los scripts CDN en index.html si decides cargar ambas librerías por CDN.

const QINFLO_OBSERVABILITY = {
  sentryDsn: '',
  posthogKey: '',
  posthogHost: 'https://app.posthog.com'
};

function initObservability() {
  try {
    if (window.Sentry && QINFLO_OBSERVABILITY.sentryDsn) {
      window.Sentry.init({
        dsn: QINFLO_OBSERVABILITY.sentryDsn,
        tracesSampleRate: 0.2,
        environment: location.hostname.includes('github.io') ? 'staging' : 'production'
      });
    }
    if (window.posthog && QINFLO_OBSERVABILITY.posthogKey) {
      window.posthog.init(QINFLO_OBSERVABILITY.posthogKey, {
        api_host: QINFLO_OBSERVABILITY.posthogHost,
        capture_pageview: true
      });
    }
  } catch (err) {
    console.warn('Observabilidad no inicializada:', err);
  }
}

function identifyObservabilityUser(user, userData) {
  try {
    if (!user) return;
    if (window.Sentry && QINFLO_OBSERVABILITY.sentryDsn) {
      window.Sentry.setUser({ id: user.id, email: user.email });
    }
    if (window.posthog && QINFLO_OBSERVABILITY.posthogKey) {
      window.posthog.identify(user.id, {
        email: user.email,
        role: userData && userData.role,
        familyId: userData && userData.familyId
      });
    }
  } catch (err) {
    console.warn('No se pudo identificar usuario:', err);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  var reg = null;
  var refreshing = false;

  // Cuando el nuevo service worker toma el control, recargamos para que la
  // pestaña/app abierta pase a usar el código nuevo. Si la app está en
  // primer plano (uso activo), no recargamos de inmediato -- interrumpiría
  // lo que el usuario está haciendo (ej. justo al tocar un botón). Esperamos
  // a que la app pase a segundo plano y recargamos recién ahí.
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (refreshing) return;
    if (document.visibilityState === 'hidden') {
      refreshing = true;
      window.location.reload();
      return;
    }
    var reloadOnHide = function() {
      if (document.visibilityState !== 'hidden' || refreshing) return;
      refreshing = true;
      document.removeEventListener('visibilitychange', reloadOnHide);
      window.location.reload();
    };
    document.addEventListener('visibilitychange', reloadOnHide);
  });

  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./service-worker.js').then(function(r) {
      reg = r;
    }).catch(function(err) {
      console.warn('Service worker no registrado:', err);
    });
  });

  // Como app instalada, Qinflo puede quedar abierta en segundo plano por
  // días sin que el sistema vuelva a pedir service-worker.js. Al volver a
  // primer plano forzamos ese chequeo, para no depender de cerrar sesión
  // (o reinstalar la app) para ver los últimos cambios.
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && reg) {
      reg.update().catch(function() {});
    }
  });
}

initObservability();
registerServiceWorker();
