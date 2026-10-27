---
id: x00983
title: "Budget specs measure a complete boot, never a degraded one"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-27
last-transition-id: cffef7a5-e5a9-4de9-98df-3e6a92f70b8f
last-correlation-id: cffef7a5-e5a9-4de9-98df-3e6a92f70b8f
last-transition-from: in-progress
last-transition-at: 2026-10-27T10:33:46.005Z
shipped-in:
  - "55fbb80d2"
---

# x00983 — Budget specs measure a complete boot, never a degraded one

## goal

The token-budget e2e spec boots every plugin of its fixture with a load timeout fit for measurement, and refuses to measure, naming the plugins that did not load, when any plugin is missing.

## why

On a loaded machine the native overview listing test failed: 40 tools listed (normally about 87), 7953 B = 198.8 B/tool over hardPerItem 167; alone it passes. loadPlugins drops a plugin whose import or register() exceeds its 15 s step timeout and reports it only in loadResult.errors, so the partial boot had fewer rows and the fixed overhead read as fat rows: a degraded boot was read as a budget breach. Reproduced by forcing a 30 ms timeout: proposals and memory are dropped with "timed out after 30ms".

## non-goals

- Changing the loader's 15 s default for real hosts.
- Changing any budget ceiling.

## slices

- global_gate: none

### S1 — assemble accepts a plugin timeout; the budget spec requires a complete boot
- **Status**: done
- **Files**: `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
- **Gate**: none
- acceptance:
  - "assembleCliConfig accepts pluginTimeoutMs and passes it to loadPlugins as timeoutMs; unset keeps the 15 s default."
  - "The token-budget spec connects with a 120 s plugin timeout and fails, listing each plugin and reason, when loadResult.errors is not empty."
- shipped-in: `55fbb80d2`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The token-budget spec passes under load and fails with the unloaded plugin names, never with a per-tool byte breach, when a plugin does not load.
