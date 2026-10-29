---
id: x00983
title: "Budget specs measure a complete boot, never a degraded one"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-27
last-transition-id: 82cf3339-fb52-41f6-ad44-69683faaa75c
last-correlation-id: 82cf3339-fb52-41f6-ad44-69683faaa75c
last-transition-from: review
last-transition-at: 2026-10-28T08:15:32.003Z
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 55fbb80d2, validate exit 0 and tests 17/17 claimed, no recorded run cited; acceptance 2/2: (1) assemble.ts:272 adds the pluginTimeoutMs dependency and :773-775 forwards it to assemble-plugins.ts:114, which passes it to loadPlugins as timeoutMs (:941-943)… (2) The token-budget spec sets the measuring timeout to 120000 milliseconds (spec:34), passes it as pluginTimeoutMs (:207) and asserts at :212-217 that the load er… — This slice declares gate none, so the counts below are concrete checks, not a test suite: 17 checks performed (the dependency type and its forward, the input field, the timeoutMs forward, the loader default, the two timeout uses, the spec constant, its use, the position of the guard, the close call, a runtime probe that loadPlugins with a 30 ms timeout reports the importer timeout with the specifier and the reason, the focused spec run, a biome check of the three slice files, the empty diff against HEAD, the untouched loader-default files, the untouched budget-constant files and the merge's file list). The one spec the slice names was run green (1 file / 17 tests, exit 0) and the biome check reported no findings on the three slice files. Recorded rather than blocked: no unit test pins the new pluginTimeoutMs dependency, so the default rests on the code, and the degraded-boot path has no committed regression test.

## acceptance

- The token-budget spec passes under load and fails with the unloaded plugin names, never with a per-tool byte breach, when a plugin does not load.
