---
id: t00033
title: "Remove specs that add no value and keep the ones that do (measured sweep)"
kind: test
status: in-progress
type: proposal
track: quality
date: 2026-11-21
last-transition-id: f8fa287e-88ef-48dc-a76e-02282426aa1c
last-correlation-id: f8fa287e-88ef-48dc-a76e-02282426aa1c
last-transition-from: ready
last-transition-at: 2026-11-21T04:50:09.892Z
---

# t00033 — Remove specs that add no value and keep the ones that do (measured sweep)

## goal

Target delendai version 0.3.0. Measured on 2,718 spec files / 19,530 cases by a one-off classifier: only a small, precise set adds no value. This proposal removes or merges exactly that set, and adds a lint so the classes do not return. Coverage must stay at or above the changed-file coverage gate; contract, guard, type-shape and parity specs are always kept.

## why

Owner asked to drop tests with no value. Measurement (scratch classifier, per-file timings from .cache/vitest results.json, 585 of 2,718 specs timed, 402 s total, 87 ms per case average): (a) runtime-tautological cases 1 confirmed (perf-bundle) after dropping a heuristic with ~90% false positives; ~12 type-shape cases in 12 files are tautological at runtime but are compile-time contract checks and are KEPT; (b) 4 files with unconditional skip/todo, 1 true dead skip (threshold-tracker historical repro), the rest are conditional or fixtures of the skip detector; (c) 30 duplicate groups, 32 removable duplicate cases, mostly copy-pasted github-client-security specs and per-plugin availability/plugin-options cases; (d) 1 spec whose subject has no non-spec consumer (session-handover.service, feature pending in f00816) listed for owner decision, not deletion; (e) 1 snapshot-only file (component-css). Estimated saving is about 35 cases, roughly 3 s CI time: the suite is mostly valuable, the gain is mainly signal quality and the lint.

## non-goals

- No spec is deleted if coverage of the changed files would fall below the gate
- Contract, guard, type-shape, parity and lint-of-lints specs are never removed
- No deletion of the session-handover spec without the owner confirming the feature is abandoned

## slices

- global_gate: none

### S1 — plugins/issues: drop copy-pasted github-client-security duplicates
- **Status**: pending
- **Files**: `plugins/issues/tests/src/lib/github-client-security.spec.ts`, `plugins/issues/tests/src/lib/github-client-security-dependabot-code-scanning.spec.ts`, `plugins/issues/tests/src/lib/github-client-security-secret-scanning-advisories.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (c) duplicate: cases with the same subject call and the same expected value appear in two of these files; keep one copy per case (about 20 removed), merge the survivors into the file named for the subject"
  - "Changed-file coverage for plugins/issues stays at or above the gate"

### S2 — Per-plugin availability and plugin-options duplicates become one shared parameterised spec
- **Status**: pending
- **Files**: `plugins/agent-orchestrator/tests/src/availability.spec.ts`, `plugins/audit-orchestrator/tests/src/availability.spec.ts`, `plugins/browser/tests/src/availability.spec.ts`, `plugins/roadmap/tests/src/availability.spec.ts`, `plugins/style-convention/tests/src/availability.spec.ts`, `plugins/execution-env/tests/src/availability.spec.ts`, `plugins/remote-provider-core/tests/availability.spec.ts`, `plugins/deps/tests/src/lib/plugin-options.spec.ts`, `plugins/git/tests/src/plugin-options.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (c) duplicate: identical case bodies across plugins merge into a shared helper driven by each plugin's own registration; each plugin keeps only its plugin-specific cases"
  - "These are contract-style specs: every plugin must still be exercised, so the merge must not reduce the plugins covered (verify by case count per plugin)"

### S3 — plugins/execution-env adapters: drop repeated teardown and no-tools cases
- **Status**: pending
- **Files**: `plugins/execution-env/tests/src/lib/adapters/docker-compose.spec.ts`, `plugins/execution-env/tests/src/lib/adapters/docker-exec.spec.ts`, `plugins/execution-env/tests/src/lib/adapters/ssh.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (c) duplicate: one case each repeated verbatim with availability.spec.ts or its sibling; keep the copy next to the subject"

### S4 — tools: duplicate cases in lint specs
- **Status**: pending
- **Files**: `tools/scripts/lint/publication-proof-gate.script.spec.ts`, `tools/tests/lint/pre-flight-and-ci-cannot-drift.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (c) duplicate: remove the repeated case only; these are guard specs, so keep any case that is the only assertion of a guard"

### S5 — Tautological and dead skipped cases
- **Status**: pending
- **Files**: `plugins/perf/src/lib/tools/perf-bundle.tool.spec.ts`, `plugins/commit-policy/tests/src/lib/triggers/threshold-tracker.spec.ts`, `tools/scripts/shim-invocation.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (a): remove 'budgets conversion rounds kB to bytes deterministically' (asserts only literals the case built); replace with a call to the tool's real conversion if it has none"
  - "Reason class (b): remove the unconditional it.skip historical-repro case in threshold-tracker (or un-skip it if it passes); in shim-invocation keep only skips that are conditional on a missing toolchain, delete unconditional ones"
  - "Not flagged by design: type-shape specs under packages/contracts, packages/core/tests/src/lib/contracts, packages/state and plugins/quality/tests/src/lib/scope-type.spec.ts are compile-time contract checks and are kept"

### S6 — Snapshot-only generated text
- **Status**: pending
- **Files**: `packages/ui-extension/tests/styles/component-css.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (e): snapshot of generated CSS with no assertion on meaning; replace the snapshot by assertions on the tokens that matter, or delete it if the style gate already covers them"

### S7 — Owner decision: subject without a consumer
- **Status**: pending
- **Files**: `packages/core/tests/src/lib/work-units/session-handover.service.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (d): session-handover.service has no non-spec consumer; f00816 (review) still plans it. Do not delete; record the decision in this proposal, and delete the module with its spec only if f00816 is retired"

### S8 — Lint: flag new tautological and skipped specs
- **Status**: pending
- **Files**: `tools/scripts/lint/spec-no-value.script.ts`, `tools/scripts/lint/spec-no-value.script.spec.ts`, `tools/scripts/lint/spec-no-value.baseline.json`, `package.json`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Flags in NEW or changed spec files: class (a) a case whose expect arguments are only values built in the case, with no call to any imported or file-level symbol; class (b) unconditional it.skip, it.todo, it.only and xit; baseline file lists the existing instances so only new ones fail"
  - "Exempts type-shape contract specs (files under contracts/ or named *.interface.spec.ts)"
  - "Wired into validate:run and CI (lint scripts must reach CI), with a lint:cli:i18n-compatible help summary if exposed as a CLI"
  - "The lint spec uses real fixtures for each class and a false-positive fixture (case that calls the subject through a local helper) that must pass"

## acceptance

- Reason class (c) duplicate: cases with the same subject call and the same expected value appear in two of these files; keep one copy per case (about 20 removed), merge the survivors into the file named for the subject
- Changed-file coverage for plugins/issues stays at or above the gate
- Reason class (c) duplicate: identical case bodies across plugins merge into a shared helper driven by each plugin's own registration; each plugin keeps only its plugin-specific cases
- These are contract-style specs: every plugin must still be exercised, so the merge must not reduce the plugins covered (verify by case count per plugin)
- Reason class (c) duplicate: one case each repeated verbatim with availability.spec.ts or its sibling; keep the copy next to the subject
- Reason class (c) duplicate: remove the repeated case only; these are guard specs, so keep any case that is the only assertion of a guard
- Reason class (a): remove 'budgets conversion rounds kB to bytes deterministically' (asserts only literals the case built); replace with a call to the tool's real conversion if it has none
- Reason class (b): remove the unconditional it.skip historical-repro case in threshold-tracker (or un-skip it if it passes); in shim-invocation keep only skips that are conditional on a missing toolchain, delete unconditional ones
- Not flagged by design: type-shape specs under packages/contracts, packages/core/tests/src/lib/contracts, packages/state and plugins/quality/tests/src/lib/scope-type.spec.ts are compile-time contract checks and are kept
- Reason class (e): snapshot of generated CSS with no assertion on meaning; replace the snapshot by assertions on the tokens that matter, or delete it if the style gate already covers them
- Reason class (d): session-handover.service has no non-spec consumer; f00816 (review) still plans it. Do not delete; record the decision in this proposal, and delete the module with its spec only if f00816 is retired
- Flags in NEW or changed spec files: class (a) a case whose expect arguments are only values built in the case, with no call to any imported or file-level symbol; class (b) unconditional it.skip, it.todo, it.only and xit; baseline file lists the existing instances so only new ones fail
- Exempts type-shape contract specs (files under contracts/ or named *.interface.spec.ts)
- Wired into validate:run and CI (lint scripts must reach CI), with a lint:cli:i18n-compatible help summary if exposed as a CLI
- The lint spec uses real fixtures for each class and a false-positive fixture (case that calls the subject through a local helper) that must pass
