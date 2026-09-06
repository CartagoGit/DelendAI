---
id: f00509
title: "F1 — Work Event Bus: stream append-only de eventos (sin await, sin LLM) con observadores git / test / tool / agent-lease"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-06
parent-plan: q00020
depends-on:
    - q00019
cascadeBoost: 1
tags:
    - work-telemetry
    - event-bus
    - state-engine
    - non-blocking
---

# f00509 — F1 — Work Event Bus: stream append-only de eventos (sin await, sin LLM) con observadores git / test / tool / agent-lease

## Goal

Aterrizar el bus de eventos del Work Telemetry: un paquete nuevo `packages/state-telemetry` que define el contrato `IWorkEvent`, monta la tabla `work_events` sobre la sombra SQLite de `q00019` (con fallback a NDJSON si la sombra no está consolidada) y expone cuatro observadores puros (`GitObserver`, `TestObserver`, `ToolObserver`, `AgentLeaseObserver`) que cada herramienta del sistemaalimenta sin añadir `await` a su camino crítico. El bus es append-only, no impone un daemon en background y garantiza que dos procesos que escriban a la vez vean el mismo orden causal (generaciones del State Engine + `last_event_id`).

## why

Hoy DelendAI coordina agentes con locks de archivo, registry, queue, agents.json, checkpoints, decisions, proposal-index — todo se observa a posteriori leyendo logs dispersos. Lo que falta es **una fuente única, append-only y consultable** de qué hizo cada actor sobre qué ficheros, en qué tests, con qué comandos. Sin esa fuente, `f00510` (Projector) no tiene de dónde inferir la fase y `f00277` (`AgentSession`) sigue mostrando fotos estáticas. La conversación con ChatGPT del 2026-09-06 puso el bus como cimiento de la arquitectura; este slice lo aterriza con disciplina de State Engine (un productor más) y disciplina de no-await (los observadores son `EventEmitter` + inserción sincrónica en SQLite WAL).

## non-goals

- Persistir más allá del bus de eventos. La proyección determinista del progreso (fase, %, ETA, stalled) es responsabilidad de `f00510` (Projector), no de F1.
- Inventar un daemon de polling o un watcher global. Los observadores se enganchan a hooks existentes (`git` post-commit, `bun test` exit, MCP tool call boundary, `agent-lock` claim/release); no agregan timers nuevos en el camino crítico.
- Almacenar payloads secretos. El campo `payload_hash` guarda el sha256 del payload canónico (paths, comandos, conteos); el payload crudo se descarta. Los secretos siguen el camino de `error-reporting`, no de F1.
- Migrar logs legacy. `usage-tracking`, `logs`, `memory` y `observability` siguen emitiendo a su formato actual; F1 sólo los engancha después si la propuesta dueña lo decide.

## Slices

- global_gate: type

### F1-S1 — Paquete `packages/state-telemetry` + tabla `work_events` (SQLite + NDJSON fallback)
- **Status**: pending
- **Files**: `packages/state-telemetry/package.json`, `packages/state-telemetry/tsconfig.json`, `packages/state-telemetry/src/public/index.ts`, `packages/state-telemetry/src/lib/events/work-event.ts`, `packages/state-telemetry/src/lib/events/work-event.spec.ts`, `packages/state-telemetry/src/lib/events/work-event-store.sqlite.ts`, `packages/state-telemetry/src/lib/events/work-event-store.ndjson.ts`, `packages/state-telemetry/src/lib/events/work-event-store.facade.ts`, `packages/state-telemetry/src/lib/events/work-event-store.spec.ts`, `packages/state-telemetry/src/lib/events/index.ts`, `tools/scripts/lint/state-telemetry-purity.script.ts`
- **Gate**: lint
- acceptance:
  - "`bunx vitest run packages/state-telemetry` verde sobre SQLite shadow (cuando `q00019` consolidado) y sobre NDJSON (cuando no)."
  - "Tabla `work_events` creada con el schema documentado en `q00020`, columnas `id, work_item_id, actor_id, kind, payload_hash, created_at`."
  - "Dos escrituras concurrentes desde procesos distintos no producen filas duplicadas (PK por autoincrement + índice por `(work_item_id, id)`)."
  - "`work_event_store.facade` decide SQLite vs NDJSON leyendo `delendai.config.json#state.parity.shadow.enabled`; nunca falla al arranque si la sombra está apagada."
  - "`tools/scripts/lint/state-telemetry-purity.script.ts` corre en CI y devuelve `0 violations`."

### F1-S2 — `GitObserver` — hook post-write / post-commit (paths cambiados, branch, diff stat)
- **Status**: pending
- **DependsOn**: [F1-S1]
- **Files**: `packages/state-telemetry/src/lib/observers/git-observer.ts`, `packages/state-telemetry/src/lib/observers/git-observer.spec.ts`, `packages/state-telemetry/src/lib/observers/index.ts`
- **Gate**: type
- acceptance:
  - "`GitObserver` ingiere `git status --porcelain` cada vez que el agente hace `write_file` o ejecuta `git commit`; emite eventos `kind: 'git_change'` con `payload_hash` del `git diff --stat`."
  - "No hace `await` dentro de su bucle principal: usa `spawnSync('git', [...])` con `timeout: 250ms` y degrada a `kind: 'git_change_stale'` si el timeout se dispara."
  - "Test: una secuencia simulada de 5 escrituras a 3 ficheros produce 5 eventos `git_change` con `payload_hash` distintos; un timeout simulado produce `git_change_stale` sin abortar el proceso."
  - "Test de aislamiento: dos `GitObserver` en worktrees distintos del mismo repo no se cruzan (cada uno ve su `cwd`)."

### F1-S3 — `TestObserver` — enganche a `bun test` / `vitest` (start, finish, failure_hash)
- **Status**: pending
- **DependsOn**: [F1-S1]
- **Files**: `packages/state-telemetry/src/lib/observers/test-observer.ts`, `packages/state-telemetry/src/lib/observers/test-observer.spec.ts`
- **Gate**: type
- acceptance:
  - "`TestObserver` envuelve `bun test` y `vitest run` con un wrapper que emite `kind: 'test_started'` antes y `kind: 'test_finished'` después; el payload incluye `passed`, `failed`, `failure_hash` (sha256 del primer failure path + mensaje normalizado)."
  - "No añade `await` al cuerpo del agente: la envoltura es un `preExec` / `postExec` en el boundary de la herramienta, no en la herramienta misma."
  - "El `failure_hash` es estable entre dos ejecuciones que fallan por la misma causa (verificar con fixture `tests/fixtures/test-failure-snapshot.spec.ts`)."
  - "Una ejecución sin tests no emite `test_started`/`test_finished` espurios (degradación silenciosa, no error)."

### F1-S4 — `ToolObserver` — observador del MCP request log (tool_called, tool_finished, tool_error)
- **Status**: pending
- **DependsOn**: [F1-S1]
- **Files**: `packages/state-telemetry/src/lib/observers/tool-observer.ts`, `packages/state-telemetry/src/lib/observers/tool-observer.spec.ts`
- **Gate**: type
- acceptance:
  - "`ToolObserver` se engancha al `IMcpHostSession.events.on('tool_called' | 'tool_finished' | 'tool_error', …)` que ya existe; emite eventos `kind: 'tool_called'` con `payload_hash` del nombre+argumentos canónicos (sin secretos)."
  - "El observer es un listener pasivo: añadirlo o quitarlo no cambia el comportamiento del host MCP; se prueba con un test de doble enganche que verifica simetría."
  - "Tool errors que terminan en `tool_error` también producen `kind: 'tool_error'` con `exit_code` y `failure_hash` del mensaje normalizado."
  - "El volumen no degrada: un burst de 1000 tool calls produce 1000 filas en `work_events` en < 1s en CI (bench en `tests/perf/tool-observer-bench.spec.ts`)."

### F1-S5 — `AgentLeaseObserver` — enganche al lock engine (claim, release, heartbeat)
- **Status**: pending
- **DependsOn**: [F1-S1, F1-S4]
- **Files**: `packages/state-telemetry/src/lib/observers/agent-lease-observer.ts`, `packages/state-telemetry/src/lib/observers/agent-lease-observer.spec.ts`
- **Gate**: type
- acceptance:
  - "`AgentLeaseObserver` escucha los eventos que `agent-lock.engine` ya emite (`lease_claimed`, `lease_released`, `lease_heartbeat`) y los traduce a `work_events` con `kind` `'lease_claimed' | 'lease_released' | 'lease_heartbeat'` y `payload_hash` estable."
  - "El emparejamiento `lease_claimed → lease_released` se materializa en `work_assignments.released_at` cuando llega el release."
  - "Si el release no llega (kill -9), el observer emite `lease_heartbeat_missed` cuando han pasado 3 heartbeats sin release; usa el heartbeat interval del lock engine."
  - "Test: simular claim → 4 heartbeats → release produce 6 eventos; claim → 5 heartbeats → kill produce 5 eventos más `lease_heartbeat_missed`."

## acceptance

- `bunx vitest run packages/state-telemetry` verde sobre SQLite shadow (cuando `q00019` consolidado) y sobre NDJSON (cuando no).
- Tabla `work_events` creada con el schema documentado en `q00020`, columnas `id, work_item_id, actor_id, kind, payload_hash, created_at`.
- Dos escrituras concurrentes desde procesos distintos no producen filas duplicadas (PK por autoincrement + índice por `(work_item_id, id)`).
- `work_event_store.facade` decide SQLite vs NDJSON leyendo `delendai.config.json#state.parity.shadow.enabled`; nunca falla al arranque si la sombra está apagada.
- La lint de pureza para `packages/state-telemetry/src/**` la crea `f00510` S1 (única slice responsable de `tools/scripts/lint/state-telemetry-purity.script.ts`); esta slice no la introduce.
- `GitObserver` ingiere `git status --porcelain` cada vez que el agente hace `write_file` o ejecuta `git commit`; emite eventos `kind: 'git_change'` con `payload_hash` del `git diff --stat`.
- No hace `await` dentro de su bucle principal: usa `spawnSync('git', [...])` con `timeout: 250ms` y degrada a `kind: 'git_change_stale'` si el timeout se dispara.
- Test: una secuencia simulada de 5 escrituras a 3 ficheros produce 5 eventos `git_change` con `payload_hash` distintos; un timeout simulado produce `git_change_stale` sin abortar el proceso.
- Test de aislamiento: dos `GitObserver` en worktrees distintos del mismo repo no se cruzan (cada uno ve su `cwd`).
- `TestObserver` envuelve `bun test` y `vitest run` con un wrapper que emite `kind: 'test_started'` antes y `kind: 'test_finished'` después; el payload incluye `passed`, `failed`, `failure_hash` (sha256 del primer failure path + mensaje normalizado).
- No añade `await` al cuerpo del agente: la envoltura es un `preExec` / `postExec` en el boundary de la herramienta, no en la herramienta misma.
- El `failure_hash` es estable entre dos ejecuciones que fallan por la misma causa (verificar con fixture `tests/fixtures/test-failure-snapshot.spec.ts`).
- Una ejecución sin tests no emite `test_started`/`test_finished` espurios (degradación silenciosa, no error).
- `ToolObserver` se engancha al `IMcpHostSession.events.on('tool_called' | 'tool_finished' | 'tool_error', …)` que ya existe; emite eventos `kind: 'tool_called'` con `payload_hash` del nombre+argumentos canónicos (sin secretos).
- El observer es un listener pasivo: añadirlo o quitarlo no cambia el comportamiento del host MCP; se prueba con un test de doble enganche que verifica simetría.
- Tool errors que terminan en `tool_error` también producen `kind: 'tool_error'` con `exit_code` y `failure_hash` del mensaje normalizado.
- El volumen no degrada: un burst de 1000 tool calls produce 1000 filas en `work_events` en < 1s en CI (bench en `tests/perf/tool-observer-bench.spec.ts`).
- `AgentLeaseObserver` escucha los eventos que `agent-lock.engine` ya emite (`lease_claimed`, `lease_released`, `lease_heartbeat`) y los traduce a `work_events` con `kind` `'lease_claimed' | 'lease_released' | 'lease_heartbeat'` y `payload_hash` estable.
- El emparejamiento `lease_claimed → lease_released` se materializa en `work_assignments.released_at` cuando llega el release.
- Si el release no llega (kill -9), el observer emite `lease_heartbeat_missed` cuando han pasado 3 heartbeats sin release; usa el heartbeat interval del lock engine.
- Test: simular claim → 4 heartbeats → release produce 6 eventos; claim → 5 heartbeats → kill produce 5 eventos más `lease_heartbeat_missed`.
