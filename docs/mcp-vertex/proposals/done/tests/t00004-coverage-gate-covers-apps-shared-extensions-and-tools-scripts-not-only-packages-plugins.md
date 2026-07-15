---
id: t00004
title: "Coverage gate covers apps/shared, extensions and tools scripts — not only packages+plugins"
kind: test
status: done
type: proposal
track: tests+coverage
date: 2026-07-14
---

# t00004 — Coverage gate covers apps/shared, extensions and tools scripts — not only packages+plugins

## Goal

The root coverage include is ['packages/*/src/**/*.ts', 'plugins/*/src/**/*.ts'] (vitest.config.ts:35), so apps/shared (i18n source of truth for 12 languages), extensions/vscode and every tools/scripts/*.script.ts run with ZERO coverage accounting — regressions there can silently drop to 0% without moving the thresholds. Widen the include (thresholds re-measured honestly in the same commit) so the no-regression gate actually guards the whole runtime surface.

## why

Audit a00054 F-6. t00002 fixed the PARSE_ERROR by narrowing to *.ts, which was correct — but the include list was already narrow before that: apps/, extensions/ and tools/ never participated. The thresholds (72/55/75/73) only describe packages+plugins today.

## non-goals

- No threshold gaming: if a newly included root drops a global number, the commit records the honest new floor a few points under the measured value — same policy as the existing gate.
- apps/web Astro components stay excluded until the coverage provider maps .astro sanely.

## Slices

- global_gate: e2e

### S1 — Widen include to apps/shared + extensions/vscode + tools/scripts/lib (*.ts), re-measure, honest thresholds, document exclusions
- **Status**: done
- **Files**: `vitest.config.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: e2e
- acceptance:
  - "bun run test:coverage green with apps/shared/src, extensions/vscode/src and tools/scripts/lib included (*.ts only); pure *.script.ts entrypoints excluded with an inline comment explaining why (process.exit orchestrators)."
  - "Thresholds re-baselined honestly in the same commit; a short note records the widened scope where the coverage policy is documented."

## acceptance

- bun run test:coverage green with apps/shared/src, extensions/vscode/src and tools/scripts/lib included (*.ts only); pure *.script.ts entrypoints excluded with an inline comment explaining why (process.exit orchestrators).
- Thresholds re-baselined honestly in the same commit; a short note records the widened scope where the coverage policy is documented.
