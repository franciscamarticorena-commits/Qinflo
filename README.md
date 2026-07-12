# Qinflo

PWA de coordinación de custodia compartida para padres separados. En producción en [qinflo.cl](https://qinflo.cl).

> "Qinflo no reemplaza al otro padre o madre. Reemplaza la necesidad de recordar y volver a conversar lo mismo."

Qinflo es un sistema de verdad compartida — no un calendario, no un chat, no una app de gastos. Ver `ROADMAP.md` para la visión de producto completa.

## Documentación

Este repo mantiene documentación extensa y activamente sincronizada con el código. Empieza por acá según lo que necesites:

| Documento | Para qué sirve |
|---|---|
| `CLAUDE.md` | Memoria persistente del proyecto — visión de producto, fases completadas, roadmap, decisiones de diseño, bugs conocidos. **Léelo primero.** |
| `HANDOFF.md` | Transferencia de conocimiento exhaustiva: arquitectura, decisiones técnicas y de UX con su motivo, errores ya resueltos, bugs pendientes, dependencias entre módulos, deuda técnica |
| `AI_MEMORY.md` | Manual de comportamiento para sesiones de IA: patrones a seguir, errores a evitar, decisiones que no deben reabrirse |
| `ARCHITECTURE.md` | Arquitectura técnica como referencia standalone |
| `ROADMAP.md` | Roadmap de producto + técnico consolidado, priorizado |
| `CHANGELOG.md` | Historial de fases y commits significativos |
| `PROJECT_STATUS.md` | Auditoría detallada de una sesión previa, con cita textual de cada bug encontrado en el código |

Si dos documentos parecen contradecirse, `HANDOFF.md` y `CLAUDE.md` son la fuente de verdad más reciente. Ante cualquier duda sobre comportamiento real, verifica contra el código fuente y `supabase/migrations/*.sql`.

## Stack

- **Frontend**: HTML + CSS + JavaScript vanilla. Sin build step, sin bundler, sin framework. Los módulos `.js` se cargan como `<script>` clásicos secuenciales desde `index.html` y comparten scope global.
- **Auth + DB + Realtime**: [Supabase](https://supabase.com) — Auth (email/password + Google OAuth), PostgreSQL con Row Level Security, Realtime vía `postgres_changes`.
- **Hosting**: Firebase Hosting (solo sirve archivos estáticos — no hay Auth ni Firestore activos pese a quedar código huérfano en el repo, ver más abajo).
- **Iconos**: [Lucide](https://lucide.dev).
- **CI/CD**: GitHub Actions, deploy automático a cada push a `main`.

Ver `ARCHITECTURE.md` para el detalle completo.

## Estructura del repo

Estructura **plana** — todo en la raíz, sin `src/`:

```
Qinflo/
├── index.html              # SPA completa + orden de carga de scripts
├── styles.css               # Estilos únicos
├── supabase.js               # Cliente Supabase (instancia global `supa`)
├── state.js                  # Estado global + helpers
├── auth.js, connect.js, app-shell.js, onboarding.js
├── calendar.js, events.js, expenses.js, messages.js
├── children.js, agreements.js, reminders.js, documents.js
├── activity.js, today.js, resources.js, theme.js, observability.js
├── manifest.json, service-worker.js    # PWA
├── supabase/migrations/*.sql            # Schema PostgreSQL (fuente de verdad de columnas/constraints)
└── .github/workflows/                   # CI
```

**Nota**: si en algún momento ves referencias a carpetas `js/`, `css/`, o a `capacitor.config.json`, son restos de una etapa de planificación anterior a la migración a Supabase — ya no existen. La estructura real es la de arriba, siempre plana.

## Estado del proyecto

El proyecto está en producción y es funcional en su mayoría, pero **tiene 3 bugs conocidos activos ahora mismo** (módulos de Hijos y Documentos no persisten datos, eventos privados no se pueden crear) — sin observabilidad activa en producción, así que no hay garantía de que sean los únicos. Detalle completo, con la línea de código exacta de cada uno, en `HANDOFF.md` sección 7 / `PROJECT_STATUS.md` sección 13.

## Desarrollo

No hay `npm install` para el frontend — es JS vanilla servido directo. Para trabajar en el proyecto, basta con clonar el repo y abrir `index.html` (aunque para probar contra datos reales necesitas las credenciales de Supabase ya configuradas en `supabase.js`, apuntando al proyecto de producción — no hay entorno de staging separado hoy).

Antes de escribir código nuevo, lee `AI_MEMORY.md` — resume los patrones y errores ya conocidos de este proyecto específico (verificación de errores de Supabase, manejo de fechas de calendario, convención de nombres de columna) para no repetir bugs ya documentados.

## Deploy

Cada push a `main` dispara `.github/workflows/firebase-hosting-deploy.yml`, que despliega el contenido estático a Firebase Hosting (proyecto `quinflo`, dominio `qinflo.cl`). El workflow también intenta desplegar Firestore Rules y Cloud Functions — son pasos huérfanos de la era pre-Supabase, no bloqueantes (`continue-on-error: true`), pendientes de limpieza (ver `HANDOFF.md` sección 15).
