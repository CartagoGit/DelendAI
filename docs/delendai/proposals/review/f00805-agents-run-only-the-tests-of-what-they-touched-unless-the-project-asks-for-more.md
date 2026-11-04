---
id: f00805
title: "Agents run only the tests of what they touched, unless the project asks for more"
kind: feat
status: review
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: 74ee566b-0a49-4070-b362-740cbc9bc5de
last-correlation-id: 74ee566b-0a49-4070-b362-740cbc9bc5de
last-transition-from: in-progress
last-transition-at: 2026-11-04T11:30:01.815Z
---

# f00805 — Agents run only the tests of what they touched, unless the project asks for more

## goal

By default delendai runs only the specs a change touched: a changed spec, the spec that mirrors a changed source and a spec that imports a changed file directly. A wider scope runs only when delendai.config.json asks for it with testing.scope.

## why

The owner's rule, product-wide: by default delendai runs only the tests of what was touched, and a wider scope runs only when the project asks. Measured on 2026-11-03: the fast proof of f00803 S2 (17 files) ran 720 specs, about 15 vitest forks at 60% CPU for most of a 15-minute proof, because the analysis it shares with the forge follows every module that uses a changed one. A single leaf (`classify-origin.ts`, `feature-flags.ts`) reached 184 and 131 specs; its own spec is 1. With the touched scope the S2 diff selects 101 specs (changed specs, mirrors and direct importers) and the two leaves 1 each. This completes q00038 S1's third acceptance line, that the local proof runs the same specs from one analysis, by giving that analysis one setting (`testing.scope`: touched, reach, all) the proof reads. The forge's own plan is unchanged and keeps its wider reach.

## non-goals

- The forge's test plan (`test-zones.script.ts`): it keeps its wider scope.
- Narrowing the symbol analysis itself.

## slices

- global_gate: none

### S1 — The setting and the proof follow it
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/config-file-schema.ts`, `packages/core/schema/delendai.config.schema.json`, `tools/scripts/ci/test-scope.ts`, `tools/scripts/ci/test-scope.spec.ts`, `tools/scripts/ci/near-specs.ts`, `packages/core/tests/src/lib/plugins/config-file-schema.spec.ts`
- **Gate**: none
- acceptance:
  - "testing.scope is touched, reach or all and defaults to touched; work prove and work deliver (prove-plan --fast, near-specs) run the changed specs, the mirror spec and the direct importers only, and a spec that reaches the change through another module does not run unless the scope is reach or all, shown on a fixture diff."
- shipped-in: `fae717645a14`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — shipped-in fae717645a14 is stale: S1 files changed afterward (e.g. 047d74500, d43290f9b). Redeliver S1 on current HEAD and resubmit with fresh shipped-in and fixture evidence.

### S2 — The advisory tests-for-change tool follows the setting
- **Status**: review
- **Files**: `plugins/impact-analysis/src/lib/services/impact-analysis.service.ts`
- **Gate**: none
- acceptance:
  - "impact-analysis tests_for_change recommends the touched specs by default and the symbol-reached ones only when testing.scope is reach or all."
- shipped-in: `615abe74d1d9`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- testing.scope is touched, reach or all and defaults to touched; work prove and work deliver (prove-plan --fast, near-specs) run the changed specs, the mirror spec and the direct importers only, and a spec that reaches the change through another module does not run unless the scope is reach or all, shown on a fixture diff.
- impact-analysis tests_for_change recommends the touched specs by default and the symbol-reached ones only when testing.scope is reach or all.
