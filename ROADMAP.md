# ROADMAP.md — Roadmap de producto y técnico de Qinflo

> Consolida el roadmap de producto y el roadmap técnico en un solo documento de referencia. La fuente original de estas prioridades es `CLAUDE.md`; este archivo las presenta de forma más extensa y las cruza con los hallazgos técnicos de `HANDOFF.md`. Si hay una discrepancia entre este archivo y `CLAUDE.md` sobre qué está "completado" vs "pendiente", `CLAUDE.md` y `HANDOFF.md` tienen precedencia — actualiza este archivo para que coincida.

---

## Visión de producto (norte estratégico — no negociable sin el usuario)

> "Qinflo no reemplaza al otro padre o madre. Reemplaza la necesidad de recordar y volver a conversar lo mismo."

Qinflo es un **sistema de verdad compartida**, no un calendario, ni un chat, ni una app de gastos. Principio de producto: disminuir carga mental, conversaciones repetidas y dependencia de la memoria — la coordinación debe basarse en hechos, no en mensajes. Principio de diseño: menos módulos, más hechos, menos conversaciones, más claridad compartida.

**Qué NO incorporar** (regla explícita, no una omisión por evaluar): IA conversacional, chat complejo, transferencias de dinero, fotos, álbumes, geolocalización, videollamadas, módulos adicionales innecesarios.

---

## Roadmap de producto (por orden de impacto declarado)

1. **Pantalla Hoy (centro de mando)** — Al abrir, entender qué pasa en menos de 5 segundos: con quién están los niños, próximo cambio, próximos eventos (7 días), esperando respuesta, recordatorios, balance. **Estado: implementado** (`today.js`).

2. **"Esperando respuesta"** (nunca llamarlo "Pendientes") — Una sola tarjeta que agrupa cambio de custodia pendiente, evento por confirmar, gasto por confirmar, acuerdo por revisar, mostrando quién solicitó, fecha y estado. **Estado: implementado** (`today.js _todayPendingRequests()`), aunque no incluye "gasto por confirmar" ni "acuerdo por revisar" como categorías propias hoy — solo propuestas de custodia, eventos por confirmar y avisos de hoy. Evaluar si conviene extenderlo para cubrir esos dos casos también, coherente con la descripción original.

3. **Actividad** — Tarjeta dentro de Pantalla Hoy, no módulo independiente. Lista cronológica de hechos ("Mamá confirmó recepción de los niños", "Papá aprobó cambio Día del Padre", "Gasto uniforme registrado"). Objetivo: transformar conversaciones en hechos. **Estado: implementado parcialmente** (`activity.js` + `logActivity()`) — el feed existe y funciona, pero **no todas las acciones del sistema llaman a `logActivity()`** (es best-effort, cubre creación/aprobación/rechazo de propuestas y eventos, no cubre por ejemplo edición de acuerdos o registro de gastos de forma completa). No es un audit log exhaustivo todavía.

4. **Timeline histórico** — Historial único por fecha que incluye eventos, gastos, cambios de custodia, acuerdos, confirmaciones. Objetivo: eliminar "no me acuerdo", "nunca me dijiste", "¿cuándo fue?". **Estado: NO implementado.** Los datos existen dispersos en sus tablas respectivas (con soft-delete preservando historial), pero no hay ninguna vista unificada cronológica que los combine. Es el ítem de mayor impacto de producto pendiente en el roadmap original.

5. **Confirmaciones** — Solo para días de cambio de casa. Registra quién confirmó, fecha y hora exacta — genera realidad compartida verificable. **Estado: implementado parcialmente.** Existe `confirmKidsWithMe()` en `today.js`, que escribe `families.last_pickup` (JSONB con uid/role/timestamp) y llama a `logActivity()`. La tabla `custody_confirmations` está en el schema (`001_initial_schema.sql`) pero **sin ningún uso en el código** — el registro actual vive solo en un campo JSONB de la familia (`last_pickup`), que se sobreescribe en cada confirmación nueva, sin historial de confirmaciones pasadas. Para cumplir la visión completa ("realidad compartida verificable"), se necesitaría persistir cada confirmación como una fila en `custody_confirmations` en vez de sobreescribir un único campo.

6. **Google Calendar** — Sincronización bidireccional para no duplicar trabajo (largo plazo). **Estado: NO implementado.** El schema ya tiene columnas preparadas en `events` (`source` con valores `'qinflo'`/`'google_calendar'`, `google_event_id`), pero no existe ninguna integración real. Es explícitamente "largo plazo" en la visión original — no priorizar sobre el resto del roadmap de producto ni sobre los bugs técnicos urgentes.

---

## Roadmap técnico

### Urgente — bugs activos en producción (hallazgo de auditoría, no en el roadmap original)

Estos no estaban en ningún roadmap previo porque no habían sido detectados — no hay observabilidad activa en producción. Detalle completo con líneas de código exactas en `HANDOFF.md` sección 7 y `PROJECT_STATUS.md` sección 13.

| Ítem | Descripción |
|---|---|
| Arreglar módulo de Hijos | `children.js saveKid()` envía columnas inexistentes en la tabla real — no persiste nada |
| Arreglar módulo de Documentos | `documents.js saveDoc()` viola un CHECK constraint y envía columnas inexistentes — no persiste nada |
| Arreglar eventos privados | `events.participants` solo acepta `p1`/`p2`/`both`; el código envía `mama`/`papa`/`both` — falla el CHECK |
| Agregar verificación de `{ error }` | Sistemático en `children.js`, `documents.js`, `reminders.js`, `agreements.js` |
| Timestamp de mensajes roto | `messages.js` usa API de Firestore Timestamp (`.toDate()`) sobre un string ISO de Supabase |
| Variables indefinidas en logs de actividad | `calendar.js saveProp()` (`from`/`to`), `today.js acceptPropInline`/`rejectPropInline` (`fromDay`/`toDay`) |

### Alta prioridad (roadmap técnico ya explícito en `CLAUDE.md`)

| Ítem | Descripción |
|---|---|
| SMTP personalizado (Resend) | Emails desde `@qinflo.cl`, evitar spam |
| Emails en español | Plantilla de recuperación de contraseña en Supabase Auth |
| Confirmación de email | Revisar si conviene mantenerla activada en Supabase Auth |
| Verificación de Google OAuth end-to-end | Especialmente en Android — historial de problemas de intents con el flujo Firebase anterior, no reverificado tras la migración a Supabase |

### Media prioridad (higiene / deuda técnica)

| Ítem | Descripción |
|---|---|
| Activar Sentry | Aunque sea free tier — hoy no hay ninguna visibilidad de errores en producción; alto apalancamiento dado el hallazgo de bugs silenciosos |
| Limpiar infraestructura Firebase muerta | CI (`firestore:rules`/`functions`), `firebase.js`, `firebase-messaging-sw.js`, `firestore.rules`, `functions/` |
| Corregir `user.uid` → `user.id` en `observability.js` | Antes de activar llaves de Sentry/PostHog |
| Sincronizar `README.md` con la estructura real | Hecho en la sesión de documentación del 2026-07-12 — ver `CHANGELOG.md` |

### Baja prioridad (largo plazo)

| Ítem | Descripción |
|---|---|
| Push notifications reales | Reconstruir sobre Supabase (Edge Functions / Web Push), no Firebase Cloud Functions sobre Firestore (código actual huérfano) |
| Sincronización Google Calendar | Ítem 6 del roadmap de producto |
| Confirmaciones con historial completo | Migrar de `families.last_pickup` (JSONB, se sobreescribe) a filas en `custody_confirmations` |
| Timeline histórico unificado | Ítem 4 del roadmap de producto — el de mayor impacto de producto aún sin implementar |

---

## Cómo se prioriza en este proyecto

Cuando no hay instrucción explícita del usuario sobre qué abordar, el orden recomendado es: **bugs activos en producción primero** (afectan usuarios reales ahora), **luego roadmap técnico de infraestructura ya comprometido** (SMTP, emails, OAuth), **luego higiene/observabilidad** (activar Sentry tiene alto apalancamiento porque destaparía bugs no documentados), **y recién después roadmap de producto nuevo**. Ver `AI_MEMORY.md` sección "Cómo priorizar cuando el usuario no especifica qué hacer" para el detalle de esta heurística.
