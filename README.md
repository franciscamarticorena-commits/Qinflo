# Qinflo modular

> **NOTA DE ESTRUCTURA:** La descripción de carpetas en este README (`js/`, `css/`, `assets/`) corresponde a la estructura modular planificada originalmente. El repositorio actual usa estructura plana (todos los archivos en raíz). Este README es referencia histórica y no debe usarse como fuente de verdad para rutas o imports.

Versión Qinflo separada por bloques desde la base `index_copadres_v2_8.html`, manteniendo la lógica actual para bajar riesgo y preparando el camino para PWA, observabilidad y empaquetado con Capacitor.

## Estructura
- `index.html`: estructura HTML y carga de dependencias.
- `css/styles.css`: estilos completos.
- `js/firebase.js`: configuración Firebase actual. No se cambió el proyecto para no romper producción.
- `js/state.js`: estado global y helpers.
- `js/auth.js`: login, registro y recuperación.
- `js/connect.js`: invitación y conexión de co-padre/madre. El link ahora se arma dinámicamente desde la URL donde esté publicada la app.
- `js/app-shell.js`: listener de auth, carga general, navegación y listeners DOM.
- `js/calendar.js`: calendario, custodia, eventos y solicitudes.
- `js/expenses.js`: gastos, UF, balance e historial.
- `js/messages.js`: mensajes y quick replies.
- `js/children.js`: perfiles de hijos.
- `js/agreements.js`: acuerdos.
- `js/reminders.js`: recordatorios.
- `js/resources.js`: recursos de apoyo.
- `js/observability.js`: base para Sentry + PostHog, desactivada hasta tener llaves reales.
- `manifest.json`: PWA instalable.
- `service-worker.js`: cache básico para instalación PWA.
- `firestore.rules`: reglas base de seguridad para revisar y publicar en Firebase.
- `capacitor.config.json` y `package.json`: base para empaquetar con Capacitor cuando corresponda.

## Qué quedó incorporado
- Cambio de producto a **Qinflo**.
- Mantención de **Kindflo** como marca paraguas en el footer: `Qinflo by Kindflo`.
- Separación por módulos para que IA pueda editar archivos chicos y reducir errores.
- PWA básica: `manifest.json`, ícono SVG y `service-worker.js`.
- Observabilidad preparada: Sentry + PostHog quedan listos para activar con llaves reales.
- Firestore rules base para evitar dejar datos abiertos.
- Base Capacitor preparada, sin obligar aún a compilar app nativa.

## Cómo subir a GitHub
Sube todo respetando carpetas. No subas solo el `index.html`, porque depende de `/css`, `/js`, `/assets`, `manifest.json` y `service-worker.js`.

## Orden recomendado
1. Subir esta carpeta completa a una rama o repositorio de prueba.
2. Probar login, navegación, calendario, gastos y Firestore.
3. Recién después activar Sentry/PostHog con llaves reales.
4. Validar PWA instalable desde navegador.
5. Empaquetar con Capacitor para iOS/Android.

## Nota importante Firebase
El proyecto Firebase sigue apuntando a `kindflo-copadres` para no romper la app actual. Cuando se cree el proyecto Firebase definitivo de Qinflo, reemplazar la configuración en `js/firebase.js` y revisar reglas/colecciones.
