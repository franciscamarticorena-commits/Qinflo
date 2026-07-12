# CLAUDE_HANDOFF — Léeme antes de tocar nada

> Este archivo es para la próxima instancia de Claude Code que retome este proyecto. Fue escrito al cierre de una sesión que hizo una auditoría profunda del código real (no solo de `CLAUDE.md`) porque la conversación anterior llegó a su límite práctico de contexto. **Léelo completo antes de escribir código.** El documento hermano `PROJECT_STATUS.md` (misma carpeta) tiene el detalle exhaustivo de todo lo que se resume acá — este archivo es el mapa, `PROJECT_STATUS.md` es el territorio.

## Orden de lectura al arrancar

1. `CLAUDE.md` (memoria persistente del proyecto — pero ver advertencia abajo).
2. Este archivo, completo.
3. `PROJECT_STATUS.md`, al menos las secciones 13 (bugs conocidos) y 15 (enfoques que no repetir) antes de tocar cualquier módulo.
4. `git log --oneline -15` y `git status` para confirmar que nada cambió desde que se escribió esto.

**Advertencia sobre `CLAUDE.md`**: es la fuente de verdad para el roadmap y las decisiones de producto, pero **contiene al menos una afirmación técnica incorrecta** verificada en esta sesión (dice que los eventos privados usan `participants === 'p1'/'p2'` — el código real usa `'mama'/'papa'`, y por eso los eventos privados no se pueden guardar hoy, ver más abajo). Ante cualquier duda sobre comportamiento real del código, verifica contra el código fuente y `supabase/migrations/*.sql`, no asumas que `CLAUDE.md` está actualizado al 100%.

---

## Qué NO volver a hacer (leer esto antes de escribir código)

Estas son reglas destiladas de errores ya cometidos y ya resueltos (o descubiertos y aún sin resolver) en este proyecto. Ignorarlas significa repetir investigaciones que ya se hicieron.

1. **Nunca envíes un `insert`/`update` a Supabase sin desestructurar y chequear `{ error }`.** Los dos bugs más graves de todo el proyecto (módulos de Hijos y Documentos, ver abajo) existen porque el código asumió que si no hubo excepción, la operación funcionó. Supabase-js v2 **no lanza excepciones** por errores de base de datos — los devuelve en el objeto de respuesta. Si escribes un `insert`/`update`/`upsert` nuevo, siempre haz `const { error } = await supa.from(...)...` y maneja `error`.

2. **Nunca envíes un objeto camelCase directo a `supa.from(tabla).insert()`.** Antes de escribir el payload, abre `supabase/migrations/001_initial_schema.sql` y `002_migration_compatibility.sql` y confirma los nombres de columna reales (snake_case) y sus `CHECK` constraints. El patrón correcto está en `expenses.js`/`events.js`/`agreements.js` (mapeo explícito campo por campo). El patrón que falló está en `children.js`/`documents.js` (spread directo del formulario).

3. **Nunca uses `new Date('YYYY-MM-DD')` para fechas de calendario/custodia.** Parsea como UTC medianoche, que en Chile retrocede un día. Usa `new Date(year, month, day)` (constructor de 3 números = medianoche local). Este bug ya costó una investigación de tres causas raíz entrelazadas (ver `PROJECT_STATUS.md` sección 14, error 2).

4. **Nunca decidas si regenerar el calendario basándote en si un mapa poblado por el listener realtime ya tiene datos** — el listener es async y puede no haber disparado en la primera carga. Usa siempre el valor persistido `cal_alg_version` en `families` como fuente de verdad.

5. **Nunca uses `.uid`** — siempre `.id`. Es la convención Supabase; `.uid` es un resto de Firebase. Ya existe una instancia viva de este error en `observability.js` (inofensiva solo porque Sentry/PostHog están apagados hoy).

6. **Nunca des un módulo por "terminado" solo porque la UI funciona.** Interactúa con los botones, sí, pero además abre la pestaña Network del navegador (o consulta la tabla directo en el dashboard de Supabase) para confirmar que el dato realmente se persistió. Los módulos de Hijos y Documentos tienen UI 100% funcional y llevan (probablemente) semanas sin guardar nada, sin que nadie lo notara.

7. **No reintroduzcas dependencia de Firebase Cloud Functions / Firestore triggers para nada nuevo** (push notifications, webhooks, etc.). Ese código (`functions/index.js`) ya quedó huérfano de la migración a Supabase y nunca se dispara. Si se retoma push notifications, la vía correcta es Supabase Edge Functions / Web Push directo, no Firebase Functions sobre Firestore.

8. **No toques el orden de carga de scripts en `index.html`** sin entender por qué es así: `app-shell.js` se carga último a propósito (depende de que todo lo anterior exista en scope global), y **cada archivo `.js` nuevo debe agregarse también a `STATIC_ASSETS` en `service-worker.js`**, con bump de `QINFLO_CACHE`, o los usuarios con la PWA instalada quedarán sirviendo versiones viejas indefinidamente.

9. **No apliques cambios de schema SQL sin mantenerlos idempotentes** (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`, etc.). Ya hubo que arreglar esto dos veces en la migración inicial.

---

## Qué decisiones NO deben revertirse

Estas son decisiones deliberadas, con razones válidas documentadas en detalle en `PROJECT_STATUS.md` sección 7-8. No las cuestiones sin releer primero el porqué:

- **Sin build step / sin bundler** — es una decisión de producto explícita para bajar riesgo y simplificar edición por IA, no un descuido.
- **Instancia global se llama `supa`, no `supabase`** — choca de nombre con el propio bundle UMD si se renombra.
- **UUID de familia generado en el cliente** (`crypto.randomUUID()`) en vez de leído del retorno del INSERT — es el fix del error de RLS documentado (sección 14, error 1). Revertir esto reintroduce ese bug.
- **`p1`/`p2` como roles neutrales en base de datos**, con labels resueltos en UI vía `familyConfig` — es lo que permite soportar `mama_papa`/`papa_papa`/`mama_mama` sin tocar schema.
- **Soft deletes (`deleted_at`) en vez de `DELETE` real** — preserva historial para el futuro "Timeline histórico" del roadmap de producto.
- **Mensajes inmutables, sin política DELETE** — decisión de producto explícita: nadie puede borrar mensajes, por diseño.
- **Un canal Realtime por familia con re-fetch completo de tabla** (no updates incrementales) — simplicidad deliberada, suficiente a la escala de 2 usuarios por familia.
- **Firebase Hosting se mantuvo solo para servir estáticos** tras migrar Auth/DB a Supabase — decisión pragmática para minimizar el radio de cambio de una migración ya grande. No es indecisión, fue deliberado.
- **Máximo una propuesta de cambio de custodia pendiente a la vez** — decisión de UX explícita para evitar solicitudes contradictorias.
- **No incorporar IA, chat complejo, transferencias de dinero, fotos, álbumes, geolocalización ni videollamadas** — principio de producto explícito en `CLAUDE.md`, "menos módulos, más hechos".

---

## Contexto indispensable que hay que conservar

- **Visión de producto**: Qinflo es un "sistema de verdad compartida", no un calendario/chat/app de gastos genérica. El principio rector es "disminuir carga mental, conversaciones repetidas y dependencia de la memoria" — cualquier feature nueva debe evaluarse contra ese filtro, no contra "sería útil tener X".
- **`p1` = quien se registró primero / creó la familia** (el invitante). `p2` = quien acepta la invitación. Es irreversible una vez asignado, no hay UI para intercambiar roles.
- **El modelo de datos vive en dos capas**: columnas snake_case reales en Postgres, y un modelo derivado camelCase con alias manuales agregados en cada `loadX()` de `app-shell.js`. Los nombres de campo camelCase **no siempre corresponden 1:1** con la columna real (ej. `paidBy` con valores `'mama'/'papa'` deriva de `paid_by_role` con valores `'p1'/'p2'`). Si vas a tocar un loader, lee el loader completo antes de asumir el mapeo.
- **Desarrollo directo en `main`**, sin flujo de PR de larga vida establecido como norma del proyecto (aunque las instrucciones de esta sesión específica pedían trabajar en una rama `claude/...` — revisa las instrucciones de la tarea actual para saber si aplica flujo de PR o push directo).
- **Repo**: `franciscamarticorena-commits/Qinflo`. **Producción**: `https://qinflo.cl` (Firebase Hosting, proyecto `quinflo`). **Supabase**: proyecto `xvfdncjrwrcbxgogzvym`.
- **No hay tests automatizados, no hay linter en CI, no hay observabilidad activa** (Sentry/PostHog configurados en código pero sin llaves). Esto significa que **cualquier regresión que introduzcas no será detectada por ninguna red de seguridad automatizada** — sé extra cuidadoso, especialmente con el patrón de verificar `{ error }` (regla 1 arriba).

---

## Los 3 bugs críticos que están en producción AHORA

Si el usuario pregunta "¿por qué no se guardó el hijo que agregué?" o similar, **ya se sabe la respuesta** — no hay que investigar desde cero:

1. **Módulo de Hijos (`children.js`) no persiste nada.** `saveKid()` envía columnas que no existen en la tabla `children` (`birthDate`, `age`, `clinic`, `schoolInsurance`, `bloodType`, `created_by`). El INSERT/UPDATE falla, pero como no se chequea `{ error }`, la UI se comporta como si hubiera funcionado.
2. **Módulo de Documentos (`documents.js`) no persiste nada.** `saveDoc()` envía `type` con valores que violan el `CHECK` constraint de esa columna (esos valores en realidad pertenecen a `category`), más `childId`/`url` que no son columnas reales.
3. **Eventos privados (`participants !== 'both'`) no se pueden crear.** El `<select>` de participantes usa `mama`/`papa`, pero la columna `events.participants` solo acepta `both`/`p1`/`p2` por CHECK constraint. Este caso sí muestra un `alert()` de error al usuario (a diferencia de los otros dos, que fallan en silencio).

**Detalle completo de la causa raíz de cada uno, con líneas de código exactas, está en `PROJECT_STATUS.md` sección 13.** El plan de arreglo recomendado (qué mapear a qué, qué decidir para cada campo huérfano) está en la sección 19, "Urgente".

Si el usuario simplemente dice "sigamos" o "retomemos" sin especificar tarea, **estos 3 bugs son candidatos naturales a priorizar antes que cualquier ítem del roadmap de features** — están afectando a usuarios reales ahora mismo y probablemente llevan tiempo sin detectarse justamente porque no hay observabilidad activa.

---

## Roadmap pendiente (por si el usuario pide continuar con eso en vez de los bugs)

De `CLAUDE.md`, todavía vigente al cierre de esta sesión:

| Tarea | Prioridad |
|---|---|
| SMTP personalizado (Resend) para emails desde `@qinflo.cl` | Alta |
| Emails en español (plantilla de recuperación de contraseña en Supabase) | Alta |
| Confirmación de email — revisar si conviene desactivarla | Alta |
| Verificar Google OAuth end-to-end en producción (especialmente Android, ver historial de intents en `PROJECT_STATUS.md` sección 14 error 3) | Alta |
| Push notifications (rehacer sobre Supabase, no Firebase Functions) | Baja |

---

## Estado exacto del repo al cierre de esta sesión

- Rama de trabajo: `claude/resume-main-14rwyc`, sincronizada 1:1 con `main` y `origin/main` en el commit `9fbe25d` (no hay commits nuevos de esta sesión de documentación todavía en el momento de escribir este párrafo — revisa `git log` para confirmar si ya se commitearon `PROJECT_STATUS.md`/`CLAUDE_HANDOFF.md`).
- Working tree limpio antes de esta sesión de documentación.
- Existen otras ramas remotas (`claude/agreements-list-ui-pGDd9`, `claude/new-session-77yvvr`, `claude/qinflo-dev-continue-4cbkft`, `claude/qinflo-supabase-migration-ojxr1z`) que en su momento tenían commits divergentes de `main` (trabajo de fases anteriores de la migración, ya incorporado a `main` a través de otros merges) — no asumas que hay que fusionar nada de ahí sin verificar primero si ese trabajo ya está incluido en `main`.

## Cómo retomar esta sesión

No hace falta releer todo el historial de commits ni re-explorar el código desde cero — este documento y `PROJECT_STATUS.md` son el resultado de haberlo hecho ya, en profundidad, verificando cada afirmación contra el código y el schema reales (no son un resumen de `CLAUDE.md`, son investigación original de esta sesión). Empieza directamente por preguntar al usuario si quiere:
(a) arreglar los 3 bugs críticos de producción, o
(b) seguir con el roadmap de infraestructura (SMTP/emails/OAuth), o
(c) otra cosa.

No hace falta volver a preguntar "¿con qué seguimos?" de forma genérica — ya se hizo esa pregunta en la sesión anterior y quedó sin responder por límite de contexto; probablemente lo primero que hay que hacer es retomarla con las opciones ya refinadas (los bugs críticos ahora son una opción concreta que antes no se sabía que existía).
