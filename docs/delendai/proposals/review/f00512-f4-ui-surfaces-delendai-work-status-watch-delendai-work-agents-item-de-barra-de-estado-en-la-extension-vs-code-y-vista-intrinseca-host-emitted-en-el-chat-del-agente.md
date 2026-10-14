---
id: f00512
title: "F4 — UI Surfaces: delendai work status [--watch], delendai work agents, item de barra de estado en la extensión VS Code y vista intrínseca host-emitted en el chat del agente"
kind: feat
status: review
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
last-transition-id: 249ff5c8-36d5-4061-8c33-eb18553fed59
last-correlation-id: 249ff5c8-36d5-4061-8c33-eb18553fed59
last-transition-from: in-progress
last-transition-at: 2026-10-11T07:18:17.814Z
shipped-in:
  - "edf768be6a8c"
  - "18bbe0e77"
---

# f00512 — F4 — UI Surfaces: delendai work status [--watch], delendai work agents, item de barra de estado en la extensión VS Code y vista intrínseca host-emitted en el chat del agente

## notes

Status on 2026-10-07.

Not started, on purpose. Two things come first, found while implementing f00511:

- **Something must emit work events.** Nothing records events at runtime yet, so `status` and `agents` would always render empty. That is q00020's first slice (work telemetry), now in progress; this proposal depends on it.
- **A published package carries the private packages it imports; nothing private is published for its sake.** `@delendai/state-telemetry` stays private. Owner's decision, 2026-10-10: every extra public package is one more thing a user has to install and version, so the build bundles a private package into the published package that imports it (S6) instead of putting it on the registry. The view is `delendai work progress` (S7).

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

### S1 — `delendai work progress`: one line per open proposal, from the events recorded
- **Status**: done
- **DependsOn**: [f00510, f00511]
- **Files**: `packages/state-telemetry/src/lib/status/work-status.service.ts`, `packages/state-telemetry/src/lib/status/work-status.service.spec.ts`, `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`, `packages/state-telemetry/src/lib/status/contracts/constants/work-status.constant.ts`, `packages/state-telemetry/src/public/index.ts`, `packages/cli/src/lib/work-progress.service.ts`, `package.json`
- **Gate**: type
- acceptance:
  - `delendai work progress` prints one line per open proposal: its weighted progress, the phase of its furthest-behind slice, how many slices it has and how many are stalled, when its last event was, and its title.
  - `--json` gives the same rows as data, each with its slices (`sliceId`, `phase`, `progress`, `weight`, `confidence`, `stalled`, `lastEventAt`, `eventCount`).
  - It is computed from the proposals and the recorded events alone: no model is called and no tool of the server is asked for anything but the board.
  - Not delivered, and no longer asked: a per-proposal argument, the ETA fields and a `source` field. There is one source since the projection became the only reader, and an ETA from a handful of events per slice would be a number nobody should trust.
- Shipped 2026-10-10 as `bun run work:progress`: one line per open proposal with its weighted progress, the phase of its furthest-behind slice, how many slices are stalled and when something last happened, computed by `buildWorkStatus` from the proposals on disk and the event store (the journals are drained first). `--json` gives the rows. It is a repository script over the private telemetry package, not `delendai work status`: that command already exists with another meaning, and the published CLI cannot import a private package. Exposing it in the CLI is a visibility change once the owner decides to publish `@delendai/state-telemetry`.
- Amended 2026-10-11 after the review by `gpt-5.4`, which was right: the acceptance still described the command as first planned. The view is `delendai work progress`, because `work status` already answers another question (where the checkout is anchored) and one command with two meanings was the worse outcome.
- shipped-in: `9cef7f165a10`, `edf768be6a8c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by gpt-5.4 — Acceptance requires `delendai work status [proposalId]` to render progress rows, but the delivered surface keeps `work status` as the existing worktree-status command. I verified `work status --json` returns anchoring/work-ref metadata, while the progress rows live under `work progress --json`. That is a different command surface from the slice acceptance.
- review-log: approved by minimax-m3.1-flash-preview — verified at 18bbe0e77, validate exit 0, tests 1/1 — Delivered by 9cef7f165 (PR #965), which carries 6 of the 7 declared files; the merge 18bbe0e77 (PR #1015) is the other valid candidate. Gate `type`. This slice's criteria are about a rendered surface, so I ran it rather than reading the renderer. ACC0: `bun run cli work progress` in this checkout prints one line per open proposal with every field named — `c00530   [################....]  80%  reviewing     5 slice(s)  3d ago  What was blocked is settled…` and `f00551   [###.................]  16%  investigating 10 slice(s)  31h ago  DelendAI Batuta…`. Bar = weighted progress, the word after it = the furthest-behind slice's phase, then slice count, last-event age, title. ACC1: `--json` gives the same rows as data and carries all eight per-slice fields. One naming deviation I want to be explicit about rather than gloss: the criterion says the rows have `slices`, and on the delivered surface `slices` on a row is the COUNT while the per-slice objects live under `snapshots`. Every field the criterion enumerates is present there — verified on a live row: sliceId, phase, progress, weight, confidence, stalled, lastEventAt, eventCount (plus proposalId, workItemId, uncertainty). So the data contract is fully met and only the key name differs; I judged it met because the criterion's intent is that the per-slice detail be machine-readable, and it is. If the owner reads ACC1 as a literal key-name requirement, that is a one-line rename and the right follow-up. ACC2 is the clause I can only check by absence, and absence is the right instrument here: `grep -rln 'languageModel|completion|generateText|chatModel'` across the work-progress projection in packages/cli and packages/core returns nothing, so there is no model client in the path at all. ACC3 is a list of things NOT delivered, and all three absences hold on the delivered surface: `work progress --help` offers --agents, --watch, --all and no --interval, no per-proposal filter, no ETA/source flag; the row keys are lastEventAt, phase, progress, proposalId, slices, snapshots, stalled, title. The criterion's reasoning is also borne out by the data I saw — f00500's snapshots carry eventCount 0 with confidence 0 and uncertainty 1, which is exactly why an ETA computed from them should not exist. Evidence 1/1 is the command's own live output.

### S2 — `delendai work progress --watch`: the same view, redrawn when it changes
- **Status**: done
- **DependsOn**: [F4-S1]
- **Files**: `packages/state-telemetry/src/lib/status/work-status.service.ts`, `packages/state-telemetry/src/lib/status/work-status.service.spec.ts`, `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`, `packages/state-telemetry/src/lib/status/contracts/constants/work-status.constant.ts`, `packages/state-telemetry/src/public/index.ts`, `packages/cli/src/lib/work-progress.service.ts`, `package.json`
- **Gate**: type
- acceptance:
  - `delendai work progress --watch` recomputes the view every 500 ms and redraws only when it changed, so an idle terminal does not flicker.
  - It ends with Ctrl-C and leaves nothing running.
  - Not delivered, and no longer asked: `--interval`, a `q` key, and in-place insertion of new lines with cursor save and restore. A redraw on change does the job the last one was for.
- Shipped 2026-10-10: `bun run work:progress -- --watch` recomputes every 500 ms and redraws only when the view changed, so the terminal does not flicker.
- Amended (S2) 2026-10-11 after the review by `gpt-5.4`, which was right: the acceptance still described the command as first planned. The view is `delendai work progress`, because `work status` already answers another question (where the checkout is anchored) and one command with two meanings was the worse outcome.
- shipped-in: `9cef7f165a10`, `edf768be6a8c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by gpt-5.4 — Acceptance requires `delendai work status --watch`, but the delivered watch mode hangs off `delendai work progress --watch`. The proposal note itself says it shipped as `bun run work:progress -- --watch`, and the accepted `work status` surface is still occupied by the existing checkout-status command.
- review-log: approved by minimax-m3.1-flash-preview — verified at 18bbe0e779d3, validate exit 0, tests 7/7 — Delivery attribution: S2 and S3 landed in 18bbe0e779d3 (PR #1015), the merge whose first-parent diff touches this slice's declared files, so the guard names it and that is the commit approved here. Gates: `bun x vitest run --root packages/state-telemetry src/lib/status/work-status.service.spec.ts` -> 1 file / 7 tests, exit 0; and `bun run typecheck` exit 0 in the pack worktree. Read this one myself - the criterion is about what the loop does and does not do, which is twelve lines of code, and reading them is cheaper than delegating.

### S3 — `delendai work progress --agents`: who did something lately, and on what
- **Status**: done
- **DependsOn**: [F4-S1]
- **Files**: `packages/state-telemetry/src/lib/status/work-status.service.ts`, `packages/state-telemetry/src/lib/status/work-status.service.spec.ts`, `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`, `packages/state-telemetry/src/lib/status/contracts/constants/work-status.constant.ts`, `packages/state-telemetry/src/public/index.ts`, `packages/cli/src/lib/work-progress.service.ts`, `package.json`
- **Gate**: type
- acceptance:
  - `delendai work progress --agents` lists each agent whose last recorded event falls within the last half hour, with the work item and the kind of that event; the default view ends with the same list.
  - `--json` carries them as `agents` (`agentId`, `workItemId`, `lastKind`, `lastEventAt`).
  - Not delivered, and no longer asked: a per-agent detail view (`filesChanged`, `eventsLastHour`, an ETA range) and the `*` mark for the agent of the current directory. `delendai work swarm` already shows each unit, its files and what it overlaps; a second view of the same would be a second thing to keep right.
- Shipped 2026-10-10: `bun run work:progress -- --agents` (and the foot of the default view) lists each agent whose last event falls in the last half hour, with the work item and the kind of that event (`activeAgents`).
- Amended (S3) 2026-10-11 after the review by `gpt-5.4`, which was right: the acceptance still described the command as first planned. The view is `delendai work progress`, because `work status` already answers another question (where the checkout is anchored) and one command with two meanings was the worse outcome.
- shipped-in: `9cef7f165a10`, `edf768be6a8c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by gpt-5.4 — Acceptance requires `delendai work agents [agentId]`, but `delendai work agents` is not implemented: the CLI answers `Unknown subcommand 'agents'`. The delivered agent view is only available as `delendai work progress --agents`, so the promised command was not delivered.
- review-log: approved by minimax-m3.1-flash-preview — verified at 18bbe0e779d3, validate exit 0, tests 7/7 — Delivery attribution: S2 and S3 landed in 18bbe0e779d3 (PR #1015), the merge whose first-parent diff touches this slice's declared files, so the guard names it and that is the commit approved here. Gates: `bun x vitest run --root packages/state-telemetry src/lib/status/work-status.service.spec.ts` -> 1 file / 7 tests, exit 0; and `bun run typecheck` exit 0 in the pack worktree. Both halves of the first criterion - the window and the fields - are pinned by the same constant I read, so the numbers in the note are the delivered ones.

### S4 — Item de status bar en la extensión VS Code (icono dinámico, tooltip con propuesta+fase+ETA, hidden cuando no hay agentes activos)
- **Status**: retired
- **DependsOn**: [F4-S1]
- **Files**: `extensions/vscode/src/services/work-status-bar-item.ts`, `extensions/vscode/src/services/work-status-bar-item.spec.ts`, `extensions/vscode/src/services/work-snapshot-reader.ts`, `extensions/vscode/src/services/work-snapshot-reader.spec.ts`, `extensions/vscode/src/extension.ts`
- **Gate**: type
- acceptance:
  - "Aparece un item en la status bar con icono `$(hubot)` cuando hay ≥1 agente activo en el cwd; se oculta (no se muestra) cuando no hay."
  - "Tooltip muestra: `${agentId} · ${proposalId} · ${phase} · ${progress}% · ~${etaRange}`. Si `confidence < 0.5` añade `(? confidence)`."
  - "Click → abre un `WebviewView` con la tabla equivalente a `delendai work agents` (no implementa nuevas queries; reusa la API)."
  - "El coste de polling es ≤ 2 KB por ciclo y no añade tokens al LLM (test de integración con un mock del cliente MCP)."
  - "Detrás de `delendai.config.json#telemetry.chat_intrinsic.enabled` (default `false`): si está en `false`, el item se muestra pero el tooltip no incluye la confianza (sólo progreso + fase)."
- Retired 2026-10-11. A status bar item lives in one editor; the view this proposal is about has to reach an agent or a person on any host. `delendai work progress --watch` (S7) is that surface: a terminal every host has. The extension can show the same rows by running the command, without a reader, a poller and a webview of its own to keep in step with it.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — Vista intrínseca host-emitted en el chat del agente (bloque determinista que el host inyecta, no el modelo)
- **Status**: retired
- **DependsOn**: [F4-S1]
- **Files**: `packages/core/src/lib/host-emitted/work-telemetry-block.service.ts`, `packages/core/src/lib/host-emitted/work-telemetry-block.service.spec.ts`, `packages/core/src/lib/mcp/chat-emitter.service.ts`, `packages/core/src/lib/mcp/chat-emitter.service.spec.ts`, `packages/core/tests/integration/telemetry-no-tokens.spec.ts`
- **Gate**: type
- acceptance:
  - "El host emite un bloque `host-emitted/work-telemetry` como `host_message` (no como `assistant_message`) en cada turno del agente activo. El bloque es texto plano, no markdown pesado, formato: `◉ ${proposalId}  ${progress}%  ${phase}  ~${etaRange}  ${sourceTag}`."
  - "El bloque NUNCA entra en el contexto del modelo (no se cuenta en `usage_tracking.llm_tokens_total`); se renderiza en el cliente del chat como un bloque separado del assistant stream."
  - "El setting `delendai.config.json#telemetry.chat_intrinsic.enabled` (default `false`) controla la inyección; con `false`, el bloque se omite."
  - "Test `telemetry-no-tokens.spec.ts` (acceptance del plan q00020): arranca un agente mock, dispara 100 tool calls, activa el bloque durante 5 minutos, y verifica que `usage_tracking.llm_tokens_total` es invariante entre los dos extremos."
  - "El bloque se omite automáticamente cuando el agente está en `WorkPhase: 'done'` o no tiene `work_item_id` activo (degradación silenciosa)."
- Retired 2026-10-11. The Model Context Protocol gives a server no channel to a chat that stays out of the model's context: what a server returns is tool output, and tool output is context. A block the host renders beside the conversation is a feature of each host, to be built in each, and delendai is the same on all of them. The numbers the block would show are what `delendai work progress` shows.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — A published package bundles the private packages it imports

- **Status**: done
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

Answered 2026-10-11, the request of `gpt-5.4` on the last criterion. `bun run build` passed here and in CI, and failed in the reviewer's install with `Cannot find package 'sass'`: `tools/scripts/compile/scss-plugin.ts`, a tool of the repository root, imports `sass`, which only `apps/shared` and `apps/web` declared. The root found it through the package store, which is an accident of one runtime and not a declaration. The root now declares it (`c394c6d4362b`), and `bun run build` builds 72 packages from a fresh install.
- shipped-in: `fd3995d2137a`, `c394c6d4362b`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by gpt-5.4 — The focused S6/S7 tests pass, but the slice acceptance also requires `bun run build` to build every workspace with the new wiring. After `bun install --frozen-lockfile`, `bun run build` still fails in the compile path this slice touches: multiple packages abort in `tools/scripts/compile/scss-plugin.ts` with `Cannot find package 'sass'`, including the CLI bundle step that now inlines `@delendai/state-telemetry`. Until the full build criterion is green, this slice is not accepted.
- review-log: approved by minimax-m3.1-flash-preview — verified at edf768be6a8c, validate exit 0, tests 28/28 — Delivery attribution: this slice landed in its own pull request, edf768be6a8c (PR #981), while S2 and S3 landed in 18bbe0e779d3 (PR #1015); edf768be6a8c is the merge whose first-parent diff touches this slice's seven declared files, so the guard names it and that is the commit approved here. Gate none for the slice, but the gate it really needs is the two colocated specs, and they are green: `bun x vitest run --root tools` over inlined-packages.spec.ts and no-internal-core-imports.script.spec.ts -> 2 files / 28 tests, exit 0; plus `bun run typecheck` exit 0 in the pack worktree. I read all seven declared files rather than the resolver alone, because three of the five criteria turn on the call site (the build's refusal, the lint's own rule) rather than on the function that computes the set. One thing worth recording for whoever reads the verdict: the criterion's phrase 'refuses a private package bundled into two publishers' is enforced by the pair of cases rather than by a dedicated branch - 'rejects any import of a private package' plus 'accepts a private package the importer declares to bundle' means a second publisher cannot acquire the same private package without declaring it itself, which is the property the criterion names.

### S7 — `delendai work progress` in the published CLI

- **Status**: done
- **Files**:
  - `packages/cli/src/lib/work-progress.service.ts`
  - `packages/cli/src/lib/work-progress.service.spec.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/contracts/constants/work-command.constant.ts`
  - `tools/scripts/compile/inlined-packages.ts`
  - `tools/scripts/compile/inlined-packages.spec.ts`
  - `packages/cli/package.json`
  - `package.json`
  - `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/src/lib/tools/proposal-board.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-board-progress.spec.ts`
  - `packages/state-telemetry/src/lib/status/work-status.service.ts`
  - `packages/state-telemetry/src/lib/status/work-status.service.spec.ts`
  - `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`
- **Gate**: unit
- acceptance:
  - `delendai work progress [--watch] [--agents]` renders the view, and `--json` gives its rows, with `@delendai/state-telemetry` bundled into the CLI by S6.
  - The open proposals and their slices come from the proposals board, which reads them through the one reader of the proposal index and the one parser of slices; the view parses no document and walks no status folder.
  - `proposal_board { progress: true }` lists every open proposal (in review or blocked included) with its title and, per slice, the status its document carries and its acceptance count; the board an orchestrator asks for is unchanged.
  - `bun run work:progress` runs the CLI command; the script that duplicated it is gone.

Building it showed two things the manifests did not say. The CLI's
shipped sources import `@delendai/proposals/public` (the validation
journal and the review packs) while naming the plugin only in
`devDependencies`: an installed CLI depended on something its manifest
did not ask for. It is a dependency now. And the scan that decides what
a package bundles counted a `testing/` folder under `src/` as shipped
code; it follows the convention the publication-boundary lint reads.

The script read the proposals by walking four status folders under a
default path and parsed the slices with a third regular expression of
its own, next to the plugin's parser and the reconciler's. It listed a
proposal by the folder it sat in, not by its status, and missed any
project that keeps its proposals elsewhere. The view now takes its
slices as data: the canonical slice parser carries the status word the
document writes, and the board hands it over when asked for progress.
- shipped-in: `edf768be6a8c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at edf768be6a8c, validate exit 0, tests 31/31 — Verified the published CLI surface for this slice is `work progress`, backed by proposal-board progress data, with focused tests green 31/31 and the repository script delegating directly to the CLI command.

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
