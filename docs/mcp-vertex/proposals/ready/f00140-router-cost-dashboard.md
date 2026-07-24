---
id: f00140
kind: feat
title: router cost + recommendation dashboard — surface auto-agent-selector picks and usage-tracking spend in the CLI and VS Code extension
status: ready
date: 2026-07-23
track: plugin+extension+routing
---

# f00140 — router cost + recommendation dashboard

## goal

Make routing decisions **visible and steerable** by surfacing
`auto-agent-selector`'s recommendations (per task type, with cost/quality
rationale) alongside `usage-tracking`'s actual spend, in both the **CLI** and a
**VS Code extension panel** — where the user reviews, compares, and **pins** a
provider. This is `f00119` S6 made concrete and wired to real spend data.

## why

The router already recommends and plans, but the user asked to *see* and
*decide*: which provider for which work, how much has been spent, and whether
a cheaper model would still pass the gate. A dashboard closes the loop so the
"recommend, never dictate" promise is actionable, not buried in tool output —
and it is exactly how the user drives "no gastar tantos tokens" in practice.

## why this design

Read-only projection: pull `auto_recommend`/`auto_status` output +
`usage-tracking` spend rows and render them — no new decision logic. The CLI
command and the extension panel share one **pure view-model builder** (roster ×
recommendation × spend → rows), so both surfaces stay identical and testable
without a UI. Pins are written back through the existing config path (user
always wins).

## non-goals

- No new routing logic — it visualises `auto-agent-selector` + `usage-tracking`.
- No spend without consent; no telemetry upload.
- No provider dictation — the panel recommends; the user pins.

## slices

### S1 — shared view-model builder

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/dashboard/view-model.ts`, `plugins/auto-agent-selector/src/lib/contracts/interfaces/dashboard.interface.ts`
- **Gate**: bun run validate

Pure `buildDashboard(roster, recommendations, spend)` → rows (provider, fit,
cost, spend-to-date, pinned?). Unit-tested without a UI.

### S2 — CLI command

- **Status**: pending
- **Files**: `packages/cli/src/commands/groups/router-dashboard.ts`, `packages/cli/src/lib/help.service.ts`
- **Gate**: bun run validate

`mcpv router` prints the recommendation + spend table with rationale; `--pin`
writes the pin back to config.

### S3 — VS Code extension panel

- **Status**: pending
- **Files**: `extensions/vscode/src/`, `packages/ui-extension/src/`
- **Gate**: bun run validate

A panel rendering the same view-model; review + pin from the UI. Catalog/wiki.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`, `lint:web`).
- `mcpv router` shows per-task recommendations + spend-to-date; `--pin` persists
  and the router honours it.
- The extension panel renders the same rows and can pin.

## notes

Reuses `auto-agent-selector` (recommend/status) + `usage-tracking` (spend) +
`ui-extension`. Concretises f00119 S6.
