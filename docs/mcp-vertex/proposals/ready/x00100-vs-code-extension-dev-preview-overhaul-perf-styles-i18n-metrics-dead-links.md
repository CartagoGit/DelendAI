---
id: x00100
kind: fix
status: ready
type: proposal
track: general
date: 2026-07-13
---

# x00100 — VS Code extension dev-preview overhaul: perf, styles, i18n, metrics, dead links

## Goal

Make the bun run dev:vscode preview pleasant section by section: warm/precompiled section bundles (or a shared entry) so switching is instant, every page renders through one path that injects the rendered head styles and honors the ?lang selector, the metrics page gets a working data wiring and layout, and docsUrl points at a URL that exists (derived from one constant, not 3 hardcoded copies).

## Slices

- global_gate: e2e

### S1 — Dev harness: prebuild/warm all section bundles + single render path with head styles and ?lang
- files: tools/scripts/dev/dev.script.ts
- files: extensions/vscode/src/dev/pages/registry.ts
- files: extensions/vscode/src/dev/pages/contract.ts
- gate: e2e
- acceptance:
  - "switching sections in dev:vscode responds warm (no per-section cold Bun.build)"
  - "every section shows its styles on first paint"
- status: pending

### S2 — i18n: ?lang switcher applies to every vscode dev page + docsUrl single constant
- files: extensions/vscode/src/dev/pages/dashboard.ts
- files: extensions/vscode/src/dev/pages/settings.ts
- files: extensions/vscode/src/dev/pages/configuration-center.ts
- files: extensions/vscode/src/dev/pages/tool-detail.ts
- files: extensions/vscode/src/i18n/index.ts
- files: packages/ui-extension/src/dev/entry.ts
- depends_on: [S1]
- gate: e2e
- acceptance:
  - "changing the language selector re-renders every section in that language"
  - "no 404 link in the dev dashboard; docsUrl defined once"
- status: pending

### S3 — Metrics page: working data wiring and layout in dev preview
- files: extensions/vscode/src/dev/pages/metrics.ts
- files: extensions/vscode/src/views/metrics-sparkline.ts
- files: extensions/vscode/src/views/metrics-sparkline.html
- depends_on: [S1]
- gate: e2e
- acceptance:
  - "metrics section renders styled with mock data and no console errors"
- status: pending
