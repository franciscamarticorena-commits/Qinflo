# Qinflo — Contexto del proyecto para Claude

> **Documentación de transferencia (2026-07-12)**: este proyecto mantiene un set de documentos sincronizados, cada uno con un propósito distinto — no dupliques contenido libremente entre ellos, y **léelos** antes de asumir que este archivo por sí solo tiene el contexto completo (se detectaron afirmaciones en este `CLAUDE.md` que no coincidían con el comportamiento real del código — ver nota sobre eventos privados más abajo, ya corregida).
>
> - `HANDOFF.md` — transferencia de conocimiento exhaustiva: arquitectura, decisiones técnicas/UX con su motivo, qué se intentó y no funcionó, errores ya resueltos, bugs pendientes, dependencias entre módulos, convenciones, riesgos, supuestos del código, deuda técnica, y Lessons Learned de la sesión de auditoría. **El documento operativo principal si vas a tocar código.**
> - `AI_MEMORY.md` — manual de comportamiento para sesiones de IA: patrones a seguir, errores a evitar, decisiones ya cerradas que no deben reabrirse sin pedido explícito del usuario. Léelo antes de escribir código nuevo.
> - `ARCHITECTURE.md` — arquitectura técnica como referencia standalone.
> - `ROADMAP.md` — roadmap de producto + técnico consolidado y priorizado.
> - `CHANGELOG.md` — historial de fases y commits significativos.
> - `PROJECT_STATUS.md` / `CLAUDE_HANDOFF.md` — auditoría original (turno previo de la misma sesión de documentación) con cita textual del código de cada bug encontrado; `HANDOFF.md` los reorganiza y completa, pero el detalle línea-por-línea sigue ahí.
> - `README.md` — punto de entrada del repo, estructura y stack reales.
>
> Si dos documentos se contradicen, este archivo y `HANDOFF.md` son la fuente de verdad más reciente.

## Visión de producto (norte estratégico)

> "Qinflo no reemplaza al otro padre o madre. Reemplaza la necesidad de recordar y volver a conversar lo mismo."

**Qinflo es un sistema de verdad compartida**, no un calendario ni un chat ni una app de gastos.

**Principio de producto**: Disminuir carga mental, conversaciones repetidas y dependencia de la memoria. La coordinación debe basarse en hechos, no en mensajes.

**Principio de diseño**: Menos módulos. Más hechos. Menos conversaciones. Más claridad compartida.

### Qué NO hacer
No incorporar: IA, chat complejo, transferencias de dinero, fotos, álbumes, geolocalización, videollamadas, módulos adicionales innecesarios.

### Priorización de producto (por orden de impacto)

1. **Pantalla Hoy (centro de mando)** — Al abrir, entender qué pasa en < 5 segundos: con quién están los niños, próximo cambio, próximos eventos (7 días), esperando respuesta, recordatorios, balance.

2. **"Esperando respuesta"** (no llamarlo "Pendientes") — Una sola tarjeta que agrupa: cambio de custodia pendiente, evento por confirmar, gasto por confirmar, acuerdo por revisar. Mostrar: quién solicitó, fecha, estado.

3. **Actividad** — Tarjeta dentro de Pantalla Hoy, no módulo independiente. Lista cronológica de hechos: "Mamá confirmó recepción de los niños", "Papá aprobó cambio Día del Padre", "Gasto uniforme registrado". Objetivo: transformar conversaciones en hechos, la coordinación deja de depender de la memoria.

4. **Timeline histórico** — Historial único por fecha que incluye eventos, gastos, cambios de custodia, acuerdos, confirmaciones. Objetivo: eliminar "no me acuerdo", "nunca me dijiste", "¿cuándo fue?"

5. **Confirmaciones** — Solo para días de cambio de casa. Registra: quién confirmó, fecha y hora exacta. Genera realidad compartida verificable.

6. **Google Calendar** — Sincronización bidireccional para no duplicar trabajo (largo plazo).

---

## Repositorio
- **GitHub**: franciscamarticorena-commits/Qinflo
- **Rama principal**: `main` (desarrollo directo en main)

## Regla crítica al comenzar cada sesión
1. Leer este archivo primero.
2. Verificar `git log --oneline -10` para confirmar el estado real.
3. NO reinventar el roadmap ni proponer fases ya completadas.
4. Verificar ramas remotas con `git fetch origin && git log --oneline --all | head -20`.

## Stack actual (POST-MIGRACIÓN)

**Firebase fue reemplazado completamente por Supabase.** No hay ninguna referencia a Firebase en el código activo cargado por `index.html`. **Sí quedan archivos huérfanos en el repo** que ya no se usan ni se cargan: `firebase.js`, `firebase-messaging-sw.js`, `firestore.rules`, `functions/` (3 Cloud Functions sobre triggers de Firestore que ya nunca se disparan). La CI (`firebase-hosting-deploy.yml`) todavía intenta desplegar Firestore Rules y Functions en cada push, con `continue-on-error: true` — no rompe nada pero es deuda técnica pendiente de limpiar (ver `PROJECT_STATUS.md` sección 13).

- **Auth**: Supabase Auth (`supa.auth`) — email+password y Google OAuth
- **DB**: Supabase PostgreSQL con RLS
- **Realtime**: `supa.channel()` con `postgres_changes`
- **Cliente**: `@supabase/supabase-js@2` (UMD via CDN)
- **Global**: `supa` (createClient en `supabase.js`)
- **Hosting**: Firebase Hosting (proyecto `quinflo`) — solo el hosting, no Auth ni Firestore
- **Deploy**: GitHub Actions en cada push a `main` → `qinflo.cl`

## Estructura del proyecto
Todos los archivos están en la **raíz del repo** (estructura plana).

Archivos principales:
- `index.html` — HTML completo, carga todos los scripts al final del body
- `styles.css` — estilos únicos
- `supabase.js` — config Supabase (URL + anon key, instancia global `supa`)
- `state.js` — variables globales: USER, USERDATA, CODATA, FAMILY_ID, custodyMap, etc. + helpers `toCamel()`, `famQ()`, `nowISO()`
- `auth.js` — login, registro (email + Google), recuperación, `doUpdatePassword()`
- `connect.js` — `showConnectScreen()`, `autoConnect(inviteCode)` — flujo de invitación
- `app-shell.js` — listener auth `onAuthStateChange`, `loadApp()`, `setupListeners()`, loaders de datos, realtime
- `calendar.js` — renderCalendar, setCustody via RPC, proposals
- `events.js` — módulo de eventos: CRUD, aprobaciones, eventos privados
- `onboarding.js` — onboarding completo + `generateOnbCalendar()` + watcher coparent via realtime
- `expenses.js` — gastos, UF, balance, marcar pagado, anular
- `messages.js` — mensajes en tiempo real, quick replies editables, divisor de tema
- `children.js` — perfiles de hijos
- `agreements.js` — acuerdos
- `reminders.js` — recordatorios
- `resources.js` — recursos de apoyo Chile
- `today.js` — dashboard Hoy: custodia, pendientes, eventos, avisos, balance
- `observability.js` — Sentry + PostHog desactivados (sin llaves reales)
- `manifest.json` + `service-worker.js` — PWA base
- `supabase/migrations/001_initial_schema.sql` — schema completo PostgreSQL (idempotente)
- `supabase/migrations/002_migration_compatibility.sql` — columnas adicionales de compatibilidad

## Modelo de datos Supabase (PostgreSQL)

### Tablas principales
- `users` — extiende `auth.users`. Campos: `name, email, auth_provider, onboarding_completed, quick_replies, fcm_token, legal_acceptance (JSONB)`
- `families` — `name, created_by, config (JSONB), custody_config (JSONB), special_rules (JSONB), cal_alg_version, p1_uid, p2_uid, last_pickup (JSONB)`
- `family_members` — `family_id, user_id, role (p1|p2), status`
- `invitations` — `family_id, invited_by, token, role, status, expires_at`
- `children` — `family_id, name, birth_date, deleted_at`
- `custody_months` — PK `(family_id, month_key)`, JSONB `custody`, `overrides` — equivalente a `/calendar/{YYYY-MM}`
- `custody_changes` — propuestas de cambio: `from_date, to_date, proposed_by_role, requested_to_role, status`
- `events` — `family_id, title, start_at (TIMESTAMPTZ), category, participants, requires_confirmation, status`
- `expenses` — `family_id, paid_by, paid_by_role, amount_clp, split_percentage_p1/p2, status, voided, date`
- `settlements` — liquidaciones de balance: `from_role, to_role, amount`
- `messages` — `family_id, author_id, author_role, content, type`
- `agreements` — `family_id, title, content, status, signatures (JSONB), created_by_role`
- `reminders` — `family_id, title, date, assigned_to, status`
- `documents` — `family_id, child_id, title, type, url, notes, deleted_at`
- `activity_logs` — `family_id, actor_user_id, actor_role, type, summary, metadata`

### RPCs (funciones PostgreSQL)
- `set_custody_day(p_family_id, p_month_key, p_day, p_parent)` — upsert atómico de un día de custodia
- `accept_invitation(p_token, p_user_id)` — acepta invitación atómicamente, crea membership, retorna JSONB con `{familyId, role, familyConfig, inviterId}`
- `is_family_member(p_family_id)` — helper RLS

### Compatibilidad camelCase
Los loaders en `app-shell.js` aplican `toCamel()` y agregan alias para compatibilidad con funciones de render:
- `expenses`: `paidBy` (de `paid_by_role`), `paid` (de `status === 'paid'`)
- `messages`: `text` (de `content`), `createdBy` (de `author_id`), `senderRole` (de `author_role`)
- `reminders`: `for` (de `assigned_to`), `done` (de `status === 'completed'`)
- `proposals` (custody_changes): `fromDate`, `toDate`, `createdByRole`, `createdBy`, `requestedToRole`
- `events`: `date` (de `start_at`), `time`, `requiresApproval`, `approvalStatus`
- `settlements`: `fromRole`, `toRole` mapeados a `'mama'`/`'papa'`

## Configuración Supabase (producción)

- **Proyecto ID**: `xvfdncjrwrcbxgogzvym`
- **URL**: `https://xvfdncjrwrcbxgogzvym.supabase.co`
- **Anon key**: en `supabase.js` (ya configurada)
- **Google OAuth**: configurado en Supabase Auth → Providers → Google
  - Client ID: `662940889446-ufs1tcl1ou164uoesv7pbvm1lnt4cc5s.apps.googleusercontent.com`
  - Redirect URI registrado: `https://xvfdncjrwrcbxgogzvym.supabase.co/auth/v1/callback`
  - Origen JS autorizado: `https://qinflo.cl`
- **Redirect URL**: `https://qinflo.cl` en Supabase Auth → URL Configuration

## Fases completadas

| Fase | Descripción | Commits clave |
|------|-------------|---------------|
| 1 | Modularización desde monolito | `ac760db` |
| 2 | Onboarding completo (custodia, hijos, invitación) | `98b8c8c` |
| 3 | Calendario automático, filtros, cambiar custodia, editar día, restaurar regla | `f2d1024` |
| 4 | Módulo de Eventos completo (events.js, aprobaciones, privados) | `9f7810e` |
| 5 | Flujo de invitación robusto: batch atómico, p1/p2, inviteConsumed, familyConfig heredado | `ec4be59` |
| 5b | Google auth Safari/iOS fix + migración a Firebase Hosting | `140e76c` |
| 6 | Firestore Rules desplegadas via CI, Documentos, PWA store assets, T&C onboarding | `3619277..a4b1b1f` |
| 7 | Acuerdos — edición, firma simple, cambio de estado inline, cards mejoradas | `a5a390a` |
| 8 | Gastos — liquidar balance, exportar resumen texto, historial de liquidaciones | — |
| 9 | Dashboard "Hoy" — custodia, pendientes, eventos, avisos, balance con liquidaciones | `1898133` |
| 9b | Onboarding legal — panel Bienvenida, 3 checkboxes separados, audit trail | `d2b6896` |
| 10 | **Migración completa Firebase → Supabase** — Auth, DB, Realtime, RLS, RPCs | `d5db018` |
| 10b | Fix flujo recuperación contraseña — pantalla nueva clave post-reset | `e139535` |

## Bugs conocidos activos en producción (hallazgo de auditoría 2026-07-12)

Verificados leyendo el código real contra el schema real (`supabase/migrations/*.sql`), no son suposiciones. Detalle completo con líneas exactas y fix recomendado en `PROJECT_STATUS.md` sección 13 y 19.

1. **🔴 `children.js` (Hijos) no persiste nada** — `saveKid()` envía columnas que no existen en la tabla (`birthDate`, `age`, `clinic`, `schoolInsurance`, `bloodType`, `created_by`). El insert falla pero el código no chequea `{ error }`, así que la UI parece funcionar y no guarda nada.
2. **🔴 `documents.js` (Documentos) no persiste nada** — `saveDoc()` envía `type` con valores que violan su `CHECK` (esos valores pertenecen semánticamente a `category`), más `childId`/`url` que no son columnas reales.
3. **🟠 Eventos privados no se pueden crear** — ver nota en "Decisiones de diseño importantes" arriba.

Estos tres bugs probablemente llevan tiempo sin detectarse porque Sentry/PostHog están desactivados (sin observabilidad en producción). Son candidatos a **máxima prioridad** — más urgentes que cualquier ítem del roadmap de abajo, porque afectan a usuarios reales ahora mismo.

## Roadmap pendiente (próxima sesión primero)

| Tarea | Descripción | Prioridad |
|-------|-------------|-----------|
| Arreglar bugs de Hijos/Documentos/Eventos privados | Ver sección de arriba y `PROJECT_STATUS.md` sección 19 | **Urgente** |
| SMTP personalizado | Configurar Resend para emails desde `@qinflo.cl` (no spam) | **Alta** |
| Emails en español | Personalizar plantilla de recuperación de contraseña en Supabase | Alta |
| Confirmación de email | Revisar si está activada en Supabase Auth y si conviene desactivarla | Alta |
| Google OAuth test | Verificar que el login con Google funciona end-to-end | Alta |
| Activar Sentry | Aunque sea free tier — hoy no hay ninguna visibilidad de errores en producción | Media |
| Push notifications | Rehacer sobre Supabase (Edge Functions/Web Push) — el código FCM actual apunta a Firestore, que ya no se usa | Baja |

## Decisiones de diseño importantes
- **Supabase JS v2** (no modular), instancia global `supa`, NO `supabase` (nombre reservado por el UMD)
- **Sin build step** — JS vanilla, sin bundler, desplegable directo con Firebase Hosting
- **p1 = la persona que se registró primero** (invitante), p2 = quien acepta la invitación
- **Labels dinámicos**: `p1()` y `p2()` devuelven el label según `familyConfig` (ej. "Mamá" / "Papá")
- **`accept_invitation` RPC**: atómica, reemplaza el batch de Firestore. Idempotente.
- **Overrides de custodia**: en `custody_months.overrides` JSONB. Sin edición directa — solo flujo propuesta/aprobación.
- **Eventos privados (intención de diseño, NO el comportamiento actual)**: la tabla `events.participants` tiene `CHECK (participants IN ('both','p1','p2'))`, pero `events.js` y el `<select id="evParticipants">` en `index.html` usan `'mama'/'papa'/'both'`. Resultado: **crear o editar un evento con destinatario "Mamá" o "Papá" falla el INSERT/UPDATE hoy** (viola el CHECK constraint; `saveEvent()` sí muestra un `alert()` de error). Ver `PROJECT_STATUS.md` sección 13 para el detalle y sección 19 para el fix recomendado.
- **Soft deletes**: `deleted_at = nowISO()` en lugar de DELETE para expenses, children, documents, agreements, reminders
- **Mensajes inmutables**: sin política DELETE en RLS — nadie puede borrar mensajes por diseño
- **`USER.id`** (Supabase) — nunca `USER.uid` (era Firebase). Si aparece `.uid` en código es un bug.
- **`toCamel()`**: convierte snake_case → camelCase en todos los loaders para compatibilidad con render functions
- **Aceptación legal**: JSONB en `users.legal_acceptance` con `tosVersion`/`privacyVersion`. Constantes en `onboarding.js`.

## Google OAuth — configuración actual (Supabase)

**Flujo**: `supa.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`  
→ Redirect a `https://xvfdncjrwrcbxgogzvym.supabase.co/auth/v1/callback`  
→ Redirect de vuelta a `https://qinflo.cl`  
→ `onAuthStateChange` recibe sesión → `loadUserData()` → app o onboarding

**Si Google OAuth falla**, verificar en este orden:
1. Supabase Dashboard → Authentication → Providers → Google → ¿está habilitado?
2. Google Cloud Console → OAuth Client → Authorized redirect URIs → ¿incluye `https://xvfdncjrwrcbxgogzvym.supabase.co/auth/v1/callback`?
3. Google Cloud Console → OAuth Client → Authorized JavaScript origins → ¿incluye `https://qinflo.cl`?
4. Supabase Dashboard → Authentication → URL Configuration → ¿`https://qinflo.cl` está en Redirect URLs?

## Flujo de recuperación de contraseña

1. Usuario pide reset → `doReset()` → `supa.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`
2. Email llega con link → redirige a `qinflo.cl` con token en hash
3. `onAuthStateChange` recibe evento `PASSWORD_RECOVERY` → muestra `#resetPasswordScreen`
4. Usuario ingresa nueva clave → `doUpdatePassword()` → `supa.auth.updateUser({ password })`
5. Éxito → vuelve a pantalla de login

**Pendiente**: emails van al spam porque usan el SMTP genérico de Supabase. Solución: configurar Resend (próxima sesión).

## Notas de deployment
- **Hosting**: Firebase Hosting (proyecto `quinflo`) — solo hosting estático
- **Dominio**: `qinflo.cl` → Firebase Hosting
- **Deploy automático**: GitHub Actions en cada push a `main`
- **Secret requerido**: `FIREBASE_SERVICE_ACCOUNT_QUINFLO` en GitHub repo secrets
