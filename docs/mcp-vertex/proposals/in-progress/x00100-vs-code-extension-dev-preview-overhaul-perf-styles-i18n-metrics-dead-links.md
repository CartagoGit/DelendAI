---
id: x00100
title: "VS Code extension dev-preview overhaul: perf, styles, i18n, metrics, dead links"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-07-13
---

# x00100 — VS Code extension dev-preview overhaul: perf, styles, i18n, metrics, dead links

## Goal

Make the bun run dev:vscode preview pleasant section by section: warm/precompiled section bundles (or a shared entry) so switching is instant, every page renders through one path that injects the rendered head styles and honors the ?lang selector, the metrics page gets a working data wiring and layout, and docsUrl points at a URL that exists (derived from one constant, not 3 hardcoded copies).

## why

User-reported (2026-07-13, `bun run dev:vscode`): switching sections takes
very long, styles do not preload, the language switcher does not apply, the
metrics section renders and behaves badly, and the dashboard links to
https://cartagogit.github.io/mcp-vertex/ which 404s. Recon: each dev page
under `extensions/vscode/src/dev/pages/` is its own Bun.build entry (cold
build per section, no watch invalidation); the f00103 head-style/?lang fixes
live in `packages/ui-extension/src/dev/entry.ts` but the vscode dev pages
have a parallel render path (dashboard.ts extracts head styles, others may
not); docsUrl is hardcoded in 3 call sites.

## non-goals

- The production VS Code webviews' visual redesign (only the broken behaviours).
- Publishing the GitHub Pages site itself (the slice only fixes/derives the link).
- The apps/web docs site.

## Slices

- global_gate: e2e

### S1 — Dev harness: prebuild/warm all section bundles + single render path with head styles and ?lang
- **Status**: pending
- **Files**: `tools/scripts/dev/dev.script.ts`, `extensions/vscode/src/dev/pages/registry.ts`, `extensions/vscode/src/dev/pages/contract.ts`
- **Gate**: e2e
- acceptance:
  - "switching sections in dev:vscode responds warm (no per-section cold Bun.build)"
  - "every section shows its styles on first paint"
### S2 — i18n: ?lang switcher applies to every vscode dev page + docsUrl single constant
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `extensions/vscode/src/dev/pages/dashboard.ts`, `extensions/vscode/src/dev/pages/settings.ts`, `extensions/vscode/src/dev/pages/configuration-center.ts`, `extensions/vscode/src/dev/pages/tool-detail.ts`, `extensions/vscode/src/i18n/index.ts`, `packages/ui-extension/src/dev/entry.ts`
- **Gate**: e2e
- acceptance:
  - "changing the language selector re-renders every section in that language"
  - "no 404 link in the dev dashboard; docsUrl defined once"
### S3 — Metrics page: working data wiring and layout in dev preview
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `extensions/vscode/src/dev/pages/metrics.ts`, `extensions/vscode/src/views/metrics-sparkline.ts`, `extensions/vscode/src/views/metrics-sparkline.html`
- **Gate**: e2e
- acceptance:
  - "metrics section renders styled with mock data and no console errors"
## acceptance

- Switching sections in dev:vscode responds warm (no per-section cold Bun.build).
- Every section shows its styles on first paint.
- Changing the language selector re-renders every section in that language.
- No 404 link in the dev dashboard; docsUrl defined once.
- Metrics section renders styled with mock data and no console errors.
