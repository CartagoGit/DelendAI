---
id: f00098
kind: feat
status: ready
type: proposal
track: ui-extension+vscode+web+cli-parity
date: 2026-07-06
title: "Provider dashboard + usage cost analyst + CLI↔UI parity contract (ui-extension + vscode + web)"
shipped-in: []
recan: []
related:
    - f00067 # multi-model orchestrator — shipped the data layer this proposal visualises; explicitly deferred this UI
    - f00067a # provider schema + catalog surface — S2 catalog roster feeds the dashboard
    - f00097 # vscode proposals board — the builder/adapter/web-parity architecture this proposal follows
    - f00046 # CLI coverage conventions — the parity matrix cross-checks its registry groups
ownership:
    - { agent: implementation_runner, task: 'S1: host-agnostic provider-status dashboard builder in packages/ui-extension' }
    - { agent: implementation_runner, task: 'S2: usage cost-analyst card builder in packages/ui-extension' }
    - { agent: implementation_runner, task: 'S3: VS Code provider panel + commands (thin host adapter)' }
    - { agent: implementation_runner, task: 'S4: CLI↔UI parity contract + lint ratchet' }
    - { agent: implementation_runner, task: 'S5: web parity page for providers + usage' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00098 — Provider dashboard + usage cost analyst + CLI↔UI parity contract (ui-extension + vscode + web)

## goal

Ship the visualisation layer f00067 explicitly deferred ("filed once S3–S7
close and the data surface stabilises" — condition now met: orchestrator-runner
+ usage-tracking shipped with 13 tools + CLI surface), and make the extension
UI and the CLI **codependent by contract**: a real-time provider status panel,
a usage/cost analyst card, and a declarative CLI↔UI parity matrix enforced by
lint so every user-facing CLI command group has a discoverable UI affordance
and vice versa. All views must degrade gracefully when the opt-in plugins are
not loaded (they are NOT in any preset). Follow the f00097 architecture:
host-agnostic builder in `packages/ui-extension`, thin host adapter in
`extensions/vscode`, web parity where it makes sense.

## why

f00067 shipped the full data layer (provider roster, routing decisions, quota,
spend governance, usage NDJSON + rollups) and the CLI surface (`mcpv
usage-tracking report|clear`), but the only way to *see* provider health or
spend today is a terminal. The f00067 proposal itself promised the
visualisation as a follow-up once the data surface stabilised — that condition
is met. Separately, the CLI and the extension UI have no contract keeping them
in sync: nothing today stops a new CLI command group from shipping with zero
UI story (or a webview command with no scriptable counterpart), which erodes
the "one product, three hosts" promise. A declarative parity map with a lint
ratchet fixes that class of drift permanently, the same way lint:cli-coverage
already ratchets tool→CLI coverage.

## non-goals

- **No live server dependency on the static web build.** The web page (S5) is
  a documented showcase of the render-model, not a websocket dashboard; the
  GitHub Pages site stays fully static.
- **No polling loops.** The vscode panel refreshes via the existing
  notification/agent-events bridge; no setInterval health polling.
- **No new spend paths.** The dashboard reads usage_report / advise_spend /
  healthcheck output; it never triggers a paid invocation. usage_clear keeps
  its modal confirm (parity with the CLI `--confirm`).
- **No preset changes.** orchestrator-runner + usage-tracking stay opt-in;
  every view must render a helpful opt-in hint (with the exact config snippet)
  when the plugins are absent — never an error state.

## Slices

- global_gate: validate

### S1 — Host-agnostic provider-status dashboard builder (ui-extension)

- **Status**: pending
- **Files**: `packages/ui-extension/src/dashboard/builders/provider-status.builder.ts`, `packages/ui-extension/src/contracts/interfaces/provider-status.interface.ts`, `packages/ui-extension/tests/dashboard/provider-status.builder.spec.ts`
- **Gate**: bun run lint:cross-ide
- **Acceptance**:
  - "Pure builder maps healthcheck_providers + get_quota tool payloads to a render-model (no host API imports); mirrors the IProviderSummary/IProviderAvailability vocabulary from core contracts — no re-invented types."
  - "Graceful degraded state when orchestrator-runner is not loaded (builder returns an explicit 'plugin not loaded — opt-in' model, never throws)."
  - "Spec covers: healthy roster, quota-exceeded provider, empty roster, plugin-absent."
- status: done
### S2 — Usage cost-analyst card builder (ui-extension)

- **Status**: pending
- **Files**: `packages/ui-extension/src/dashboard/builders/usage-cost.builder.ts`, `packages/ui-extension/src/contracts/interfaces/usage-cost.interface.ts`, `packages/ui-extension/tests/dashboard/usage-cost.builder.spec.ts`
- **Gate**: bun run lint:cross-ide
- **Acceptance**:
  - "Builder maps usage_report (group-by provider/plugin/agent/extension) + advise_spend limitsStatus into a card render-model with spend-vs-limit meters; never averages session and monthly spend (matches circuit-breaker semantics)."
  - "Degrades gracefully when usage-tracking absent; spec covers grouped report, limits breach, empty log, plugin-absent."
- status: done
### S3 — VS Code provider panel + commands (thin host adapter)

- **Status**: pending
- **Files**: `extensions/vscode/src/views/provider-dashboard-webview.ts`, `extensions/vscode/src/commands/provider-actions.ts`, `extensions/vscode/src/i18n/provider-dashboard.strings.ts`
- **Depends on**: S1, S2
- **Gate**: bun run lint
- **Acceptance**:
  - "Webview renders the S1+S2 render-models (theme-aware, matches existing tool-detail/proposals-board webview styling); refresh via the notification bridge, no polling."
  - "Commands wrap set_provider_state (pause/resume with reason), healthcheck refresh, usage_clear (with modal confirm — parity with CLI --confirm), usage report open; registered in package.json contributes with strings following the extension i18n convention."
  - "When plugins absent the panel shows the opt-in hint with the exact config snippet, not an error."

### S4 — CLI↔UI parity contract + lint (the codependency ratchet)

- **Status**: pending
- **Files**: `tools/scripts/lint/cli-ui-parity.script.ts`, `tools/scripts/lint/cli-ui-parity.map.json`, `tools/scripts/lint/cli-ui-parity.script.spec.ts`
- **Gate**: bun run lint:proposals
- **Acceptance**:
  - "Declarative map: every CLI command group → its UI affordance (vscode command id / view id / web route) or an explicit documented waiver (e.g. shell-only commands like completion); every contributed vscode command → its CLI counterpart or waiver."
  - "Script cross-checks the map against packages/cli registry groups AND extensions/vscode package.json contributes; fails on unmapped entries — new CLI groups can never silently lack a UI story again."
  - "Wired into `bun run validate` after lint:cli-shape; repo passes with the initial map (usage-tracking group maps to S3's panel)."

### S5 — Web parity (providers + usage docs surface)

- **Status**: pending
- **Files**: `apps/web/src/pages/providers.astro`, `apps/web/src/data/provider-dashboard.ts`, `apps/web/src/i18n/provider-dashboard.ts`
- **Depends on**: S1
- **Gate**: bun run lint:web
- **Acceptance**:
  - "Web page documents the provider roster config (opt-in example, env-var-only secrets) and renders a static showcase of the dashboard render-model (reuses S1 vocabulary; no live server dependency on the static site)."
  - "12-lang i18n map follows the install-ecosystems pattern; registered in PAGES_AUDIT; astro check + build green."

## acceptance

- `bun run typecheck` → exit 0.
- `bun run test` → exit 0.
- `bun run validate` → exit 0 (including the new lint:cli-ui-parity once S4
  lands).
- Every view degrades to an opt-in hint (never an error) when
  orchestrator-runner / usage-tracking are not loaded.
