# HANDOFF.md — Transferencia completa de conocimiento

> **Generado**: 2026-07-12, cierre de sesión en la rama `claude/resume-main-14rwyc` (commit base `9fbe25d`, sincronizada 1:1 con `main`/`origin/main`).
> **Propósito**: transferencia de conocimiento completa, no un resumen. El objetivo es que una conversación nueva pueda continuar exactamente donde esta terminó, sin re-leer commits, sin re-descubrir decisiones, sin repetir investigación ya hecha.
> **Relación con otros documentos**: este archivo es el documento operativo principal. `AI_MEMORY.md` es más corto y está escrito para condicionar el comportamiento de una IA en sesiones futuras (patrones, qué no re-discutir). `ARCHITECTURE.md`, `ROADMAP.md`, `CHANGELOG.md` y `README.md` son documentos de referencia enfocados, derivados de este y de `CLAUDE.md`. Si algo se contradice entre archivos, **este documento y `CLAUDE.md` son la fuente de verdad más reciente**; el resto se generó a partir de ellos en la misma sesión y debería estar sincronizado, pero verifica contra el código si hay duda.
> **Nota importante**: gran parte del contenido de este archivo ya existía, con otra organización, en `PROJECT_STATUS.md` y `CLAUDE_HANDOFF.md` (escritos en el turno anterior de esta misma sesión). No se resume ese contenido — se reorganiza y se completa contra el pedido explícito de esta transferencia (dependencias entre módulos, supuestos del código, cosas que nunca deben tocarse sin revisar el resto del sistema, y una sección de Lessons Learned dedicada a esta sesión de trabajo). Si necesitas el detalle línea-por-línea de un bug específico con el fragmento de código exacto, `PROJECT_STATUS.md` sección 13 lo tiene citado textual.

---

## Índice

1. Estado actual del proyecto
2. Arquitectura completa
3. Decisiones técnicas tomadas y su motivo
4. Decisiones de UX y de negocio
5. Qué se intentó y NO funcionó
6. Errores encontrados y cómo se solucionaron
7. Bugs pendientes
8. Riesgos técnicos
9. Archivos importantes y su propósito
10. Dependencias entre módulos
11. Convenciones de código
12. Próximos pasos priorizados
13. Cosas que nunca deben modificarse sin revisar el resto del sistema
14. Supuestos que hoy tiene el código
15. Deuda técnica existente
16. Lessons Learned de esta sesión

---

## 1. Estado actual del proyecto

Qinflo es una PWA de coordinación de custodia compartida para padres separados, en producción en `https://qinflo.cl`. El proyecto terminó recientemente (commit `d5db018`, 2026-06-21) una migración completa de Firebase (Auth + Firestore + Cloud Functions) a **Supabase (Auth + PostgreSQL + Realtime)**, manteniendo Firebase únicamente como hosting estático.

**Estado de la rama de trabajo**: `claude/resume-main-14rwyc` está sincronizada 1:1 con `main`/`origin/main`. El working tree está limpio salvo por los archivos de documentación que se están generando en esta misma sesión (`HANDOFF.md`, `AI_MEMORY.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `CHANGELOG.md`, reescritura de `README.md`, y la actualización previa de `CLAUDE.md`). No hay features de producto sin terminar a medio commitear — el estado del código es exactamente el que quedó en el commit `9fbe25d`.

**Lo más importante que hay que saber para continuar**: el código está funcionalmente completo en su mayoría, pero **tres funcionalidades están rotas en producción ahora mismo** sin que nadie las haya reportado (por falta de observabilidad activa): el módulo de Hijos no guarda datos, el módulo de Documentos no guarda datos, y no se pueden crear eventos privados (solo "para Mamá" o "solo para Papá"). El detalle causal completo está en la sección 6 y 7 de este documento.

No hay trabajo de producto en curso de esta sesión — la sesión completa (este turno y el anterior) fue exclusivamente de **auditoría y documentación**, sin tocar código de la aplicación. El código de `index.html` y los 17 módulos `.js` está exactamente igual que en el commit `9fbe25d`.

---

## 2. Arquitectura completa

### 2.1 Vista de alto nivel

```
Navegador (PWA, sin build step, JS vanilla, sin módulos ES)
  index.html carga 17 archivos .js en <script> secuencial (orden fijo, ver sección 9)
  Estado compartido en variables globales de scope de módulo (state.js)
        │
        ├──▶ Supabase (proyecto xvfdncjrwrcbxgogzvym)
        │     Auth + PostgreSQL (RLS) + Realtime (websocket, postgres_changes)
        │
        └──▶ Firebase Hosting (proyecto "quinflo")
              Solo sirve los archivos estáticos — sin Auth, sin Firestore activo
              Dominio: qinflo.cl
```

No existe backend propio ni capa de API intermedia. El cliente habla directo con Supabase usando la `anon key` (protegida por RLS), salvo dos operaciones que necesitan atomicidad multi-tabla, resueltas con RPCs `SECURITY DEFINER`: `set_custody_day` y `accept_invitation`.

### 2.2 Ciclo de vida de la aplicación (paso a paso)

1. `index.html` carga Supabase UMD + Lucide desde CDN, luego los 17 scripts del proyecto en orden fijo.
2. `app-shell.js`, al cargarse, registra `supa.auth.onAuthStateChange(...)`. **Este listener es el verdadero punto de entrada** — no hay un `main()` explícito ni un bootstrap separado.
3. Cuando Supabase emite estado de sesión:
   - Evento `PASSWORD_RECOVERY` → se muestra la pantalla de nueva contraseña, se corta el flujo ahí.
   - Sin usuario → se muestra `authScreen`.
   - Con usuario → `loadUserData(u.id)` reconstruye `USERDATA` con 3 queries (perfil, membership+familia vía join embebido de PostgREST, coparent, invitación pendiente).
     - Si `loadUserData` devuelve `null` (usuario sin familia): si viene de Google, se crea perfil+familia automáticamente (`createGoogleUserProfile`); si no, se desloguea pidiendo registro explícito.
   - Se resuelve invitación pendiente (URL `?invite=` o `localStorage.pendingInvite`) llamando `autoConnect()`.
   - `updateLabels()` + `loadOrOnboard()`.
4. `loadOrOnboard()`: `onboardingCompleted === false` → `startOnboarding()`; si no, `loadApp()`.
5. `loadApp()`: muestra el shell, `switchTab('today')` (**antes** de cualquier función que pueda fallar — decisión UX deliberada, ver sección 4), luego `setupListeners()` (11 tablas en paralelo + suscripción Realtime), `fetchUF()`, renders iniciales, `checkAndGenerateCalendar()`.

### 2.3 El patrón central: loader + alias camelCase por tabla

Cada una de las 11 tablas activas tiene una función `loadX()` en `app-shell.js` que: hace `SELECT` filtrado por `family_id` (+ `deleted_at IS NULL` cuando aplica soft-delete) → convierte cada fila con `toCamel()` (snake_case → camelCase recursivo) → **agrega alias adicionales a mano** para que las funciones `renderX()` (escritas originalmente contra el modelo Firestore) sigan funcionando sin reescribirse → llama a los renders.

Ejemplos de alias que NO son un simple cambio de mayúscula (ojo con estos si tocas el modelo):
- `expenses.paidBy` (valores `'mama'`/`'papa'`) deriva de la columna real `paid_by_role` (valores `'p1'`/`'p2'`).
- `messages.text` deriva de `content`; `messages.createdBy` deriva de `author_id`.
- `reminders.for` deriva de `assigned_to`; `reminders.done` es booleano derivado de `status === 'completed'`.
- `proposals` (alias en memoria de la tabla `custody_changes`): agrega `fromDate`/`toDate`/`date`, `createdByRole`, `createdBy`, `requestedToRole`.
- `events.date`/`events.time` se parten desde la columna real `start_at` (timestamptz).
- `settlements.fromRole`/`toRole` mapeados a `'mama'`/`'papa'` desde `from_role`/`to_role` (`'p1'`/`'p2'`).

**El modelo de datos vive en dos capas simultáneas**: las columnas reales de Postgres (snake_case, con sus CHECK constraints) y un modelo derivado en memoria (camelCase, con nombres y a veces vocabularios de valores distintos). Esta doble capa es la causa raíz directa de los 3 bugs activos documentados en la sección 7 — en los módulos rotos, alguien escribió directamente contra el vocabulario de la capa en memoria (o contra el vocabulario Firestore original) sin traducir a la capa real de Postgres.

### 2.4 Tiempo real

Un canal Supabase Realtime por familia (`family-{FAMILY_ID}`), suscrito a `postgres_changes` en las 11 tablas activas. Cualquier cambio dispara un **re-fetch completo de esa tabla** (`loadX()` de nuevo), no un merge incremental. Simple y suficiente a la escala de 2 usuarios por familia.

Canal efímero adicional durante onboarding: `coparent-join-{FAMILY_ID}`, escucha `INSERT` en `family_members` para detectar cuándo el coparent acepta la invitación y avanzar automáticamente la UI. Se desuscribe tras la primera detección.

### 2.5 Autenticación

Email+contraseña y Google OAuth vía `supa.auth`. Recuperación de contraseña vía evento `PASSWORD_RECOVERY` de `onAuthStateChange`. Un trigger de Postgres (`handle_new_user`) crea automáticamente la fila espejo en `public.users` — el cliente nunca hace `INSERT` manual ahí.

### 2.6 Modelo de familia

`families` (una fila por familia) + `family_members` (relación usuario↔familia con `role` p1/p2) + `invitations` (tokens de invitación). `p1` = quien creó la familia (invitante/primer registrado); `p2` = quien acepta. Los labels visibles (Mamá/Papá, Papá 1/Papá 2, etc.) se resuelven en tiempo de render vía `familyConfig.p1Label`/`p2Label`, nunca hardcoded. La UI asume siempre exactamente 2 miembros activos por familia — el modelo de datos lo permitiría de forma más flexible, pero no hay ninguna pantalla que soporte más de un coparent.

### 2.7 RLS (Row Level Security)

Todas las tablas relevantes tienen RLS habilitado, basado principalmente en la función helper `is_family_member(p_family_id)`. Las operaciones que necesitan escribir a varias tablas atómicamente (aceptar invitación, fijar un día de custodia) usan RPCs `SECURITY DEFINER` en vez de encadenar escrituras desde el cliente, precisamente para no tener que abrir políticas RLS más permisivas de lo necesario. **Ver sección 13** — las políticas RLS son terreno de alto riesgo para tocar sin entender el resto del sistema.

---

## 3. Decisiones técnicas tomadas y su motivo

Cada decisión con su porqué explícito — no las repitas ni las cuestiones sin releer esto primero.

1. **Sin build step / sin bundler.** JS vanilla, `<script>` secuencial. Motivo original (documentado en el README histórico del proyecto): bajar riesgo y permitir que una IA edite archivos chicos sin depender de un pipeline de build que pueda romperse de formas no obvias. Se mantuvo intacto durante toda la migración a Supabase — no es una carencia, es una decisión activa que se ha respetado consistentemente a través de 10+ fases de desarrollo.

2. **Instancia de Supabase se llama `supa`, nunca `supabase`.** El bundle UMD de `@supabase/supabase-js` se expone a sí mismo como `window.supabase` — nombrar la instancia del cliente igual generaría colisión.

3. **`toCamel()` + alias manuales por loader, en vez de renombrar columnas Postgres a camelCase.** Se prefirió mantener el schema en snake_case (convención estándar de Postgres/RLS/RPCs) y absorber la traducción en la capa de carga de datos, para no reescribir ~15 funciones `renderX()` heredadas del modelo Firestore. Trade-off consciente: dos vocabularios simultáneos, con el riesgo que eso implica (ver sección 2.3 y los bugs de sección 7).

4. **`p1`/`p2` como roles neutrales en base de datos**, labels resueltos dinámicamente en UI. Permite soportar `mama_papa`/`papa_papa`/`mama_mama` sin tocar schema ni lógica — solo el objeto `familyConfig`.

5. **UUID de familia generado en el cliente** (`crypto.randomUUID()`, con fallback manual si el navegador no lo soporta) en el momento del registro, en vez de leerlo del retorno del `INSERT`. Es el fix directo de un bug de RLS ya resuelto — ver sección 6, error 1. No revertir esto sin releer esa sección completa.

6. **RPCs `SECURITY DEFINER`** (`accept_invitation`, `set_custody_day`) para operaciones multi-tabla atómicas. Evita estados intermedios inconsistentes ante pérdida de conexión a mitad de una operación, y evita exponer políticas RLS más permisivas solo para habilitar pasos intermedios del cliente.

7. **Un canal Realtime por familia, re-fetch completo de tabla ante cualquier cambio** (no merge incremental de deltas). Simplicidad deliberada sobre eficiencia — justificable a la escala de 2 usuarios por familia; **no escala** si el modelo de "familia" cambiara a soportar más miembros o más datos por familia (ver riesgos, sección 8).

8. **`cal_alg_version` en `families`** para forzar regeneración de calendario cuando cambia el algoritmo de generación de custodia, sin necesitar migración manual de datos. Permite corregir bugs del algoritmo (ya pasó una vez, ver sección 6 error 2) preservando overrides manuales gracias a upsert-con-merge.

9. **Soft deletes (`deleted_at`)** en vez de `DELETE` real, en `expenses`, `children`, `documents`, `agreements`, `reminders`. Preserva historial para el futuro "Timeline histórico" (prioridad 4 del roadmap de producto, ver `ROADMAP.md`) y evita pérdida accidental de datos compartidos entre dos personas que podrían no estar de acuerdo en borrar algo.

10. **Mensajes inmutables — sin política RLS de `DELETE`.** Decisión de producto explícita: nadie puede borrar mensajes, para preservar la "verdad compartida" (ver visión de producto en `CLAUDE.md`/`ROADMAP.md`).

11. **Firebase Hosting se mantuvo solo para servir estáticos** tras la migración de Auth/DB a Supabase, en vez de migrar también el hosting. Razón pragmática: el dominio `qinflo.cl`, certificado y pipeline de CI ya funcionaban; migrar solo backend minimizó el radio de cambio de una migración ya grande. Es deuda arquitectónica aceptada conscientemente, no un olvido (ver sección 15).

---

## 4. Decisiones de UX y de negocio

1. **"Esperando respuesta" como una sola tarjeta unificada** (propuesta de custodia + evento por confirmar + aviso de hoy), no módulos separados. Reduce carga cognitiva — coherente con el principio de producto "menos módulos, más hechos" (`ROADMAP.md`).

2. **Máximo una propuesta de cambio de custodia pendiente a la vez**, en cualquier dirección. Evita solicitudes contradictorias o pérdida de foco sobre "cuál es la vigente".

3. **Fechas de propuesta de cambio deben ser desde mañana en adelante**, nunca hoy o pasado. Evita cambios retroactivos o de aplicación inmediata sin aviso al otro padre/madre.

4. **Semana empieza en lunes**, estándar latinoamericano/chileno — corregido explícitamente tras salir con domingo por defecto (comportamiento nativo de `Date.getDay()` en JS).

5. **Pickers nativos de fecha/hora reemplazados por selects + texto `DD/MM/AAAA`** en onboarding. El selector nativo de Android generaba UX inconsistente entre plataformas.

6. **`switchTab('today')` se llama antes de cualquier función que pueda fallar** en `loadApp()`. Filosofía general del código: el usuario siempre debe ver al menos el shell de la app, aunque algo detrás falle silenciosamente — esta misma filosofía es la razón estructural por la que los bugs de Hijos/Documentos (sección 7) no muestran ningún error visible: el patrón de "nunca bloquear la UI" se aplicó también, sin querer, a errores que sí deberían haberse mostrado.

7. **Botón de invitar se oculta una vez que el coparent está conectado.** Nota arquitectural dejada explícitamente en el código: soporte multi-coparent queda pendiente como evolución futura — el modelo hoy asume una familia = un coparent fijo, sin posibilidad de reemplazo ni de segunda relación.

8. **Reembolso de gastos oculto a quien pagó** — quien puso el dinero no necesita ver el campo de "comprobante de reembolso", que es para que el otro padre/madre demuestre que ya devolvió su parte.

9. **"Los niños ya están conmigo" solo visible en días de cambio de custodia**, nunca en días normales. Es la base de la funcionalidad de "Confirmaciones" del roadmap de producto (prioridad 5).

10. **Modo oscuro persistido en `localStorage`**, aplicado antes del primer paint relevante para evitar flash de tema incorrecto.

11. **Quick replies totalmente personalizables por usuario**, reemplazando una lista fija — el tono real de cada familia no calzaba con respuestas genéricas predefinidas.

12. **Detector best-effort de lenguaje ofensivo antes de enviar un mensaje**, no bloqueante (pide confirmación extra, no impide el envío). Fricción intencional, no censura dura.

13. **Onboarding legal explícito**: checkboxes separados para Términos y Privacidad, con versión y timestamp auditables en `users.legal_acceptance` — pero **solo validado client-side**, no hay constraint de base de datos que impida `onboarding_completed = true` sin aceptación legal registrada (ver supuestos, sección 14).

---

## 5. Qué se intentó y NO funcionó

Estos son enfoques concretos que se probaron durante el desarrollo del proyecto y se descartaron — no reintentarlos sin releer por qué fallaron primero.

1. **Decidir si regenerar el calendario según si un mapa poblado por el listener realtime ya tenía datos.** Falló porque el listener es asíncrono y en la primera carga de página puede no haber disparado todavía — el mapa aparecía vacío aunque los datos existieran en el servidor, disparando una regeneración innecesaria que además sobreescribía overrides manuales. Se reemplazó por comparar contra `cal_alg_version` persistido server-side.

2. **`new Date('YYYY-MM-DD')` para construir fechas de calendario/custodia.** Falló porque parsea como medianoche UTC, que en Chile (UTC-3/-4) retrocede al día local anterior, desplazando el origen del bloque de 7 días en un día completo y haciendo que el domingo cayera sistemáticamente en el bloque de semana incorrecto. Se reemplazó por `new Date(year, month, day)` (constructor de 3 números = medianoche local) en todos los puntos donde se comparan/operan fechas de custodia.

3. **`signInWithPopup` de Firebase para Google Sign-In en Android.** Falló porque el sistema de intents de Android interceptaba la URL `accounts.google.com` preguntando con qué app abrirla, rompiendo el flujo. Se reemplazó (en la era Firebase) por `signInWithRedirect` específicamente en Android. **Nota**: este código específico ya no existe — la migración a Supabase reemplazó todo el flujo por `supa.auth.signInWithOAuth(...)` con `detectSessionInUrl: true`, que en teoría maneja el redirect de forma unificada. **No se ha vuelto a probar en Android tras la migración** — sigue siendo un punto ciego, no una garantía de que el problema esté resuelto.

4. **Depender del retorno de `.select().single()` inmediatamente después de un `INSERT INTO families`** durante el registro. Falló porque la política RLS de `SELECT` en `families` depende de que exista una membership en `family_members`, que en ese instante del flujo todavía no se había creado — el propio creador no podía leer la fila que acababa de insertar. Se reemplazó generando el UUID en el cliente antes del INSERT (ver sección 6, error 1).

5. **Confiar en que "si `await supa.from(x).insert(...)` no lanzó excepción, la operación funcionó".** Este no es un enfoque que se haya probado y corregido — es un enfoque que **se usó y nunca se corrigió** en varios módulos (`children.js`, `documents.js`, `reminders.js`, `agreements.js`). Se documenta acá como "no funciona" porque es la causa raíz compartida de los bugs más graves del proyecto (sección 7). Supabase-js v2 no lanza excepciones por errores de base de datos — los devuelve en el objeto de respuesta (`{ data, error }`), y si no se desestructura y chequea `error`, el fallo es completamente invisible.

6. **README con estructura de carpetas `js/`/`css/`/`capacitor.config.json`** como documentación de referencia activa. El repo migró a estructura plana hace tiempo y nunca se integró Capacitor — el README quedó describiendo una arquitectura que dejó de existir. Se corrige en esta sesión (ver `README.md` reescrito).

---

## 6. Errores encontrados y cómo se solucionaron

Bugs **ya corregidos**, con causa raíz completa documentada para no reinvestigarlos.

### Error 1 — RLS bloqueaba el SELECT inmediatamente después del INSERT de familia
**Commit**: `9fbe25d`.
**Síntoma**: al registrar un usuario nuevo, `INSERT INTO families ... .select().single()` fallaba.
**Causa raíz**: la política RLS de `SELECT` en `families` depende de `is_family_member(id)`, que depende de una fila en `family_members` que en ese instante del flujo aún no existía (se crea en el paso siguiente).
**Fix**: generar el UUID de la familia en el cliente (`crypto.randomUUID()`) antes del INSERT, pasarlo explícito como `id`, usarlo directo para los pasos siguientes sin depender de un `SELECT` de vuelta. Aplicado en `doRegister()`, `createGoogleUserProfile()` (`auth.js`) y el fallback de `connect.js showConnectScreen()`.

### Error 2 — Bug de asignación de domingo + pérdida de overrides manuales (3 causas raíz relacionadas)
**Commit**: `4f48719`.
- **2a. Domingo en el bloque de semana incorrecto**: `new Date('YYYY-MM-DD')` parsea UTC, se corre un día en Chile. Fix: `new Date(y, m, d)` (constructor local) para `startDate` y cada día evaluado, misma referencia horaria.
- **2b. Condición de carrera que borraba correcciones manuales**: decisión de regenerar basada en un mapa poblado async por el listener realtime, que podía estar vacío en la primera carga. Fix: usar `cal_alg_version` persistido, comparación server-side confiable.
- **2c. Overrides invisibles aunque estuvieran guardados**: `getCustody()` solo leía `custodyMap`, nunca `custodyOverridesMap`. Fix: `getCustody()` consulta primero overrides, cae a patrón base si no hay.
**Preservación de datos**: los overrides sobrevivieron a la regeneración forzada porque el upsert usa merge — patrón que debe mantenerse en cualquier cambio futuro al algoritmo.

### Error 3 — Google Sign-In interceptado por intents de Android
**Commit**: `b53f53f`. Ver detalle en sección 5, punto 3 (era un enfoque descartado, la solución encontrada entonces ya no existe en el código actual por la migración a Supabase — punto ciego pendiente de reverificar).

### Error 4 — Pantalla en blanco si alguna función de carga fallaba en `loadApp()`
**Commit**: `3eac5bc`. Fix: mover `switchTab('today')` antes de las llamadas que pueden fallar; `loadApp()` envuelto en `try/catch` que solo loguea a consola sin re-lanzar.

### Error 5 — Cache del Service Worker no incluía todos los scripts referenciados
**Commit**: `b5d83e2`. `events.js`/`onboarding.js` estaban en `index.html` pero no en `STATIC_ASSETS` del service worker. Fix: agregarlos + bump de versión de cache. **Convención resultante**: cada `.js` nuevo en `index.html` debe agregarse también a `STATIC_ASSETS`, y cada cambio de contenido cacheado requiere bump de `QINFLO_CACHE` (hoy `v25`).

### Error 6 — CI fallaba por paso de Functions innecesario
**Commit**: `3476a4e`. Se quitó `npm ci --prefix functions` del workflow — pero el resto de pasos de Functions/Firestore Rules quedaron con `continue-on-error: true`, sin resolver el problema de fondo (código Firebase muerto siendo "desplegado"). Ver deuda técnica, sección 15.

### Error 7 — Schema no idempotente al reintentar la migración
**Commits**: `81e0b8c`, `bf9f428`. Faltaba `IF NOT EXISTS` en tablas/índices, `DROP POLICY IF EXISTS` antes de recrear políticas, y había una FK circular (`custody_confirmations.related_event_id` → `events`, definida antes de que `events` existiera en el orden del archivo). Fix: idempotencia completa en las 28 tablas y ~40 políticas; FK circular eliminada dejando la columna nullable sin constraint; `is_family_member()` movida para definirse después de `family_members`.

---

## 7. Bugs pendientes

Verificados leyendo código real contra schema real en esta sesión de auditoría (no son suposiciones). Ordenados por severidad.

### 🔴 CRÍTICO — Módulo de Hijos no persiste nada (`children.js`)
`saveKid()` envía `birthDate`, `age`, `clinic`, `schoolInsurance`, `bloodType`, `created_by` — ninguna de esas columnas existe en la tabla real `children` (que solo tiene `id, family_id, name, birth_date, school, doctor, allergies, notes, avatar_url, status, created_at, updated_at, deleted_at`). El INSERT/UPDATE es rechazado por PostgREST, pero el código **no verifica `{ error }`**, así que el formulario se cierra como si hubiera funcionado. El alta de hijos durante onboarding tiene el mismo problema de fondo.

### 🔴 CRÍTICO — Módulo de Documentos no persiste nada (`documents.js`)
`saveDoc()` envía `type` con valores (`'rut'`, `'carnet_salud'`, etc.) que violan el `CHECK (type IN ('file','reference'))` real — esos valores pertenecen semánticamente a la columna `category`. Además envía `childId` (no existe, la columna es `child_id`, duplicado por el código de otra forma) y `url` (no existe, son `file_url`/`external_location`). Mismo patrón: sin verificación de `{ error }`, falla en silencio.

### 🟠 ALTO — Eventos privados no se pueden crear
`events.participants` tiene `CHECK (participants IN ('both','p1','p2'))`, pero el `<select id="evParticipants">` y `events.js` usan `'mama'`/`'papa'`/`'both'`. Crear/editar un evento dirigido solo a un padre falla el constraint. A diferencia de los dos anteriores, `saveEvent()` sí tiene `try/catch` y muestra `alert()` — el usuario al menos ve que algo falló, pero no puede completar la acción.

### 🟡 MEDIO — Variables indefinidas al loguear actividad de propuestas
`calendar.js saveProp()` referencia `from`/`to` (nunca declaradas; deberían ser `fromDate`/`toDate`) al llamar `logActivity()`. `ReferenceError` no capturado, mensaje. Ocurre **después** de que la propuesta ya se insertó con éxito — solo falla el registro de actividad, en consola.

### 🟡 MEDIO — "Día undefined → Día undefined" en actividad al aceptar/rechazar desde Hoy
`today.js acceptPropInline()`/`rejectPropInline()` usan `p.fromDay`/`p.toDay` (campos del modelo Firestore viejo, ya no poblados — el modelo actual usa `fromDate`/`toDate`). El flujo equivalente desde Calendario (`calendar.js renderProposals()`) sí usa `fmtProposalDates()` correctamente — el bug es específico del atajo desde Hoy.

### 🟡 MEDIO — Timestamps de mensajes nunca se muestran
`messages.js renderMessages()` usa `m.createdAt.toDate` (API de `Timestamp` de Firestore). Supabase devuelve `created_at` como string ISO plano sin `.toDate` — la condición siempre es falsa, ningún mensaje muestra hora.

### 🟢 BAJO (latente) — `user.uid` en vez de `user.id` en observabilidad
`observability.js identifyObservabilityUser()` usa `user.uid`. Inofensivo hoy porque Sentry/PostHog están sin llaves configuradas (el bloque nunca se ejecuta) — explotará en cuanto se activen esas llaves.

### 🟢 BAJO — CI despliega infraestructura Firebase muerta en cada push
`firebase deploy --only firestore:rules` y `--only functions` corren en cada push con `continue-on-error: true`. No rompe nada, pero cuesta tiempo de CI y puede confundir a quien lea el workflow.

---

## 8. Riesgos técnicos

1. **Los 3 bugs crítico/alto de la sección 7 están afectando usuarios reales ahora mismo** — es el riesgo de mayor impacto inmediato del proyecto, por encima de cualquier feature nueva del roadmap.
2. **Ausencia sistemática de verificación de `{ error }`** en varios módulos — no es exclusivo de los 2 módulos ya conocidos como rotos; cualquier `insert`/`update`/`upsert` sin ese chequeo es un bug silencioso latente, detectado o no todavía.
3. **Dependencias externas sin pin de versión** (`@supabase/supabase-js@2`, `lucide@latest` vía CDN) — un breaking change upstream se propaga a producción sin ventana de prueba, sin lockfile, sin CI que lo detecte.
4. **Cero tests automatizados, cero linter en CI.** Toda regresión se detecta manualmente o por reporte de usuario.
5. **Observabilidad completamente apagada en producción** (Sentry/PostHog con código listo pero sin llaves). Es probablemente la causa directa de que los bugs de Hijos/Documentos lleven tiempo sin detectarse — es el punto de mayor apalancamiento para reducir el resto de los riesgos de esta lista.
6. **Credenciales de Supabase hardcoded en `supabase.js`** (URL + anon key) — es el patrón esperado para una anon key protegida por RLS, pero cualquier futura credencial con privilegios elevados (service role key) **no debe** seguir ese mismo patrón ni vivir en el frontend.
7. **`cal_alg_version` como único mecanismo de invalidación de calendario** — manual, frágil, depende de que quien edite el algoritmo de generación recuerde subir la constante (ya causó un bug real una vez, ver error 2b sección 6).
8. **CI sin ningún gate de calidad** (solo despliega, no valida nada) — errores de sintaxis/lógica que no rompen el parseo pero sí la ejecución (como los de la sección 7) llegan directo a producción.
9. **40 políticas RLS sin test automatizado que las valide.** Un cambio futuro a una política podría abrir o cerrar acceso de forma no intencionada sin que nada lo detecte hasta que un usuario reporte un problema de datos visibles/invisibles.
10. **Dos proveedores de infraestructura separados** (Firebase Hosting + Supabase) para un proyecto chico — superficie operativa duplicada sin beneficio claro hoy, deuda arquitectónica aceptada conscientemente (ver sección 3, decisión 11).

---

## 9. Archivos importantes y su propósito

| Archivo | Propósito | Se carga... |
|---|---|---|
| `index.html` | Estructura completa de la SPA; todas las pantallas/formularios son secciones ocultas/visibles vía `hide()`/`show()` | — (documento raíz) |
| `supabase.js` | Instancia global `supa`, credenciales Supabase | 1º |
| `state.js` | Estado global (`USER`, `USERDATA`, `FAMILY_ID`, arrays de datos) + helpers universales (`$`, `toCamel`, `famQ`, `nowISO`, `p1()`/`p2()`, `fmtCLP`) | 2º |
| `auth.js` | Login, registro (con creación de familia), Google OAuth, reset password | 3º |
| `connect.js` | Pantalla de invitación + `autoConnect()` (RPC `accept_invitation`) | 4º |
| `calendar.js` | Calendario, custodia, `setCustody`, flujo de propuestas de cambio | 5º |
| `expenses.js` | Gastos, balance, liquidaciones, exportación de resumen | 6º |
| `messages.js` | Mensajería en tiempo real + quick replies | 7º |
| `children.js` | Perfiles de hijos — **módulo roto**, ver sección 7 | 8º |
| `agreements.js` | Acuerdos con firma simple | 9º |
| `reminders.js` | Avisos/recordatorios | 10º |
| `resources.js` | Recursos de apoyo Chile (contenido estático) | 11º |
| `observability.js` | Sentry/PostHog (inactivo) + registro del service worker | 12º |
| `onboarding.js` | Onboarding completo + `generateOnbCalendar()` + watcher de coparent | 13º |
| `events.js` | CRUD de eventos + aprobación — contiene el bug de `participants`, sección 7 | 14º |
| `documents.js` | Documentos — **módulo roto**, ver sección 7 | 15º |
| `activity.js` | `logActivity()` + render del feed de actividad | 16º |
| `today.js` | Dashboard "Hoy" — corazón de la visión de producto | 17º |
| `theme.js` | Dark/light mode | 18º |
| `app-shell.js` | Listener de auth, `loadUserData`, `loadApp`, los 11 `loadX()`, Realtime, todos los `addEventListener` de la UI | 19º (último, a propósito) |
| `supabase/migrations/001_initial_schema.sql` | Schema completo original — fuente de verdad de columnas/constraints reales | — |
| `supabase/migrations/002_migration_compatibility.sql` | Columnas/tablas/RPCs añadidas post-migración — también fuente de verdad, no asumir que 001 alcanza | — |
| `service-worker.js` | Cache PWA — mantenimiento manual obligatorio (ver error 5, sección 6) | — |
| `.github/workflows/firebase-hosting-deploy.yml` | Único pipeline CI/CD — con pasos muertos, ver deuda técnica | — |
| `CLAUDE.md` | Memoria persistente del proyecto — punto de partida de cada sesión | — |
| `PROJECT_STATUS.md` | Estado exhaustivo (turno anterior de esta sesión) — detalle línea-por-línea de cada bug citado en código | — |
| `CLAUDE_HANDOFF.md` | Handoff operativo del turno anterior — reglas "qué no hacer" ya destiladas | — |
| `HANDOFF.md` | Este documento | — |
| `AI_MEMORY.md` | Memoria de patrones/comportamiento para IA en sesiones futuras | — |
| `ARCHITECTURE.md` | Arquitectura como documento de referencia standalone | — |
| `ROADMAP.md` | Roadmap de producto + técnico consolidado | — |
| `CHANGELOG.md` | Historial de fases/commits significativos | — |
| `README.md` | Punto de entrada del repo, reescrito en esta sesión para reflejar la estructura real | — |

**Archivos huérfanos (código muerto en el repo, no forman parte del flujo activo)**: `firebase.js`, `firebase-messaging-sw.js`, `firestore.rules`, `functions/index.js`, `functions/package.json`.

---

## 10. Dependencias entre módulos

**No existen módulos ES ni imports** — los 17 archivos `.js` comparten un único scope global de `window`, y el orden de carga en `index.html` (sección 9) es lo único que garantiza que una función exista antes de ser llamada. Esto significa que las "dependencias" son implícitas: función A en el archivo X llama a función B definida en el archivo Y, sin ninguna declaración explícita de esa relación — hay que leer el código para descubrirla.

Mapa de dependencias funcionales relevantes (quién llama a qué, entre archivos):

- **`state.js`**: sin dependencias. Es la base — define `$`, `show`/`hide`, `toCamel`, `famQ`, `nowISO`, `p1()`/`p2()`/`myRole()`, `fmtCLP`/`fmtUF`, `showMsg`/`hideMsg`, manejo de errores de auth. **Todo el resto del proyecto depende de este archivo.**
- **`supabase.js`**: sin dependencias. Define `supa`. Todo lo que hace `supa.from(...)`/`supa.auth`/`supa.rpc(...)` depende de este archivo.
- **`auth.js`** → llama a `startOnboarding()` (`onboarding.js`) y `autoConnect()` (`connect.js`) desde dentro de funciones async — es una dependencia hacia adelante en el orden de carga, válida porque las llamadas ocurren en tiempo de ejecución (post-`DOMContentLoaded`), no en tiempo de parseo.
- **`connect.js`** → llama a `loadApp()` (`app-shell.js`) y `showCoparentWelcome()` (`onboarding.js`, con guard `typeof`).
- **`calendar.js`** → llama a `logActivity()` (`activity.js`, con guard `typeof`), `renderEventsForDay()` (`events.js`, con guard `typeof`). Expone `window.renderCalendar` para que otros módulos puedan invocarlo explícitamente.
- **`expenses.js`** → depende de los arrays globales `expenses`/`settlements`/`UF` poblados por `app-shell.js`; usa `p1()`/`p2()`/`myRole()`/`fmtCLP` de `state.js`.
- **`events.js`** → depende de `selDay`/`calYear`/`calMonth` (globales de `calendar.js`) y del array global `events`; llama a `logActivity()` (`activity.js`).
- **`today.js`** → el módulo más acoplado del proyecto. Lee `custodyMap`/`custodyOverridesMap` (poblados por `app-shell.js loadCalendar()`), y los arrays `proposals`/`events`/`reminders`/`expenses`/`settlements`/`children`/`activityLog`; llama a `setCustody()` (`calendar.js`), `logActivity()` (`activity.js`), `approveEvent()`/`rejectEvent()` (`events.js`), `switchTab()` (`app-shell.js`), `fmtProposalDates()` (`calendar.js`), `_computeSharedNet()`/`_computeSettlAdjust()` (`expenses.js`, con fallback inline si no existen).
- **`onboarding.js`** → llama a `finishOnboarding() → loadApp()` (`app-shell.js`); usa el array global `children` en `showCoparentWelcome()`.
- **`documents.js`** → depende del array global `children` (para el selector de hijo asociado).
- **`theme.js`** → llama a `closeProfilePanel()` (`app-shell.js`) desde el handler del botón de tema en el panel de perfil.
- **`app-shell.js`** → el "hub": llama a **todas** las funciones `renderX()` de todos los demás módulos (`renderExpenses`, `renderMessages`, `renderChildren`, `renderAgreements`, `renderReminders`, `renderProposals`, `renderCalendar`, `renderDocuments`, `renderTodayActivity`, `renderToday`, `renderResources`, `renderQuickReplies`), `initTheme()` (`theme.js`), `identifyObservabilityUser()` (`observability.js`, con guard `typeof`). Define en sí mismo los 11 `loadX()` que pueblan los arrays globales que **todos** los demás módulos leen.

**Implicación práctica**: no puedes razonar sobre "qué se rompe si cambio la función X" mirando solo el archivo donde vive X — tienes que buscar (grep) todas las referencias a esa función en el resto del proyecto, porque no hay compilador ni linter que te avise de una llamada rota a una función renombrada o eliminada. Ver sección 13.

---

## 11. Convenciones de código

- Punto y coma siempre explícito.
- Predomina `var`/`function` sobre `let`/`const`/arrow, con mezcla (helpers puros en `state.js` sí usan `const`/arrow). Seguir el estilo del archivo que se está editando, no imponer un estilo nuevo.
- `async function` + `await` para todo lo que toca Supabase; casi no hay `.then()` encadenado (excepciones puntuales legacy: `fetchUF()`, el fallback de `connect.js`).
- Prefijo `_` para funciones "privadas" de un módulo (no llamadas desde otros archivos) — es solo convención visual, no hay aislamiento real de scope.
- `$(id)` como alias universal de `document.getElementById(id)` — nunca usar `document.getElementById` directo en código nuevo.
- `show(id)`/`hide(id)` para visibilidad vía clase `hidden` — con excepciones puntuales que usan `style.display` directo (no seguir esas excepciones como patrón).
- HTML generado por concatenación de strings + `innerHTML`, a veces mezclado con `document.createElement` para el contenedor. Sin templating engine.
- **Manejo de errores inconsistente por diseño histórico, no por regla**: algunos módulos (`expenses.js`, `events.js`) sí verifican `{ error }` con `try/catch` + `alert()`; otros (`children.js`, `documents.js`, `reminders.js`, `agreements.js`) no verifican nada. **Código nuevo debe seguir siempre el primer patrón.**
- Query strings de versión (`?v=N`) en cada `<script src>` de `index.html`, incrementadas manualmente al modificar un archivo — ayuda contra cache HTTP normal, pero la invalidación real contra el Service Worker depende del bump de `QINFLO_CACHE` en `service-worker.js`, un mecanismo separado.
- Español para toda la UI, comentarios de negocio y mensajes de commit; inglés ocasional en comentarios técnicos (p. ej. explicaciones de bugs de timezone).
- Colores/tokens vía CSS custom properties (`var(--accent)`, `var(--text-s)`, etc.), con soporte de tema oscuro vía `[data-theme="dark"]` — el JS que genera HTML inline las referencia directo en `style="color:var(--...)"`.
- Soft-deletes siempre con el mismo patrón: `.update({ deleted_at: nowISO() })`, nunca `.delete()`, en las tablas que lo soportan.
- Commits generados por Claude Code llevan trailer `Co-Authored-By: Claude ... <noreply@anthropic.com>` + `Claude-Session: <url>` — mantener ese trailer en commits futuros generados por Claude.

---

## 12. Próximos pasos priorizados

### Urgente (bugs activos en producción)
1. Arreglar `children.js` (`saveKid()` + insert de hijos en `onboarding.js`) para enviar solo columnas reales, snake_case.
2. Arreglar `documents.js` (`saveDoc()`) — mapear `type` del formulario a `category`, decidir un `type` real (`file`/`reference`), mapear `url` a `file_url`/`external_location`.
3. Arreglar `events.js` para usar `p1`/`p2`/`both` (no `mama`/`papa`) al hablar con la tabla `events`, manteniendo el label visible en español.
4. Agregar verificación de `{ error }` a los `insert`/`update` de `children.js`, `documents.js`, `reminders.js`, `agreements.js`.
5. Arreglar timestamp de mensajes (`m.createdAt.toDate` → `new Date(m.createdAt)`).
6. Arreglar referencias a variables indefinidas (`from`/`to` en `saveProp()`, `fromDay`/`toDay` en `acceptPropInline`/`rejectPropInline`).

### Alta prioridad (roadmap ya explícito)
7. SMTP personalizado (Resend) para emails desde `@qinflo.cl`.
8. Plantilla de recuperación de contraseña de Supabase Auth en español.
9. Revisar si conviene desactivar confirmación de email en Supabase Auth.
10. Verificar Google OAuth end-to-end en producción, especialmente Android (punto ciego, ver sección 5 punto 3).

### Media prioridad (higiene/deuda técnica)
11. Activar Sentry (aunque sea free tier) — altísimo apalancamiento dado el hallazgo de bugs silenciosos.
12. Limpiar infraestructura Firebase muerta (CI + archivos huérfanos).
13. Corregir `user.uid` → `user.id` en `observability.js` antes de activar llaves de Sentry/PostHog.

### Baja prioridad (roadmap largo plazo)
14. Push notifications reales sobre Supabase (no Firebase Functions).
15. Sincronización bidireccional con Google Calendar.
16. Confirmaciones verificables de cambio de custodia con timestamp exacto — base parcial ya existe (`confirmKidsWithMe()`), falta conectarla completa a `custody_confirmations`.

Ver `ROADMAP.md` para la versión consolidada con el roadmap de producto completo.

---

## 13. Cosas que nunca deben modificarse sin revisar el resto del sistema

Dado que no hay módulos reales, compilador, ni tests, estos cambios tienen radio de impacto invisible a simple vista:

1. **Cualquier nombre de columna o tabla en `supabase/migrations/*.sql`.** Un rename rompe silenciosamente cualquier `.js` que lo referencie — no hay tipo, no hay compilador que lo detecte. Antes de renombrar una columna, `grep -rn "nombre_columna"` en todos los `.js` y actualizar cada uno.
2. **Cualquier `CHECK` constraint en el schema.** Ya hay dos casos activos (`events.participants`, `documents.type`) donde el JS y el constraint están desalineados — es exactamente el tipo de cambio que necesita revisión cruzada explícita antes de tocarse.
3. **El orden de los `<script src>` en `index.html`.** `app-shell.js` debe ser el último porque su `DOMContentLoaded` asume que toda función de todos los demás módulos ya existe en scope global. Cualquier archivo nuevo que dependa de funciones de otro debe cargarse después de ese otro.
4. **`STATIC_ASSETS` en `service-worker.js`.** Debe mantenerse en sincronía exacta con los `<script src>` de `index.html` — un archivo nuevo sin agregar aquí falla en modo offline/cache stale (ver error 5, sección 6).
5. **`CAL_ALG_VERSION` en `calendar.js`.** Cualquier cambio al algoritmo de generación de custodia (`getOnbCustodyForDate()`, `generateOnbCalendar()`) que altere el resultado para fechas ya generadas **debe** ir acompañado de subir esta constante, o el fix nunca se aplicará a calendarios ya existentes (solo a familias que hagan onboarding desde cero).
6. **Cualquier política RLS o la función `is_family_member()`.** Afecta a las ~15 tablas activas simultáneamente; no hay test que valide que sigue permitiendo/bloqueando exactamente lo esperado. Un cambio mal calculado puede exponer datos de una familia a otra, o bloquear a usuarios legítimos de sus propios datos.
7. **Las funciones `toCamel()`/`famQ()`/`nowISO()` en `state.js`.** Son usadas por los 11 `loadX()` de `app-shell.js` y, indirectamente, por cada `renderX()` del proyecto. Un cambio de comportamiento aquí se propaga a todo el modelo de datos en memoria.
8. **Cualquier RPC (`set_custody_day`, `accept_invitation`, `is_family_member`).** Son `SECURITY DEFINER` — corren con privilegios elevados, bypaseando RLS. Un bug introducido ahí no se limita por las políticas normales.
9. **La convención `p1`/`p2` y su mapeo a labels.** Está entretejida en prácticamente todos los módulos (`myRole()`, `oppositeRole()`, `roleLabel()`, cada `renderX()` que muestra "quién"). Cambiarla requiere auditar todo el proyecto, no un módulo aislado.
10. **El mecanismo de alias camelCase en cada `loadX()` de `app-shell.js`.** Cambiar o quitar un alias (p. ej. `expenses.paidBy`) rompe silenciosamente cualquier `renderX()` que lo consuma, en un archivo distinto, sin ningún error en tiempo de carga — el error aparece recién cuando el usuario interactúa con esa pantalla.

---

## 14. Supuestos que hoy tiene el código

Estas son cosas que el código **da por sentado**, sin validarlas explícitamente — si alguna deja de cumplirse, el comportamiento no está definido o falla de forma no evidente:

1. **Cada familia tiene exactamente 2 miembros activos como máximo.** No hay ninguna pantalla ni lógica que soporte 3+. El modelo de datos (`family_members` como relación N:N) lo permitiría técnicamente, pero toda la UI (`CODATA`, "el coparent", labels `p1`/`p2`) asume binariedad estricta.
2. **`USER.id` de Supabase Auth es estable y único por sesión** — se usa como clave de todo (creador de familia, autor de mensaje, etc.) sin revalidación adicional.
3. **`familyConfig` siempre tiene `p1Label`/`p2Label`/`type`** — los helpers `p1()`/`p2()` tienen fallback a `'Mamá'`/`'Papá'` si `USERDATA.familyConfig` es null, pero ningún código valida que el `type` sea uno de los 3 esperados (`mama_papa`/`papa_papa`/`mama_mama`) antes de usarlo para indexar el objeto `labels` en `auth.js`/`onboarding.js`.
4. **El navegador soporta `crypto.randomUUID()`** — hay fallback manual si no, pero no está testeado en navegadores realmente antiguos.
5. **La hora del dispositivo del usuario es correcta y está en zona horaria de Chile** — todo el cálculo de custodia/fechas usa `new Date()` local del navegador, sin normalización explícita a un timezone del servidor. Un usuario con el reloj o la zona horaria mal configurada vería custodia/eventos desalineados.
6. **`onboarding_completed` en `true` implica que el usuario efectivamente aceptó los términos legales** — pero no hay constraint de base de datos que lo garantice; es una asunción de flujo de UI únicamente (ver decisión 13, sección 4).
7. **Cada `INSERT`/`UPDATE` a Supabase que no lanza excepción tuvo éxito** — supuesto **falso** en varios módulos (ver sección 7), documentado explícitamente para que quede claro que no es un supuesto seguro en ningún punto nuevo del código.
8. **El valor de la UF obtenido de `mindicador.cl` es representativo del momento actual** — sin caché de servidor, sin manejo de historia; si la API cae, se usa el fallback hardcoded `UF = 38650` (`state.js`), que con el tiempo queda desactualizado silenciosamente (no hay alerta cuando el fetch falla, solo un texto "(referencial)" en la UI).
9. **El listener Realtime de Supabase siempre reconecta** tras una pérdida de red — no hay lógica explícita de retry/backoff en el código del proyecto; se depende completamente del comportamiento por defecto de `supabase-js`.
10. **Todos los archivos `.js` cargan y ejecutan sin error de sintaxis** — no hay ningún mecanismo de fallback si uno de los 17 scripts falla al parsear (un error de sintaxis en cualquiera de ellos rompe la ejecución de todos los que le siguen en el `<script>` secuencial, incluyendo `app-shell.js` con su `DOMContentLoaded`).

---

## 15. Deuda técnica existente

1. **Infraestructura Firebase huérfana** desplegándose en cada push sin usarse: Cloud Functions (`functions/index.js`, triggers Firestore que nunca disparan), Firestore Rules, `firebase.js`, `firebase-messaging-sw.js`. Limpieza pendiente, sin urgencia funcional pero con costo de claridad y tiempo de CI.
2. **Dos módulos con persistencia completamente rota** (Hijos, Documentos) — deuda que ya es un bug de producción, no solo teórica (ver sección 7).
3. **Sin tests automatizados de ningún tipo.**
4. **Sin linter en CI.**
5. **Dependencias de CDN sin pin de versión** (`@supabase/supabase-js@2`, `lucide@latest`).
6. **README.md desactualizado** (en proceso de corrección en esta misma sesión) describía una estructura de carpetas (`js/`, `css/`, Capacitor) que no existe hace tiempo.
7. **Doble stack de hosting** (Firebase Hosting + Supabase) sin necesidad funcional actual, solo histórica.
8. **Manejo de errores inconsistente entre módulos** — mitad del código verifica `{ error }`, mitad no, sin ninguna guía escrita hasta este documento.
9. **`cal_alg_version` como mecanismo manual y frágil** de invalidación de calendario — funciona pero depende de disciplina humana, no de un sistema que lo fuerce.
10. **13 tablas del schema sin ningún uso en el código** (`legal_acceptances`, `custody_patterns`, `custody_confirmations`, `event_confirmations`, `currency_rates`, `message_edit_history`, `message_templates`, `resources`, `pending_actions`, `notifications`, `notification_tokens`, `plans`, `subscriptions`, `audit_logs`) — superficie de diseño no implementada, ni un problema en sí, pero riesgo de asumir que hay lógica detrás de ellas cuando no la hay.
11. **`"README 2.md"`** — duplicado accidental de `README.md`, eliminado en esta sesión de documentación (ver `CHANGELOG.md`).
12. **Sin `package.json` en la raíz** — no hay forma estándar de declarar/instalar dependencias de desarrollo (p. ej. un futuro linter) sin introducir la primera pieza de tooling npm que el proyecto nunca tuvo.

---

## 16. Lessons Learned de esta sesión

Esta sección es específica al trabajo hecho en **esta conversación** (dos turnos: auditoría + documentación inicial, y esta segunda ronda de documentación exhaustiva). No repite las lecciones ya destiladas de errores históricos del proyecto (esas están en las secciones 5 y 6) — documenta cómo se condujo el trabajo de documentación en sí, para que una sesión futura no repita pasos ya dados ni cometa los mismos tropiezos de proceso.

1. **La primera pasada de "auditoría" no debe confiar en `CLAUDE.md` como fuente de verdad de comportamiento real.** Se encontró al menos una afirmación incorrecta (`participants === 'p1'/'p2'` en eventos privados, cuando el código real usa `'mama'/'papa'`) que, de haberse tomado como cierta sin verificar contra `index.html` y el schema SQL, habría quedado propagada a todos los documentos nuevos. **Lección aplicada**: cada afirmación técnica de este documento y de `PROJECT_STATUS.md` se verificó leyendo el archivo fuente real y, cuando aplicaba, el `CHECK` constraint real en `supabase/migrations/*.sql` — no se derivó nada de memoria de lo que "debería" decir la documentación previa.

2. **Herramientas interactivas (`AskUserQuestion`) pueden fallar por errores de infraestructura ajenos al contenido de la pregunta** ("Tool permission stream closed before response received" ocurrió en el turno anterior de esta sesión). **Lección aplicada**: cuando una herramienta de este tipo falla, no reintentar ciegamente la misma llamada — resumir en texto plano el estado y la pregunta pendiente, y dejar que la conversación continúe de forma más resiliente. No asumir que un fallo de tooling implica que el usuario rechazó o ignoró la pregunta.

3. **Pedir "no resumir, documentación exhaustiva" es una instrucción que hay que tomar literalmente sobre la extensión, pero no como licencia para inflar contenido sin verificar.** Cada sección larga de este documento y de `PROJECT_STATUS.md` tiene contenido verificado línea por línea (nombres de columna, nombres de función, números de commit) — la extensión viene de cobertura real (17 módulos, 27 tablas, ~15 commits relevantes revisados con su body completo), no de relleno. **Lección para el futuro**: cuando se pida documentación exhaustiva, priorizar cobertura verificada sobre prosa extensa no verificable — un documento largo pero impreciso es peor que uno corto y exacto, incluso si el pedido explícito es "extensión sobre resumen".

4. **Los bugs más valiosos de esta auditoría (Hijos y Documentos rotos) no eran visibles leyendo solo el archivo `.js` del módulo** — requirieron cruzar cada campo del payload de `insert()`/`update()` contra el `CREATE TABLE` real en las migraciones SQL, campo por campo. **Lección aplicada y a repetir**: para cualquier auditoría futura de un módulo de persistencia, el proceso correcto es (a) leer la función de guardado, (b) listar exactamente qué columnas envía, (c) abrir el `CREATE TABLE` real de esa tabla y listar qué columnas/constraints existen, (d) comparar las dos listas explícitamente. Leer solo el código JS, o solo el schema, no habría encontrado ninguno de los dos bugs críticos.

5. **Generar múltiples documentos de transferencia en la misma sesión (`PROJECT_STATUS.md` + `CLAUDE_HANDOFF.md` en el turno anterior, `HANDOFF.md` + `AI_MEMORY.md` + `ARCHITECTURE.md` + `ROADMAP.md` + `CHANGELOG.md` + `README.md` reescrito en este turno) genera riesgo real de contenido contradictorio entre archivos si cada uno se escribe de forma aislada.** **Lección aplicada**: este documento declara explícitamente en su cabecera cuál es la relación de autoridad entre archivos (`HANDOFF.md`/`CLAUDE.md` como fuente de verdad más reciente, el resto derivado) precisamente para que una sesión futura sepa a cuál acudir si dos documentos parecen decir cosas distintas, en vez de tener que adivinar o releer todo el set completo para resolver la ambigüedad.

6. **Verificar sincronización de documentación (README/CLAUDE/ARCHITECTURE/ROADMAP/CHANGELOG) requiere primero confirmar cuáles de esos archivos existen** — `ARCHITECTURE.md`, `ROADMAP.md` y `CHANGELOG.md` no existían antes de esta sesión (se verificó con `ls *.md` antes de asumir que había que "sincronizarlos", lo cual habría sido un paso perdido si se hubiera asumido su existencia y saltado directo a editarlos). **Lección para el futuro**: ante un pedido de "sincronizar documentos X, Y, Z", verificar primero cuáles existen realmente en el filesystem antes de planear el trabajo — no asumir que un nombre de archivo mencionado por el usuario ya existe en el repo.
