---
id: x01091
title: "A test run leaves nothing in the system temp directory"
kind: fix
status: ready
type: proposal
track: fixes
date: 2026-11-18
---

# x01091 — A test run leaves nothing in the system temp directory

## goal

Every temporary directory a spec, a test helper or a test runner creates lives under one per-run root that the runner removes when the run ends, so /tmp holds the same entries before and after any test run.

## why

Measured 2026-11-18 on the owner's machine: /tmp holds 241,362 entries, 134,223 of them delendai-gh-* made once per worker process by packages/test-kit/src/lib/hermetic-environment.helper.ts (forgeConfigDir) and never removed; further leaks are state-contract-* 11,800, unit-index-* 10,024, tok-report-* 5,040, state-coordination-* 4,670, state-sqlite-* 4,650, tok-* 2,742. The count grows with every proof, slows every directory scan of /tmp and fills the inode table of the owner's disk. Fixing each spec one by one would miss the next one; one run-scoped root removes the whole class.

## non-goals

- Changing what any spec asserts.
- Cleaning directories that production code creates at run time outside tests.
- Deleting existing leaked entries from the owner's /tmp automatically; the delivery note names the one-off command.

## slices

- global_gate: lint

### S1 — One run-scoped temp root for vitest and bun test runs
- **Status**: pending
- **Files**: `vitest.shared.ts`, `tools/scripts/test/run-temp-root.global-setup.ts`, `tools/scripts/test/run-temp-root.global-setup.spec.ts`, `tools/scripts/test/bun-owned-specs.script.ts`, `packages/test-kit/src/lib/hermetic-environment.helper.ts`
- **Gate**: e2e
- acceptance:
  - "A vitest globalSetup shared by every project config (through vitest.shared.ts) creates one directory under os.tmpdir() named delendai-test-run-<pid>, sets TMPDIR, TMP and TEMP to it before any worker starts, and removes it recursively in its teardown."
  - "bun-owned-specs.script.ts runs bun test with the same run root in its child environment and removes it when the child exits, whatever its exit code."
  - "forgeConfigDir in hermetic-environment.helper.ts creates its directory under the run root, so it is removed with it."
  - "run-temp-root.global-setup.spec.ts runs a child vitest over a fixture spec that calls mkdtempSync(join(tmpdir(), 'leak-')) and asserts the system temp directory holds the same entry names before and after the child run."
  - "No spec file outside S1 changes."

### S2 — A lint refuses a test helper that writes outside the run root
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/lint/test-temp-root.script.ts`, `tools/scripts/lint/test-temp-root.spec.ts`, `package.json`
- **Gate**: lint
- acceptance:
  - "lint:test-temp-root fails on a spec or test helper that passes a literal absolute /tmp path to mkdtemp or mkdtempSync instead of a path under tmpdir(), naming file and line."
  - "The lint is wired into lint:architecture so CI runs it."
  - "It passes on the current tree and fails on a fixture with mkdtempSync('/tmp/x-')."

## acceptance

- A vitest globalSetup shared by every project config (through vitest.shared.ts) creates one directory under os.tmpdir() named delendai-test-run-<pid>, sets TMPDIR, TMP and TEMP to it before any worker starts, and removes it recursively in its teardown.
- bun-owned-specs.script.ts runs bun test with the same run root in its child environment and removes it when the child exits, whatever its exit code.
- forgeConfigDir in hermetic-environment.helper.ts creates its directory under the run root, so it is removed with it.
- run-temp-root.global-setup.spec.ts runs a child vitest over a fixture spec that calls mkdtempSync(join(tmpdir(), 'leak-')) and asserts the system temp directory holds the same entry names before and after the child run.
- No spec file outside S1 changes.
- lint:test-temp-root fails on a spec or test helper that passes a literal absolute /tmp path to mkdtemp or mkdtempSync instead of a path under tmpdir(), naming file and line.
- The lint is wired into lint:architecture so CI runs it.
- It passes on the current tree and fails on a fixture with mkdtempSync('/tmp/x-').
