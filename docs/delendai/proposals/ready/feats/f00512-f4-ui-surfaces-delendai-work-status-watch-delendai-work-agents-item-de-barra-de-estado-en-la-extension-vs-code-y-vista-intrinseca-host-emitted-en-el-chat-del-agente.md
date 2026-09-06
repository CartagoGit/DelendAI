---
id: f00512
title: "F4 — UI Surfaces: delendai work status [--watch], delendai work agents, item de barra de estado en la extensión VS Code y vista intrínseca host-emitted en el chat del agente"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-06
parent-plan: q00020
depends-on:
    - f00510
    - f00511
cascadeBoost: 1
tags:
    - work-telemetry
    - ui
    - cli
    - vscode-extension
    - non-llm
---

# f00512 — F4 — UI Surfaces: delendai work status [--watch], delendai work agents, item de barra de estado en la extensión VS Code y vista intrínseca host-emitted en el chat del agente

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

### F4-S1 — `delendai work status` — comando CLI que renderiza el snapshot agregado por propuesta (progreso ponderado, fase, ETA, source)
- **Status**: pending
- **DependsOn**: [f00510, f00511]
- **Files**: `packages/cli/src/commands/groups/work.ts`, `packages/cli/src/commands/groups/work.spec.ts`, `packages/cli/src/commands/registry.ts`, `packages/cli/src/lib/work/work-status-renderer.ts`, `packages/cli/src/lib/work/work-status-renderer.spec.ts`
- **Gate**: type
- acceptance:
  - "`delendai work status [proposalId]` existe y devuelve: proposal, lista de slices con `{ sliceId, phase, progress, weight, confidence, eta_p50_ms, eta_p80_ms, eta_reason, source }`."
  - "Sin `[proposalId]` lista todas las proposals activas (status ∈ {in-progress, review}) con su progreso ponderado y ETA agregada."
  - "`--format json` produce una línea JSON estable (mismo input → mismo output byte-a-byte, snapshot estable)."
  - "El campo `source` se imprime siempre (`sqlite-shadow` o `git-fallback`) para que el usuario sepa con qué se calcula."
  - "Test: `bun run packages/cli` `delendai work status --format json` sobre fixtures no añade tokens al LLM (assertion: `usage_tracking.llm_tokens_total` invariante)."

### F4-S2 — `delendai work status --watch` — modo watch (500 ms, polling del SQLite shadow o NDJSON) con render estable (sin parpadeo)
- **Status**: pending
- **DependsOn**: [F4-S1]
- **Files**: `packages/cli/src/commands/groups/work-watch.ts`, `packages/cli/src/commands/groups/work-watch.spec.ts`, `packages/cli/src/lib/work/work-status-watcher.ts`, `packages/cli/src/lib/work/work-status-watcher.spec.ts`
- **Gate**: type
- acceptance:
  - "`delendai work status --watch [proposalId]` entra en bucle con intervalo por defecto 500 ms (configurable con `--interval <ms>`, mínimo 100 ms)."
  - "El render es estable: mismas líneas en dos instantáneas consecutivas no se reescriben; líneas nuevas se insertan sin desplazar las viejas (cursor save/restore ANSI)."
  - "Sale limpiamente con `q` o Ctrl-C (`process.on('SIGINT')`); un test verifica que el intervalo se cancela y no quedan handles abiertos."
  - "El polling consume el SQLite shadow o el NDJSON fallback directamente; nunca pregunta al MCP server ni al LLM (verificado con contador `usage_tracking.llm_tokens_total` invariante en un test de 5 minutos)."

### F4-S3 — `delendai work agents [agentId]` — vista de agentes activos con su AgentSession + fase + último cambio
- **Status**: pending
- **DependsOn**: [F4-S1]
- **Files**: `packages/cli/src/commands/groups/work-agents.ts`, `packages/cli/src/commands/groups/work-agents.spec.ts`, `packages/cli/src/lib/work/work-agents-renderer.ts`
- **Gate**: type
- acceptance:
  - "`delendai work agents` lista todos los agentes con sesión activa: `{ agentId, proposalId, sliceId, phase, progress, lastActivityAt, lastActionKind, source }`."
  - "`delendai work agents <agentId>` muestra además `filesChanged (n)`, `eventsLastHour (n)`, `stalled (bool)`, `etaRange ('~5m [3–8m]')`."
  - "No requiere `git checkout`: lee `git worktree list --porcelain` desde el cwd actual, igual que `delendai agents` de `f00277`."
  - "El output distingue con prefijo `*` el agente que está ejecutando en el cwd actual (vs los que están en otros worktrees)."

### F4-S4 — Item de status bar en la extensión VS Code (icono dinámico, tooltip con propuesta+fase+ETA, hidden cuando no hay agentes activos)
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

### F4-S5 — Vista intrínseca host-emitted en el chat del agente (bloque determinista que el host inyecta, no el modelo)
- **Status**: pending
- **DependsOn**: [F4-S1]
- **Files**: `packages/core/src/lib/host-emitted/work-telemetry-block.ts`, `packages/core/src/lib/host-emitted/work-telemetry-block.spec.ts`, `packages/core/src/lib/mcp/chat-emitter.ts`, `packages/core/src/lib/mcp/chat-emitter.spec.ts`, `packages/core/tests/integration/telemetry-no-tokens.spec.ts`
- **Gate**: type
- acceptance:
  - "El host emite un bloque `host-emitted/work-telemetry` como `host_message` (no como `assistant_message`) en cada turno del agente activo. El bloque es texto plano, no markdown pesado, formato: `◉ ${proposalId}  ${progress}%  ${phase}  ~${etaRange}  ${sourceTag}`."
  - "El bloque NUNCA entra en el contexto del modelo (no se cuenta en `usage_tracking.llm_tokens_total`); se renderiza en el cliente del chat como un bloque separado del assistant stream."
  - "El setting `delendai.config.json#telemetry.chat_intrinsic.enabled` (default `false`) controla la inyección; con `false`, el bloque se omite."
  - "Test `telemetry-no-tokens.spec.ts` (acceptance del plan q00020): arranca un agente mock, dispara 100 tool calls, activa el bloque durante 5 minutos, y verifica que `usage_tracking.llm_tokens_total` es invariante entre los dos extremos."
  - "El bloque se omite automáticamente cuando el agente está en `WorkPhase: 'done'` o no tiene `work_item_id` activo (degradación silenciosa)."

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
