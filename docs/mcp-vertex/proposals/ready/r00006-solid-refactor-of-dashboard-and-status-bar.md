---
id: r00006
status: ready
type: proposal
track: solid+architecture+extension-ux
date: 2026-06-25
kind: refactor
title: SOLID refactor of dashboard renderer and status bar (SRP/OCP)
shipped-in: []
recan: []
related:
    - a00040 # audit that surfaced these findings (H22/H24/H25/H26/H27/H29/H30)
    - f00060 # sibling (CSS tokens)
    - f00058 # sibling (webview-hardening)
ownership:
    - { agent: proposal_guardian,    task: 'S1: split `renderDashboard` (820 LOC god function) into 5 single-responsibility builders (H29 SRP)' }
    - { agent: implementation_runner, task: 'S2: `render-panel-tools.ts` sparkline is computed from per-tool latency series, not a constant (H22 OCP)' }
    - { agent: implementation_runner, task: 'S3: `barChart` accepts an `ariaLabel` prop and renders `<svg role="img" aria-label>` (H24 OCP)' }
    - { agent: implementation_runner, task: 'S4: `Toast` sticky mode gets a close button + Esc handler + `aria-label` (H25 OCP)' }
    - { agent: implementation_runner, task: 'S5: `kpiStrip` gets `flex-wrap: wrap` + min-width per KPI (H26 OCP)' }
    - { agent: implementation_runner, task: 'S6: Tabs add `aria-controls`, roving tabindex, ArrowLeft/Right handler (H27 OCP)' }
    - { agent: implementation_runner, task: 'S7: `McpVertexStatusBar` `STATUS_BAR_EVENTS` becomes a discriminated union keyed by event + locale (H30 OCP)' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run lint:scss,  expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
---

# r00006 — SOLID refactor of dashboard renderer and status bar

## goal

Close audit `a00040` findings **H22, H24, H25, H26, H27, H29, H30** by applying
**SRP** (split `renderDashboard`) and **OCP** (each component opens for extension via
new props, closed for modification) to the 7 components the audit flagged.

The 7 slices are independent. Each is ≤ 1 component.

## why

`a00040` walked every component in
[`packages/ui-extension/src/components/`](packages/ui-extension/src/components/ ) and
found:

- **H22** — [`render-panel-tools.ts`](packages/ui-extension/src/renderers/render-panel-tools.ts )
  renders a sparkline as a constant value (a horizontal line). A sparkline is supposed
  to be a **trend** over a time series — the data is available in
  `mcp-vertex.metrics` but the renderer ignores it.
- **H24** — [`barChart`](packages/ui-extension/src/components/bar-chart.ts ) has no
  `aria-label`. Screen readers can't announce it. The component does accept `title`
  but renders it as a `<title>` SVG element which is non-standard.
- **H25** — [`Toast`](packages/ui-extension/src/components/toast.ts ) in `sticky` mode
  has no close button. The user can't dismiss a sticky toast without waiting it out
  (it doesn't auto-dismiss).
- **H26** — [`kpiStrip`](packages/ui-extension/src/components/kpi-strip.ts ) renders 8
  KPIs inline with `display: flex` (no wrap). In a narrow sidebar (≤ 280px) the strip
  overflows.
- **H27** — [`Tabs`](packages/ui-extension/src/components/tabs.ts ) lacks `aria-controls`
  on the tab buttons and has no roving tabindex (Arrow keys don't move focus between
  tabs). The WAI-ARIA Authoring Practices require both.
- **H29** — [`renderDashboard`](packages/ui-extension/src/renderers/render-dashboard.ts )
  is an **820 LOC god function** that builds the header, KPI strip, tools panel,
  knowledge navigator, settings link, and footer all in one. It violates SRP.
- **H30** — [`STATUS_BAR_EVENTS`](packages/ui-extension/src/status-bar/status-bar-events.ts )
  mixes English + Spanish literals and is a plain `Record<string, string>`. Adding a
  new event requires editing the table AND the dispatcher. OCP violation.

The fix is the same as the audit's Phase 9 recommendation: **each component owns one
shape; the dashboard composes them**.

## why this design

**SRP via builders** keeps the public API stable. `renderDashboard(bridge)` is still
the entry point; internally it delegates to `buildHeader`, `buildKpiStrip`,
`buildToolsPanel`, `buildKnowledgeNav`, `buildFooter`. Each builder is independently
testable.

**OCP via discriminated unions + props** lets a host add a new tab, KPI, or toast
without modifying the component (the host passes a new array element / event).

## non-goals

- Replacing the dashboard with a web framework (React, Lit). The audit endorses the
  current string-template approach.
- Adding animations or transitions. The audit's a11y findings (H25/H27) are functional,
  not visual.

## architecture

```
packages/ui-extension/src/
  renderers/
    render-dashboard.ts        # MODIFY: 820 → 100 LOC; delegates to builders
    dashboard/
      build-header.ts          # NEW: SRP extract
      build-kpi-strip.ts       # NEW: SRP extract
      build-tools-panel.ts     # NEW: SRP extract (consumes sparkline series)
      build-knowledge-nav.ts   # NEW: SRP extract
      build-footer.ts          # NEW: SRP extract
  components/
    bar-chart.ts               # MODIFY: accept ariaLabel; role="img"
    toast.ts                   # MODIFY: sticky → close button + Esc
    kpi-strip.ts               # MODIFY: flex-wrap + min-width
    tabs.ts                    # MODIFY: aria-controls + roving tabindex + Arrow keys
  status-bar/
    status-bar-events.ts       # REWRITE: discriminated union + locale-aware
```

## Slices

- global_gate: validate

### S1 — split `renderDashboard` into builders (H29 SRP)
- **Status**: done
- **Files**: packages/ui-extension/src/dashboard/render-dashboard.ts
- **Gate**: validate

Each `build*` function is ≤ 200 LOC and accepts only the data it needs (no bridge
soup). Each has its own spec file.

**Acceptance:** the new file is ≤ 100 LOC; `wc -l render-dashboard.ts` reports ≤ 100.
`build-*.spec.ts` × 5 are ≥ 80% line coverage each.

### S2 — sparkline is a trend (H22)
- **Status**: pending
- **Files**: packages/ui-extension/src/dashboard/builders/build-panels.ts
- **Gate**: validate

Replace the constant sparkline `<polyline points="0,10 10,10 20,10 …" />` with
`buildSparkline(toolSeries)` where `toolSeries: number[]` is read from
`bridge.metrics(toolName)`. If no series is available, fall back to the constant and
log a warning.

**Acceptance:** spec passes a 10-point series and asserts the rendered polyline has
10 distinct `y` values.

### S3 — `barChart` aria-label (H24)
- **Status**: done
- **Files**: packages/ui-extension/src/dashboard/bar-chart.ts
- **Gate**: validate

Render: `<svg role="img" aria-label="${escape(ariaLabel)}">…</svg>`.

**Acceptance:** TypeScript flags every call site without `ariaLabel`; the spec covers
the escape.

### S4 — `Toast` sticky close + Esc (H25)
- **Status**: done
- **Files**: packages/ui-extension/src/components/toast.ts
- **Gate**: validate

In `sticky` mode, render a `<button class="toast__close" aria-label="Close">×</button>`
and bind an Esc handler that fires a custom event the host listens to.

**Acceptance:** spec asserts the close button is in the DOM only when `mode === 'sticky'`,
and the Esc handler fires the expected event.

### S5 — `kpiStrip` flex-wrap (H26)
- **Status**: done
- **Files**: packages/ui-extension/src/dashboard/builders/build-kpi-strip.ts
- **Gate**: validate

```css
.kpi-strip { display: flex; flex-wrap: wrap; gap: 8px; }
.kpi-strip__item { flex: 1 1 120px; min-width: 0; }
```

**Acceptance:** spec asserts the rendered CSS contains `flex-wrap: wrap`.

### S6 — Tabs aria-controls + roving tabindex (H27)
- **Status**: pending
- **Files**: packages/ui-extension/src/dashboard/builders/build-tabs-bar.ts
- **Gate**: validate

Render: `<button role="tab" aria-controls="${panelId}" aria-selected="…" tabindex="${selected ? 0 : -1}">…</button>`.
Bind ArrowLeft/ArrowRight that move the roving tabindex.

**Acceptance:** spec asserts `aria-controls` matches the corresponding panel's `id`;
spec asserts ArrowLeft from tab 0 selects the last tab (wrapping).

### S7 — `STATUS_BAR_EVENTS` discriminated union (H30)
- **Status**: pending
- **Files**: extensions/vscode/src/providers/status-bar.ts
- **Gate**: validate

Adding a new event = add a member to the union + a map entry. No dispatcher edits.

**Acceptance:** adding a new event to the union without a map entry is a type error.

## dependency graph

```
S1 (split) ── independent ──┐
S2 (sparkline) ── depends on S1 (lives in the new build-tools-panel.ts) ─┤
S3 (barChart) ── independent ──────────────────────────────────────────┤
S4 (Toast)   ── independent ──────────────────────────────────────────┤
S5 (kpiStrip)── independent ──────────────────────────────────────────┤
S6 (Tabs)    ── independent ──────────────────────────────────────────┤
S7 (statusBar events) ── independent ─────────────────────────────────┘
                                       ▼
                          all slices pass `bun run validate`
```

S1 must land before S2. The other 5 can land in any order.

## acceptance

`bun run validate` exits 0. The 7 spec files cover the 7 slices. The dashboard
god-function is gone (`wc -l render-dashboard.ts` ≤ 100).

## risks and mitigations

| Risk | Mitigation |
|---|---|
| Splitting the dashboard breaks the visual layout | We snapshot-test the rendered output before and after S1; the snapshot diff must be empty (regression check). |
| `ariaLabel` is required but 3 call sites don't have a meaningful one | We provide a `defaultAriaLabel` constant derived from the data; the spec asserts the default. |
| Tabs roving tabindex breaks the existing keyboard handler | We keep `Enter`/`Space` as activate handlers; only Arrow keys move focus. The spec covers both. |
| `STATUS_BAR_EVENTS` discriminated union ripples to all callers | The public API is the map, not the union. We export `STATUS_BAR_EVENTS: ReadonlyMap` so the union is internal. |

## notes

The audit's H29 SRP finding is the most impactful: 820 LOC in one file makes every
change risky. Splitting into 5 builders makes each change safe (each file is ≤ 200
LOC, each spec covers one builder).