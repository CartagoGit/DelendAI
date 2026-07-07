---
id: f00100
kind: feat
status: ready
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

- **Status**: pending
- **Files**: `extensions/vscode/src/providers/tool-tree-data-provider.ts`, `extensions/vscode/src/commands/open-tool-detail.ts`, `extensions/vscode/src/extension.ts`, `extensions/vscode/package.json`
- **Gate**: cd extensions/vscode && bun run test
- **Acceptance**:
  - "Systematic audit recorded in the proposal: for every exported render*/build* in extensions/vscode/src/views + packages/ui-extension public barrel, name the production call path or mark it dead — the S2 work list is this table."
  - "Clicking a tool item in the mcp-vertex tools tree opens the tool-detail webview (renderToolDetailHtml — schemas, knowledge, metrics) via a new mcp-vertex.openToolDetail command; tree item command wired; parity map updated."

### S2 — Wire the remaining dead ui-extension builders

- **Status**: pending
- **Files**: `extensions/vscode/src/extension.ts`, `extensions/vscode/src/commands/*.ts`, `extensions/vscode/package.json`, `tools/scripts/lint/cli-ui-parity.map.json`
- **Depends on**: S1
- **Gate**: cd extensions/vscode && bun run test
- **Acceptance**:
  - "Every builder the S1 audit marked dead is either wired to a reachable command/view (following the thin-adapter pattern) or removed with a dated rationale — no third state."
  - "Parity map stays green with real mappings (no new waivers for surfaces that now exist)."

### S3 — Contributes polish: menus, icons, activation, walkthrough

- **Status**: pending
- **Files**: `extensions/vscode/package.json`, `extensions/vscode/media/*`
- **Depends on**: S2
- **Gate**: bun run lint
- **Acceptance**:
  - "Provider dashboard, proposals board and tools views get view-title refresh/open buttons (menus.view/title) with codicons; commands get category grouping so the palette reads as one product."
  - "A contributes.walkthroughs entry covers first-run (connect server → overview → dashboard → proposals), replacing zero onboarding today."

### S4 — Registered-command completeness ratchet

- **Status**: pending
- **Files**: `extensions/vscode/src/test/contributes-completeness.spec.ts`
- **Depends on**: S2
- **Gate**: cd extensions/vscode && bun run test
- **Acceptance**:
  - "Spec asserts: every contributes.commands id has a registered handler in activate() (drives the real activate with the injected fake host), and every registered mcp-vertex.* command id is contributed — both directions, so dead-or-phantom commands fail the suite."

## acceptance

- `bun run validate` → exit 0.
- Extension test suite green; smoke spec subscription count updated with a
  dated rationale.
- The S1 audit table shows zero surfaces left in the "dead" state.
