# AI_MEMORY.md — Memoria permanente para sesiones de Claude Code

> Este archivo no es un resumen del proyecto — para eso está `HANDOFF.md` (transferencia de estado) y `CLAUDE.md` (memoria de producto/roadmap). **Este archivo es un manual de comportamiento**: cómo piensa este proyecto, qué patrones seguir sin tener que redescubrirlos, qué errores evitar, y qué decisiones ya están tomadas y no deben reabrirse a discusión salvo pedido explícito del usuario. Léelo antes de escribir la primera línea de código en cualquier sesión nueva.

---

## Cómo piensa este proyecto

Qinflo tiene una filosofía de producto y una filosofía técnica, y ambas son deliberadamente minimalistas — no por falta de ambición, sino como principio activo.

**Filosofía de producto**: "menos módulos, más hechos". Cada decisión de feature se filtra por si reduce carga mental y dependencia de la memoria/conversación repetida entre dos padres separados, o si la aumenta. Una feature técnicamente interesante que agrega una pantalla nueva, un flujo nuevo, o una decisión nueva que dos personas tienen que negociar, probablemente va en contra de la visión del producto aunque sea "útil" en abstracto. Antes de proponer una feature nueva, pregúntate: ¿esto convierte una conversación en un hecho verificable, o agrega una conversación nueva?

**Filosofía técnica**: sin build step, sin framework, sin abstracciones que no estén ya resueltas por el problema concreto que se está resolviendo. El proyecto ha tenido 10+ fases de desarrollo y nunca introdujo un bundler, un framework de frontend, o un ORM — no por desconocimiento, sino porque la simplicidad de "todo en scope global, editable archivo por archivo" ha sido, hasta ahora, más valiosa que las garantías que un stack más sofisticado daría. **No propongas migrar a React/Vue/TypeScript/un bundler "porque sería mejor arquitectura"** salvo que el usuario lo pida explícitamente — sería resolver un problema que este proyecto decidió activamente no tener.

Esto tiene un costo real y conocido: cero red de seguridad automatizada (sin tests, sin linter, sin tipos), y ese costo ya se materializó en los bugs de persistencia de Hijos y Documentos (ver `HANDOFF.md` sección 7). El proyecto ha optado por mitigar ese costo con **verificación manual disciplinada** en vez de tooling — lo cual funciona solo si cada sesión mantiene la disciplina. Esa disciplina es, en buena medida, lo que este archivo existe para transferir.

---

## Patrones a seguir

1. **Antes de escribir cualquier `insert`/`update`/`upsert` contra Supabase**: abre el `CREATE TABLE` real en `supabase/migrations/001_initial_schema.sql` o `002_migration_compatibility.sql`, lista las columnas y sus `CHECK` constraints, y construye el payload campo por campo en snake_case explícito — nunca hagas spread de un objeto de formulario camelCase directo al `insert()`. Este es el patrón correcto que ya existe en `expenses.js`/`events.js`/`agreements.js`; el patrón que falló y produjo los 2 bugs críticos del proyecto está en `children.js`/`documents.js`.

2. **Siempre desestructura y verifica `{ error }`** de cada llamada a Supabase. Supabase-js v2 no lanza excepciones por errores de base de datos — las devuelve en la respuesta. Si no verificas `error`, un fallo de constraint, de RLS, o de columna inexistente pasa completamente desapercibido y la UI se comporta como si hubiera funcionado.

3. **Para cualquier fecha de calendario/custodia**, usa `new Date(year, month, day)` (constructor de 3 números, medianoche local), nunca `new Date('YYYY-MM-DD')` (parsea UTC, se corre un día en Chile). Este es el bug de timezone más caro que ya tuvo el proyecto — no lo repitas.

4. **Para decidir si algo "ya está cargado" o "ya está actualizado" en el cliente**, usa un valor de versión persistido server-side (como `cal_alg_version`), nunca el estado de un mapa poblado por un listener realtime — el listener es asíncrono y puede no haber disparado todavía en el momento en que decides.

5. **`$(id)` en vez de `document.getElementById(id)`**, `show(id)`/`hide(id)` en vez de manipular `style.display` directo, `toCamel()`/alias del loader correspondiente en vez de leer columnas snake_case directo en una función `renderX()`. Sigue el estilo del archivo que edites — no introduzcas un patrón nuevo (arrow functions, clases, `const` sistemático) en un archivo que usa `var`/`function` en todos lados.

6. **Cualquier archivo `.js` nuevo referenciado en `index.html` va también en `STATIC_ASSETS` de `service-worker.js`**, con bump de `QINFLO_CACHE`. Cualquier cambio de contenido a un archivo ya cacheado también requiere ese bump.

7. **`p1`/`p2` en base de datos, labels dinámicos en UI vía `p1()`/`p2()`.** Nunca hardcodees "Mamá"/"Papá" en lógica nueva — usa los helpers, que resuelven el label correcto según `familyConfig.type` (`mama_papa`/`papa_papa`/`mama_mama`).

8. **Soft delete (`deleted_at = nowISO()`) para expenses/children/documents/agreements/reminders.** Nunca `.delete()` en esas tablas. Mensajes son inmutables — ni siquiera soft delete, no hay política DELETE por diseño.

9. **Cambios de custodia siempre vía flujo propuesta→aceptar/rechazar (`custody_changes`)**, nunca edición directa de un día salvo a través del RPC `set_custody_day` (que sí es edición directa pero server-side atómica, usado para overrides puntuales, no para el flujo de negociación entre padres).

10. **Antes de dar un módulo por "terminado"**, no te bases solo en que los botones responden y la UI no tira error visible. Abre la pestaña Network o consulta la tabla directo en el dashboard de Supabase para confirmar que el dato persistió. Este es, literalmente, el patrón de verificación que habría detectado los bugs de Hijos y Documentos antes de que llegaran a producción.

---

## Errores a evitar (destilado, ver `HANDOFF.md` para el detalle completo)

- No confíes en que "si no lanzó excepción, funcionó" con Supabase-js.
- No envíes objetos camelCase sin traducir a la tabla real.
- No uses `new Date('YYYY-MM-DD')` para fechas de calendario.
- No decidas "¿ya está actualizado?" basándote en el estado de un listener async.
- No uses `.uid` — siempre `.id` (Supabase, no Firebase). Ya existe una instancia viva de este error exacto en `observability.js`, documentada pero no corregida — no la repitas en código nuevo, y si tocas ese archivo, corrígela.
- No reintroduzcas Firebase Cloud Functions / Firestore triggers para nada nuevo (push notifications u otro). Ese patrón quedó huérfano de la migración a Supabase.
- No toques una columna, tabla o `CHECK` constraint del schema sin `grep -rn` de su nombre en todos los `.js` primero — no hay compilador que te avise de una referencia rota.
- No asumas que `CLAUDE.md` (ni ningún documento, incluido este) está 100% sincronizado con el comportamiento real del código. Ya se encontró al menos un caso (eventos privados `p1`/`p2` vs `mama`/`papa`) donde la documentación describía la intención de diseño, no el comportamiento real. Verifica contra el código fuente cuando algo importa.
- No agregues manejo de errores, validación o abstracciones para escenarios que no pueden pasar. El proyecto confía en las garantías del framework/DB salvo en los bordes reales del sistema (input de usuario, APIs externas como `mindicador.cl`).
- No propongas build step, framework de frontend, ORM, o TypeScript salvo pedido explícito — ver "filosofía técnica" arriba.

---

## Decisiones que NO deben volver a discutirse

Estas ya se decidieron, con motivo documentado en `HANDOFF.md` sección 3-4 y `PROJECT_STATUS.md` sección 7-8. Si el usuario no pide explícitamente reabrirlas, trátalas como cerradas:

- Sin build step, sin bundler, JS vanilla con `<script>` secuencial.
- Instancia de Supabase llamada `supa`, nunca `supabase`.
- `p1`/`p2` como roles neutrales en base de datos, con labels dinámicos.
- UUID de familia generado en el cliente (`crypto.randomUUID()`) durante el registro — es un fix de un bug de RLS ya resuelto, no una implementación ingenua a "mejorar".
- RPCs `SECURITY DEFINER` para `accept_invitation`/`set_custody_day` en vez de encadenar escrituras desde el cliente.
- Un canal Realtime por familia con re-fetch completo de tabla (no merge incremental) — suficiente a la escala de 2 usuarios por familia.
- Soft deletes en vez de DELETE real.
- Mensajes inmutables, sin política DELETE.
- Firebase Hosting solo para estáticos, Supabase para todo el backend — decisión pragmática de minimizar radio de cambio de la migración, no indecisión a resolver "algún día".
- Máximo una propuesta de cambio de custodia pendiente a la vez.
- No incorporar IA conversacional, chat complejo, transferencias de dinero, fotos, álbumes, geolocalización, videollamadas — principio de producto explícito, no una omisión.
- Desarrollo directo en `main` como norma general del proyecto (aunque sesiones individuales puedan operar sobre una rama `claude/...` según instrucciones de esa sesión específica — eso es una instrucción operativa de sesión, no un cambio de la norma del proyecto).

Si el usuario pide reabrir alguna de estas, está en su derecho — pero no las reabras por iniciativa propia asumiendo que "se podría mejorar".

---

## Cómo priorizar cuando el usuario no especifica qué hacer

Si una sesión arranca con algo genérico ("retomemos", "sigamos", "¿qué falta?"), el orden de prioridad recomendado, salvo que el usuario indique otra cosa, es:

1. **Bugs activos en producción** (hoy: los 3 documentados en `HANDOFF.md` sección 7 — Hijos, Documentos, eventos privados). Afectan usuarios reales ahora mismo, no son trabajo especulativo.
2. **Roadmap técnico de infraestructura ya explícito** en `CLAUDE.md`/`ROADMAP.md` (SMTP, emails en español, confirmación de email, verificación de Google OAuth).
3. **Activar observabilidad (Sentry)** — apalancamiento alto: destaparía automáticamente bugs no documentados aquí.
4. **Roadmap de producto** (Timeline histórico, Confirmaciones, Google Calendar) — features nuevas, la prioridad más baja de las cuatro salvo pedido explícito del usuario.

No le preguntes al usuario "¿con qué seguimos?" de forma completamente abierta si ya existe un roadmap priorizado escrito — ofrécele las opciones concretas ya ordenadas (ver `HANDOFF.md` sección 12 o `ROADMAP.md`) para que decidir sea más rápido que releer todo el roadmap desde cero.

---

## Cómo mantener la documentación sincronizada

Este proyecto ahora tiene un set de documentos con responsabilidades distintas — no dupliques contenido libremente entre ellos, actualiza el dueño correcto:

- **`CLAUDE.md`**: memoria persistente de producto — visión, fases completadas, roadmap, decisiones de diseño resumidas, bugs conocidos (versión corta). Se actualiza en cada sesión que cambie algo relevante a estos temas.
- **`HANDOFF.md`**: transferencia de conocimiento exhaustiva del estado técnico — se regenera o actualiza cuando una sesión larga termina y hay riesgo real de perder contexto acumulado (no en cada sesión chica).
- **`AI_MEMORY.md`** (este archivo): patrones de comportamiento y decisiones cerradas — se actualiza solo cuando se aprende un patrón nuevo genuinamente reutilizable o se cierra una decisión nueva a discusión futura. No lo reescribas por completo cada sesión; agrégale.
- **`ARCHITECTURE.md`**: referencia técnica de arquitectura — se actualiza cuando la arquitectura misma cambia (nuevo proveedor, nuevo patrón de datos, nuevo mecanismo de realtime), no cuando cambia una feature de producto.
- **`ROADMAP.md`**: roadmap de producto + técnico consolidado — se actualiza cuando se completa o reprioriza algo del roadmap.
- **`CHANGELOG.md`**: historial — se agrega una entrada nueva cuando se completa una fase o un fix significativo, nunca se reescribe el pasado salvo error factual.
- **`README.md`**: punto de entrada para alguien (humano o IA) que abre el repo por primera vez — debe reflejar la estructura de archivos y el stack **reales**, no un histórico ni un plan. Si cambia la estructura de carpetas, el stack, o el flujo de deploy, actualízalo ese mismo cambio.

Si en algún momento dos documentos parecen contradecirse, `HANDOFF.md` (o su versión más reciente) y `CLAUDE.md` son la fuente de verdad — el resto se deriva de ellos y puede haber quedado desactualizado si no se sincronizó a tiempo. Verifica siempre contra el código fuente si la duda es sobre comportamiento real, no solo contra la documentación.

---

## Nota sobre esta misma memoria

Este archivo se escribió en la misma sesión que `HANDOFF.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `CHANGELOG.md` y la reescritura de `README.md` (2026-07-12), como parte de un pedido explícito del usuario de dejar el proyecto preparado para cerrar la conversación sin perder contexto. No es un documento generado automáticamente ni derivado mecánicamente de otro — fue escrito leyendo el código fuente real del proyecto y el historial de commits, con verificación cruzada contra el schema SQL en los puntos donde importaba (ver `HANDOFF.md` sección 16, Lessons Learned, para el detalle de cómo se condujo esa verificación). Trátalo como una fuente confiable, y a la vez, actualízalo si descubres que algo aquí ya no aplica — no dejes que se vuelva otro documento desincronizado como le pasó a `README.md` antes de esta sesión.
