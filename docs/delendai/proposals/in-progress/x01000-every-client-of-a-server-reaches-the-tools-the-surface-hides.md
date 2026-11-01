---
id: x01000
title: "every client of a server reaches the tools the surface hides"
kind: fix
status: in-progress
type: proposal
track: extension
date: 2026-11-01
last-transition-id: 0615778e-d820-4173-85e4-f09fbd1dfc48
last-correlation-id: 0615778e-d820-4173-85e4-f09fbd1dfc48
last-transition-from: ready
last-transition-at: 2026-11-01T20:08:59.013Z
---

# x01000 — every client of a server reaches the tools the surface hides

## goal

The VS Code extension shows the real state because the shared client reaches a hidden tool the way the CLI always had to, and the tools it reads answer within bounds.

## why

Called the way the extension calls them, nine of twelve tools failed with `not found` or `disabled`, because the managed surface hides plugin tools and only the CLI knew to go through the resolver. Every panel but the overview stayed empty while 325 specs were green: they drive a fake client that answers any name.

Reaching the real server exposed two more defects. `state_health` answered 700 KB: 884 full quarantine rows that were four folder READMEs recorded on every sync, about 220 times each. The KPI panel asked for a name no plugin registers.

## non-goals

- Treating a tool's own failure behind the resolver differently from before.
- Rewriting the existing quarantine log: reading it collapses repeats.

## slices

- global_gate: type

### S1 — The shared client reaches hidden tools
- **Status**: pending
- **Files**: `docs/delendai/TOKEN-BUDGETS.md`, `extensions/vscode/src/providers/kpi-dashboard-provider.ts`, `extensions/vscode/src/test/kpi-dashboard-provider.spec.ts`, `extensions/vscode/src/test/tool-names.spec.ts`, `packages/cli/src/lib/helpers/cli-command.helper.ts`, `packages/cli/src/lib/helpers/tool-request.service.spec.ts`, `packages/client/src/lib/contracts/interfaces/resolved-capability.interface.ts`, `packages/client/src/lib/transport/mcp-stdio-client.ts`, `packages/client/src/lib/transport/tool-reach.helper.ts`, `packages/client/tests/transport/tool-reach.spec.ts`, `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`, `plugins/proposals/src/generated/tool-outputs.ts`, `plugins/proposals/src/lib/proposals/quarantine.ts`, `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`, `plugins/proposals/src/lib/tools/state-tools.tool.ts`, `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry.spec.ts`, `plugins/proposals/tests/src/lib/state-tools.spec.ts`
- **Gate**: type
- acceptance:
  - "A hidden tool answers through the shared client for the CLI, the extension and any other client, and is not asked directly twice."
  - "The CLI holds no routing of its own."
  - "`state_health` shows the newest 20 quarantine rows and the total; a README is not quarantined and one finding is one entry."
  - "A spec holds every tool name the extension calls against the generated catalog."

## acceptance

- A hidden tool answers through the shared client for the CLI, the extension and any other client, and is not asked directly twice.
- The CLI holds no routing of its own.
- `state_health` shows the newest 20 quarantine rows and the total; a README is not quarantined and one finding is one entry.
- A spec holds every tool name the extension calls against the generated catalog.
