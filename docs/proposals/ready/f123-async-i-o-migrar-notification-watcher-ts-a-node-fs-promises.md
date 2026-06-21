---
id: f123
kind: feat
title: Async I/O — migrar notification/watcher.ts a node:fs/promises
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

## Why

- El watcher corre en cada host MCP que carga el plugin `notification`. En un swarm con 9 plugins cargados, el event loop se bloquea cada N ms en proporción al tamaño de `ctx.workspace`, latencia que se observa como "stalls" en otras tools (`search_search`, `docs_docs_read`).
- AGENTS.md, invariante 3: "Async I/O only in hot paths. No `*Sync` filesystem calls inside tool handlers or engines (boot-time one-shots are the documented exception)". El watcher es exactamente un engine de hot path (polling continuo).
- La primitiva `walkAllowedFiles` ya está en el barrel del core y respeta el path containment (resuelve el invariante 5 simultáneamente).
- Es el **único** plugin con sync I/O en su hot path. La corrección es local y elimina una clase entera de stalls de baja prioridad.

## Non-goals

- Reescribir el watcher como `chokidar` o `node:fs.watch` (cambio de paradigma, fuera de scope).
- Cambiar la API pública del plugin (los nombres de tools y sus shapes quedan iguales).
- Modificar la cadencia del polling; el interval configurable queda como está.

## Slices

### S1 — Migrar watcher.ts a fs/promises + serializar ticks
  - **Status**: ready
  - **Files**: `plugins/notification/src/lib/watcher.ts`
  - **Command**: `bun run validate`
  - **Expect**: green; 0 invocaciones `*Sync` de `node:fs` en el archivo; ticks concurrentes se saltan; detección de archivos nuevos preservada.
  - **Acceptance**:
    - 0 invocaciones `*Sync` de `node:fs` (verificable con `grep -E 'Sync\(' plugins/notification/src/lib/watcher.ts`)
    - Ticks concurrentes se saltan (no encolan)
    - Detección de archivos nuevos preservada
    - Considerar `walkAllowedFiles` del core si reduce duplicación

### S2 — Spec de no-bloqueo y de detección de archivos nuevos
  - **Status**: ready
  - **Files**: `plugins/notification/tests/src/lib/watcher.spec.ts`
  - **Command**: `bunx vitest run plugins/notification/tests/src/lib/watcher.spec.ts && bun run validate`
  - **Expect**: green; 3 tests nuevos que cubren max latency del event loop, tick saltado, y detección de archivo nuevo.
  - **Acceptance**:
    - Test de max latency del event loop durante un tick (medido con `performance.now()` en handler)
    - Test de tick saltado cuando hay uno en vuelo
    - Test de detección de archivo nuevo dispara notificación

## Acceptance

- [ ] `bun run validate` es verde.
- [ ] 0 invocaciones de `*Sync` de `node:fs` en el archivo (verificable con `grep -E 'Sync\(' plugins/notification/src/lib/watcher.ts`).
- [ ] Spec nuevo en `plugins/notification/tests/src/lib/watcher.spec.ts` que valide: (a) el watcher no bloquea el event loop durante un tick (medir max latency); (b) ticks concurrentes se saltan, no se encolan; (c) un archivo nuevo en `ctx.workspace` se detecta y dispara la notificación.
- [ ] `bun run lint:proposals` valida este documento.
- [ ] Cita cruzada desde `a022` (H2) marcada en el checklist.

## Risks and mitigations

- **R1**: el refactor a `fs/promises` cambia la semántica de error de "lanza sync" a "rechaza promise". **Mitigación**: ajustar los call-sites para usar `try/catch` en lugar de dejar que el sync lance.
- **R2**: si `walkAllowedFiles` no encaja exactamente con la lógica del watcher, forzar su uso introduce un wrapper. **Mitigación**: si S1 muestra fricción, dejar `fs/promises` directo y documentar por qué `walkAllowedFiles` no aplica aquí.
- **R3**: el test de "max latency" es flaky por naturaleza (depende del scheduler del OS). **Mitigación**: medir en un bucle de N=100 ticks y exigir p99 < 5ms, no el caso individual.

## Notes

- **Auditoría origen**: `a022-21-06-2026-copilot-minimax-m3-repositorio.md` (H2, severidad P0).
- **Primitiva candidata del core**: `walkAllowedFiles` (exportada en `packages/core/src/public/index.ts`).
- **Invariante que rompe**: AGENTS.md regla 3 ("Async I/O only in hot paths").
- **Tamaño del fix**: un solo archivo + un spec. Impacto desproporcionado: elimina la única fuente de stalls por sync I/O en todo el monorepo.
- **Follow-up natural**: si se aprueba, abre el camino a una segunda iteración que migre también el bootstrap CLI del host a `walkAllowedFiles`, ganando contención de paths en boot-time.
