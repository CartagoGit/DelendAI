---
id: f00509
title: "F1 — Work Event Bus: stream append-only de eventos (sin await, sin LLM) con observadores git / test / tool / agent-lease"
kind: feat
status: in-progress
type: proposal
track: trust
date: 2026-09-06
parent-plan: q00020
depends-on:
    - q00019
cascadeBoost: shipped-blocking
tags:
    - work-telemetry
    - event-bus
    - state-engine
    - non-blocking
last-transition-id: 6fbf41cd-1fb4-484c-bf52-9e63b9bfebf3
last-correlation-id: 6fbf41cd-1fb4-484c-bf52-9e63b9bfebf3
last-transition-from: review
shipped-in:
  - "a9cb8d6a4"
  - "97320d4d7"
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

### S1 — Paquete `packages/state-telemetry` + tabla `work_events` (SQLite + NDJSON fallback)
- **Status**: in-progress
- **Shipped-In**: 27c6cf021 feat(state-telemetry): scaffold work event bus
- **Files**: `packages/state-telemetry/package.json` (sin entrada de subpath público: la declaraba apuntando a un barrel que esta slice no crea, y `lint:tsconfig-paths-coverage` la rechaza con razón — un subpath que no resuelve a nada. F2-S5, que es la dueña del barrel, añade export y barrel juntos), `packages/state-telemetry/tsconfig.json`, `packages/state-telemetry/src/lib/events/work-event.ts`, `packages/state-telemetry/src/lib/events/work-event.spec.ts`, `packages/state-telemetry/src/lib/events/work-event-store.sqlite.ts`, `packages/state-telemetry/src/lib/events/work-event-store.ndjson.ts`, `packages/state-telemetry/src/lib/events/work-event-store.facade.ts`, `packages/state-telemetry/src/lib/events/work-event-store.spec.ts`, `packages/state-telemetry/src/lib/events/index.ts`
- **Gate**: lint
- acceptance:
  - "`bunx vitest run packages/state-telemetry` verde sobre SQLite shadow (cuando `q00019` consolidado) y sobre NDJSON (cuando no)."
  - "Tabla `work_events` creada con el schema documentado en `q00020`, columnas `id, work_item_id, actor_id, kind, payload_hash, created_at`."
  - "Dos escrituras concurrentes desde procesos distintos no producen filas duplicadas (PK por autoincrement + índice por `(work_item_id, id)`)."
  - "`work_event_store.facade` decide SQLite vs NDJSON leyendo `delendai.config.json#state.parity.shadow.enabled`; nunca falla al arranque si la sombra está apagada."
  - "`tools/scripts/lint/state-telemetry-purity.script.ts` corre en CI y devuelve `0 violations`."
  - "F1-S1 NO crea `tools/scripts/lint/state-telemetry-purity.script.ts`; lo introduce F2-S1 (única slice responsable). Esta slice se limita al bus + tabla + tests, dejando la lint para cuando exista contenido que lintar."
- Two-process test: `work-event-store.spec.ts` spawns two `bun` writers that wait for each other, open one store and append 200 events each at once; it asserts both exit 0, the count is 400, every id is distinct and each writer's events are all present in order. It exposed that opening the store could fail with SQLITE_BUSY, so `busy_timeout` is now set before the WAL switch and the boot statements retry on a busy file.
- review-state: changes_requested
- review-implementer: Persia
- review-reviewer: claude-opus-5-5
- review-log: requested_changes by claude-opus-5-5 — Every other criterion holds (work-event-store.spec: the q00020 table, the config switch with NDJSON when absent or malformed, no failure at startup; the purity lint now runs in lint:architecture). Missing: the criterion 'two concurrent writes from different processes produce no duplicate rows' has no test; 'keeps the autoincrement id monotonic across closes' writes from one process in sequence. To approve: a bun-owned spec that spawns two processes appending to one store at once and asserts every id is distinct and every event is present.

### S2 — `GitObserver` — hook post-write / post-commit (paths cambiados, branch, diff stat)
- **Status**: done
- **Blocked by**: a consumer. Nothing in production reads `state-telemetry` events yet (f00510 is pending). Emitting them first is work nobody can see. The write boundary exists: every `caller-checkout` write passes `bindWriteRoot` (core), which is where a `git_change` would hook.
- **DependsOn**: [F1-S1]
- **Files**: `packages/state-telemetry/src/lib/observers/git-observer.service.ts`, `packages/state-telemetry/src/lib/observers/git-observer.service.spec.ts`, `packages/state-telemetry/src/lib/observers/contracts/interfaces/git-observer.interface.ts`, `packages/state-telemetry/src/lib/observers/contracts/constants/git-observer.constant.ts`
- **Gate**: `bunx vitest run --root packages/state-telemetry src/lib/observers`
- shipped: `GitObserver` (`notify(trigger)` is fire-and-forget, one run in flight, requests in between fold into one repetition, `git` spawned asynchronously and read-only, killed at 250 ms with `git_change_stale`). A write observes `git status --porcelain` + `git diff --stat HEAD`; a commit observes `git show --name-only/--stat HEAD`. `payload_hash` is the sha256 of `{trigger, branch, paths, diffStat}`. A failing git or a directory that is not a repository emits nothing and never throws. It appends to any sink with the facade's `append` shape. Not wired into `bindWriteRoot` yet: that waits for a consumer (the Blocked-by note), so wiring adds no behaviour to the hook for other consumers.
- acceptance:
  - "`GitObserver` ingiere `git status --porcelain` cada vez que el agente hace `write_file` o ejecuta `git commit`; emite eventos `kind: 'git_change'` con `payload_hash` del `git diff --stat`."
  - "No bloquea al agente ni al servidor: lanza `git` con `spawn` asíncrono que la herramienta nunca espera (fire-and-forget), con como mucho una ejecución en vuelo (las peticiones que llegan mientras tanto se funden en una sola repetición al terminar), y si pasan 250 ms mata el proceso y emite `kind: 'git_change_stale'`. Corregido el 2026-09-24: la versión anterior decía `spawnSync` con `timeout: 250ms` y lo llamaba no bloqueante por no hacer `await`; `spawnSync` detiene el event loop de todo el servidor durante esos 250 ms en cada escritura."
  - "Test: una secuencia simulada de 5 escrituras a 3 ficheros produce 5 eventos `git_change` con `payload_hash` distintos; un timeout simulado produce `git_change_stale` sin abortar el proceso."
  - "Test de aislamiento: dos `GitObserver` en worktrees distintos del mismo repo no se cruzan (cada uno ve su `cwd`)."
- shipped-in: `a9cb8d6a4b9b`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at a9cb8d6a4, validate exit 0, tests 103/103 — Delivered by #779. state-telemetry vitest 103/103 and the bun-owned store spec 9/9 pass.

### S3 — `TestObserver` — enganche a `bun test` / `vitest` (start, finish, failure_hash)
- **Status**: done
- **Blocked by**: none. The original hook points do not exist (no `preExec` hook, no `IMcpHostSession.events`, the lock engine emits nothing), so this observer is a pure component fed by its consumer; wiring it belongs to f00510.
- **DependsOn**: [F1-S1]
- **Files**: `packages/state-telemetry/src/lib/observers/test-observer.service.ts`, `packages/state-telemetry/src/lib/observers/test-observer.service.spec.ts`, `packages/state-telemetry/src/lib/observers/observer-emitter.service.ts`, `packages/state-telemetry/src/lib/observers/failure-normalizer.helper.ts`, `packages/state-telemetry/src/lib/observers/contracts/interfaces/observer.interface.ts`, `packages/state-telemetry/src/lib/observers/contracts/constants/observer.constant.ts`
- **Gate**: `bunx vitest run --root packages/state-telemetry src/lib/observers`
- acceptance:
  - "`TestObserver.started(run)` only remembers the run; `finished(run, { passed, failed, firstFailure? })` emits `test_started` (stamped with the start time) and then `test_finished`, each carrying only a sha256 `payload_hash` of a canonical JSON projection."
  - "`failureHash(firstFailure)` is the sha256 of the path plus the normalized message (ANSI stripped, absolute paths made relative, durations, timestamps and line:col numbers removed, whitespace collapsed), so two runs failing for the same cause hash equal; the normalizer is shared with the tool observer."
  - "A run with zero tests (passed + failed = 0) emits neither event, because `started` defers everything to `finished`."
  - "The observer is pure and fire-and-forget: it spawns and hooks nothing, never awaits in the caller and never throws, even when the sink rejects."
- shipped-in: `c446c1602e8e`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 97320d4d7, validate exit 0, tests 103/103 — Delivered by #792 (merge 97320d4d7).

### S4 — `ToolObserver` — observador del MCP request log (tool_called, tool_finished, tool_error)
- **Status**: done
- **Blocked by**: none. The original hook points do not exist (no `preExec` hook, no `IMcpHostSession.events`, the lock engine emits nothing), so this observer is a pure component fed by its consumer; wiring it belongs to f00510.
- **DependsOn**: [F1-S1]
- **Files**: `packages/state-telemetry/src/lib/observers/tool-observer.service.ts`, `packages/state-telemetry/src/lib/observers/tool-observer.service.spec.ts`, `packages/state-telemetry/src/lib/observers/observer-emitter.service.ts`, `packages/state-telemetry/src/lib/observers/failure-normalizer.helper.ts`, `packages/state-telemetry/src/lib/observers/contracts/interfaces/observer.interface.ts`, `packages/state-telemetry/src/lib/observers/contracts/constants/observer.constant.ts`
- **Gate**: `bunx vitest run --root packages/state-telemetry src/lib/observers`
- acceptance:
  - "`ToolObserver.called(tool, args)`, `finished(tool, { durationMs })` and `failed(tool, { exitCode, message })` emit `tool_called`, `tool_finished` and `tool_error`; the hash of a call covers the tool name and the key-sorted args with every secret-looking key (token, secret, password, authorization, key, credential, case-insensitive) dropped first."
  - "`tool_error` hashes the exit code and the message through the same normalizer as the test observer, so equal errors hash equal."
  - "Attach/detach symmetry is tested: an observer over a no-op sink changes nothing and never mutates the args it is given."
  - "A 1000-call burst lands 1000 events through the NDJSON store in under one second (asserted in `tool-observer.service.spec.ts`)."
- shipped-in: `c446c1602e8e`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 97320d4d7, validate exit 0, tests 103/103 — Delivered by #792 (merge 97320d4d7).

### S5 — `AgentLeaseObserver` — enganche al lock engine (claim, release, heartbeat)
- **Status**: done
- **Blocked by**: none. The original hook points do not exist (no `preExec` hook, no `IMcpHostSession.events`, the lock engine emits nothing), so this observer is a pure component fed by its consumer; wiring it belongs to f00510.
- **DependsOn**: [F1-S1, F1-S4]
- **Files**: `packages/state-telemetry/src/lib/observers/agent-lease-observer.service.ts`, `packages/state-telemetry/src/lib/observers/agent-lease-observer.service.spec.ts`, `packages/state-telemetry/src/lib/observers/observer-emitter.service.ts`, `packages/state-telemetry/src/lib/observers/failure-normalizer.helper.ts`, `packages/state-telemetry/src/lib/observers/contracts/interfaces/observer.interface.ts`, `packages/state-telemetry/src/lib/observers/contracts/constants/observer.constant.ts`
- **Gate**: `bunx vitest run --root packages/state-telemetry src/lib/observers`
- acceptance:
  - "`AgentLeaseObserver.claimed`, `heartbeat` and `released` emit `lease_claimed`, `lease_heartbeat` and `lease_released` with a stable `payload_hash`; claim, 4 heartbeats and release make 6 events."
  - "`check(now)` takes the clock from the caller (no timers) and emits `lease_heartbeat_missed` once per lease when 3 heartbeat intervals passed without heartbeat or release: claim, 5 heartbeats and silence make 6 events plus one missed, and a second `check` adds nothing."
  - "Not shipped: `work_assignments.released_at` is left out because no such table exists yet."
- shipped-in: `c446c1602e8e`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 97320d4d7, validate exit 0, tests 103/103 — Delivered by #792 (merge 97320d4d7).

## acceptance

- `bunx vitest run packages/state-telemetry` corre los specs internos de `src/lib/events/**` (F1-S1 no exporta nada público todavía). Verde sobre SQLite shadow (cuando `q00019` consolidado) y sobre NDJSON (cuando no).
- Tabla `work_events` creada con el schema documentado en `q00020`, columnas `id, work_item_id, actor_id, kind, payload_hash, created_at`.
- Dos escrituras concurrentes desde procesos distintos no producen filas duplicadas (PK por autoincrement + índice por `(work_item_id, id)`).
- `work_event_store.facade` decide SQLite vs NDJSON leyendo `delendai.config.json#state.parity.shadow.enabled`; nunca falla al arranque si la sombra está apagada.
- La lint de pureza para `packages/state-telemetry/src/**` la crea `f00510` S1 (única slice responsable de `tools/scripts/lint/state-telemetry-purity.script.ts`); esta slice no la introduce.
- `GitObserver` ingiere `git status --porcelain` cada vez que el agente hace `write_file` o ejecuta `git commit`; emite eventos `kind: 'git_change'` con `payload_hash` del `git diff --stat`.
- No bloquea al agente ni al servidor: `git` se lanza con `spawn` asíncrono que la herramienta nunca espera, con una sola ejecución en vuelo (las peticiones intermedias se funden en una repetición), y a los 250 ms se mata el proceso y se emite `kind: 'git_change_stale'`. "Sin `await`" no es "no bloqueante": `spawnSync` detendría el event loop de todo el servidor.
- Test: una secuencia simulada de 5 escrituras a 3 ficheros produce 5 eventos `git_change` con `payload_hash` distintos; un timeout simulado produce `git_change_stale` sin abortar el proceso.
- Test de aislamiento: dos `GitObserver` en worktrees distintos del mismo repo no se cruzan (cada uno ve su `cwd`).
- `TestObserver.started(run)` only remembers the run; `finished(run, { passed, failed, firstFailure? })` emits `test_started` (stamped with the start time) and then `test_finished`, each carrying only a sha256 `payload_hash` of a canonical JSON projection.
- `failureHash(firstFailure)` is the sha256 of the path plus the normalized message (ANSI stripped, absolute paths made relative, durations, timestamps and line:col numbers removed, whitespace collapsed), so two runs failing for the same cause hash equal; the normalizer is shared with the tool observer.
- A run with zero tests (passed + failed = 0) emits neither event, because `started` defers everything to `finished`.
- The observer is pure and fire-and-forget: it spawns and hooks nothing, never awaits in the caller and never throws, even when the sink rejects.
- `ToolObserver.called(tool, args)`, `finished(tool, { durationMs })` and `failed(tool, { exitCode, message })` emit `tool_called`, `tool_finished` and `tool_error`; the hash of a call covers the tool name and the key-sorted args with every secret-looking key (token, secret, password, authorization, key, credential, case-insensitive) dropped first.
- `tool_error` hashes the exit code and the message through the same normalizer as the test observer, so equal errors hash equal.
- Attach/detach symmetry is tested: an observer over a no-op sink changes nothing and never mutates the args it is given.
- A 1000-call burst lands 1000 events through the NDJSON store in under one second (asserted in `tool-observer.service.spec.ts`).
- `AgentLeaseObserver.claimed`, `heartbeat` and `released` emit `lease_claimed`, `lease_heartbeat` and `lease_released` with a stable `payload_hash`; claim, 4 heartbeats and release make 6 events.
- `check(now)` takes the clock from the caller (no timers) and emits `lease_heartbeat_missed` once per lease when 3 heartbeat intervals passed without heartbeat or release: claim, 5 heartbeats and silence make 6 events plus one missed, and a second `check` adds nothing.
- Not shipped: `work_assignments.released_at` is left out because no such table exists yet.

**Checked against the tree on 2026-09-26.** S2–S5 had stood still since
2026-09-08. S4 and S5 hook into events their text says "already exist";
they do not. No production code reads the events S2–S5 would emit, and
the projector that would (f00510) is itself pending. Each slice now
names its real hook point and what blocks it. S2 and S3 wait for a
consumer; S4 and S5 wait for their premise.
