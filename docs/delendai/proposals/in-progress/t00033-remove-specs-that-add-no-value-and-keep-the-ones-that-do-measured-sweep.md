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
  - "Reason class (c) duplicate: `grep -cE '^\s*it\(' plugins/issues/tests/src/lib/github-client-security-dependabot-code-scanning.spec.ts plugins/issues/tests/src/lib/github-client-security-secret-scanning-advisories.spec.ts plugins/issues/tests/src/lib/github-client-security.spec.ts` totals 40 before and at most 25 after, `git ls-files 'plugins/issues/tests/src/lib/github-client-security-*.spec.ts'` prints nothing once the survivors are merged into github-client-security.spec.ts, and `bunx vitest run plugins/issues/tests/src/lib/github-client-security.spec.ts` exits 0"
  - "`bun tools/scripts/ci/changed-file-coverage.script.ts` exits 0 for the plugins/issues files this slice changes"

### S2 — Per-plugin availability and plugin-options duplicates become one shared parameterised spec
- **Status**: pending
- **Files**: `plugins/agent-orchestrator/tests/src/availability.spec.ts`, `plugins/audit-orchestrator/tests/src/availability.spec.ts`, `plugins/browser/tests/src/availability.spec.ts`, `plugins/roadmap/tests/src/availability.spec.ts`, `plugins/style-convention/tests/src/availability.spec.ts`, `plugins/execution-env/tests/src/availability.spec.ts`, `plugins/remote-provider-core/tests/availability.spec.ts`, `plugins/deps/tests/src/lib/plugin-options.spec.ts`, `plugins/git/tests/src/plugin-options.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (c) duplicate: the nine S2 specs share one helper driven by each plugin's own registration, and `bunx vitest run plugins/git/tests/src/plugin-options.spec.ts plugins/deps/tests/src/lib/plugin-options.spec.ts plugins/browser/tests/src/availability.spec.ts` exits 0; each plugin keeps its plugin-specific cases in its own spec"
  - "Every plugin is still exercised: `bunx vitest run plugins/agent-orchestrator/tests/src/availability.spec.ts plugins/audit-orchestrator/tests/src/availability.spec.ts plugins/browser/tests/src/availability.spec.ts plugins/roadmap/tests/src/availability.spec.ts plugins/style-convention/tests/src/availability.spec.ts plugins/execution-env/tests/src/availability.spec.ts plugins/remote-provider-core/tests/availability.spec.ts plugins/deps/tests/src/lib/plugin-options.spec.ts plugins/git/tests/src/plugin-options.spec.ts` reports 9 test files passed and 0 skipped"

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
  - "Reason class (c) duplicate: `bunx vitest run tools/scripts/lint/publication-proof-gate.script.spec.ts tools/tests/lint/pre-flight-and-ci-cannot-drift.spec.ts` exits 0, and only a case repeated verbatim is removed, so every guard keeps at least one case that asserts it"

### S5 — Tautological and dead skipped cases
- **Status**: pending
- **Files**: `plugins/perf/src/lib/tools/perf-bundle.tool.spec.ts`, `plugins/commit-policy/tests/src/lib/triggers/threshold-tracker.spec.ts`, `tools/scripts/shim-invocation.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (a): `grep -c 'budgets conversion rounds kB to bytes deterministically' plugins/perf/src/lib/tools/perf-bundle.tool.spec.ts` prints 0, and `bunx vitest run plugins/perf/src/lib/tools/perf-bundle.tool.spec.ts` exits 0; a replacement case, if the tool has a real conversion, calls it"
  - "Reason class (b): `grep -nE 'it\.(skip|todo|only)|xit\(' plugins/commit-policy/tests/src/lib/triggers/threshold-tracker.spec.ts` prints nothing, and `grep -n 'it.skip' tools/scripts/shim-invocation.spec.ts` lists only skips guarded by a missing-toolchain condition, with `bunx vitest run tools/scripts/shim-invocation.spec.ts` exiting 0"
  - "Not flagged by design: type-shape specs under packages/contracts, packages/core/tests/src/lib/contracts, packages/state and plugins/quality/tests/src/lib/scope-type.spec.ts are compile-time contract checks and are kept"

### S6 — Snapshot-only generated text
- **Status**: pending
- **Files**: `packages/ui-extension/tests/styles/component-css.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (e): `grep -c 'toMatchInlineSnapshot' packages/ui-extension/tests/styles/component-css.spec.ts` prints 0 (or the file is deleted), and if the file remains `bunx vitest run packages/ui-extension/tests/styles/component-css.spec.ts` exits 0 with at least one assertion on a named token"

### S7 — Owner decision: subject without a consumer
- **Status**: pending
- **Files**: `packages/core/tests/src/lib/work-units/session-handover.service.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Reason class (d): while f00816 is not retired, `git ls-files packages/core/tests/src/lib/work-units/session-handover.service.spec.ts` still prints that path (the spec is not deleted) and this proposal records the decision; the module and spec are deleted together only once f00816 is retired"

### S8 — Lint: flag new tautological and skipped specs
- **Status**: pending
- **Files**: `new:tools/scripts/lint/spec-no-value.script.ts`, `new:tools/scripts/lint/spec-no-value.script.spec.ts`, `new:tools/scripts/lint/spec-no-value.baseline.json`, `package.json`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "Flags in new or changed spec files: tools/scripts/lint/spec-no-value.script.spec.ts holds one fixture per class, (a) a case whose expect arguments are only values built in the case, (b) each of unconditional it.skip, it.todo, it.only and xit, and `bun tools/scripts/lint/spec-no-value.script.ts` exits 0 on the repository because spec-no-value.baseline.json lists the existing instances"
  - "Exempts type-shape contract specs (files under contracts/ or named *.interface.spec.ts)"
  - "Wired into validate:run and CI: `grep -c 'spec-no-value' package.json` prints at least 2 (the lint script and its call from validate:run), and `bun run lint:cli:i18n` exits 0"
  - "`bunx vitest run tools/scripts/lint/spec-no-value.script.spec.ts` exits 0 with a real fixture per class and a false-positive fixture (a case that calls the subject through a local helper) reported with no finding"

## acceptance

- Reason class (c) duplicate: `grep -cE '^\s*it\(' plugins/issues/tests/src/lib/github-client-security-dependabot-code-scanning.spec.ts plugins/issues/tests/src/lib/github-client-security-secret-scanning-advisories.spec.ts plugins/issues/tests/src/lib/github-client-security.spec.ts` totals 40 before and at most 25 after, `git ls-files 'plugins/issues/tests/src/lib/github-client-security-*.spec.ts'` prints nothing once the survivors are merged into github-client-security.spec.ts, and `bunx vitest run plugins/issues/tests/src/lib/github-client-security.spec.ts` exits 0
- `bun tools/scripts/ci/changed-file-coverage.script.ts` exits 0 for the plugins/issues files this slice changes
- Reason class (c) duplicate: the nine S2 specs share one helper driven by each plugin's own registration, and `bunx vitest run plugins/git/tests/src/plugin-options.spec.ts plugins/deps/tests/src/lib/plugin-options.spec.ts plugins/browser/tests/src/availability.spec.ts` exits 0; each plugin keeps its plugin-specific cases in its own spec
- Every plugin is still exercised: `bunx vitest run plugins/agent-orchestrator/tests/src/availability.spec.ts plugins/audit-orchestrator/tests/src/availability.spec.ts plugins/browser/tests/src/availability.spec.ts plugins/roadmap/tests/src/availability.spec.ts plugins/style-convention/tests/src/availability.spec.ts plugins/execution-env/tests/src/availability.spec.ts plugins/remote-provider-core/tests/availability.spec.ts plugins/deps/tests/src/lib/plugin-options.spec.ts plugins/git/tests/src/plugin-options.spec.ts` reports 9 test files passed and 0 skipped
- Reason class (c) duplicate: one case each repeated verbatim with availability.spec.ts or its sibling; keep the copy next to the subject
- Reason class (c) duplicate: `bunx vitest run tools/scripts/lint/publication-proof-gate.script.spec.ts tools/tests/lint/pre-flight-and-ci-cannot-drift.spec.ts` exits 0, and only a case repeated verbatim is removed, so every guard keeps at least one case that asserts it
- Reason class (a): `grep -c 'budgets conversion rounds kB to bytes deterministically' plugins/perf/src/lib/tools/perf-bundle.tool.spec.ts` prints 0, and `bunx vitest run plugins/perf/src/lib/tools/perf-bundle.tool.spec.ts` exits 0; a replacement case, if the tool has a real conversion, calls it
- Reason class (b): `grep -nE 'it\.(skip|todo|only)|xit\(' plugins/commit-policy/tests/src/lib/triggers/threshold-tracker.spec.ts` prints nothing, and `grep -n 'it.skip' tools/scripts/shim-invocation.spec.ts` lists only skips guarded by a missing-toolchain condition, with `bunx vitest run tools/scripts/shim-invocation.spec.ts` exiting 0
- Not flagged by design: type-shape specs under packages/contracts, packages/core/tests/src/lib/contracts, packages/state and plugins/quality/tests/src/lib/scope-type.spec.ts are compile-time contract checks and are kept
- Reason class (e): `grep -c 'toMatchInlineSnapshot' packages/ui-extension/tests/styles/component-css.spec.ts` prints 0 (or the file is deleted), and if the file remains `bunx vitest run packages/ui-extension/tests/styles/component-css.spec.ts` exits 0 with at least one assertion on a named token
- Reason class (d): while f00816 is not retired, `git ls-files packages/core/tests/src/lib/work-units/session-handover.service.spec.ts` still prints that path (the spec is not deleted) and this proposal records the decision; the module and spec are deleted together only once f00816 is retired
- Flags in new or changed spec files: tools/scripts/lint/spec-no-value.script.spec.ts holds one fixture per class, (a) a case whose expect arguments are only values built in the case, (b) each of unconditional it.skip, it.todo, it.only and xit, and `bun tools/scripts/lint/spec-no-value.script.ts` exits 0 on the repository because spec-no-value.baseline.json lists the existing instances
- Exempts type-shape contract specs (files under contracts/ or named *.interface.spec.ts)
- Wired into validate:run and CI: `grep -c 'spec-no-value' package.json` prints at least 2 (the lint script and its call from validate:run), and `bun run lint:cli:i18n` exits 0
- `bunx vitest run tools/scripts/lint/spec-no-value.script.spec.ts` exits 0 with a real fixture per class and a false-positive fixture (a case that calls the subject through a local helper) reported with no finding
