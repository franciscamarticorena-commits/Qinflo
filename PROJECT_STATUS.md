# Qinflo — Estado del proyecto (documento de transferencia completo)

> **Generado**: 2026-07-12, al cierre de una sesión de trabajo en la rama `claude/resume-main-14rwyc` (sincronizada 1:1 con `main`, commit `9fbe25d`).
> **Propósito**: Que cualquier persona (o instancia de Claude) que retome el proyecto tenga el 100% del contexto sin tener que releer commits, adivinar decisiones ni re-descubrir bugs ya identificados.
> **Cómo usar este documento**: Es la fuente de verdad exhaustiva. `CLAUDE_HANDOFF.md` (en la raíz) es su resumen operativo para arrancar una sesión nueva de Claude Code — léanse juntos. `CLAUDE.md` sigue siendo el archivo de memoria persistente del proyecto (se actualiza en cada sesión); este documento es una foto congelada, más profunda, del momento en que se escribió.

---

## Índice

1. Estado actual del proyecto
2. Arquitectura completa
3. Estructura de carpetas y archivos
4. Tecnologías utilizadas
5. Dependencias
6. Modelo de datos completo (Supabase/PostgreSQL)
7. Decisiones técnicas adoptadas y por qué
8. Decisiones UX adoptadas y por qué
9. Reglas de negocio implementadas
10. Funcionalidades terminadas
11. Funcionalidades parcialmente implementadas
12. Funcionalidades pendientes
13. **Bugs conocidos (verificados contra el código y el schema real)**
14. Errores que ya ocurrieron durante el desarrollo y cómo se resolvieron
15. Enfoques que NO deben volver a intentarse
16. Archivos críticos y propósito de cada uno
17. Convenciones de código
18. Riesgos técnicos
19. Próximos pasos priorizados

---

## 1. Estado actual del proyecto

Qinflo es una PWA (web app instalable) para coordinación de custodia compartida entre padres separados, en producción en `https://qinflo.cl`. Está en **fase post-migración**: pasó de un stack 100% Firebase (Auth + Firestore + Hosting + Cloud Functions) a un stack híbrido **Supabase (Auth + PostgreSQL + Realtime) + Firebase Hosting únicamente**. La migración de datos/lógica está completa y desplegada; quedan **restos de infraestructura Firebase sin uso** (Cloud Functions, Firestore Rules, service worker de FCM) que la CI sigue intentando desplegar sin que nadie los use.

El repo vive en `franciscamarticorena-commits/Qinflo`, rama principal `main`, con **desarrollo directo en main** (sin PRs ni ramas de feature de larga vida — así lo indica `CLAUDE.md` y así se ha operado en los últimos ~10 commits). Cada sesión de Claude Code trabaja sobre una rama `claude/...` que en la práctica termina fusionándose/empujándose a `main` sin flujo de PR formal (ver historial: la mayoría de los commits están directo en `main`).

**Última actividad real (commits en `main`, más recientes primero):**

| Commit | Fecha | Qué hizo |
|---|---|---|
| `9fbe25d` | 2026-07-05 | Fix: generar UUID de familia en el cliente para evitar problema de RLS en SELECT tras INSERT |
| `3476a4e` | 2026-07-05 | Fix: quitar paso `npm ci` de Functions en CI (fallaba) |
| `f685ac8` | 2026-07-05 | Fix: bump service worker a v25, reemplazar referencia a `firebase.js` por `supabase.js` en el cache |
| `df9f73b` | 2026-06-22 | Doc: actualizar `CLAUDE.md` con migración a Supabase y tareas pendientes |
| `e139535` | 2026-06-22 | Fix: flujo de recuperación de contraseña — manejar evento `PASSWORD_RECOVERY` |
| `d5db018` | 2026-06-21 | **Migración completa Firebase → Supabase** (el commit más grande del proyecto) |

No hay trabajo sin commitear: `git status` está limpio. No hay ramas divergentes activas relevantes — `origin/main` y esta rama apuntan al mismo commit.

**Estado del despliegue**: cada push a `main` dispara `.github/workflows/firebase-hosting-deploy.yml`, que sube el contenido estático a Firebase Hosting (proyecto `quinflo`, dominio `qinflo.cl`). La app en producción usa Supabase para todo el backend real; Firebase solo sirve los archivos estáticos.

---

## 2. Arquitectura completa

### 2.1 Panorama general

```
┌─────────────────────────────────────────────────────────────┐
│  Navegador (PWA, sin build step, JS vanilla)                 │
│                                                                │
│  index.html  ──carga──▶  17 archivos .js en <script> secuencial │
│                          (sin módulos ES, sin bundler)         │
│                                                                │
│  Estado global compartido vía variables `var`/`let` de scope   │
│  de módulo (USER, USERDATA, CODATA, FAMILY_ID, expenses[],     │
│  messages[], children[], etc. — todas declaradas en state.js)  │
└───────────────┬────────────────────────────┬──────────────────┘
                │                            │
                ▼                            ▼
     ┌─────────────────────┐      ┌──────────────────────┐
     │ Supabase             │      │ Firebase Hosting      │
     │ (xvfdncjrwrcbxgogzvym)│      │ (proyecto "quinflo")  │
     │  - Auth               │      │  - Solo sirve         │
     │  - PostgreSQL + RLS   │      │    archivos estáticos │
     │  - Realtime (websocket)│     │  - Dominio qinflo.cl  │
     └─────────────────────┘      └──────────────────────┘
```

No hay servidor propio, no hay API intermedia: el cliente habla directo con Supabase usando la `anon key` (protegido por Row Level Security en PostgreSQL) y con dos RPCs para operaciones que necesitan atomicidad (`set_custody_day`, `accept_invitation`).

### 2.2 Flujo de arranque de la app

1. `index.html` carga Supabase UMD + Lucide icons desde CDN, luego los 17 scripts del proyecto en orden fijo (ver sección 3).
2. `app-shell.js` registra `supa.auth.onAuthStateChange(...)` al cargar — este listener es el **verdadero punto de entrada** de toda la lógica de sesión, no hay un `main()` explícito.
3. Cuando Supabase emite una sesión (`SIGNED_IN`, recarga de página con sesión persistida, etc.):
   - Si el evento es `PASSWORD_RECOVERY`, se muestra la pantalla de nueva contraseña y se corta el flujo ahí.
   - Si no hay usuario, se muestra `authScreen`.
   - Si hay usuario, se llama a `loadUserData(u.id)`, que hace **3 queries a Supabase** (perfil, membresía+familia via join embebido, coparent, invitación pendiente) para reconstruir un objeto `USERDATA` compatible en forma con el viejo modelo Firestore.
   - Si `loadUserData` devuelve `null` (usuario sin familia todavía):
     - Si vino de Google OAuth → `createGoogleUserProfile()` crea familia + membership + invitación automáticamente (un usuario de Google nunca pasa por el formulario de registro con tipo de familia/rol).
     - Si no → se desloguea y se pide registrarse primero (no se puede "iniciar sesión" con Google sin haber tenido antes un flujo de creación de cuenta consistente... en la práctica Google siempre crea perfil automáticamente, este branch solo aplica a emails huérfanos).
   - Se resuelve invitación pendiente en la URL (`?invite=CODE`) o en `localStorage` (`pendingInvite`) llamando a `autoConnect()`.
   - Se llama `updateLabels()` y `loadOrOnboard()`.
4. `loadOrOnboard()`: si `onboardingCompleted === false` → `startOnboarding()`; si no → `loadApp()`.
5. `loadApp()`: muestra el shell de la app, llama `setupListeners()` (carga inicial de **11 tablas en paralelo** + se suscribe a Realtime), `fetchUF()`, renders iniciales, y `checkAndGenerateCalendar()` (regenera el calendario de custodia si la versión del algoritmo cambió).

### 2.3 Patrón de datos: "loader + alias camelCase" por tabla

Cada tabla Supabase tiene una función `loadX()` en `app-shell.js` que:
1. Hace el `SELECT` filtrado por `family_id` (usando `.is('deleted_at', null)` cuando la tabla soporta soft-delete).
2. Convierte cada fila con `toCamel()` (snake_case → camelCase recursivo, ver `state.js`).
3. Agrega **alias adicionales a mano** para que las funciones de render (escritas originalmente para el modelo Firestore) sigan funcionando sin reescribirse. Ejemplos:
   - `expenses`: agrega `paidBy` (derivado de `paid_by_role`) y `paid` (booleano derivado de `status === 'paid'`).
   - `messages`: agrega `text` (de `content`), `createdBy` (de `author_id`), `senderRole`.
   - `reminders`: agrega `for` (de `assigned_to`) y `done` (booleano de `status === 'completed'`).
   - `proposals` (tabla `custody_changes`): agrega `fromDate`/`toDate`/`date`, `createdByRole`, `createdBy`, `requestedToRole`.
   - `events`: agrega `date`/`time` (partidos desde `start_at` timestamptz), `requiresApproval`, `approvalStatus`.
   - `settlements`: agrega `fromRole`/`toRole` mapeados a strings `'mama'`/`'papa'`.
4. Llama a los renders correspondientes (`renderExpenses()`, `renderToday()`, etc.)

Esto significa que **el modelo de datos "real" vive en dos capas**: las columnas snake_case de Postgres, y un modelo derivado camelCase con nombres de campo que a veces no coinciden 1:1 con la tabla (p.ej. `paidBy` tiene valores `'mama'`/`'papa'`, mientras que la columna real `paid_by_role` tiene `'p1'`/`'p2'`). **Cualquier cambio de schema debe actualizarse en 2 lugares: la tabla y el loader.**

### 2.4 Tiempo real

Un solo canal Supabase Realtime por familia (`family-{FAMILY_ID}`), suscrito a `postgres_changes` en 11 tablas (`expenses`, `messages`, `children`, `agreements`, `reminders`, `custody_changes`, `events`, `custody_months`, `documents`, `settlements`, `activity_logs`). Cualquier `INSERT`/`UPDATE`/`DELETE` en esas tablas para la familia activa dispara un **re-fetch completo** de esa tabla (no hay actualización incremental fila-por-fila — se relee todo con `loadX()`). Es simple pero no es eficiente a escala; para el tamaño de una familia (2 usuarios, decenas/cientos de filas) es más que suficiente.

Hay un segundo canal efímero, `coparent-join-{FAMILY_ID}`, creado solo durante el onboarding (`onboarding.js _watchForCoparentJoin()`), que escucha el `INSERT` en `family_members` para detectar cuándo el otro padre/madre acepta la invitación, mostrar el mensaje de bienvenida y avanzar automáticamente. Se desuscribe apenas dispara una vez.

### 2.5 Autenticación

- Email + contraseña: `supa.auth.signInWithPassword` / `signUp`.
- Google OAuth: `supa.auth.signInWithOAuth({ provider: 'google', redirectTo: window.location.origin })`. Supabase gestiona el redirect completo (`detectSessionInUrl: true` en `supabase.js`); no hay manejo manual de `getRedirectResult()` como en la era Firebase.
- Recuperación de contraseña: `resetPasswordForEmail` → email con link → Supabase dispara evento `PASSWORD_RECOVERY` en `onAuthStateChange` → pantalla dedicada → `updateUser({ password })`.
- Un **trigger de Postgres** (`handle_new_user`, en `001_initial_schema.sql`) crea automáticamente la fila en `public.users` cuando se crea un usuario en `auth.users` — el cliente nunca hace `INSERT INTO users` directamente tras el signup.

### 2.6 Estructura de "familia" (multi-tenant por familia)

- `families`: una fila por familia, contiene config general (`config` JSONB: labels de rol y tipo de familia), `custody_config` (JSONB: la regla de custodia elegida en onboarding), `special_rules` (JSONB: reservado, no implementado), `cal_alg_version` (para forzar regeneración de calendario tras fixes de algoritmo), `p1_uid`/`p2_uid`, `last_pickup` (JSONB: último "los niños ya están conmigo").
- `family_members`: relación N:N usuario↔familia con `role` (`p1`/`p2`) y `status` (`active`/...). **En la práctica cada familia tiene máximo 2 miembros activos** (el modelo de datos lo permitiría de forma más flexible pero la UI asume siempre "yo" + "coparent").
- `p1` = quien creó la familia (se registró primero / usó el link de invitación siendo el iniciador). `p2` = quien acepta la invitación. Los labels visibles (`Mamá`/`Papá`, `Papá 1`/`Papá 2`, etc.) se resuelven dinámicamente vía `familyConfig.p1Label`/`p2Label` según el tipo de familia elegido en el registro (`mama_papa`, `papa_papa`, `mama_mama`).
- Casi todas las tablas de datos (`expenses`, `events`, `children`, etc.) tienen `family_id` y se filtran por RLS a los miembros activos de esa familia (`is_family_member(p_family_id)` en Postgres).

### 2.7 RLS (Row Level Security)

Todas las tablas relevantes tienen RLS habilitado. La función helper `is_family_member(p_family_id)` (SQL, `SECURITY DEFINER` presumiblemente) es la base de casi todas las políticas. **No se revisó el detalle línea por línea de las 40 políticas** en esta sesión de documentación — si se sospecha un problema de permisos, ir directo a `supabase/migrations/001_initial_schema.sql` (políticas) y `002_migration_compatibility.sql` (RPCs `SECURITY DEFINER` que bypasean RLS para operaciones atómicas).

---

## 3. Estructura de carpetas y archivos

Estructura **plana** — todo en la raíz del repo, sin `src/`, sin bundler. Confirmado directamente contra el filesystem (no contra el README, que describe una estructura `js/`/`css/` que **ya no existe** — ver sección 15).

```
Qinflo/
├── index.html                          # HTML completo + orden de carga de scripts
├── styles.css                          # Único archivo de estilos (39 KB)
├── manifest.json                       # PWA manifest
├── service-worker.js                   # Cache PWA (cache-first con fallback a index.html)
├── favicon.svg
├── CNAME                               # Dominio custom para GitHub Pages (histórico/no usado con Firebase Hosting)
├── .firebaserc                         # Proyecto Firebase: "quinflo"
├── firebase.json                       # Config hosting + (obsoleto) firestore + functions
│
├── supabase.js                         # Cliente Supabase (URL + anon key hardcoded, instancia global `supa`)
├── state.js                            # Estado global + helpers (toCamel, famQ, nowISO, etc.)
├── auth.js                             # Login, registro, Google OAuth, reset password
├── connect.js                          # Pantalla de conexión + autoConnect(inviteCode)
├── app-shell.js                        # onAuthStateChange, loadUserData, loadApp, loaders, realtime
├── onboarding.js                       # Onboarding completo + generación de calendario + watcher coparent
├── calendar.js                         # Calendario, custodia, propuestas de cambio
├── events.js                           # Eventos: CRUD, aprobación, categorías
├── expenses.js                         # Gastos, UF, balance, liquidaciones
├── messages.js                         # Mensajería + quick replies
├── children.js                         # Perfiles de hijos  ⚠️ MÓDULO ROTO — ver sección 13
├── agreements.js                       # Acuerdos con firma simple
├── reminders.js                        # Avisos/recordatorios
├── documents.js                        # Documentos                ⚠️ MÓDULO ROTO — ver sección 13
├── activity.js                         # logActivity() + feed de actividad en Hoy
├── today.js                            # Dashboard "Hoy"
├── resources.js                        # Recursos de apoyo Chile (contenido estático hardcoded)
├── theme.js                            # Dark/light mode (localStorage + data-theme attr)
├── observability.js                    # Sentry/PostHog — desactivado (sin llaves), + registra el SW
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql      # Schema completo (27 tablas, ~40 políticas RLS, triggers)
│       └── 002_migration_compatibility.sql  # Columnas + tablas + RPCs añadidas post-migración
│
├── .github/workflows/
│   └── firebase-hosting-deploy.yml     # CI: deploy hosting (+ intentos obsoletos de firestore/functions)
│
├── .well-known/                        # assetlinks.json (Android App Links / TWA)
├── assets/icons/                       # Íconos PWA en todos los tamaños
│
├── terms.html / privacy.html           # Páginas legales (T&C, privacidad) enlazadas desde onboarding
│
├── CLAUDE.md                           # Memoria persistente del proyecto (leer siempre primero)
├── PROJECT_STATUS.md                   # Este documento
├── CLAUDE_HANDOFF.md                   # Handoff operativo para la próxima sesión de Claude
├── README.md / "README 2.md"           # ⚠️ Obsoletos — describen una estructura js/css que no existe. Ver sección 15.
│
└── — Archivos Firebase huérfanos (no referenciados por index.html, dead code en el repo) —
    ├── firebase.js                     # Cliente Firebase — YA NO SE IMPORTA en index.html
    ├── firebase-messaging-sw.js        # Service worker de FCM — YA NO SE USA
    ├── firestore.rules                 # Reglas de Firestore — la CI las sigue "desplegando" (continue-on-error)
    └── functions/                      # 3 Cloud Functions sobre triggers de Firestore — NUNCA se disparan
        ├── index.js
        └── package.json
```

**17 scripts cargados por `index.html`** (orden exacto, con query string de versión para bustear cache — ver sección 17 sobre esta convención):

```html
<script src="supabase.js?v=1"></script>
<script src="state.js?v=9"></script>
<script src="auth.js?v=9"></script>
<script src="connect.js?v=8"></script>
<script src="calendar.js?v=13"></script>
<script src="expenses.js?v=13"></script>
<script src="messages.js?v=9"></script>
<script src="children.js?v=8"></script>
<script src="agreements.js?v=8"></script>
<script src="reminders.js?v=9"></script>
<script src="resources.js?v=8"></script>
<script src="observability.js?v=8"></script>
<script src="onboarding.js?v=11"></script>
<script src="events.js?v=10"></script>
<script src="documents.js?v=1"></script>
<script src="activity.js?v=1"></script>
<script src="today.js?v=12"></script>
<script src="theme.js?v=1"></script>
<script src="app-shell.js?v=13"></script>
```

`app-shell.js` se carga **último a propósito** porque registra el listener de auth y el `DOMContentLoaded` que engancha literalmente todos los botones de la UI — depende de que todas las funciones de los módulos anteriores ya existan en el scope global.

---

## 4. Tecnologías utilizadas

- **Frontend**: HTML + CSS + JavaScript vanilla (ES2017-ish, `var`/`function`, algo de `async/await`, sin clases, sin JSX, sin TypeScript). Sin build step, sin bundler, sin transpilación.
- **Auth/DB/Realtime**: Supabase (`@supabase/supabase-js@2`, cargado como bundle UMD vía jsDelivr CDN, no vía npm — no hay `npm install` en el flujo del frontend).
- **Base de datos**: PostgreSQL (gestionado por Supabase) con Row Level Security.
- **Iconos**: Lucide (`lucide.js` UMD vía unpkg CDN).
- **Hosting**: Firebase Hosting (solo archivos estáticos, sin SSR).
- **CI/CD**: GitHub Actions, un solo workflow (`firebase-hosting-deploy.yml`), dispara en cada push a `main`.
- **PWA**: `manifest.json` + `service-worker.js` custom (cache-first, sin Workbox).
- **Observabilidad**: Sentry + PostHog integrados en código pero **desactivados** (sin DSN/API key configurados — ver `observability.js`).
- **Fuente de tipo de cambio**: API pública `mindicador.cl` para el valor de la UF (Unidad de Fomento chilena), usado en gastos.
- **Cloud Functions** (Firebase, Node 18) — **código presente pero muerto**, ver sección 13.

---

## 5. Dependencias

No hay `package.json` en la raíz del proyecto (el frontend no usa npm). Las únicas dependencias externas son vía `<script src>` en `index.html`:

| Paquete | Versión | Fuente | Uso |
|---|---|---|---|
| `@supabase/supabase-js` | `@2` (latest 2.x, sin pin exacto) | jsDelivr CDN | Cliente Supabase completo (Auth + PostgREST + Realtime) |
| `lucide` | `@latest` (sin pin) | unpkg CDN | Set de iconos SVG |
| Sentry / PostHog | comentados, sin cargar | — | Preparados pero inactivos |

`functions/package.json` (Cloud Functions, código muerto — ver sección 13):
```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.9.0"
  }
}
```

**Riesgo de dependencia**: tanto Supabase-js como Lucide se cargan con `@2` / `@latest` sin pin de versión exacta — un breaking change upstream se propagaría a producción sin aviso ni control de versión. Ver sección 18 (riesgos técnicos).

---

## 6. Modelo de datos completo (Supabase/PostgreSQL)

### 6.1 Tablas realmente usadas por el código de la app

| Tabla | Usada por | Notas |
|---|---|---|
| `users` | auth.js, app-shell.js, todos | Extiende `auth.users`. Trigger `handle_new_user` la puebla automáticamente. |
| `families` | auth.js, calendar.js, onboarding.js | `config`, `custody_config`, `special_rules` (JSONB) |
| `family_members` | app-shell.js, connect.js | `role` p1/p2, `status` |
| `invitations` | auth.js, connect.js | `token`, `status` |
| `children` | children.js | ⚠️ Schema real no coincide con lo que envía `saveKid()` — ver sección 13 |
| `custody_changes` | calendar.js, today.js | Alias en JS: `proposals` |
| `custody_months` | calendar.js, onboarding.js (`generateOnbCalendar`) | PK compuesta `(family_id, month_key)`, JSONB `custody`/`overrides` |
| `events` | events.js, calendar.js, today.js | `participants` CHECK solo admite `'both'/'p1'/'p2'` — JS envía `'mama'/'papa'/'both'` ⚠️ |
| `expenses` | expenses.js | `treatment`, `split_percentage_p1/p2`, soft delete vía `voided` |
| `settlements` | expenses.js | Liquidaciones de balance |
| `messages` | messages.js | Inmutable — sin política DELETE |
| `agreements` | agreements.js | `signatures` JSONB (uid → timestamp) |
| `reminders` | reminders.js | `assigned_to`, `status` |
| `documents` | documents.js | ⚠️ Schema real no coincide con lo que envía `saveDoc()` — ver sección 13 |
| `activity_logs` | activity.js | Feed de "Actividad" en Hoy |

### 6.2 Tablas definidas en el schema pero SIN uso actual en el código

Estas 13 tablas existen en `001_initial_schema.sql` (probablemente diseñadas con visión de roadmap largo) pero **ningún archivo `.js` las referencia** hoy: `legal_acceptances` (la aceptación legal real vive en `users.legal_acceptance` JSONB, no en esta tabla separada), `custody_patterns`, `custody_confirmations`, `event_confirmations`, `currency_rates`, `message_edit_history`, `message_templates`, `resources` (los recursos de apoyo están hardcoded en `resources.js`, no en esta tabla), `pending_actions`, `notifications`, `notification_tokens`, `plans`, `subscriptions`, `audit_logs`.

No son un problema en sí (tablas vacías no cuestan nada), pero **no asumir que existe lógica detrás de ellas** solo porque están en el schema — es superficie de diseño no implementada. Si se retoma alguna (p.ej. `notifications`/`notification_tokens` para push), hay que construir la lógica desde cero.

### 6.3 RPCs (funciones PostgreSQL)

- **`set_custody_day(p_family_id, p_month_key, p_day, p_parent)`** — upsert atómico de un día dentro del JSONB `custody` de `custody_months`. Usado por `calendar.js setCustody()`.
- **`accept_invitation(p_token, p_user_id)`** — reemplaza el batch write de Firestore: valida el token, crea la membership, marca la invitación como usada, y devuelve JSONB `{familyId, role, familyConfig, inviterId}`. Idempotente (según `CLAUDE.md`; no se re-verificó el código SQL línea por línea en esta sesión). Usado por `connect.js autoConnect()`.
- **`is_family_member(p_family_id)`** — helper de RLS, usado dentro de las políticas de casi todas las tablas.
- **`set_updated_at()`** — trigger genérico para mantener `updated_at`.
- **`handle_new_user()`** — trigger en `auth.users` que crea la fila espejo en `public.users`.

### 6.4 Compatibilidad camelCase (resumen — detalle en sección 2.3)

Ver sección 2.3. Es el mecanismo central para entender por qué el código JS a veces "no calza" a simple vista con los nombres de columna reales.

---

## 7. Decisiones técnicas adoptadas y por qué

1. **Sin build step / sin bundler.** Decisión original del proyecto (documentada en el README histórico) para bajar riesgo y permitir que una IA edite archivos chicos sin romper un pipeline de build. Se mantuvo durante toda la migración a Supabase. Trade-off: no hay tree-shaking, no hay minificación, cache-busting manual vía query string (`?v=N`) en cada `<script>`.

2. **Supabase JS v2 cargado como UMD por CDN, no vía npm.** Coherente con "sin build step". La instancia global se llama `supa` (no `supabase`) — **deliberado**: `supabase` es el nombre que el propio bundle UMD usa para exponerse en `window`, así que nombrar la instancia igual generaría un choque de nombres.

3. **`toCamel()` + alias manuales en cada loader, en vez de renombrar columnas Postgres a camelCase.** Se prefirió mantener el schema en snake_case (convención estándar de Postgres/Supabase, mejor soporte de tooling, RLS y RPCs más legibles) y absorber la diferencia de convención en la capa de carga de datos, para no tener que reescribir las ~15 funciones `renderX()` que ya asumían nombres de campo camelCase heredados de Firestore.

4. **`p1`/`p2` como roles neutrales de género en base de datos, con labels dinámicos en UI.** Permite soportar familias `mama_papa`, `papa_papa`, `mama_mama` sin tocar el schema — el label mostrado (`Mamá`, `Papá 1`, etc.) se resuelve en tiempo de render vía `familyConfig`. Los helpers `p1()`/`p2()` en `state.js` son la única fuente de verdad para esos labels.

5. **UUID de familia generado en el cliente (`crypto.randomUUID()`), no devuelto por el `INSERT`.** Ver sección 14, error #1 — evita una vuelta de RLS que bloqueaba el `SELECT` inmediatamente después del `INSERT` durante el registro (porque en ese instante la membership que habilitaría la política RLS de lectura todavía no existía).

6. **RPCs `SECURITY DEFINER` para operaciones que cruzan varias tablas atómicamente** (`accept_invitation`, `set_custody_day`) en vez de encadenar varios `INSERT`/`UPDATE` desde el cliente. Evita estados intermedios inconsistentes si el cliente pierde la conexión a mitad de una operación multi-tabla, y evita tener que exponer políticas RLS más permisivas de lo necesario solo para permitir esos pasos intermedios.

7. **Un canal Realtime por familia que dispara re-fetch completo de tabla, no updates incrementales.** Simplicidad sobre eficiencia — a la escala de una familia (2 usuarios) el costo de releer una tabla completa es insignificante, y evita tener que mantener lógica de merge de deltas en 11 tablas distintas.

8. **Soft deletes (`deleted_at`) en vez de `DELETE` real** para `expenses`, `children`, `documents`, `agreements`, `reminders`. Preserva el historial para el futuro "Timeline histórico" (prioridad 4 del roadmap de producto) y evita pérdida accidental de datos compartidos entre dos personas que podrían no estar de acuerdo en borrar algo.

9. **Mensajes inmutables — sin política RLS de `DELETE`.** Decisión de producto explícita (documentada en `CLAUDE.md`): nadie puede borrar mensajes, por diseño, para preservar la "verdad compartida".

10. **`cal_alg_version` en `families` + regeneración forzada de calendario cuando cambia.** Permite corregir bugs en el algoritmo de generación de custodia (ver error #2 en sección 14) sin tener que migrar datos manualmente — basta con subir la constante `CAL_ALG_VERSION` en `calendar.js` y el cliente regenera automáticamente en el siguiente `loadApp()`, preservando los overrides manuales gracias al upsert con merge.

11. **Firebase Hosting se mantuvo solo para servir estáticos tras la migración**, en vez de mover a Vercel/Netlify/Supabase Storage. Razón pragmática: el dominio `qinflo.cl`, el certificado y el pipeline de CI ya estaban funcionando; migrar solo el backend (Auth/DB) y dejar el hosting intacto minimizó el radio de cambio de una migración ya de por sí grande.

---

## 8. Decisiones UX adoptadas y por qué

1. **"Esperando respuesta" como una sola tarjeta unificada**, no módulos separados por tipo de pendiente (propuesta de custodia, evento por confirmar, aviso de hoy). Implementado en `today.js _todayPendingRequests()`. Razón de producto (ver visión estratégica en `CLAUDE.md`): reduce la carga cognitiva de tener que revisar varias secciones para saber "¿algo requiere mi atención?".

2. **Máximo una propuesta de cambio de custodia pendiente a la vez** (`activePendingProposal()` bloquea la creación de una nueva mientras haya una `pending`, en ambas direcciones — ni quien la creó ni quien debe responder pueden abrir una segunda). Evita que se acumulen solicitudes contradictorias o que se pierda de vista cuál es "la vigente".

3. **Fechas de propuesta deben ser desde mañana en adelante**, nunca hoy o pasado (`saveProp()` valida `fromDate < minDate` con `minDate = mañana`). Evita proponer cambios retroactivos o de aplicación inmediata sin aviso al otro padre/madre.

4. **Semana empieza en lunes** (`(getDay() + 6) % 7`), no domingo — estándar latinoamericano/chileno, corregido explícitamente en un commit (`d945908`) tras salir con domingo por defecto (comportamiento por defecto de `Date.getDay()` en JS).

5. **Pickers nativos de fecha/hora reemplazados por selects y texto `DD/MM/AAAA`** en onboarding, en vez de `<input type="date">`/`<input type="time">`. Motivo: el selector nativo de Android interfería con el diseño y generaba UX inconsistente entre plataformas (commit `3eac5bc`). `parseDateInput()` convierte `DD/MM/AAAA` → ISO internamente.

6. **`switchTab('today')` se llama antes que cualquier función que pueda lanzar una excepción** en `loadApp()`. Motivo explícito de un commit (`3eac5bc`): evitar pantalla en blanco si alguna carga de datos falla — el usuario siempre ve al menos el shell de la app con la tab "Hoy" visible, aunque algo detrás falle silenciosamente.

7. **Botón de invitar se oculta automáticamente una vez que el coparent está conectado** (`updateLabels()` en `app-shell.js`). Nota arquitectural dejada en el commit `6d78bbf`: el soporte multi-coparent (un padre/madre con hijos de distintas parejas, cada una con su propia familia Qinflo) queda pendiente como evolución futura — hoy el modelo asume una familia = un coparent fijo.

8. **Reembolso de gastos ocultado a quien pagó** (`isCreditor` en `updateExpenseTreatmentUI`) — quien puso el dinero no necesita ver el campo de "adjuntar comprobante de reembolso", porque ese campo es para que el otro padre/madre demuestre que ya devolvió su parte.

9. **Confirmación explícita "Los niños ya están conmigo"** solo visible en días de cambio de custodia (`custody === 'transition'`), nunca en días normales. Es la base de la funcionalidad de "Confirmaciones" del roadmap de producto (prioridad 5): generar realidad compartida verificable con timestamp exacto.

10. **Modo oscuro completo** con toggle tanto en el header como en el panel de perfil, persistido en `localStorage` (`qinflo-theme`) y aplicado vía atributo `data-theme` en `<html>` — se aplica antes del primer paint relevante para evitar flash de tema incorrecto (llamado desde `DOMContentLoaded`, ver `theme.js`).

11. **Editor de "quick replies" (respuestas rápidas) totalmente personalizable por usuario**, reemplazando una lista fija — decisión tomada tras observar que las respuestas por defecto no calzaban con el tono real de cada familia (commit `404eb44`).

12. **Detector best-effort de lenguaje ofensivo antes de enviar un mensaje** (`isPotentiallyOffensive()` en `messages.js`), con lista de palabras hardcoded en español chileno — no bloquea el envío, solo pide confirmación extra (`confirm()`). Es una fricción intencional, no una censura dura.

---

## 9. Reglas de negocio implementadas

### Custodia
- Tres modelos de calendario: `alternating_weeks` (semana por medio, con día y hora de cambio configurables), `fixed_days` (días fijos por semana, con soporte opcional de "días alternados" dentro del patrón fijo), `custom`/`undefined` (sin generación automática — el calendario queda vacío/manual).
- El calendario se **pre-genera 24 meses hacia adelante** desde `generateOnbCalendar()`, no se calcula on-the-fly al navegar.
- Cambios de custodia puntuales pasan siempre por el flujo propuesta→aceptar/rechazar (`custody_changes`), nunca por edición directa de un día — decisión de producto: "sin edición directa — solo flujo propuesta/aprobación" (ver `CLAUDE.md`).
- Al aceptar una propuesta, el día `toDay`/`toDate` se marca como `'transition'` en el calendario (no se recalculan los días intermedios automáticamente).
- Los overrides manuales (guardados vía `set_custody_day` RPC) tienen **prioridad sobre el patrón generado**: `getCustody()` primero consulta `custodyOverridesMap`, y solo si no hay override cae al patrón (`custodyMap`).

### Eventos
- Tres estados relevantes de aprobación: sin aprobación requerida (se crea `confirmed` directo), o con aprobación requerida (`pending` → `confirmed`/`cancelled` según respuesta del otro padre/madre). La aprobación **solo aplica si `participants === 'both'`** (un evento privado no tiene a quién pedirle aprobación).
- Eventos con `participants !== 'both'` son visibles solo para el rol correspondiente (`eventsForDay()` filtra por `myRole()`).
- Categorías fijas: salud, colegio, actividad, cumpleaños, vacaciones, otro.

### Gastos
- Cada gasto tiene un **"tratamiento"**: `pension` (considerado en la pensión de alimentos, no genera saldo — "registro no cobrable"), `shared` (dividido en el % que se defina, 50/50 por defecto), `mama_only`/`papa_only` (100% a cargo de uno, sin generar deuda al otro).
- El balance compartido (`_computeSharedNet`) solo considera gastos `treatment === 'shared'`; los `pension`/`mama_only`/`papa_only` no entran al cálculo de deuda entre padres.
- Las liquidaciones (`settlements`) ajustan el balance calculado — el balance final es `net gastos compartidos - ajuste por liquidaciones ya pagadas`.
- Montos pueden registrarse en CLP o UF; el valor de la UF se trae en vivo de `mindicador.cl` con fallback hardcoded (`UF = 38650` en `state.js`) si la API falla.
- Categorías con subcategorías predefinidas (Educación, Salud, Vida cotidiana, Gastos extraordinarios), cada una con su propia lista de subcategorías chilenas específicas (matrícula, isapre/fonasa, uniformes, etc.).

### Mensajería
- Sin edición ni borrado de mensajes (inmutabilidad por diseño).
- Separador de "tema" (`sendMsgDivider()`) para marcar visualmente el inicio de una conversación nueva dentro del mismo hilo continuo.
- Detección best-effort de lenguaje ofensivo antes de enviar (no bloqueante).

### Onboarding / invitación
- El primer usuario en registrarse (o el que usa Google) siempre es `p1`; quien acepta la invitación es `p2` — **irreversible** una vez asignado (no hay UI para cambiar roles después).
- Un usuario nuevo con invitación pendiente en `localStorage`/URL se conecta automáticamente a la familia del invitador sin pasar por onboarding propio de custodia — hereda `familyConfig` de `p1`.
- Onboarding legal explícito: checkboxes separados para Términos y Privacidad, guardados con versión (`LEGAL_TOS_VERSION`, `LEGAL_PRIVACY_VERSION`) y timestamp en `users.legal_acceptance` JSONB — auditable.

### Aceptación legal
- No se puede avanzar del panel de disclaimer sin marcar ambos checkboxes (`onbAcceptDisclaimer()` los valida server-side... en realidad solo client-side; no hay constraint en DB que impida `onboarding_completed=true` sin `legal_acceptance` poblado — es una validación de UI únicamente).

---

## 10. Funcionalidades terminadas

Estas funcionan de punta a punta hoy en producción (verificado por lectura de código; no se hizo QA manual en esta sesión):

- Registro por email/contraseña y por Google OAuth.
- Login, logout, recuperación de contraseña (con el fix de `PASSWORD_RECOVERY` aplicado).
- Onboarding completo: tipo de familia, tipo de custodia (3 modelos), lugar de cambio, hijos (nombre + fecha nacimiento, sin el resto de campos porque **ver bug de children más abajo** — el alta durante onboarding usa un insert distinto, más simple, que si coincide con el schema: solo `name`+`birthDate`+`created_at`+`created_by`... **también falla por `created_by`**, ver sección 13), invitación al coparent con link de WhatsApp, detección en tiempo real de cuándo el coparent se conecta.
- Generación automática de calendario de custodia a 24 meses, con overrides manuales que sobreviven a regeneraciones.
- Filtrado de calendario por padre (`calFilter`).
- Propuestas de cambio de custodia: crear, aceptar, rechazar, retirar (por quien la creó), con bloqueo de una segunda propuesta mientras haya una pendiente.
- Eventos: crear, editar, marcar como realizado/cancelado, aprobación cuando aplica, vista por día en el detalle del calendario.
- Gastos: crear, editar, marcar como pagado, anular (soft delete), adjuntar nombre de archivo de comprobante (**sin subida real de archivo** — ver sección 11), cálculo de balance, liquidar balance, exportar resumen de texto al portapapeles.
- Mensajería en tiempo real con quick replies editables y divisor de tema (**el timestamp visual no funciona**, ver bug #5 en sección 13, pero el envío/recepción de mensajes sí).
- Acuerdos: crear, editar, firma simple (timestamp por usuario), ciclo de estado (Activo → En revisión → Completado → vuelve a Activo), borrado (soft delete).
- Avisos/recordatorios: crear, editar, marcar completado/deshacer, borrado (soft delete).
- Dashboard "Hoy": custodia actual + próximo cambio, tarjeta unificada de pendientes, eventos de hoy, avisos de la próxima semana, balance de gastos, feed de actividad reciente.
- Feed de actividad (`activity_logs`) — registra creación/aprobación/rechazo de propuestas y eventos (pero **no todas las acciones del sistema llaman a `logActivity()`** — es best-effort, no un audit log completo).
- Modo oscuro/claro con persistencia.
- PWA instalable (manifest + service worker, cache-first).
- Páginas legales estáticas (`terms.html`, `privacy.html`).
- Recursos de apoyo Chile (contenido estático, no editable desde la UI).

## 11. Funcionalidades parcialmente implementadas

- **Adjuntar comprobantes a gastos**: la UI captura el **nombre del archivo** (`$('expFile').files[0].name`) y lo guarda como texto en `attachment_name`/`reimbursement_attachment_name` — **no hay subida real a storage**. El archivo nunca sale del navegador del usuario; el campo es puramente decorativo/informativo hoy.
- **Reembolso de gastos de salud**: existe el campo `healthRefund` (`pending`/`yes`/`no`) en la UI y se persiste, pero no hay lógica de negocio que dependa de su valor (no afecta el balance, no dispara ninguna notificación).
- **`special_rules` en `families`**: se persiste una estructura JSONB completa (`mothersDay`, `fathersDay`, `christmas`, `newYear`, `vacations`) durante `saveOnboardingData()`, con un comentario explícito en el código: *"specialRules: estructura reservada para lógica futura de fechas especiales. La lógica de prioridad ... no está implementada — solo se persiste la estructura para no tener que migrar el schema después."* Es placeholder puro.
- **`documents.js`**: la UI completa existe (formulario, lista, edición, borrado) pero **el guardado está roto por incompatibilidad de schema** — ver bug en sección 13. Funcionalmente es "UI terminada, backend no conectado correctamente".
- **`children.js`**: mismo caso que documentos — UI completa, persistencia rota.
- **Push notifications (FCM)**: existe infraestructura completa del lado Firebase (Cloud Functions, service worker, VAPID) pero **está 100% desconectada** de Supabase — `setupNotifications()` es un no-op explícito. Es "construido para el stack anterior, nunca migrado".
- **Sentry/PostHog**: código de inicialización completo y correcto, pero sin DSN/API key configurados — no captura nada hoy.
- **Google Calendar sync**: mencionado como prioridad 6 del roadmap de producto en `CLAUDE.md`, la tabla `events` ya tiene columnas `source` (`qinflo`/`google_calendar`) y `google_event_id` preparadas en el schema, pero no hay ninguna integración real implementada.

## 12. Funcionalidades pendientes

Del roadmap explícito en `CLAUDE.md` (sección "Roadmap pendiente"), en el orden de prioridad ahí definido:

1. **SMTP personalizado (Resend)** — para que los emails (recuperación de contraseña, confirmación) salgan desde `@qinflo.cl` y no cwaigan en spam. Prioridad Alta.
2. **Emails en español** — personalizar la plantilla de recuperación de contraseña en Supabase Auth (hoy usa la plantilla genérica en inglés de Supabase).
3. **Confirmación de email** — decidir si mantenerla activada o no en Supabase Auth (afecta fricción de registro).
4. **Verificación end-to-end de Google OAuth en producción** — no hay evidencia en el código de que se haya probado el flujo completo post-migración a Supabase (el código parece correcto por lectura, pero no fue verificado en vivo en esta sesión).
5. **Push notifications reales** (prioridad Baja en el roadmap) — requeriría implementar Web Push nativo (o reconectar FCM) contra Supabase Realtime/Postgres triggers, ya que el sistema actual apunta a Firestore, que ya no se usa.

Adicional, no en el roadmap explícito pero identificado en esta sesión de auditoría (ver siguiente sección para el detalle técnico):

6. **Arreglar el módulo de Hijos (`children.js`)** — está roto en producción, no es "pendiente de construir" sino "regresión sin detectar".
7. **Arreglar el módulo de Documentos (`documents.js`)** — mismo caso.
8. **Arreglar la creación de eventos privados** (`participants !== 'both'`) — viola un CHECK constraint, la creación falla con alerta de error.
9. **Limpieza de infraestructura Firebase muerta** (Cloud Functions, Firestore Rules, `firebase.js`, `firebase-messaging-sw.js`) — no es una funcionalidad pendiente sino deuda técnica que vale la pena resolver junto con el punto 5.

---

## 13. Bugs conocidos (verificados contra el código y el schema real)

Todos los bugs de esta sección fueron **verificados leyendo el código fuente actual y el schema SQL real** en esta sesión — no son suposiciones. Se listan por severidad.

### 🔴 CRÍTICO — Módulo de Hijos no persiste datos (`children.js`)

`saveKid()` construye:
```js
var data = {
  name: name, birthDate: ..., age: ..., school: ...,
  doctor: ..., clinic: ..., schoolInsurance: ..., allergies: ...,
  bloodType: ..., notes: ...
};
await supa.from('children').insert({ ...data, family_id: FAMILY_ID, created_by: USER.id });
```

La tabla real `children` (ver `001_initial_schema.sql:118-132`) solo tiene columnas: `id, family_id, name, birth_date, school, doctor, allergies, notes, avatar_url, status, created_at, updated_at, deleted_at`.

Columnas que el código envía y **no existen**: `birthDate` (debería ser `birth_date`), `age`, `clinic`, `schoolInsurance`, `bloodType`, `created_by`. PostgREST rechaza el INSERT completo por columna desconocida. **El código no verifica `{ error }`** de la llamada a Supabase (no hay `try/catch` ni chequeo del resultado), así que el formulario simplemente se cierra (`hide('kidForm')`) como si hubiera funcionado. **Resultado: agregar o editar un hijo no guarda nada, y el usuario no recibe ningún error — cree que funcionó.**

*Nota:* el insert de hijos durante el **onboarding** (`onboarding.js saveOnboardingData()`) usa un objeto más simple (`{name, birthDate, age}` + `family_id`/`created_at`/`created_by`) pero tiene el mismo problema de fondo (`birthDate`, `age`, `created_by` no existen en la tabla) — también falla.

### 🔴 CRÍTICO — Módulo de Documentos no persiste datos (`documents.js`)

`saveDoc()` envía `type: $('docType').value` con valores como `'rut'`, `'carnet_salud'`, `'colegio'`, `'legal'`, `'seguro'`, `'otro'` (de `DOC_TYPES`). La columna real `type` tiene `CHECK (type IN ('file', 'reference'))` (`001_initial_schema.sql:402-403`) — esos valores en realidad corresponden conceptualmente a la columna `category`, que sí tiene ese mismo set de valores permitido en su CHECK. Además envía `childId` (camelCase, no existe — la columna es `child_id`, que el código sí agrega por separado, duplicando el concepto) y `url` (no existe — las columnas son `file_url`/`external_location`). **El INSERT/UPDATE viola el CHECK constraint de `type` y falla.** Igual que en Hijos, no hay verificación de `{ error }`, así que la UI no avisa al usuario.

### 🟠 ALTO — Eventos privados no se pueden crear (violación de CHECK constraint)

La columna `events.participants` tiene `CHECK (participants IN ('both', 'p1', 'p2'))` (`001_initial_schema.sql:204-205`). El `<select id="evParticipants">` en `index.html` (línea ~1067) tiene opciones con `value="mama"`/`value="papa"`/`value="both"`, y `events.js` los envía tal cual. **Crear o editar un evento con destinatario "Mamá" o "Papá" (no "Ambos") falla el INSERT/UPDATE.** A diferencia de los dos bugs anteriores, `saveEvent()` sí tiene `try/catch` y muestra `alert('Error al guardar. Intenta de nuevo.')`, así que al menos el usuario ve que algo falló — pero no hay forma de crear un evento privado hoy. Esto también **contradice la documentación de `CLAUDE.md`**, que describe "Eventos privados: `participants === 'p1'`/`'p2'`" como si funcionara — la intención de diseño es correcta, la implementación de UI usa el vocabulario equivocado (`mama`/`papa` en vez de `p1`/`p2`).

### 🟡 MEDIO — Referencia a variables inexistentes al loguear actividad de propuestas (`calendar.js`)

En `saveProp()`:
```js
logActivity('proposal_created', myLabel() + ' solicitó cambio de custodia: Día ' + from + ' → Día ' + to, ...)
```
`from`/`to` nunca se declaran en esa función (las variables correctas en scope son `fromDate`/`toDate`). Lanza `ReferenceError: from is not defined`, no capturado (ocurre **después** de que el `INSERT` de la propuesta ya se ejecutó con éxito, así que la propuesta sí se crea; solo falla el registro en el feed de actividad). El error queda solo en la consola del navegador.

### 🟡 MEDIO — Feed de actividad muestra "Día undefined → Día undefined" al aceptar/rechazar desde Hoy

`today.js acceptPropInline()`/`rejectPropInline()` construyen el mensaje de actividad con `p.fromDay`/`p.toDay` — campos que existían en el modelo Firestore antiguo pero que ya no se popula (el modelo actual usa `p.fromDate`/`p.toDate`, fechas ISO, no números de día del mes). El `logActivity()` no falla, pero el texto generado es literalmente `"Día undefined → Día undefined"`. (Nota: `calendar.js renderProposals()`, el flujo equivalente pero desde la pantalla de Calendario, sí usa `fmtProposalDates(pr)` correctamente — el bug es específico del atajo desde "Hoy".)

### 🟡 MEDIO — Timestamps de mensajes nunca se muestran

`messages.js renderMessages()`:
```js
var time = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleTimeString(...) : '';
```
`.toDate` era el método de los `Timestamp` de Firestore. Supabase devuelve `created_at` como string ISO plano — no tiene `.toDate`, así que la condición siempre es falsa y `time` siempre es `''`. **Ningún mensaje muestra su hora de envío.**

### 🟢 BAJO (latente, no activo hoy) — `user.uid` en vez de `user.id` en observabilidad

`observability.js identifyObservabilityUser()` usa `user.uid` (patrón Firebase) en vez de `user.id` (patrón Supabase) — es exactamente el anti-patrón que `CLAUDE.md` documenta explícitamente como bug ("Si aparece `.uid` en código es un bug"). Hoy es inofensivo porque `QINFLO_OBSERVABILITY.sentryDsn`/`posthogKey` están vacíos y el bloque nunca se ejecuta — **pero explotará en cuanto se configuren esas llaves** (Sentry/PostHog identificarían a todos los usuarios como `undefined`).

### 🟢 BAJO — CI despliega infraestructura Firebase muerta en cada push

`.github/workflows/firebase-hosting-deploy.yml` ejecuta `firebase deploy --only firestore:rules` y `--only functions` en cada push a `main` (ambos con `continue-on-error: true`, por eso no rompen el pipeline). Las Firestore Rules protegen una base de datos que ya no recibe escrituras de la app, y las 3 Cloud Functions (`onNewMessage`, `onNewProposal`, `onNewEvent`) escuchan triggers de documentos Firestore que nunca se crean. No rompe nada, pero cuesta tiempo de CI y **puede confundir a quien lea el workflow pensando que esas funciones están activas**.

### 🟢 BAJO — `README.md` y `"README 2.md"` describen una estructura de carpetas obsoleta

Ambos (son casi idénticos, `README 2.md` parece un duplicado accidental) describen `js/`, `css/`, `capacitor.config.json` — nada de eso existe en el repo actual (estructura plana, sin Capacitor). El propio `README.md` tiene una nota al inicio advirtiendo esto, pero el archivo entero debajo de esa nota sigue describiendo la estructura vieja. Riesgo bajo de confundir a alguien que no lea la nota.

---

## 14. Errores que ya ocurrieron durante el desarrollo y cómo se resolvieron

Esta sección documenta bugs **ya corregidos**, con su causa raíz completa, para que no se reintroduzcan por accidente ni se re-investiguen desde cero.

### Error 1 — RLS bloqueaba el SELECT inmediatamente después del INSERT de familia (commit `9fbe25d`)

**Síntoma**: al registrar un usuario nuevo, el `INSERT INTO families ... .select().single()` fallaba (el `SELECT` implícito del `.select()` encadenado no devolvía la fila recién creada).
**Causa raíz**: la política RLS de `SELECT` en `families` depende de `is_family_member(id)`, que a su vez depende de que exista una fila en `family_members` para ese usuario — pero en el momento del `INSERT` de `families`, la membership **todavía no se había creado** (se crea en el paso siguiente del flujo). El propio creador no podía leer la fila que acababa de crear.
**Fix**: generar el UUID de la familia **en el cliente** (`crypto.randomUUID()`, con fallback manual si `crypto.randomUUID` no existe) antes del INSERT, y pasarlo explícitamente como `id`. Se quita el `.select().single()` (ya no se necesita, se conoce el `id` de antemano) y se usa directamente el UUID generado para los pasos siguientes (`family_members`, `invitations`). Aplicado en 3 lugares: `doRegister()`, `createGoogleUserProfile()` (ambos en `auth.js`), y el fallback de `connect.js showConnectScreen()`.
**Lección para el futuro**: si se agrega un flujo nuevo que hace `INSERT` seguido de `SELECT`/`.select()` sobre una tabla cuya política RLS depende de una relación que se crea en un paso posterior, **generar el ID en el cliente** en vez de depender del retorno del INSERT.

### Error 2 — Bug de asignación de domingo + pérdida de overrides manuales (commit `4f48719`)

Este commit documenta **tres causas raíz relacionadas** encontradas y arregladas juntas:

**2a. Domingo asignado al bloque de semana incorrecto**: `new Date('YYYY-MM-DD')` parsea como **medianoche UTC**. En Chile (UTC-3/-4) eso retrocede al día local anterior. Al hacer luego `setHours(0,0,0,0)` se fijaba la medianoche *local* sobre esa fecha ya corrida un día, desplazando el origen del bloque de 7 días en un día completo — cada domingo caía en el bloque siguiente en vez del actual. **Fix**: parsear `startDate` con el constructor `new Date(y, m, d)` (siempre medianoche local), igual que se construye cada día evaluado, para que ambos queden en el mismo sistema de referencia.

**2b. Condición de carrera que borraba correcciones manuales**: `checkAndGenerateCalendar()` comprobaba `custodyMap[calKey()]` para decidir si regenerar, pero ese mapa se poblaba de forma asíncrona por el listener realtime — en una carga de página fresca el listener aún no había disparado, el mapa estaba vacío, y `generateOnbCalendar()` corría de nuevo (con el algoritmo con el bug 2a todavía sin corregir en versiones anteriores) sobreescribiendo overrides ya guardados. **Fix**: usar `cal_alg_version` guardado en el documento de familia (ya obtenido, sin depender del listener) — solo regenerar si `storedVersion < CAL_ALG_VERSION` o el mes está vacío; tras regenerar, guardar la nueva versión para que cargas futuras no vuelvan a disparar la regeneración.

**2c. Overrides invisibles aunque estuvieran guardados**: `getCustody()` solo leía de `custodyMap`, nunca de `custodyOverridesMap` — el override se guardaba correctamente en Firestore/Supabase pero el calendario nunca lo mostraba. **Fix**: `getCustody()` ahora consulta primero `custodyOverridesMap`, y solo si no hay override cae a `custodyMap`.

**Nota de preservación de datos**: los overrides existentes sobrevivieron a la regeneración forzada porque `generateOnbCalendar`/el upsert usa merge — este patrón (upsert con merge en vez de replace) es intencional y debe mantenerse en cualquier futuro cambio al algoritmo de generación.

### Error 3 — Google Sign-In interceptado por el sistema de intents de Android (commit `b53f53f`)

**Síntoma**: en Android, `signInWithPopup` de Firebase (era la implementación de la época pre-Supabase) abría una ventana nueva y el sistema operativo interceptaba la URL `accounts.google.com` preguntando con qué app abrirla (Gmail, Chrome, etc.) en vez de dejar que el flujo de auth continuara.
**Fix**: usar `signInWithRedirect` específicamente en Android (mantiene el flujo en la misma pestaña de Chrome), con `getRedirectResult()` manejando el retorno; iOS/Safari y desktop siguieron usando `signInWithPopup`.
**Relevancia hoy**: este código era específico de Firebase Auth y **ya no existe** — la migración a Supabase (`d5db018`) reemplazó todo el flujo de Google OAuth por `supa.auth.signInWithOAuth(...)`, que maneja el redirect de forma unificada para todas las plataformas (`detectSessionInUrl: true`). Se documenta aquí por si el comportamiento de interceptación de intents reaparece en Android con el nuevo flujo — **no se ha verificado en esta sesión si Supabase OAuth tiene el mismo problema en Android**, es un punto ciego a probar (ver sección 12, punto 4).

### Error 4 — Pantalla en blanco si alguna función de carga fallaba durante `loadApp()` (commit `3eac5bc`)

**Síntoma**: si cualquiera de las funciones llamadas dentro de `loadApp()` (fetch de datos, render inicial, etc.) lanzaba una excepción, la app quedaba en blanco porque el cambio de pantalla (`switchTab('today')`) ocurría después en el orden del código.
**Fix**: mover `switchTab('today')` **antes** de las llamadas que pueden fallar, para que el shell de la app siempre sea visible aunque algo detrás falle. `loadApp()` hoy además está envuelto en un `try/catch` que solo loguea a consola (`console.error('[loadApp crash]', e)`) sin re-lanzar — el patrón general del código es "que la UI nunca se congele en blanco, aunque signifique tragarse errores silenciosamente". Esto es coherente con el resto de la base (ver bugs de Hijos/Documentos en sección 13: la misma filosofía de "no bloquear la UI" es la razón por la que esos bugs no generan ningún error visible al usuario).

### Error 5 — Cache del Service Worker no incluía todos los scripts referenciados (commit `b5d83e2`)

**Síntoma**: `events.js` y `onboarding.js` estaban referenciados en `index.html` pero no en `STATIC_ASSETS` del service worker, causando fallos al usar la app offline/con cache stale (404 de esos scripts si el navegador servía desde cache sin red).
**Fix**: agregarlos a `STATIC_ASSETS` y bump de versión de cache para forzar refresh en todos los clientes.
**Convención resultante**: **cada archivo `.js` nuevo referenciado en `index.html` debe agregarse también a `STATIC_ASSETS` en `service-worker.js`**, y cada cambio de contenido de cualquier script cacheado debe ir acompañado de un bump de `QINFLO_CACHE` (hoy en `v25`) — de lo contrario los usuarios con la PWA instalada pueden quedar sirviendo JS desactualizado indefinidamente (el cache-first + fallback del SW no revalida contra red salvo cambio explícito de versión).

### Error 6 — CI fallaba por un paso de Functions innecesario (commit `3476a4e`)

**Síntoma**: el workflow de CI fallaba en el paso `npm ci --prefix functions` tras la migración a Supabase.
**Fix**: se quitó el paso `Install Functions dependencies` del workflow — pero **el resto de los pasos de Functions/Firestore Rules quedaron** (con `continue-on-error: true`), lo cual dejó el CI "verde" sin resolver el problema de fondo (código Firebase muerto siendo desplegado). Ver bug 🟢 BAJO en sección 13 — sigue pendiente una limpieza real, no solo el parche que evita que rompa CI.

### Error 7 — Migración Firebase→Supabase: schema no idempotente al primer intento (commits `81e0b8c`, `bf9f428`)

**Síntoma**: al aplicar `001_initial_schema.sql` por primera vez contra una base ya parcialmente migrada (o al reintentar tras un fallo parcial), fallaba por: `CREATE POLICY` sin `DROP POLICY IF EXISTS` previo, `CREATE TABLE`/`CREATE INDEX` sin `IF NOT EXISTS`, y una FK circular (`custody_confirmations.related_event_id` → `events`, definida antes de que `events` existiera en el orden del archivo).
**Fix**: se agregó `IF NOT EXISTS` a las 28 `CREATE TABLE` y a todos los `CREATE INDEX`; se agregó `DROP POLICY IF EXISTS` antes de cada una de las ~40 `CREATE POLICY`; se eliminó la FK circular dejando la columna como `UUID` nullable sin constraint. También se movió `is_family_member()` para que se defina **después** de crear `family_members` (antes el orden del archivo la definía antes de que la tabla que consulta existiera).
**Lección para el futuro**: cualquier cambio al archivo de schema debe mantenerse **totalmente idempotente** (poder re-ejecutarse sin error sobre una base ya migrada) — es el patrón que ya se estableció y debe respetarse en migraciones nuevas.

---

## 15. Enfoques que NO deben volver a intentarse

1. **No usar `new Date('YYYY-MM-DD')` para fechas de custodia/calendario.** Parsea como UTC, se corre un día en Chile (UTC-3/-4). Usar siempre `new Date(year, month, day)` (constructor con 3 números, que es local) cuando se necesite comparar/operar sobre fechas de calendario. Ver error 2a en sección 14 — este bug ya costó una investigación completa de tres causas raíz entrelazadas.

2. **No decidir si regenerar el calendario basándose en si un mapa poblado por un listener realtime ya tiene datos.** El listener es async y puede no haber disparado todavía en la primera carga. Usar siempre un valor de versión persistido server-side (`cal_alg_version`) como fuente de verdad de "¿ya se generó con el algoritmo actual?". Ver error 2b.

3. **No usar `signInWithPopup` para Google en Android** si en algún momento se vuelve a tocar el flujo de OAuth (hoy delegado a `supa.auth.signInWithOAuth`, que en teoría abstrae esto, pero no fue reverificado en Android tras la migración — ver punto pendiente en sección 12). El patrón probado que funcionó fue redirect-based en Android específicamente.

4. **No asumir que `supa.from(x).insert(data)` sin revisar `{ error }` es seguro.** Los bugs más graves documentados en este proyecto (Hijos, Documentos) existen exactamente porque el código no verificó el error de retorno de Supabase y la UI se comportó como si la operación hubiera tenido éxito. **Cualquier `insert`/`update`/`upsert` nuevo debe desestructurar `{ error }` y manejarlo** (al menos loguearlo y avisar al usuario) — no asumir que "si no lanzó excepción, funcionó" (Supabase-js v2 no lanza excepciones por errores de base de datos: los devuelve en el objeto de respuesta).

5. **No enviar objetos camelCase directo a `supa.from(tabla).insert()`/`.update()` sin mapear explícitamente a snake_case primero.** El patrón correcto y probado está en `expenses.js`, `events.js`, `agreements.js`: construir el objeto de payload con los nombres de columna reales (snake_case) explícitos, campo por campo. El patrón que falló está en `children.js`/`documents.js`: pasar directo un objeto con nombres de campo "convenientes" (camelCase, heredados del modelo Firestore viejo) sin traducirlos. Antes de escribir un nuevo `insert`/`update`, **revisar el schema real en `supabase/migrations/001_initial_schema.sql` y `002_migration_compatibility.sql`** — no confiar en lo que dice `CLAUDE.md` de memoria ni en el nombre "obvio" que debería tener una columna.

6. **No dar por completada una migración de módulo solo porque la UI (formularios, listas, renders) está terminada.** Hijos y Documentos tienen UI 100% funcional y terminada — el problema está exclusivamente en la capa de persistencia, invisible a simple vista o a un test manual superficial que no revise la consola/Network tab. **Probar el guardado real (abrir Network tab o consultar la tabla en Supabase directamente) antes de dar un módulo por terminado**, no solo interactuar con los botones.

7. **No reintroducir dependencia de Cloud Functions de Firebase sobre triggers de Firestore.** Ese patrón entero (`functions/index.js`) quedó huérfano tras la migración a Supabase — si se retoma push notifications, la implementación correcta hoy sería triggers de Postgres (`pg_net`, Edge Functions de Supabase, o un webhook desde Realtime) disparando Web Push directo, no Cloud Functions de Firebase sobre Firestore.

8. **No usar `.uid` en código nuevo — siempre `.id`.** Ya es una regla explícita en `CLAUDE.md`, y ya existe una instancia viva del error (`observability.js`, sección 13) que confirma que el error se sigue colando pese a la regla escrita. Tratarlo como un grep obligatorio (`grep -rn '\.uid\b'`) antes de dar por cerrada cualquier sesión que toque autenticación u observabilidad.

9. **No asumir que `CLAUDE.md` está libre de imprecisiones.** Se encontró al menos una afirmación incorrecta en `CLAUDE.md` respecto al comportamiento real del código (participantes de eventos `p1`/`p2` vs. `mama`/`papa` — ver bug 🟠 en sección 13). `CLAUDE.md` documenta la **intención** de diseño, que no siempre coincide con lo que el código realmente hace. Ante cualquier duda sobre comportamiento real, **verificar contra el código fuente y el schema**, no solo contra la documentación.

---

## 16. Archivos críticos y propósito de cada uno

| Archivo | Propósito | Criticidad |
|---|---|---|
| `index.html` | Estructura completa de la SPA, todos los formularios/pantallas como secciones ocultas/visibles vía `hide()`/`show()`, orden de carga de scripts | Máxima — cualquier ID de elemento referenciado desde JS vive acá |
| `state.js` | Estado global (`USER`, `USERDATA`, `FAMILY_ID`, arrays de datos), helpers universales (`toCamel`, `famQ`, `nowISO`, `p1()`/`p2()`, `fmtCLP`) | Máxima — se carga segundo, todo lo demás depende de estos helpers |
| `supabase.js` | Instancia global `supa`, credenciales de Supabase hardcoded | Máxima — punto único de configuración de backend |
| `app-shell.js` | Listener de auth, `loadUserData`, `loadApp`, los 11 `loadX()` por tabla, suscripción Realtime, **todos los `addEventListener` de la UI** (`DOMContentLoaded`) | Máxima — es el "controlador" de toda la app; se carga último a propósito |
| `auth.js` | Login, registro (con creación de familia), Google OAuth, reset de contraseña | Alta — contiene el fix de UUID cliente-side (error 1, sección 14) |
| `connect.js` | Pantalla de invitación + `autoConnect()` (llama a la RPC `accept_invitation`) | Alta |
| `calendar.js` | Render de calendario, custodia, `setCustody`, flujo completo de propuestas de cambio | Alta — contiene la lógica de fechas más delicada del proyecto (ver error 2, sección 14) |
| `onboarding.js` | Flujo de onboarding completo + `generateOnbCalendar()` (algoritmo de generación de custodia) + watcher de coparent en tiempo real | Alta |
| `expenses.js` | Toda la lógica de gastos: cálculo de balance, liquidaciones, exportación de resumen | Alta — lógica financiera, requiere precisión en el cálculo |
| `events.js` | CRUD de eventos + aprobación | Media-Alta — contiene el bug de `participants` (sección 13) |
| `children.js` | Perfiles de hijos | Media — **módulo roto**, ver sección 13 |
| `documents.js` | Documentos | Media — **módulo roto**, ver sección 13 |
| `agreements.js` | Acuerdos con firma | Media |
| `reminders.js` | Avisos | Media |
| `messages.js` | Mensajería + quick replies | Media — contiene el bug de timestamps (sección 13) |
| `today.js` | Dashboard "Hoy" — el corazón de la visión de producto ("entender qué pasa en <5 segundos") | Alta desde el punto de vista de producto |
| `activity.js` | `logActivity()` (llamado desde varios módulos) + render del feed | Media |
| `theme.js` | Dark/light mode | Baja |
| `resources.js` | Contenido estático de recursos de apoyo | Baja |
| `observability.js` | Sentry/PostHog (inactivo) + registro del service worker | Baja hoy, será Media si se activan las llaves (ver bug `.uid`) |
| `supabase/migrations/001_initial_schema.sql` | Schema completo original — **fuente de verdad de qué columnas existen realmente** | Máxima para cualquier trabajo de backend |
| `supabase/migrations/002_migration_compatibility.sql` | Columnas/tablas/RPCs añadidas después de `001` — **también fuente de verdad**, no asumir que `001` solo alcanza | Máxima |
| `service-worker.js` | Cache de PWA — requiere mantenimiento manual (`STATIC_ASSETS` + bump de versión) en cada cambio de archivo | Media — ver error 5, sección 14 |
| `.github/workflows/firebase-hosting-deploy.yml` | Único pipeline de CI/CD | Alta — pero con pasos muertos, ver bug 🟢 sección 13 |
| `CLAUDE.md` | Memoria persistente del proyecto — leer siempre primero, pero verificar afirmaciones dudosas contra código (ver punto 9, sección 15) | Máxima como punto de partida |

**Archivos huérfanos (código muerto, no forman parte del flujo activo pero siguen en el repo)**: `firebase.js`, `firebase-messaging-sw.js`, `firestore.rules`, `functions/index.js`, `functions/package.json`, `README.md`, `"README 2.md"` (parcialmente — la estructura que describen no aplica, pero el archivo en sí no hace daño).

---

## 17. Convenciones de código

- **Sin punto y coma opcional — siempre se usa `;`.** Estilo consistente en los 17 módulos.
- **`var`/`function` predominan sobre `let`/`const`/arrow functions**, aunque hay mezcla (`state.js` usa bastante `const`/arrow para helpers puros). No hay una regla estricta, pero el código nuevo tiende a seguir el estilo del archivo que se está editando.
- **`async function` + `await` para todo lo que toca Supabase.** No hay uso de `.then()` encadenado salvo en un puñado de casos legacy (p.ej. `fetchUF()` en `app-shell.js`, el fallback de `connect.js`).
- **Nombres de función con prefijo `_` para funciones "privadas" de un módulo** (no exportadas ni llamadas desde otro archivo), ej: `_todayCustody`, `_resetExpForm`, `_computeSharedNet`. Es solo convención visual, no hay módulos ES reales — todo vive en el mismo scope global.
- **`$(id)` como alias de `document.getElementById(id)`**, definido una sola vez en `state.js`, usado en todos los módulos. **Nunca usar `document.getElementById` directo en código nuevo** — usar `$()`.
- **`show(id)`/`hide(id)`** para toggle de visibilidad vía clase `hidden`, en vez de manipular `style.display` directamente (excepto en un puñado de casos puntuales, como el toggle de `expAttachBox` que sí usa `style.display = 'grid'/'none'` — inconsistencia menor, no seguir ese patrón para código nuevo).
- **HTML generado con concatenación de strings + `innerHTML`**, no con `document.createElement` sistemático (aunque `children.js`/`agreements.js`/`reminders.js` sí construyen el contenedor con `createElement` y le asignan `innerHTML` al contenido interno, mezclando ambos enfoques). No hay ningún framework de templating.
- **Manejo de errores inconsistente por diseño histórico**: algunos módulos (`expenses.js saveExp`, `events.js saveEvent`) usan `try/catch` con `alert()` al usuario; otros (`children.js`, `documents.js`, `reminders.js`, `agreements.js`) **no verifican el resultado de las llamadas a Supabase en absoluto**. Ver regla 4 de la sección 15 — cualquier código nuevo debe verificar `{ error }` explícitamente.
- **Query strings de versión (`?v=N`) en cada `<script src>`** como mecanismo de cache-busting manual — **incrementar el número al modificar un archivo** si se quiere forzar que los clientes con Service Worker instalado recarguen la versión nueva (aunque el mecanismo real de invalidación de cache es el bump de `QINFLO_CACHE` en `service-worker.js`, no el query string en sí — el query string ayuda contra cache HTTP normal del navegador, no contra el Service Worker).
- **Español para toda la UI, comentarios de negocio y mensajes de commit; inglés ocasional en comentarios técnicos** (ej. comentarios explicando bugs de timezone en `onboarding.js`/`calendar.js` están en inglés). No hay una regla estricta, pero los mensajes visibles al usuario están siempre en español chileno.
- **Colores/tokens de diseño vía variables CSS custom properties** (`var(--accent)`, `var(--primary-d)`, `var(--text-s)`, etc.) definidas centralmente en `styles.css`, con soporte de tema oscuro vía `[data-theme="dark"]`. El código JS que genera HTML inline usa estas variables directamente en `style="color:var(--...)"`.
- **Todos los soft-deletes usan el mismo patrón**: `.update({ deleted_at: nowISO() })`, nunca `.delete()`, para las tablas que lo soportan (ver sección 7, decisión 8).
- **Mensajes de commit en español, formato libre** (`tipo(scope): descripción` a veces, texto plano otras veces), siempre con trailer `Co-Authored-By: Claude ... <noreply@anthropic.com>` y `Claude-Session: <url>` al final quiere decir que fueron generados en sesiones de Claude Code — mantener ese trailer en commits futuros generados por Claude.

---

## 18. Riesgos técnicos

1. **Los 3 bugs críticos/altos de la sección 13 están en producción ahora mismo.** Cualquier familia usando la app hoy no puede guardar hijos, no puede guardar documentos, y no puede crear eventos privados. Es el riesgo más urgente del proyecto — más que cualquier ítem del roadmap de features nuevas.

2. **Sin verificación de `{ error }` en múltiples módulos** (patrón sistémico, no solo los 2 módulos rotos conocidos) — cualquier fallo silencioso futuro de Supabase (rate limit, RLS mal configurado tras un cambio, columna renombrada) puede pasar completamente desapercibido, mostrando éxito en la UI mientras no se persiste nada. Recomendación: auditar sistemáticamente todos los `supa.from(...).insert/update/upsert(...)` del proyecto y agregar manejo de error uniforme.

3. **Dependencias externas sin pin de versión** (`@supabase/supabase-js@2`, `lucide@latest` vía CDN). Un breaking change en un minor/patch de Supabase-js v2, o en Lucide, se propaga a producción sin ningún control ni ventana de prueba — no hay lockfile, no hay CI que corra contra una versión fija.

4. **Sin tests automatizados de ningún tipo** (no hay carpeta `tests/`, no hay CI step de testing). Toda regresión se detecta manualmente o por reporte de usuario — los bugs de Hijos/Documentos probablemente llevan **semanas en producción sin detectarse** exactamente por esta razón (no hay alertas de error del lado cliente tampoco, porque Sentry está desactivado).

5. **Observabilidad completamente apagada en producción.** Sin Sentry ni PostHog activos, no hay forma de saber cuántos usuarios reales están golpeando los bugs conocidos, ni de detectar bugs nuevos, salvo que un usuario reporte manualmente. Este es probablemente el riesgo de mayor apalancamiento a resolver: activar Sentry (aunque sea gratis/básico) destaparía automáticamente los 3 bugs críticos con stack traces reales, y cualquier otro no documentado aquí.

6. **Credenciales de Supabase hardcoded en `supabase.js`** (URL + anon key, commiteadas en el repo). Es el patrón estándar y esperado para una `anon key` de Supabase protegida por RLS (no es un secreto como una service role key), pero vale la pena confirmarlo explícitamente: **si en algún momento se agrega una service role key o cualquier credencial con privilegios elevados, esa NO debe ir en el frontend ni en este archivo** — requeriría un backend/Edge Function.

7. **`cal_alg_version` como único mecanismo de invalidación de calendario** — funciona, pero es manual y fácil de olvidar: si se toca `getOnbCustodyForDate()` de nuevo en el futuro sin subir `CAL_ALG_VERSION`, el fix nuevo nunca se aplicará a calendarios ya generados (solo a familias que hagan onboarding desde cero). Ya pasó una vez (era la causa del error 2b antes de arreglarse) — es un patrón frágil que depende de que quien edite el algoritmo recuerde subir la constante.

8. **CI sin ningún gate de calidad** (no hay lint, no hay test, no hay verificación de que el HTML referencie scripts que existen, etc.) — el único paso de CI es desplegar. Cualquier error de sintaxis JS que no rompa el parseo pero sí la ejecución (como los bugs de variables indefinidas de la sección 13) llega directo a producción sin ninguna red de seguridad automatizada.

9. **RLS de 40 políticas sin test automatizado que las valide.** Un cambio futuro a una política (o a `is_family_member()`) podría abrir o cerrar acceso de forma no intencionada sin que nada lo detecte hasta que un usuario reporte "no veo los datos de mi familia" o, peor, "veo datos que no son míos".

10. **Firebase Hosting + Supabase como dos proveedores separados** para un proyecto pequeño añade superficie operativa (dos consolas, dos sets de credenciales/secrets, dos lugares donde algo puede fallar) sin beneficio claro hoy que la migración de Auth/DB ya se completó — es deuda arquitectónica razonable de aceptar a corto plazo, pero vale la pena revisar si consolidar todo en Supabase (que también ofrece hosting de sitios estáticos vía otros medios, aunque no es su feature principal) o en otro proveedor unificado (Vercel/Netlify) simplificaría el mantenimiento a mediano plazo.

---

## 19. Próximos pasos priorizados

Combinando el roadmap de producto explícito de `CLAUDE.md`, el roadmap técnico pendiente también explícito ahí, y los hallazgos de esta auditoría — en el orden en que se recomienda abordarlos (no necesariamente el orden en que se preguntará al usuario, ver `CLAUDE_HANDOFF.md` para cómo se dejó la conversación):

### Urgente (bugs activos en producción, sin roadmap explícito previo — hallazgo de esta sesión)
1. Arreglar `children.js` (`saveKid()` y el insert de hijos en `onboarding.js saveOnboardingData()`) para que envíe solo columnas reales de la tabla `children`, en snake_case. Decidir qué hacer con los campos que la UI captura pero la tabla no soporta hoy (`age` es derivable de `birth_date` y no necesita persistirse; `clinic`, `schoolInsurance`, `bloodType` requieren una migración SQL para agregar esas columnas si se quieren conservar, o quitar esos campos del formulario si no).
2. Arreglar `documents.js` (`saveDoc()`) — mapear `type` del formulario a la columna `category` (que es donde ese vocabulario pertenece según el CHECK constraint), decidir un valor válido de `type` real (`'file'`/`'reference'`) según si `url` viene lleno o no, y mapear `url` a `file_url` o `external_location` según corresponda semánticamente.
3. Arreglar `events.js` para que el `<select id="evParticipants">` y el código que lo lee usen `p1`/`p2`/`both` (no `mama`/`papa`/`both`) al hablar con la tabla `events`, manteniendo el label visible en español vía `p1()`/`p2()` como ya se hace en el resto de la app.
4. Agregar manejo de `{ error }` a los `insert`/`update` de `children.js`, `documents.js`, `reminders.js`, `agreements.js` (los que hoy no lo tienen) para que futuros fallos similares sean visibles al usuario y no silenciosos.
5. Arreglar el timestamp de mensajes en `messages.js` (`m.createdAt.toDate` → parsear el string ISO directo con `new Date(m.createdAt)`).
6. Arreglar las referencias a variables indefinidas (`from`/`to` en `calendar.js saveProp()`, `fromDay`/`toDay` en `today.js acceptPropInline`/`rejectPropInline`).

### Alta prioridad (roadmap ya explícito en CLAUDE.md)
7. Configurar SMTP personalizado con Resend para emails desde `@qinflo.cl`.
8. Personalizar la plantilla de recuperación de contraseña de Supabase Auth al español.
9. Revisar si conviene desactivar la confirmación de email en Supabase Auth.
10. Verificar el flujo de Google OAuth end-to-end en producción (incluyendo específicamente en Android, dado el historial de problemas de intents documentado en el error 3 de la sección 14).

### Media prioridad (deuda técnica / higiene)
11. Activar Sentry (aunque sea con el free tier) para dejar de operar completamente a ciegas en producción — altísimo apalancamiento dado el hallazgo de bugs silenciosos de esta sesión.
12. Limpiar infraestructura Firebase muerta: quitar los pasos de `firestore:rules`/`functions` del workflow de CI, y evaluar borrar `firebase.js`, `firebase-messaging-sw.js`, `firestore.rules`, `functions/` del repo (o dejarlos claramente marcados como archivados si se prefiere conservarlos por referencia histórica).
13. Corregir `observability.js` (`user.uid` → `user.id`) antes de que se activen las llaves de Sentry/PostHog.
14. Actualizar/eliminar `README.md` y `"README 2.md"` (contenido obsoleto, estructura de carpetas que no existe).

### Baja prioridad (roadmap largo plazo)
15. Push notifications reales sobre el stack actual (Supabase + Web Push, no Firebase Cloud Functions).
16. Sincronización bidireccional con Google Calendar (prioridad 6 del roadmap de producto).
17. Confirmaciones verificables de cambio de custodia con timestamp exacto (prioridad 5 del roadmap de producto) — la base (`confirmKidsWithMe()`, tabla `custody_confirmations` sin uso todavía) ya existe parcialmente, falta conectarla completa.
