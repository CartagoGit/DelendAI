---
id: x00981
title: "The web status pages show live data or say they are a showcase"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# x00981 — The web status pages show live data or say they are a showcase

## goal

The status pages either stream real events from a running server or are labelled showcases with the data source and date, and nothing reloads on a synthetic event.

## why

Joint audit a00095. G47: /status/logs and /status/recovery are empty operational pages without navigation and with a static SSE. D27: the logs dashboard does not stream: it sends a synthetic bootstrap event and closes. D29: the recovery page reloads on a synthetic bootstrap event. G70: the pages do open a real EventSource but the handler is prerendered. G55: providers.astro hardcodes attributionRows with no producer. G23: the web published data nobody produces (token-roi.json; fixed in x00910 S3, verify).

## non-goals

- The VS Code dashboard (the vscode proposal).

## slices

- global_gate: type

### S1 — Status pages
- **Status**: pending
- **Files**: `apps/web/src/pages/api/events/[topic].ts`, `apps/web/src/pages/status/logs.astro`, `apps/web/src/pages/status/recovery.astro`
- **Gate**: type
- acceptance:
  - "Without a server the pages say so and do not reload; with one they stream real events (D27, D29, G47, G70)."

### S2 — Showcase data is labelled
- **Status**: pending
- **Files**: `apps/web/src/data/provider-dashboard.ts`, `apps/web/src/pages/providers.astro`
- **Gate**: type
- acceptance:
  - "Fixture rows carry a visible "sample data" label with their date (G55, G23)."

## acceptance

- Without a server the pages say so and do not reload; with one they stream real events (D27, D29, G47, G70).
- Fixture rows carry a visible "sample data" label with their date (G55, G23).
