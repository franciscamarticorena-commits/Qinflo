# Qinflo — Contexto del proyecto para Claude

## Repositorio
- **GitHub**: franciscamarticorena-commits/Qinflo
- **Rama de desarrollo activa**: `claude/qinflo-dev-continue-4cbkft`
- **Rama anterior con Fases 3–5**: `origin/claude/agreements-list-ui-pGDd9` (ya mergeada)

## Regla crítica al comenzar cada sesión
1. Leer este archivo primero.
2. Verificar `git log --oneline -10` para confirmar el estado real.
3. NO reinventar el roadmap ni proponer "Fases" ya completadas.
4. Verificar si hay ramas remotas más avanzadas con `git fetch origin && git log --oneline --all | head -20`.

## Estructura del proyecto
Todos los archivos están en la **raíz del repo** (estructura plana, sin subcarpetas `js/` ni `css/`).

Archivos principales:
- `index.html` — HTML completo, carga todos los scripts al final del body
- `styles.css` — estilos únicos
- `firebase.js` — config Firebase (proyecto `kindflo-copadres`, no cambiar hasta tener proyecto definitivo)
- `state.js` — variables globales: USER, USERDATA, CODATA, FAMILY_ID, custodyMap, etc.
- `auth.js` — login, registro (email + Google), recuperación
- `connect.js` — `showConnectScreen()`, `autoConnect(inviteCode)` — flujo de invitación
- `app-shell.js` — listener auth, `loadApp()`, `setupListeners()`, listeners DOM, tabs, fetchUF
- `calendar.js` — renderCalendar, setCustody, overrides manuales, restoreBaseRule, proposals
- `events.js` — módulo de eventos: CRUD, aprobaciones, eventos privados, renderEventApprovals
- `onboarding.js` — onboarding completo + `generateOnbCalendar()` + `getOnbCustodyForDate()`
- `expenses.js` — gastos, UF, balance, marcar pagado, anular
- `messages.js` — mensajes en tiempo real, quick replies
- `children.js` — perfiles de hijos
- `agreements.js` — acuerdos
- `reminders.js` — recordatorios
- `resources.js` — recursos de apoyo Chile
- `observability.js` — Sentry + PostHog desactivados (sin llaves reales)
- `manifest.json` + `service-worker.js` — PWA base

## Modelo de datos Firestore

### `/users/{uid}`
```
name, email, role (p1|p2), familyId, coparentId, inviteCode, inviteConsumed,
onboardingCompleted, familyConfig { p1Label, p2Label }, createdAt
```

### `/families/{famId}`
```
members[], p1Uid, p2Uid, memberRoles.{uid}, custodyConfig, specialRules,
createdBy, createdAt
```
**`custodyConfig`** puede ser:
- `{ type: 'alternating_weeks', changeDay, changeTime, startDate, firstWeek, changeLocation }`
- `{ type: 'fixed_days', weeklySchedule: { "0":{parent,alternating}, ... }, hasAlternatingDays, alternatingAnchorDate, alternatingCurrentWeekParent, whoHasThemToday, whoHasTodayDate }`
- `{ type: 'custom' | 'undefined' }`

### `/families/{famId}/calendar/{YYYY-MM}`
```
custody: { "1": "mama"|"papa"|"transition", ... }
custodyOverrides: { "1": { value, reason, overriddenBy, overriddenAt }, ... }
events: { "1": ["texto"], ... }  ← legacy, nuevo módulo usa /events
```

### `/families/{famId}/events/{eventId}`
```
title, date, time, category (salud|colegio|actividad|cumpleanos|vacaciones|otro),
participants (both|mama|papa), description, reminder (2h|1d|1w),
requiresApproval, status (pending|confirmed|done|cancelled),
approvalStatus (pending|approved|rejected|null),
createdBy, createdByRole, createdAt, modifiedBy, modifiedAt,
cancelledBy, cancelledAt, approvedBy, approvedAt, rejectedBy, rejectedAt
```

### `/families/{famId}/proposals/{id}`
```
fromDay, toDay, reason, status (pending|accepted|rejected), date,
createdAt, createdBy, createdByName, createdByRole, requestedToRole,
respondedAt, respondedBy
```

### `/families/{famId}/expenses/{id}`, `/messages/{id}`, `/children/{id}`, `/agreements/{id}`, `/reminders/{id}`
Ver código de cada módulo para el schema exacto.

## Fases completadas

| Fase | Descripción | Commits clave |
|------|-------------|---------------|
| 1 | Modularización desde monolito | `ac760db` |
| 2 | Onboarding completo (custodia, hijos, invitación) | `98b8c8c` |
| 3 | Calendario automático, filtros, cambiar custodia, editar día, restaurar regla | `f2d1024`, `6b8084f`, `2c624e8` |
| 4 | Módulo de Eventos completo (events.js, aprobaciones, privados) | `9f7810e` |
| 5 | Flujo de invitación robusto: batch atómico, p1/p2, inviteConsumed, familyConfig heredado | `ec4be59` |

## Roadmap pendiente (en orden estricto)

| Fase | Descripción | Prioridad |
|------|-------------|-----------|
| **6** | **Firestore Rules** — datos cerrados: users solo lectura propia + coparent, families/subcol solo members[] | Alta |
| 7 | Acuerdos — mejorar UI, firma digital simple, historial | Media |
| 8 | Gastos — liquidar balance, exportar resumen texto, historial de pagos | Media |
| 9 | Dashboard "Hoy" — card resumen: quién tiene hoy, próximo cambio, balance pendiente, recordatorios | Media |
| 10 | Push notifications — FCM para mensajes nuevos, cambios pendientes, recordatorios | Baja |

## Decisiones de diseño importantes
- **Firebase compat SDK v10.12.0** (no modular), todo via `firebase.*` y `auth`/`db` globales
- **Sin build step** — JS vanilla, sin bundler, desplegable directo con GitHub Pages / Firebase Hosting
- **p1 = la persona que se registró primero** (invitante), p2 = quien acepta la invitación
- **Labels dinámicos**: `p1()` y `p2()` devuelven el label según `familyConfig` (ej. "Mamá" / "Papá")
- **`inviteConsumed`**: guard idempotente para que el link solo funcione una vez
- **Overrides manuales**: se guardan en `custodyOverrides` para poder restaurar la regla base
- **Eventos privados**: `participants === 'mama'` solo los ve quien tiene `myRole() === 'p1'`

## Notas de deployment
- Dominio custom: ver `CNAME`
- Firebase proyecto actual: `kindflo-copadres` (producción real, no romper)
- Cuando exista proyecto Firebase definitivo de Qinflo: actualizar `firebase.js` y migrar reglas
