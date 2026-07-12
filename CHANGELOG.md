# CHANGELOG.md — Historial de Qinflo

> Generado a partir de `git log` real sobre `main` (no inventado). Orden reverso-cronológico (más reciente primero). Los mensajes se resumen; para el mensaje de commit completo, `git show <hash>`. Para las fases numeradas de más alto nivel, ver también la tabla equivalente en `CLAUDE.md` — este changelog es más granular. Se agrega una entrada nueva cuando se completa una fase o un fix significativo; no se reescribe el pasado salvo corrección de un error factual.

---

## 2026-07-12 — Documentación de transferencia completa

Sesión dedicada exclusivamente a auditoría y documentación, sin cambios de código de producto. Se verificó cada módulo `.js` contra el schema SQL real, columna por columna, encontrando 3 bugs de persistencia activos en producción que no tenían ningún reporte ni detección previa (sin observabilidad activa).

- Auditoría profunda de los 17 módulos `.js` contra `supabase/migrations/001_initial_schema.sql` y `002_migration_compatibility.sql`.
- `PROJECT_STATUS.md` — estado exhaustivo con cita textual de cada bug encontrado.
- `CLAUDE_HANDOFF.md` — handoff operativo inicial.
- `HANDOFF.md` — transferencia de conocimiento completa (segunda ronda, más estructurada, con dependencias entre módulos, supuestos del código, y sección de Lessons Learned).
- `AI_MEMORY.md` — memoria de comportamiento/patrones para sesiones de IA futuras.
- `ARCHITECTURE.md` — arquitectura como documento de referencia standalone (no existía antes).
- `ROADMAP.md` — roadmap de producto + técnico consolidado (no existía antes).
- `CHANGELOG.md` — este archivo (no existía antes).
- `README.md` reescrito para reflejar la estructura de carpetas y stack reales (la versión anterior describía `js/`, `css/`, Capacitor — nada de eso existe en el repo actual).
- `"README 2.md"` eliminado (duplicado accidental del anterior, sin la nota de advertencia que sí tenía el original).
- `CLAUDE.md` corregido: la afirmación sobre eventos privados (`participants === 'p1'/'p2'`) no coincidía con el comportamiento real del código (`'mama'/'papa'`); se agregó sección de bugs conocidos con prioridad Urgente.

**Bugs encontrados y documentados (no corregidos en esta sesión — solo documentación)**:
- 🔴 Módulo de Hijos (`children.js`) no persiste ningún dato (columnas inexistentes en la tabla real).
- 🔴 Módulo de Documentos (`documents.js`) no persiste ningún dato (viola CHECK constraint + columnas inexistentes).
- 🟠 Eventos privados (`participants !== 'both'`) no se pueden crear (viola CHECK constraint).
- 🟡 Actividad de propuestas logueada con variables indefinidas en dos puntos distintos del código.
- 🟡 Timestamps de mensajes nunca se muestran (API de Firestore Timestamp sobre datos de Supabase).
- 🟢 `user.uid` en vez de `user.id` en `observability.js` (latente, inofensivo mientras Sentry/PostHog estén sin llaves).

---

## 2026-07-05 — Fixes post-migración (RLS, CI, service worker)

| Commit | Descripción |
|---|---|
| `9fbe25d` | Generar UUID de familia en el cliente para evitar problema de RLS en el SELECT inmediatamente después del INSERT (la política de lectura de `families` dependía de una membership que aún no existía en ese punto del flujo) |
| `3476a4e` | Quitar el paso `npm ci --prefix functions` del workflow de CI (fallaba tras la migración; el resto de pasos de Functions/Firestore quedaron con `continue-on-error`, sin resolver el problema de fondo) |
| `f685ac8` | Bump del service worker a `v25`, reemplazar la referencia a `firebase.js` por `supabase.js` en la lista de assets cacheados |

---

## 2026-06-22 — Fix de recuperación de contraseña + documentación

| Commit | Descripción |
|---|---|
| `df9f73b` | Actualización de `CLAUDE.md` documentando la migración a Supabase y las tareas pendientes |
| `e139535` | Fix del flujo de recuperación de contraseña: manejar el evento `PASSWORD_RECOVERY` de `onAuthStateChange` con una pantalla dedicada de nueva clave, en vez de redirigir directo a la app |

---

## 2026-06-21 — Fase 10: Migración completa Firebase → Supabase

El cambio más grande del proyecto — reemplazo total de Firebase Auth + Firestore por Supabase Auth + PostgreSQL en todos los módulos.

| Commit | Descripción |
|---|---|
| `d5db018` | Migración completa: `supabase.js` reemplaza `firebase.js`; `state.js` agrega `toCamel`/`rowsToCamel`/`famQ`; `auth.js` reescrito sobre `supa.auth`; `app-shell.js` con `loadUserData` + `setupListeners` + canales Realtime; `connect.js` usa la RPC `accept_invitation`; todos los módulos de datos migrados a CRUD Supabase con soft deletes; `index.html` cambia el CDN de Firebase por el de Supabase-js v2 |
| `bf9f428` | Schema idempotente: `IF NOT EXISTS` en 28 tablas y todos los índices, `DROP POLICY IF EXISTS` antes de cada una de las ~40 políticas, eliminación de una FK circular (`custody_confirmations.related_event_id` → `events`, definida antes de que la tabla `events` existiera en el orden del archivo) |
| `81e0b8c` | Mover la definición de `is_family_member()` para que ocurra después de crear `family_members` (dependía de una tabla que aún no existía en el orden original del archivo) |
| `8ed98ea` | Fase 1 de la migración: schema PostgreSQL inicial completo |

---

## 2026-06-21 (anterior) — Fase de push notifications (FCM, hoy huérfana)

| Commit | Descripción |
|---|---|
| `f117925` | Fase 10 (numeración de fase de producto, no confundir con la migración): push notifications vía FCM — 3 Cloud Functions (`onNewMessage`, `onNewProposal`, `onNewEvent`), `firebase-messaging-sw.js`, `setupNotifications()` en `app-shell.js`. **Nota**: tras la migración a Supabase de días después, este código quedó completamente huérfano — las Cloud Functions escuchan triggers de Firestore que ya no reciben escrituras. Ver deuda técnica en `HANDOFF.md` sección 15 |

---

## 2026-06-19 — Fases 6-9b: Actividad, Acuerdos, Gastos, Dashboard Hoy, Onboarding legal

Día de mayor densidad de commits del proyecto — consolidación de varias fases de producto.

| Commit | Descripción |
|---|---|
| `944ca02` | Merge: integración de rama `dev` a `main` — feed de actividad + reconciliación de ramas divergentes |
| `420cf90` | Merge: 15 commits de `main` (date pickers, aceptación legal, módulo de documentos, settlements, `theme.js`, Firestore rules, mejoras de gastos, rediseño de onboarding, íconos PWA) reconciliados con la adición de actividad de `dev` |
| `c74ac2f` | Feature de actividad: `logActivity()`, `renderTodayActivity()` |
| `880cfe1`, `c054534` | Documentación de visión de producto y decisiones de diseño legal en `CLAUDE.md` |
| `d2b6896` | Fase 9b — Onboarding legal: panel de Bienvenida, checkboxes separados de Términos/Privacidad, audit trail |
| `1898133` | Fase 9 — Dashboard "Hoy": custodia, pendientes, eventos, avisos, balance |
| `57d6c94` | Botón para cancelar/retirar una propuesta de cambio de custodia propia y pendiente |
| `96001ef` | Refactor de calendario: elimina edición directa de custodia, reemplaza por formulario de propuesta con date pickers |
| `5a2da46` | Simplificación de tarjetas de aprobación de eventos en el detalle del día |
| `4c21b0f`, `404eb44` | Mensajería: divisor de tema libre, quick replies editables (reemplaza lista fija) |
| `57bcdeb` | Tarjetas de "esperando confirmación" reducidas a chips inline mínimos |
| `4e368b4` | Navegación: separación de "Información clave" en secciones INFO y GUÍAS |
| `4f48719` | **Fix crítico de custodia**: corrección del bug de asignación de domingo (parseo UTC vs local) + pérdida de overrides manuales por condición de carrera — ver `HANDOFF.md` sección 6, error 2 |
| `5fa4556` | Rediseño de filas de gastos para layout mobile más limpio |
| `80ae5dd` | Separación de acciones de custodia/evento, renombre Recordatorios → Avisos |
| `f8b9038` | CI: separación de deploys de hosting y Firestore rules, rules no bloqueantes |
| `1f89778` | Rediseño premium minimalista: fuente Inter, paleta jade/teal, cards blancas |
| `8eb0783` | Fix de contenido cortado en pantallas 320-375px |
| `35cc998` | Modo oscuro completo con toggle en header y panel de perfil |
| `dacd7f9` | Navegación más clara: menos clics, touch targets, scroll, feedback |
| `1d6c39b` | Gastos: editar gasto, ocultar comprobante al cobrador, scroll al abrir formulario |
| `6d78bbf` | Ocultar botón de invitar una vez que el coparent está conectado (con nota arquitectural sobre soporte multi-coparent pendiente) |

---

## 2026-06-18 — Fases 1-5b: base modular, onboarding, calendario, eventos, invitación, PWA

| Commit | Descripción |
|---|---|
| `3eac5bc` | Fix de onboarding: pickers nativos reemplazados (evita calendario/reloj nativo de Android), estado de espera de coparent en tiempo real, `switchTab('today')` antes de funciones que pueden fallar (evita pantalla en blanco) |
| `b53f53f` | Fix de Google Auth en Android: `signInWithRedirect` en vez de `signInWithPopup` para evitar interceptación de intents (código específico de la era Firebase, ver `HANDOFF.md` sección 5) |
| `9804378` | Fase 8 — Gastos: liquidar balance, exportar resumen, historial de liquidaciones |
| `a5a390a` | Fase 7 — Acuerdos: edición, firma simple, historial |
| `a4b1b1f` | Estructura PWA completa para publicación en tiendas |
| `3619277` | Fase 6 — Despliegue de Firestore Rules desde CI (código hoy huérfano tras la migración a Supabase) |
| Varios (`9ddecfb`, `ec81bb9`, `9aadf47`, `5f758a7`, `44ec9a3`) | Iteración del disclaimer legal de onboarding hasta la versión de Términos y Privacidad completos |
| `4318f83` | Revert: eliminación del módulo "Integrantes" por no aplicar al contexto del producto |
| `5eacc63` | Implementación de módulos Documentos e Integrantes (Integrantes revertido después, ver arriba) |
| `b9d494b` | Botón "los niños están conmigo" visible solo en días de cambio de custodia |
| `cf67e94`, `b5d83e2` | Rediseño del dashboard de pendientes en Inicio, fix del cache del service worker (`events.js`/`onboarding.js` faltaban en `STATIC_ASSETS`) |
| `d945908` | **Fix de UX**: calendario empieza en lunes (estándar latinoamericano), no domingo |
| `42d986a`, `1615f81`, `929205f` | Reestructuración de navegación a 5 tabs + menú "Más" |
| Fase 4 (`9f7810e` según tabla de `CLAUDE.md`) | Módulo de Eventos completo: CRUD, aprobaciones, eventos privados (la intención de "privados" nunca terminó de calzar con el schema — ver bug documentado en `HANDOFF.md`) |
| Fase 5 (`ec4be59` según tabla de `CLAUDE.md`) | Flujo de invitación robusto: batch atómico, asignación p1/p2, `inviteConsumed`, `familyConfig` heredado |
| Fase 5b (`140e76c` según tabla de `CLAUDE.md`) | Fix de Google Auth Safari/iOS + migración del hosting a Firebase Hosting |
| Fase 3 (`f2d1024` según tabla de `CLAUDE.md`) | Calendario automático, filtros, cambiar custodia, editar día, restaurar regla |
| Fase 2 (`98b8c8c` según tabla de `CLAUDE.md`) | Onboarding completo: custodia, hijos, invitación |
| Fase 1 (`ac760db` según tabla de `CLAUDE.md`) | Modularización desde el monolito original a los 17 archivos `.js` actuales |

---

## Convención de este changelog hacia adelante

Cada sesión de trabajo que complete una fase de producto o un fix significativo debe agregar una entrada nueva **al principio** de este archivo (orden reverso-cronológico), con el mismo nivel de detalle que las entradas existentes: fecha, lista de commits relevantes con hash corto y descripción de una línea, y cualquier nota de "esto quedó huérfano/pendiente" si aplica. No es necesario documentar cada commit individual de fixes menores — agrupar por sesión/fase como se hizo arriba.
