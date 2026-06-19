# Qinflo — Contexto del proyecto para Claude

## Repositorio
- **GitHub**: franciscamarticorena-commits/Qinflo
- **Rama principal**: `main` (desarrollo directo en main desde Fase 6)
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
- `firebase.js` — config Firebase (proyecto `quinflo`, authDomain `qinflo.cl`)
- `state.js` — variables globales: USER, USERDATA, CODATA, FAMILY_ID, custodyMap, etc.
- `auth.js` — login, registro (email + Google), recuperación
- `connect.js` — `showConnectScreen()`, `autoConnect(inviteCode)` — flujo de invitación
- `app-shell.js` — listener auth, `loadApp()`, `setupListeners()`, listeners DOM, tabs, fetchUF
- `calendar.js` — renderCalendar, setCustody, proposals (sin edición directa de custodia)
- `events.js` — módulo de eventos: CRUD, aprobaciones, eventos privados
- `onboarding.js` — onboarding completo + `generateOnbCalendar()` + `getOnbCustodyForDate()`
- `expenses.js` — gastos, UF, balance, marcar pagado, anular
- `messages.js` — mensajes en tiempo real, quick replies editables, divisor de tema
- `children.js` — perfiles de hijos
- `agreements.js` — acuerdos
- `reminders.js` — recordatorios
- `resources.js` — recursos de apoyo Chile
- `today.js` — dashboard Hoy: custodia, pendientes, eventos, avisos, balance
- `observability.js` — Sentry + PostHog desactivados (sin llaves reales)
- `manifest.json` + `service-worker.js` — PWA base

## Modelo de datos Firestore

### `/users/{uid}`
```
name, email, role (p1|p2), familyId, coparentId, inviteCode, inviteConsumed,
onboardingCompleted, familyConfig { p1Label, p2Label }, createdAt,
quickReplies [],
legalAcceptance {
  tosVersion, privacyVersion,
  tosAccepted, privacyAccepted,
  newsletter,
  acceptedAt (Timestamp)
}
```

### `/families/{famId}`
```
members[], p1Uid, p2Uid, memberRoles.{uid}, custodyConfig, specialRules,
createdBy, createdAt, calAlgVersion
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
fromDate (ISO), toDate (ISO),
fromDay, toDay (numérico, compat),
reason, status (pending|accepted|rejected), date,
createdAt, createdBy, createdByName, createdByRole, requestedToRole,
respondedAt, respondedBy
```
**Nota**: Las propuestas solo se crean vía flujo de aprobación (no hay edición directa de custodia).
Mínimo = mañana. El remitente puede retirar su propia solicitud pendiente.

### `/families/{famId}/settlements/{id}`
```
amount (CLP), fromRole (mama|papa), toRole (mama|papa), date, createdAt, createdBy
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
| 5b | Google auth Safari/iOS fix + migración a Firebase Hosting | `140e76c` |
| 6 | Firestore Rules desplegadas via CI, Documentos, PWA store assets, T&C onboarding | `3619277..a4b1b1f` |
| 7 | Acuerdos — edición, firma simple, cambio de estado inline, cards mejoradas | `a5a390a` |
| 8 | Gastos — liquidar balance, exportar resumen texto, historial de liquidaciones | — |
| 9 | Dashboard "Hoy" — custodia, pendientes, eventos, avisos, balance con liquidaciones | `1898133` |
| 9b | Onboarding legal — panel Bienvenida, 3 checkboxes separados, audit trail Firestore | `d2b6896` |

## Roadmap pendiente (en orden estricto)

| Fase | Descripción | Prioridad |
|------|-------------|-----------|
| 10 | Push notifications — FCM para mensajes nuevos, cambios pendientes, recordatorios | Baja |

## Backlog (sin fecha — requiere análisis previo)

### Multi-familia (un usuario con coparents distintos)
**Contexto**: Un padre/madre puede tener hijos con distintas parejas. Cada relación debe tener su propio espacio independiente.

**Diseño propuesto**:
- Migrar `users/{uid}.familyId` (string) → `users/{uid}.families[]` (array de `{famId, coparentId, role, label}`)
- Agregar `activeFamilyId` para saber qué espacio está activo
- Selector de espacio en header/perfil que actualiza `FAMILY_ID` y reinicia listeners
- Antes de crear un segundo espacio: validar que el nuevo coparent no exista ya en `families[]` (evitar duplicados)
- **Migración**: todos los usuarios existentes deben pasar al nuevo schema

**Pendiente de definir (business case)**:
- ¿Se monetiza por espacio adicional, por usuario total, por familia, o es flat?
- Evaluar si el modelo de negocio justifica la complejidad de la migración
- Considerar que el mismo coparent podría estar en el espacio de múltiples usuarios

**Recuperación de contraseña**: ya existe (`doReset()` con `sendPasswordResetEmail`). Hacer más visible el "¿Ya tienes cuenta?" durante el registro para evitar cuentas duplicadas.

## Decisiones de diseño importantes
- **Firebase compat SDK v10.12.0** (no modular), todo via `firebase.*` y `auth`/`db` globales
- **Sin build step** — JS vanilla, sin bundler, desplegable directo con Firebase Hosting
- **p1 = la persona que se registró primero** (invitante), p2 = quien acepta la invitación
- **Labels dinámicos**: `p1()` y `p2()` devuelven el label según `familyConfig` (ej. "Mamá" / "Papá")
- **`inviteConsumed`**: guard idempotente para que el link solo funcione una vez
- **Overrides de custodia**: se guardan en `custodyOverrides`. La edición directa de días fue eliminada — solo existe el flujo de propuesta/aprobación entre ambos padres.
- **Eventos privados**: `participants === 'mama'` solo los ve quien tiene `myRole() === 'p1'`
- **Aceptación legal activa**: 3 checkboxes separados (TOS obligatorio, Privacy obligatorio, Newsletter opcional). Se guarda `legalAcceptance` en Firestore con `tosVersion`/`privacyVersion` para futuras migraciones de términos. Constantes `LEGAL_TOS_VERSION` y `LEGAL_PRIVACY_VERSION` en `onboarding.js`.
- **Posición jurídica de Qinflo**: herramienta de organización y registro, no reemplaza mediación ni acuerdos legales. Texto explícito antes de los checkboxes. TOS debe incluir: no es servicio de mediación, no determina quién tiene razón, no valida acuerdos judiciales, registros son referenciales no prueba legal formal, cada usuario es responsable de su información, datos de menores se tratan conforme a legislación vigente.

## Google Auth en Safari/iOS — solución definitiva

**Problema raíz**: Safari anula `window.opener` para tabs cross-origin. El popup de Google abre `/__/auth/handler` en el dominio de `authDomain`. Si `authDomain` es `quinflo.firebaseapp.com` pero la app está en `qinflo.cl`, son orígenes distintos → `window.opener` es null → Firebase no puede recibir el resultado.

**Solución implementada**:
1. Migrar hosting de GitHub Pages a **Firebase Hosting** → la app se sirve desde `qinflo.cl`
2. `authDomain: "qinflo.cl"` en `firebase.js` → el handler corre en el mismo origen
3. `signInWithPopup` para todas las plataformas (sin detección de Safari)
4. Service worker excluye URLs `/__/auth/` para no interceptar el handler

**Pasos de configuración que deben existir** (ya realizados, no tocar):
- DNS: `qinflo.cl` A record → `199.36.158.100`, `www.qinflo.cl` CNAME → `quinflo.web.app`
- Cloudflare: DNS only (sin proxy) para ambos registros
- Firebase Hosting: dominio `qinflo.cl` conectado al proyecto `quinflo`
- Google Cloud Console → OAuth Client → Authorized redirect URIs incluye `https://qinflo.cl/__/auth/handler`
- Firebase Auth → Authorized domains incluye `qinflo.cl`

**Si en el futuro Google auth deja de funcionar**, verificar en este orden:
1. ¿`authDomain` en `firebase.js` sigue siendo `qinflo.cl`?
2. ¿Firebase Hosting sigue sirviendo `qinflo.cl`? (Firebase Console → Hosting → estado "Conectado")
3. ¿El redirect URI `https://qinflo.cl/__/auth/handler` sigue en Google Cloud Console?

## Notas de deployment
- **Hosting**: Firebase Hosting (proyecto `quinflo`)
- **Dominio**: `qinflo.cl` → Firebase Hosting, `www.qinflo.cl` → `quinflo.web.app`
- **Deploy automático**: GitHub Actions (`.github/workflows/firebase-hosting-deploy.yml`) en cada push a `main`
- **Secret requerido**: `FIREBASE_SERVICE_ACCOUNT_QUINFLO` en GitHub repo secrets
- **Firebase proyecto**: `quinflo` (ID y nombre con u — el dominio `qinflo.cl` no tiene u, son cosas distintas)
