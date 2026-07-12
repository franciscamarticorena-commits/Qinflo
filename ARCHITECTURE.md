# ARCHITECTURE.md — Arquitectura de Qinflo

> Documento de referencia técnica standalone. Para el detalle de decisiones y su motivo, ver `HANDOFF.md` sección 3. Para bugs conocidos que rompen supuestos de esta arquitectura, ver `HANDOFF.md` sección 7.

## Vista de alto nivel

```
Navegador (PWA, sin build step, JS vanilla, sin módulos ES)
  index.html carga 19 <script> secuenciales (2 CDN + 17 propios)
  Estado global compartido en scope de window (state.js)
        │
        ├──▶ Supabase (proyecto xvfdncjrwrcbxgogzvym)
        │     • Auth (email/password + Google OAuth)
        │     • PostgreSQL con Row Level Security
        │     • Realtime (websocket, postgres_changes)
        │
        └──▶ Firebase Hosting (proyecto "quinflo")
              • Solo sirve archivos estáticos
              • Dominio: qinflo.cl
              • Sin Auth, sin Firestore activo (aunque queda código huérfano — ver deuda técnica)
```

No hay backend propio ni API intermedia. El cliente habla directo con Supabase usando la `anon key`, protegida por RLS. Dos operaciones que requieren atomicidad multi-tabla se resuelven con RPCs `SECURITY DEFINER`: `set_custody_day` y `accept_invitation`.

## Sin build step, por diseño

No hay `package.json` en la raíz, no hay bundler, no hay transpilación, no hay módulos ES (`import`/`export`). Los 17 archivos `.js` del proyecto se cargan como `<script>` clásicos, secuenciales, y comparten un único scope global (`window`). Las dependencias entre archivos son implícitas — función A en un archivo llama a función B definida en otro, sin ninguna declaración explícita de esa relación (ver "Orden de carga y dependencias" abajo, y `HANDOFF.md` sección 10 para el mapa completo).

Esta decisión es deliberada y documentada, no una carencia — ver `HANDOFF.md` sección 3, decisión 1.

## Ciclo de vida de la aplicación

1. `index.html` carga `@supabase/supabase-js@2` (UMD, jsDelivr) y `lucide` (UMD, unpkg) desde CDN, luego los 17 scripts del proyecto en orden fijo.
2. `app-shell.js`, al ejecutarse, registra `supa.auth.onAuthStateChange(...)`. Este listener es el punto de entrada real de toda la lógica de sesión — no hay `main()` ni bootstrap separado.
3. Según el evento de auth:
   - `PASSWORD_RECOVERY` → pantalla de nueva contraseña, corta el flujo ahí.
   - Sin usuario → `authScreen`.
   - Con usuario → `loadUserData(u.id)` reconstruye `USERDATA` (perfil + membership/familia vía join embebido + coparent + invitación pendiente, 3-4 queries). Si devuelve `null` y el usuario viene de Google, se crea perfil+familia automáticamente; si no, se desloguea pidiendo registro explícito.
   - Resuelve invitación pendiente (URL o `localStorage`) vía `autoConnect()`.
   - `updateLabels()` + `loadOrOnboard()`.
4. `loadOrOnboard()`: sin onboarding completo → `startOnboarding()`; si no, `loadApp()`.
5. `loadApp()`: muestra el shell, `switchTab('today')` primero (antes de cualquier función que pueda fallar), luego `setupListeners()` (11 tablas en paralelo + suscripción Realtime), `fetchUF()`, renders iniciales, `checkAndGenerateCalendar()`.

## Modelo de datos: dos capas simultáneas

### Capa 1 — Postgres real (snake_case, con CHECK constraints)

Ver `supabase/migrations/001_initial_schema.sql` (schema original, 27 tablas) y `002_migration_compatibility.sql` (columnas/tablas/RPCs añadidas post-migración). Esta es la única fuente de verdad de qué columnas y constraints existen — no confiar en el nombre "obvio" que debería tener una columna sin verificarlo ahí.

**Tablas activas (usadas por el código hoy)**: `users`, `families`, `family_members`, `invitations`, `children`, `custody_changes`, `custody_months`, `events`, `expenses`, `settlements`, `messages`, `agreements`, `reminders`, `documents`, `activity_logs`.

**Tablas del schema sin uso en el código actual**: `legal_acceptances`, `custody_patterns`, `custody_confirmations`, `event_confirmations`, `currency_rates`, `message_edit_history`, `message_templates`, `resources`, `pending_actions`, `notifications`, `notification_tokens`, `plans`, `subscriptions`, `audit_logs`. Superficie de diseño para roadmap futuro, no lógica implementada.

### Capa 2 — Modelo en memoria (camelCase, con alias derivados)

Cada tabla activa tiene una función `loadX()` en `app-shell.js` que hace `SELECT` filtrado por `family_id`, convierte con `toCamel()` (snake_case → camelCase recursivo, `state.js`), y **agrega alias adicionales a mano** para compatibilidad con funciones `renderX()` heredadas del modelo Firestore original. Ejemplos donde el alias no es un simple cambio de mayúscula:

| Alias en memoria | Deriva de | Notas |
|---|---|---|
| `expenses.paidBy` (`'mama'`/`'papa'`) | `paid_by_role` (`'p1'`/`'p2'`) | Vocabulario distinto, no solo casing |
| `expenses.paid` (booleano) | `status === 'paid'` | |
| `messages.text` | `content` | |
| `messages.createdBy` | `author_id` | |
| `reminders.for` | `assigned_to` | |
| `reminders.done` (booleano) | `status === 'completed'` | |
| `proposals.fromDate`/`toDate`/`date` | tabla `custody_changes`, columnas `from_date`/`to_date` | El array en memoria se llama `proposals`, no `custody_changes` |
| `events.date`/`time` | `start_at` (timestamptz) partido | |
| `events.requiresApproval` | `requires_confirmation` | |
| `events.approvalStatus` | derivado de `status` | |
| `settlements.fromRole`/`toRole` (`'mama'`/`'papa'`) | `from_role`/`to_role` (`'p1'`/`'p2'`) | |

**Riesgo estructural de este patrón**: cuando código nuevo escribe directo contra Postgres sin pasar por el vocabulario de esta capa 2 (o viceversa, sin traducir de vuelta), el resultado son los bugs de `children.js`/`documents.js`/`events.js` documentados en `HANDOFF.md` sección 7 — payloads con nombres de campo que pertenecen a la capa equivocada.

## Tiempo real

Un canal Supabase Realtime por familia (`family-{FAMILY_ID}`), suscrito a `postgres_changes` en las 11 tablas activas. Cualquier `INSERT`/`UPDATE`/`DELETE` dispara un **re-fetch completo de esa tabla** (no hay merge incremental de deltas). Simplicidad deliberada, suficiente a la escala de una familia (2 usuarios).

Canal efímero adicional durante onboarding (`coparent-join-{FAMILY_ID}`), escucha `INSERT` en `family_members` para detectar cuándo el coparent acepta la invitación; se desuscribe tras la primera detección.

## Autenticación

- Email + contraseña: `supa.auth.signInWithPassword`/`signUp`.
- Google OAuth: `supa.auth.signInWithOAuth({ provider: 'google', redirectTo: window.location.origin })`, con `detectSessionInUrl: true` en la config del cliente — Supabase gestiona el redirect completo, sin manejo manual de `getRedirectResult()`.
- Recuperación de contraseña: `resetPasswordForEmail` → email → evento `PASSWORD_RECOVERY` en `onAuthStateChange` → pantalla dedicada → `updateUser({ password })`.
- Trigger de Postgres `handle_new_user` puebla automáticamente `public.users` al crear un usuario en `auth.users` — el cliente nunca hace `INSERT` manual ahí.

## Modelo de familia

`families` (config general en JSONB) + `family_members` (relación usuario↔familia, `role` p1/p2, `status`) + `invitations` (tokens). `p1` = quien crea la familia (invitante/primer registrado, irreversible); `p2` = quien acepta la invitación. Labels visibles resueltos dinámicamente en UI vía `familyConfig.p1Label`/`p2Label` según `type` (`mama_papa`/`papa_papa`/`mama_mama`) — nunca hardcoded en lógica.

**Supuesto no validado por el código**: cada familia tiene máximo 2 miembros activos. El modelo de datos (N:N) lo permitiría técnicamente, pero ninguna pantalla soporta más de un coparent.

## RLS (Row Level Security)

Todas las tablas activas tienen RLS habilitado, basado principalmente en `is_family_member(p_family_id)`. Operaciones multi-tabla atómicas usan RPCs `SECURITY DEFINER` (`accept_invitation`, `set_custody_day`) en vez de encadenar escrituras desde el cliente — evita exponer políticas más permisivas de lo necesario y evita estados intermedios inconsistentes ante pérdida de conexión.

**No hay test automatizado que valide las ~40 políticas RLS** — cualquier cambio requiere revisión manual cuidadosa (ver `HANDOFF.md` sección 13, punto 6).

## Orden de carga y dependencias entre módulos

```
1. supabase.js    → define `supa`. Sin dependencias.
2. state.js       → estado global + helpers universales. Sin dependencias.
3. auth.js        → login/registro/OAuth. Llama (en runtime) a connect.js/onboarding.js.
4. connect.js     → invitación. Llama a app-shell.js/onboarding.js.
5. calendar.js    → calendario/custodia/propuestas. Llama a activity.js/events.js (guards typeof).
6. expenses.js    → gastos/balance. Depende de arrays poblados por app-shell.js.
7. messages.js    → mensajería + quick replies.
8. children.js    → hijos. [MÓDULO ROTO, ver HANDOFF.md sección 7]
9. agreements.js  → acuerdos con firma.
10. reminders.js  → avisos.
11. resources.js  → contenido estático.
12. observability.js → Sentry/PostHog (inactivo) + registro de service worker.
13. onboarding.js → onboarding + generación de calendario + watcher coparent.
14. events.js     → eventos. [BUG de participants, ver HANDOFF.md sección 7]
15. documents.js  → documentos. [MÓDULO ROTO, ver HANDOFF.md sección 7]
16. activity.js   → logActivity() + feed de actividad.
17. today.js      → dashboard Hoy. El módulo más acoplado — lee arrays de casi todos los demás.
18. theme.js      → dark/light mode.
19. app-shell.js  → HUB. Los 11 loadX(), listener de auth, Realtime, todos los addEventListener de la UI.
                     Se carga último a propósito: su DOMContentLoaded asume que toda función de
                     todos los módulos anteriores ya existe en scope global.
```

Ver `HANDOFF.md` sección 10 para el mapa función-por-función de quién llama a qué entre archivos. No hay compilador ni linter que detecte una llamada rota a una función renombrada o eliminada — cualquier refactor de una función pública de un módulo requiere `grep -rn` de su nombre en todo el proyecto.

## PWA

`manifest.json` (instalable, `display: standalone`) + `service-worker.js` (cache-first custom, sin Workbox). `STATIC_ASSETS` en el service worker debe mantenerse en sincronía exacta con los `<script src>` de `index.html`, y `QINFLO_CACHE` (hoy `v25`) debe incrementarse en cada cambio de contenido cacheado — de lo contrario usuarios con la PWA instalada quedan sirviendo versiones stale indefinidamente.

## CI/CD

Un único workflow de GitHub Actions (`.github/workflows/firebase-hosting-deploy.yml`), dispara en cada push a `main`: instala Firebase CLI, despliega hosting (paso real y necesario), y además intenta desplegar Firestore Rules y Cloud Functions (`continue-on-error: true`, código huérfano de la era Firebase — ver deuda técnica en `HANDOFF.md` sección 15). No hay ningún gate de calidad (sin tests, sin lint) antes del deploy.

## Observabilidad

Sentry + PostHog integrados en código (`observability.js`) pero **inactivos** — sin DSN/API key configurados. `registerServiceWorker()` sí corre siempre. Contiene un bug latente (`user.uid` en vez de `user.id`) inofensivo hoy solo porque el bloque nunca se ejecuta con las llaves vacías.

## Infraestructura huérfana (no forma parte de la arquitectura activa)

`firebase.js`, `firebase-messaging-sw.js`, `firestore.rules`, `functions/` (3 Cloud Functions sobre triggers Firestore que nunca disparan, porque la app ya no escribe a Firestore). No referenciados desde `index.html`. Ver `HANDOFF.md` sección 15 para el plan de limpieza recomendado.
