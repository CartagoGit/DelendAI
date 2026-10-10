---
id: f00512
title: "F4 — UI Surfaces: delendai work status [--watch], delendai work agents, item de barra de estado en la extensión VS Code y vista intrínseca host-emitted en el chat del agente"
kind: feat
status: in-progress
type: proposal
track: trust
date: 2026-09-06
parent-plan: q00020
depends-on:
    - f00510
    - f00511
cascadeBoost: shipped-blocking
tags:
    - work-telemetry
    - ui
    - cli
    - vscode-extension
    - non-llm
last-transition-id: 364300cb-3106-463c-952f-824651649c3a
last-correlation-id: 364300cb-3106-463c-952f-824651649c3a
last-transition-from: ready
last-transition-at: 2026-10-10T09:59:22.211Z
---

# f00512 — F4 — UI Surfaces: delendai work status [--watch], delendai work agents, item de barra de estado en la extensión VS Code y vista intrínseca host-emitted en el chat del agente

## notes

Status on 2026-10-07.

Not started, on purpose. Two things come first, found while implementing f00511:

- **Something must emit work events.** Nothing records events at runtime yet, so `status` and `agents` would always render empty. That is q00020's first slice (work telemetry), now in progress; this proposal depends on it.
- **A published package carries the private packages it imports; nothing private is published for its sake.** `@delendai/state-telemetry` stays private. Owner's decision, 2026-10-10: every extra public package is one more thing a user has to install and version, so the build bundles a private package into the published package that imports it (S6) instead of putting it on the registry. Until the CLI command of S7 exists the view runs as `bun run work:progress`.

Two corrections for the slices when they start: `delendai work status` already exists with another meaning (the checkout and policy report), so the progress view needs its own name (for example `work progress`) or an explicit extension of `status`; and the declared `commands/groups/work.ts` does not exist (`work` is `commands/work.command.ts`, which delegates to core).

## Goal

Materializar la proyección de `f00510` (snapshots) y `f00511` (ETA) en tres superficies read-only, sin añadir coste de tokens al LLM: (a) `delendai work status [--watch] [proposalId|sliceId]` en CLI, (b) item persistente en la barra de estado de la extensión VS Code con icono dinámico, y (c) bloque intrínseco emitido por el host en el chat del agente (no por el modelo). Las tres superficies consumen la misma `IWorkProgressSnapshot` y la misma regla `source: 'sqlite-shadow' | 'git-fallback'`; nunca bloquean al agente ni le piden texto.

## why

Sin superficies, las proposals F1–F3 son invisibles para el usuario. La conversación con ChatGPT del 2026-09-06 puso el listar exactamente: `delendai work status` (con `--watch`), `delendai agents`, item en la status bar y chat host-emitted. La razón de hacerlo read-only por construcción: el progreso se observa, no se declara. Un agente que tenga que decir "estoy al 73%" introduce coste de tokens, deriva de honestidad y dos puntos de verdad. La feature entera fracasa si las superficies cuestan tokens; por eso cada vista tiene un test que demuestra que el contador `usage_tracking.llm_tokens_total` no cambia al pintar.

## non-goals

- Hacer que las superficies sean declarativas por el agente. El agente no dice su fase ni su progreso — el host lo infiere (F2).
- Renderizar la propuesta en formato rich-text bonito. Esta propuesta sólo produce salida de terminal legible y JSON; los dashboards ricos son del plugin `kpis` o de la extensión VS Code, no del work-telemetry.
- Sustituir a `delendai status` (que ya muestra colectores de runtime) ni a `delendai agents` (que ya usa el plugin `auto-agent-selector`). Esta propuesta introduce `delendai work ...` como raíz nueva, no como reemplazo.
- Enviar telemetría al MCP host ni al chat. La vista del chat es una inyección del propio host (no del modelo) que el cliente renderiza localmente; no incrementa tokens del LLM.
- Soportar hosts distintos de VS Code. Esta propuesta aterriza VS Code como primera superficie; la CLI sirve como fallback universal. JetBrains / Neovim son proposals aparte que pueden apoyarse en la misma `IWorkProgressSnapshot`.

## Slices

- global_gate: type

### S1 — `delendai work status` — comando CLI que renderiza el snapshot agregado por propuesta (progreso ponderado, fase, ETA, source)
- **Status**: review
- **DependsOn**: [f00510, f00511]
- **Files**: `packages/state-telemetry/src/lib/status/work-status.service.ts`, `packages/state-telemetry/src/lib/status/work-status.service.spec.ts`, `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`, `packages/state-telemetry/src/lib/status/contracts/constants/work-status.constant.ts`, `packages/state-telemetry/src/public/index.ts`, `tools/scripts/telemetry/work-progress.script.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`delendai work status [proposalId]` existe y devuelve: proposal, lista de slices con `{ sliceId, phase, progress, weight, confidence, eta_p50_ms, eta_p80_ms, eta_reason, source }`."
  - "Sin `[proposalId]` lista todas las proposals activas (status ∈ {in-progress, review}) con su progreso ponderado y ETA agregada."
  - "`--format json` produce una línea JSON estable (mismo input → mismo output byte-a-byte, snapshot estable)."
  - "El campo `source` se imprime siempre (`sqlite-shadow` o `git-fallback`) para que el usuario sepa con qué se calcula."
  - "Test: `bun run packages/cli` `delendai work status --format json` sobre fixtures no añade tokens al LLM (assertion: `usage_tracking.llm_tokens_total` invariante)."
- Shipped 2026-10-10 as `bun run work:progress`: one line per open proposal with its weighted progress, the phase of its furthest-behind slice, how many slices are stalled and when something last happened, computed by `buildWorkStatus` from the proposals on disk and the event store (the journals are drained first). `--json` gives the rows. It is a repository script over the private telemetry package, not `delendai work status`: that command already exists with another meaning, and the published CLI cannot import a private package. Exposing it in the CLI is a visibility change once the owner decides to publish `@delendai/state-telemetry`.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — `delendai work status --watch` — modo watch (500 ms, polling del SQLite shadow o NDJSON) con render estable (sin parpadeo)
- **Status**: review
- **DependsOn**: [F4-S1]
- **Files**: `packages/state-telemetry/src/lib/status/work-status.service.ts`, `packages/state-telemetry/src/lib/status/work-status.service.spec.ts`, `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`, `packages/state-telemetry/src/lib/status/contracts/constants/work-status.constant.ts`, `packages/state-telemetry/src/public/index.ts`, `tools/scripts/telemetry/work-progress.script.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`delendai work status --watch [proposalId]` entra en bucle con intervalo por defecto 500 ms (configurable con `--interval <ms>`, mínimo 100 ms)."
  - "El render es estable: mismas líneas en dos instantáneas consecutivas no se reescriben; líneas nuevas se insertan sin desplazar las viejas (cursor save/restore ANSI)."
  - "Sale limpiamente con `q` o Ctrl-C (`process.on('SIGINT')`); un test verifica que el intervalo se cancela y no quedan handles abiertos."
  - "El polling consume el SQLite shadow o el NDJSON fallback directamente; nunca pregunta al MCP server ni al LLM (verificado con contador `usage_tracking.llm_tokens_total` invariante en un test de 5 minutos)."
- Shipped 2026-10-10: `bun run work:progress -- --watch` recomputes every 500 ms and redraws only when the view changed, so the terminal does not flicker.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — `delendai work agents [agentId]` — vista de agentes activos con su AgentSession + fase + último cambio
- **Status**: review
- **DependsOn**: [F4-S1]
- **Files**: `packages/state-telemetry/src/lib/status/work-status.service.ts`, `packages/state-telemetry/src/lib/status/work-status.service.spec.ts`, `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`, `packages/state-telemetry/src/lib/status/contracts/constants/work-status.constant.ts`, `packages/state-telemetry/src/public/index.ts`, `tools/scripts/telemetry/work-progress.script.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`delendai work agents` lista todos los agentes con sesión activa: `{ agentId, proposalId, sliceId, phase, progress, lastActivityAt, lastActionKind, source }`."
  - "`delendai work agents <agentId>` muestra además `filesChanged (n)`, `eventsLastHour (n)`, `stalled (bool)`, `etaRange ('~5m [3–8m]')`."
  - "No requiere `git checkout`: lee `git worktree list --porcelain` desde el cwd actual, igual que `delendai agents` de `f00277`."
  - "El output distingue con prefijo `*` el agente que está ejecutando en el cwd actual (vs los que están en otros worktrees)."
- Shipped 2026-10-10: `bun run work:progress -- --agents` (and the foot of the default view) lists each agent whose last event falls in the last half hour, with the work item and the kind of that event (`activeAgents`).
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — Item de status bar en la extensión VS Code (icono dinámico, tooltip con propuesta+fase+ETA, hidden cuando no hay agentes activos)
- **Status**: pending
- **DependsOn**: [F4-S1]
- **Files**: `extensions/vscode/src/services/work-status-bar-item.ts`, `extensions/vscode/src/services/work-status-bar-item.spec.ts`, `extensions/vscode/src/services/work-snapshot-reader.ts`, `extensions/vscode/src/services/work-snapshot-reader.spec.ts`, `extensions/vscode/src/extension.ts`
- **Gate**: type
- acceptance:
  - "Aparece un item en la status bar con icono `$(hubot)` cuando hay ≥1 agente activo en el cwd; se oculta (no se muestra) cuando no hay."
  - "Tooltip muestra: `${agentId} · ${proposalId} · ${phase} · ${progress}% · ~${etaRange}`. Si `confidence < 0.5` añade `(? confidence)`."
  - "Click → abre un `WebviewView` con la tabla equivalente a `delendai work agents` (no implementa nuevas queries; reusa la API)."
  - "El coste de polling es ≤ 2 KB por ciclo y no añade tokens al LLM (test de integración con un mock del cliente MCP)."
  - "Detrás de `delendai.config.json#telemetry.chat_intrinsic.enabled` (default `false`): si está en `false`, el item se muestra pero el tooltip no incluye la confianza (sólo progreso + fase)."

### S5 — Vista intrínseca host-emitted en el chat del agente (bloque determinista que el host inyecta, no el modelo)
- **Status**: pending
- **DependsOn**: [F4-S1]
- **Files**: `packages/core/src/lib/host-emitted/work-telemetry-block.service.ts`, `packages/core/src/lib/host-emitted/work-telemetry-block.service.spec.ts`, `packages/core/src/lib/mcp/chat-emitter.service.ts`, `packages/core/src/lib/mcp/chat-emitter.service.spec.ts`, `packages/core/tests/integration/telemetry-no-tokens.spec.ts`
- **Gate**: type
- acceptance:
  - "El host emite un bloque `host-emitted/work-telemetry` como `host_message` (no como `assistant_message`) en cada turno del agente activo. El bloque es texto plano, no markdown pesado, formato: `◉ ${proposalId}  ${progress}%  ${phase}  ~${etaRange}  ${sourceTag}`."
  - "El bloque NUNCA entra en el contexto del modelo (no se cuenta en `usage_tracking.llm_tokens_total`); se renderiza en el cliente del chat como un bloque separado del assistant stream."
  - "El setting `delendai.config.json#telemetry.chat_intrinsic.enabled` (default `false`) controla la inyección; con `false`, el bloque se omite."
  - "Test `telemetry-no-tokens.spec.ts` (acceptance del plan q00020): arranca un agente mock, dispara 100 tool calls, activa el bloque durante 5 minutos, y verifica que `usage_tracking.llm_tokens_total` es invariante entre los dos extremos."
  - "El bloque se omite automáticamente cuando el agente está en `WorkPhase: 'done'` o no tiene `work_item_id` activo (degradación silenciosa)."

### S6 — A published package bundles the private packages it imports

- **Status**: review
- **Files**:
  - `tools/scripts/compile/inlined-packages.ts`
  - `tools/scripts/compile/inlined-packages.spec.ts`
  - `tools/scripts/compile/bundle-js.ts`
  - `tools/scripts/compile/build-graph.ts`
  - `tools/scripts/compile/build.script.ts`
  - `tools/scripts/lint/no-internal-core-imports.script.ts`
  - `tools/scripts/lint/no-internal-core-imports.script.spec.ts`
- **Gate**: unit
- acceptance:
  - A published package that names a private workspace package in `devDependencies` and imports it from its shipped sources gets that package, and the private packages it depends on, inside its own bundle; every other bare import stays an import.
  - A private package named in `devDependencies` and imported only by tests is not bundled.
  - The build refuses, naming them, the public packages a bundled one imports that the publisher does not declare.
  - The publication-boundary lint accepts an import of a private package the importer declares in `devDependencies`, refuses any other, and refuses a private package bundled into two published packages.
  - `bun run build` builds every workspace with the new wiring.

Delivered in `f97df2512` (its message names S4 by mistake). The private
package is built before the package that bundles it, because the
declarations of the second are checked against those of the first.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — `delendai work progress` in the published CLI

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/package.json`
  - `tools/scripts/telemetry/work-progress.script.ts`
- **Gate**: unit
- acceptance:
  - `delendai work progress [--watch|--agents|--json]` renders the view `bun run work:progress` renders, from an installed CLI, with `@delendai/state-telemetry` bundled by S6.
  - The open proposals come from the one reader of the proposal index and the project's configured layout, not from a walk of status folders under a default path.
  - `bun run work:progress` runs the CLI command; the script that duplicated it is gone.
  - The pack smoke test installs the CLI tarball and runs the command.

## acceptance

- `delendai work status [proposalId]` existe y devuelve: proposal, lista de slices con `{ sliceId, phase, progress, weight, confidence, eta_p50_ms, eta_p80_ms, eta_reason, source }`.
- Sin `[proposalId]` lista todas las proposals activas (status ∈ {in-progress, review}) con su progreso ponderado y ETA agregada.
- `--format json` produce una línea JSON estable (mismo input → mismo output byte-a-byte, snapshot estable).
- El campo `source` se imprime siempre (`sqlite-shadow` o `git-fallback`) para que el usuario sepa con qué se calcula.
- Test: `bun run packages/cli` `delendai work status --format json` sobre fixtures no añade tokens al LLM (assertion: `usage_tracking.llm_tokens_total` invariante).
- `delendai work status --watch [proposalId]` entra en bucle con intervalo por defecto 500 ms (configurable con `--interval <ms>`, mínimo 100 ms).
- El render es estable: mismas líneas en dos instantáneas consecutivas no se reescriben; líneas nuevas se insertan sin desplazar las viejas (cursor save/restore ANSI).
- Sale limpiamente con `q` o Ctrl-C (`process.on('SIGINT')`); un test verifica que el intervalo se cancela y no quedan handles abiertos.
- El polling consume el SQLite shadow o el NDJSON fallback directamente; nunca pregunta al MCP server ni al LLM (verificado con contador `usage_tracking.llm_tokens_total` invariante en un test de 5 minutos).
- `delendai work agents` lista todos los agentes con sesión activa: `{ agentId, proposalId, sliceId, phase, progress, lastActivityAt, lastActionKind, source }`.
- `delendai work agents <agentId>` muestra además `filesChanged (n)`, `eventsLastHour (n)`, `stalled (bool)`, `etaRange ('~5m [3–8m]')`.
- No requiere `git checkout`: lee `git worktree list --porcelain` desde el cwd actual, igual que `delendai agents` de `f00277`.
- El output distingue con prefijo `*` el agente que está ejecutando en el cwd actual (vs los que están en otros worktrees).
- Aparece un item en la status bar con icono `$(hubot)` cuando hay ≥1 agente activo en el cwd; se oculta (no se muestra) cuando no hay.
- Tooltip muestra: `${agentId} · ${proposalId} · ${phase} · ${progress}% · ~${etaRange}`. Si `confidence < 0.5` añade `(? confidence)`.
- Click → abre un `WebviewView` con la tabla equivalente a `delendai work agents` (no implementa nuevas queries; reusa la API).
- El coste de polling es ≤ 2 KB por ciclo y no añade tokens al LLM (test de integración con un mock del cliente MCP).
- Detrás de `delendai.config.json#telemetry.chat_intrinsic.enabled` (default `false`): si está en `false`, el item se muestra pero el tooltip no incluye la confianza (sólo progreso + fase).
- El host emite un bloque `host-emitted/work-telemetry` como `host_message` (no como `assistant_message`) en cada turno del agente activo. El bloque es texto plano, no markdown pesado, formato: `◉ ${proposalId}  ${progress}%  ${phase}  ~${etaRange}  ${sourceTag}`.
- El bloque NUNCA entra en el contexto del modelo (no se cuenta en `usage_tracking.llm_tokens_total`); se renderiza en el cliente del chat como un bloque separado del assistant stream.
- El setting `delendai.config.json#telemetry.chat_intrinsic.enabled` (default `false`) controla la inyección; con `false`, el bloque se omite.
- Test `telemetry-no-tokens.spec.ts` (acceptance del plan q00020): arranca un agente mock, dispara 100 tool calls, activa el bloque durante 5 minutos, y verifica que `usage_tracking.llm_tokens_total` es invariante entre los dos extremos.
- El bloque se omite automáticamente cuando el agente está en `WorkPhase: 'done'` o no tiene `work_item_id` activo (degradación silenciosa).
