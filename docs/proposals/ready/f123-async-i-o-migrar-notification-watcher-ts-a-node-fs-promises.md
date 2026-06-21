---
id: f123
status: ready
type: proposal
track: notification-plugin
date: 2026-06-21
---

# f123 — Async I/O — migrar notification/watcher.ts a node:fs/promises

## Goal

Cerrar el hallazgo H2 (P0) de la auditoría a022 migrando `plugins/notification/src/lib/watcher.ts` de fs síncrono a `node:fs/promises` (o a `walkAllowedFiles` del core si aplica).

El bug: el watcher invoca `existsSync`/`readdirSync`/`readFileSync` (líneas 25, 138, 179, 222-224, 237, 240, 282) dentro de `check()` que corre por `setInterval` cada N ms. AGENTS.md es explícito en el invariante 3: "Async I/O only in hot paths. No `*Sync` filesystem calls inside tool handlers or engines (boot-time one-shots are the documented exception)".

El fix tiene 3 componentes:

1. Reemplazar cada `existsSync`/`readdirSync`/`readFileSync` por su equivalente `node:fs/promises` (`access` o `stat`, `readdir`, `readFile`). Encadenar con `await`.
2. Asegurar que `setInterval` no solapa ejecuciones: usar un `inFlight: Promise<void> | null` y, si hay una en curso, saltarse el tick (no encolar). Alternativamente, sustituir `setInterval` por un `setTimeout` recursivo que se reprograma al terminar.
3. Considerar usar `walkAllowedFiles` del core (exportado en el barrel) si la lógica del watcher es esencialmente "listar archivos bajo `ctx.workspace` que coincidan con un patrón" — esto elimina la duplicación y respeta el invariante de "Workspace-scoped path inputs must be contained".

Acceptance:
- `bun run validate` verde.
- 0 invocaciones de `*Sync` de `node:fs` en el archivo (verificable con `grep -E 'Sync\(' plugins/notification/src/lib/watcher.ts`).
- Spec nuevo en `plugins/notification/tests/` que valide: (a) el watcher no bloquea el event loop durante un tick (medir max latency); (b) ticks concurrentes se saltan, no se encolan; (c) un archivo nuevo en `ctx.workspace` se detecta y dispara la notificación.
- `bun run lint:proposals` valida este documento.
- Cita cruzada desde `a022` (H2).

## Slices

- global_gate: lint

### s1 — Migrar watcher.ts a fs/promises + serializar ticks
- files: plugins/notification/src/lib/watcher.ts
- gate: e2e
- acceptance:
  - "0 invocaciones *Sync de node:fs en el archivo"
  - "Ticks concurrentes se saltan (no encolan)"
  - "Detección de archivos nuevos preservada"
- status: pending

### s2 — Spec de no-bloqueo y de detección de archivos nuevos
- files: plugins/notification/tests/src/lib/watcher.spec.ts
- gate: e2e
- acceptance:
  - "Test de max latency del event loop durante un tick"
  - "Test de tick saltado cuando hay uno en vuelo"
  - "Test de detección de archivo nuevo dispara notificación"
- status: pending
