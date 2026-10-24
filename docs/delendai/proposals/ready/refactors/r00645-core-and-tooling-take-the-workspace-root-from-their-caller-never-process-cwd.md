---
id: r00645
title: "Core and tooling take the workspace root from their caller, never process.cwd()"
kind: refactor
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# r00645 — Core and tooling take the workspace root from their caller, never process.cwd()

## goal

No library module in core reads process.cwd() as a workspace root, scripts resolve the repo root from their own location or an argument, and the two stray JavaScript files become TypeScript.

## why

Joint audit a00095. G1: shell-status.tool.ts builds InstallSuggestionsService with process.cwd(). D8: more process.cwd() in core than the first pass saw. G14: tooling treats process.cwd() as the repo root and two loose JS files remain (stable-manifest.script.js, zod-default-resolver.mjs).

## non-goals

- Changing what any tool does; only where it reads the root from.

## slices

- global_gate: type

### S1 — core
- **Status**: pending
- **Files**: `packages/core/src/lib/tools/shell-status.tool.ts`, `tools/scripts/lint/no-process-cwd-in-core.script.ts`
- **Gate**: type
- acceptance:
  - "A lint fails on process.cwd() in packages/core/src/lib outside entry points, with the current uses removed (G1, D8)."

### S2 — tooling
- **Status**: pending
- **Files**: `tools/scripts/build/stable-manifest.script.js`, `tools/scripts/build/stable-manifest.script.ts`, `tools/scripts/gen/quantitative.script.ts`, `tools/scripts/i18n/translate-tutorials.script.ts`, `tools/scripts/lib/zod-default-resolver.mjs`
- **Gate**: type
- acceptance:
  - "Scripts resolve the root from import.meta.url; the .js and .mjs files are ported to TypeScript (G14)."

## acceptance

- A lint fails on process.cwd() in packages/core/src/lib outside entry points, with the current uses removed (G1, D8).
- Scripts resolve the root from import.meta.url; the .js and .mjs files are ported to TypeScript (G14).
