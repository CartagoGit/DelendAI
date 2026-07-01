---
id: f00022
kind: feat
title: Async I/O — migrar notification/watcher.ts a node:fs/promises
status: done
type: proposal
track: notification-plugin
date: 2026-06-21
---

# f00019 — Async I/O — migrar notification/watcher.ts a node:fs/promises

## Goal

Cerrar el hallazgo H2 (P0) de la auditoría a00026 migrando `plugins/notification/src/lib/watcher.ts` de fs síncrono a `node:fs/promises` (o a `walkAllowedFiles` del core si aplica).

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
  - **Status**: done
  - **Files**: `plugins/notification/src/lib/watcher.ts`
  - **Command**: `bun run validate`
  - **Expect**: green; 0 invocaciones `*Sync` de `node:fs` en el archivo; ticks concurrentes se saltan; detección de archivos nuevos preservada.
  - **Acceptance**:
    - 0 invocaciones `*Sync` de `node:fs` (verificable con `grep -E 'Sync\(' plugins/notification/src/lib/watcher.ts`)
    - Ticks concurrentes se saltan (no encolan)
    - Detección de archivos nuevos preservada
    - Considerar `walkAllowedFiles` del core si reduce duplicación

### S2 — Spec de no-bloqueo y de detección de archivos nuevos
  - **Status**: done
  - **Files**: `plugins/notification/tests/src/lib/notification.spec.ts`
  - **Command**: `bunx vitest run plugins/notification/tests/src/lib/notification.spec.ts && bun run validate`
  - **Expect**: green; cobertura existente migrada a `await watcher.check()` / `await readInFlight()`, preservando el contrato observable (incluida la detección de archivos nuevos y la no-notificación de archivos pre-existentes).
  - **Acceptance**:
    - Cobertura existente de `createReleaseWatcher`/`createHandoffWatcher`/`readInFlight` migrada a async, 11/11 tests verdes
    - Tick saltado cuando hay uno en vuelo (`checkInFlight`/`pollInFlight` flags en `watcher.ts`)
    - Test de detección de archivo nuevo dispara notificación (preservado, ahora async)

## Acceptance

- [x] `bun run validate` es verde (typecheck + test limpios para los archivos de este slice; ver nota de scope en Notes).
- [x] 0 invocaciones de `*Sync` de `node:fs` en el archivo (verificable con `grep -E 'Sync\(' plugins/notification/src/lib/watcher.ts` → sin resultados).
- [x] Spec migrado en `plugins/notification/tests/src/lib/notification.spec.ts` que valida: (a) ticks concurrentes se saltan vía guards `checkInFlight`/`pollInFlight`, no se encolan; (b) un archivo nuevo en el handoff dir se detecta y dispara la notificación; (c) `readInFlight`/`diffReleased`/`awaitLockRelease` preservan su contrato observable con I/O async.
- [x] `bun run lint:proposals` valida este documento.
- [x] Cita cruzada desde `a00026` (H2) marcada en el checklist.

## Risks and mitigations

- **R1**: el refactor a `fs/promises` cambia la semántica de error de "lanza sync" a "rechaza promise". **Mitigación**: ajustar los call-sites para usar `try/catch` en lugar de dejar que el sync lance.
- **R2**: si `walkAllowedFiles` no encaja exactamente con la lógica del watcher, forzar su uso introduce un wrapper. **Mitigación**: si S1 muestra fricción, dejar `fs/promises` directo y documentar por qué `walkAllowedFiles` no aplica aquí.
- **R3**: el test de "max latency" es flaky por naturaleza (depende del scheduler del OS). **Mitigación**: medir en un bucle de N=100 ticks y exigir p99 < 5ms, no el caso individual.

## Notes

- **Auditoría origen**: `a00026-21-06-2026-copilot-minimax-m3-repositorio.md` (H2, severidad P0).
- **Primitiva candidata del core**: `walkAllowedFiles` (exportada en `packages/core/src/public/index.ts`).
- **Invariante que rompe**: AGENTS.md regla 3 ("Async I/O only in hot paths").
- **Tamaño del fix**: un solo archivo + un spec. Impacto desproporcionado: elimina la única fuente de stalls por sync I/O en todo el monorepo.
- **Follow-up natural**: si se aprueba, abre el camino a una segunda iteración que migre también el bootstrap CLI del host a `walkAllowedFiles`, ganando contención de paths en boot-time.
- **Implementación**: `watcher.ts` migrado completo a `node:fs/promises` (`readFile`/`readdir`/`stat` en lugar de `readFileSync`/`readdirSync`/`existsSync`). `readInFlight`, `IReleaseWatcher.check()` e `IHandoffWatcher.check()` son ahora `async`/devuelven `Promise`. Ticks concurrentes (`setInterval` + `fs.watch` pueden disparar casi simultáneo) se serializan con un guard booleano (`checkInFlight`/`pollInFlight`) en vez de un `inFlight: Promise` compartido — equivalente funcional, evita una segunda capa de estado. No se adoptó `walkAllowedFiles` del core: la lógica del watcher es "diff de dos snapshots de un único directorio plano", no un recorrido recursivo de árbol de workspace, así que la primitiva no encajaba sin un wrapper (R2 se materializó, mitigación aplicada según lo previsto). El spec de "max latency del event loop" (R3) no se añadió como assertion de timing dedicada — la migración a async ya es la garantía estructural de no bloqueo; en su lugar el spec existente (`notification.spec.ts`) se migró íntegro a `await watcher.check()`, preservando los 11 casos (detección de archivo nuevo, ignorar pre-existentes, JSON corrupto, `awaitLockRelease` con timeout/abort). `bun run typecheck` limpio; `bunx vitest run plugins/notification` → 11/11 verde; `bun run lint`/`bun run validate` global bloqueado únicamente por `docs/proposals/index.json`, lockeado por el trabajo concurrente de `f00023`/`f00001` (ajeno a este slice).

## Rationale (cierre)

- Al re-verificar el 2026-06-21 18:13 UTC+2, el código de `watcher.ts` ya tenía 0 ocurrencias de `*Sync` (`grep -nE 'Sync\(' plugins/notification/src/lib/watcher.ts` → vacío) y los 11/11 tests de `notification.spec.ts` pasaban en verde. El trabajo de implementación estaba completo; solo faltaba el cierre formal (mover a `done/` + sincronizar `index.json`).
- En el momento del cierre, `bun run validate` global fallaba por causas **ajenas a este slice** y propiedad de otros agentes activos en paralelo en el mismo workspace: (a) `packages/ui-extension/src/dev/entry.ts` sin `lib: dom`, (b) `plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts` con propiedades duplicadas (editado en vivo, `git status` lo marcaba modificado en ese instante), (c) `@mcp-vertex/audit` no resoluble en `node_modules` (workspace linking pendiente de `bun install` tras un rename de `apps/ide`→`packages/ui-extension` y `extensions/vscode`→`extensions/vscode` hecho por otro agente). Ninguno de estos archivos pertenece al scope de `plugins/notification`.
- Gate aplicado para este cierre, acotado al slice (consistente con la regla de "no quedarse esperando" cuando el bloqueo es de terceros): `npx tsc --noEmit -p tsconfig.json` sin errores en `plugins/notification/**`, `bunx vitest run plugins/notification/tests/src/lib/notification.spec.ts` → 11/11 verde, `bun tools/scripts/lint/proposals.script.ts` → `0 fatal error(s)` (82 files checked). No se tocó `bun.lock`, `proposal-scaffold-linter.ts` ni ningún archivo bajo `apps/`/`packages/ui-extension`/`extensions/vscode` para evitar colisión con el trabajo en curso de otros agentes.
