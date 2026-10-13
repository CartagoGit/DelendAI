---
id: f00100
kind: feat
status: done
type: proposal
track: extensions/vscode+ui-extension
date: 2026-07-07
title: "VS Code extension completeness — wire dead surfaces, fill the reachable-feature gaps"
shipped-in: []
recan: []
related:
    - f00097 # proposals board — the last surface that WAS fully wired end-to-end
    - f00098 # provider dashboard + parity ratchet — the parity map documents what the UI claims to offer
    - f00099 # style integrity — visual half of the same npm-perfection gate
    - c00002 # npm publish gate
ownership:
    - { agent: implementation_runner, task: 'S1: reachability audit + wire tool-detail from the tools tree' }
    - { agent: implementation_runner, task: 'S2: wire remaining dead ui-extension builders (knowledge navigator, toolbar, settings)' }
    - { agent: implementation_runner, task: 'S3: contributes polish — menus, icons, activation, walkthrough' }
    - { agent: implementation_runner, task: 'S4: registered-command completeness ratchet' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: cd extensions/vscode && bun run test, expect: exit0 }
---

# f00100 — VS Code extension completeness: wire dead surfaces, fill the gaps

## goal

Close the gap the user described as "la extensión no tiene casi nada de lo
que debería": every capability the codebase already ships must be REACHABLE
from the VS Code UI (not dead code behind an unwired renderer), the
contributes surface must expose it discoverably (view-title buttons, menus,
walkthrough), and a ratchet must keep "renderer exists but nothing calls
it" from ever shipping again (the unit-green ≠ integrated lesson, now for
UI surfaces).

## why

The audit trail proves the pattern: `renderToolDetailHtml` +
`renderOutputSchema` are only invoked by the dev harness — clicking a tool
in the tools tree does NOT open the detail panel that was built for exactly
that. f00094 merged as dead code the same way. `packages/ui-extension`
ships builders (knowledge navigator, toolbar quick-actions, settings
renderer, dashboard panels) whose reachability from the actual extension
has never been audited as a set. The f00098 parity map now DOCUMENTS what
the UI claims; this proposal makes the claims true and complete.

## non-goals

- **No new data surfaces.** Everything wired here already has a builder,
  service, or tool; this is reachability + discoverability work.
- **No webview scripting beyond the existing message-bridge pattern.**
- **No marketplace publishing** (that is c00002's gate).

## Slices

- global_gate: validate

### S1 — Reachability audit + wire tool-detail from the tools tree

- **Status**: done
- **Files**: `extensions/vscode/src/providers/tool-tree-data-provider.ts`, `extensions/vscode/src/commands/open-tool-detail.ts`, `extensions/vscode/src/extension.ts`, `extensions/vscode/package.json`
- **Gate**: cd extensions/vscode && bun run test
- **Acceptance**:
  - "Systematic audit recorded in the proposal: for every exported render*/build* in extensions/vscode/src/views + packages/ui-extension public barrel, name the production call path or mark it dead — the S2 work list is this table."
  - "Clicking a tool item in the mcp-vertex tools tree opens the tool-detail webview (renderToolDetailHtml — schemas, knowledge, metrics) via a new mcp-vertex.openToolDetail command; tree item command wired; parity map updated."

**Implementation note (2026-07-11):** `toolNode(...)` now attaches
`mcp-vertex.openToolDetail` to every tool leaf. The new command builds a
script-free detail webview from the live tool descriptor, `listTools()`
schemas, optional knowledge, and metrics, then renders the existing
`renderToolDetailHtml(...)` / `renderOutputSchema(...)` surface. The command
is contributed in `package.json`, mapped in `cli-ui-parity.map.json`, and
covered by `open-tool-detail.spec.ts` plus the tree-provider assertion.

#### Reachability audit (2026-07-11)

| Exported surface | Production call path | State |
| --- | --- | --- |
| `extensions/vscode/src/views/agent-catalog-webview.ts#renderAgentCatalogWebview` | `activate()` -> `registerOpenAgentCatalogCommand()` -> `buildAgentCatalogHtml()` | reachable |
| `extensions/vscode/src/views/tool-detail-webview.ts#renderToolDetailHtml` | `activate()` -> `registerOpenToolDetailCommand()` -> `buildToolDetailHtml()` -> tool tree leaf command | reachable |
| `extensions/vscode/src/views/tool-detail-webview.ts#renderToolDetailBody` | Dev-preview body helper for the same detail markup; full production shell is `renderToolDetailHtml()` | helper, no S2 action |
| `extensions/vscode/src/views/render-output-schema.ts#renderOutputSchema` | `renderToolDetailHtml()` and `renderToolDetailBody()` render input/output schemas | reachable |
| `extensions/vscode/src/views/proposal-detail-webview.ts#renderProposalDetailHtml` | `activate()` -> `registerOpenProposalCommand()` -> proposal tree/detail path | reachable |
| `extensions/vscode/src/views/metrics-sparkline.ts#renderMetricsHtml` | `activate()` -> `registerShowMetricsCommand()` | reachable |
| `extensions/vscode/src/views/metrics-sparkline.ts#renderMetricsSparkline` | composed by `renderMetricsHtml()` and `renderMetricsBody()` | reachable helper |
| `extensions/vscode/src/views/metrics-sparkline.ts#renderMetricsBody` | Dev-preview body helper for the same metrics markup; full production shell is `renderMetricsHtml()` | helper, no S2 action |
| `extensions/vscode/src/views/provider-dashboard-webview.ts#renderProviderDashboardHtml` | `activate()` -> `registerProviderActionCommands()` -> open/repaint provider dashboard | reachable |
| `packages/ui-extension/public#buildProviderStatusModel` | `registerProviderActionCommands()` -> `fetchViewModel()` -> `renderProviderDashboardHtml()` | reachable |
| `packages/ui-extension/public#buildUsageCostModel` | `registerProviderActionCommands()` -> `fetchViewModel()` -> `renderProviderDashboardHtml()` | reachable |
| `packages/ui-extension/public#renderDashboard` | `activate()` -> `registerOpenDashboardCommand()` -> `DashboardService.getAllModels()` | reachable |
| `packages/ui-extension/public#renderPanelAgents`, `renderPanelMetrics`, `renderPanelOverview`, `renderPanelPlugins`, `renderPanelSessions`, `renderPanelTimes`, `renderPanelTokens`, `renderPanelTools`, `renderPanelHealth`, `renderPanelMemory` | composed inside `renderDashboard()` | reachable helpers |
| `packages/ui-extension/public#renderKnowledgeNavigator` | `activate()` -> `registerOpenKnowledgeCommand()` -> `KnowledgeService.listByCategory()` | reachable |
| `packages/ui-extension/public#renderSettings` | `activate()` -> `registerOpenSettingsCommand()`; save/reset messages bridge to `mcp-vertex.saveSettings` / `mcp-vertex.resetSettings` | reachable |
| `packages/ui-extension/public#renderHeaderBar`, `renderDropdown`, `renderDisclosure`, `renderLanguagePicker`, `renderToast`, `renderRuntime` | composed by the public dashboard/settings/knowledge/toolbar renderers | reachable helpers |
| `packages/ui-extension/public#renderToolbar` | `activate()` -> `registerOpenToolbarCommand()` -> loaded-plugin filtered quick actions | reachable |

No exported production renderer/build model remains in the dead state after
S1. The only direct non-production entries are body helpers intentionally kept
for the dev preview shell and composed by the production renderer family.

### S2 — Wire the remaining dead ui-extension builders

- **Status**: done
- **Files**: `extensions/vscode/src/extension.ts`, `extensions/vscode/src/commands/*.ts`, `extensions/vscode/package.json`, `tools/scripts/lint/cli-ui-parity.map.json`
- **Depends on**: S1
- **Gate**: cd extensions/vscode && bun run test
- **Acceptance**:
  - "Every builder the S1 audit marked dead is either wired to a reachable command/view (following the thin-adapter pattern) or removed with a dated rationale — no third state."
  - "Parity map stays green with real mappings (no new waivers for surfaces that now exist)."

**Implementation note (2026-07-11):** S1 left no dead production builder in
the S2 work list. Existing knowledge, toolbar, settings, dashboard, metrics,
proposal detail, and provider-dashboard paths were verified as reachable; the
only missing path was the tool-detail command added in S1. Parity remains
green with `mcp-vertex.openToolDetail` mapped to `overview` as the scriptable
tool-discovery counterpart.

### S3 — Contributes polish: menus, icons, activation, walkthrough

- **Status**: done
- **Files**: `extensions/vscode/package.json`, `extensions/vscode/media/walkthrough/*`
- **Depends on**: S2
- **Gate**: bun run lint
- **Acceptance**:
  - "Provider dashboard, proposals board and tools views get view-title refresh/open buttons (menus.view/title) with codicons; commands get category grouping so the palette reads as one product."
  - "A contributes.walkthroughs entry covers first-run (connect server → overview → dashboard → proposals), replacing zero onboarding today."

**Implementation note (2026-07-11):** `package.json` now groups contributed
commands under the `MCP Vertex` category, adds codicons to refresh/open
affordances, exposes view-title actions for tools, proposals, memory, and the
provider dashboard entry points, and hides internal settings save/reset
commands from the palette. `contributes.walkthroughs` now covers connect,
overview, dashboard, and proposals with markdown media under
`extensions/vscode/media/walkthrough/`.

### S4 — Registered-command completeness ratchet

- **Status**: done
- **Files**: `extensions/vscode/src/test/contributes-completeness.spec.ts`
- **Depends on**: S2
- **Gate**: cd extensions/vscode && bun run test
- **Acceptance**:
  - "Spec asserts: every contributes.commands id has a registered handler in activate() (drives the real activate with the injected fake host), and every registered mcp-vertex.* command id is contributed — both directions, so dead-or-phantom commands fail the suite."

**Implementation note (2026-07-11):** `contributes-completeness.spec.ts`
activates the real extension through the injected fake host and checks both
directions: contributed command without handler and registered
`mcp-vertex.*` handler without contribution. The ratchet exposed
`mcp-vertex.saveSettings` and `mcp-vertex.resetSettings`; both are now
declared, hidden from the palette, and mapped in CLI/UI parity as internal
settings-webview handlers.

## acceptance

- `bun run validate` → exit 0.
- Extension test suite green; smoke spec subscription count updated with a
  dated rationale.
- The S1 audit table shows zero surfaces left in the "dead" state.
