---
id: f00805
title: "Agents run only the tests of what they touched, unless the project asks for more"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# f00805 — Agents run only the tests of what they touched, unless the project asks for more

## goal

By default delendai runs only the specs a change touched: a changed spec, the spec that mirrors a changed source and a spec that imports a changed file directly. A wider scope runs only when delendai.config.json asks for it with testing.scope.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The setting and the proof follow it
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/config-file-schema.ts`, `packages/core/schema/delendai.config.schema.json`, `tools/scripts/ci/test-scope.ts`, `tools/scripts/ci/test-scope.spec.ts`, `tools/scripts/ci/near-specs.ts`, `packages/core/tests/src/lib/plugins/config-file-schema.spec.ts`
- **Gate**: none
- acceptance:
  - "testing.scope is touched, reach or all and defaults to touched; work prove and work deliver (prove-plan --fast, near-specs) run the changed specs, the mirror spec and the direct importers only, and a spec that reaches the change through another module does not run unless the scope is reach or all, shown on a fixture diff."

### S2 — The advisory tests-for-change tool follows the setting
- **Status**: pending
- **Files**: `plugins/impact-analysis/src/lib/services/impact-analysis.service.ts`
- **Gate**: none
- acceptance:
  - "impact-analysis tests_for_change recommends the touched specs by default and the symbol-reached ones only when testing.scope is reach or all."

## acceptance

- testing.scope is touched, reach or all and defaults to touched; work prove and work deliver (prove-plan --fast, near-specs) run the changed specs, the mirror spec and the direct importers only, and a spec that reaches the change through another module does not run unless the scope is reach or all, shown on a fixture diff.
- impact-analysis tests_for_change recommends the touched specs by default and the symbol-reached ones only when testing.scope is reach or all.
