---
id: x01091
title: "A test run leaves nothing in the system temp directory"
kind: fix
status: done
type: proposal
track: fixes
date: 2026-11-18
last-transition-id: 71cf588c-cd2b-49bc-9337-ee7e9ce8e761
last-correlation-id: 71cf588c-cd2b-49bc-9337-ee7e9ce8e761
last-transition-from: review
last-transition-at: 2026-11-19T23:20:57.504Z
shipped-in:
  - "92329ad5f4d38718843fce63f7df7e4a30aecda2"
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
- **Status**: done
- **Files**: `vitest.shared.ts`, `tools/scripts/test/run-temp-root.global-setup.ts`, `tools/scripts/test/run-temp-root.global-setup.spec.ts`, `tools/scripts/test/bun-owned-specs.script.ts`, `packages/test-kit/src/lib/hermetic-environment.helper.ts`
- **Gate**: e2e
- acceptance:
  - "A vitest globalSetup shared by every project config (through vitest.shared.ts) creates one directory under os.tmpdir() named delendai-test-run-<pid>, sets TMPDIR, TMP and TEMP to it before any worker starts, and removes it recursively in its teardown."
  - "bun-owned-specs.script.ts runs bun test with the same run root in its child environment and removes it when the child exits, whatever its exit code."
  - "forgeConfigDir in hermetic-environment.helper.ts creates its directory under the run root, so it is removed with it."
  - "run-temp-root.global-setup.spec.ts runs a child vitest over a fixture spec that calls mkdtempSync(join(tmpdir(), 'leak-')) and asserts the system temp directory holds the same entry names before and after the child run."
  - "No spec file outside S1 changes."
- shipped-in: `4bd2b1c6e289`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 92329ad5f4d3, validate exit 0 and tests 6/6 claimed, no recorded run cited; acceptance 5/5: (1) sharedTestOptions.globalSetup points to run-temp-root.global-setup.ts; enterRunTempRoot creates delendai-test-run-<pid>, sets all three variables, deduplicates… (2) The Bun wrapper calls enterRunTempRoot, passes withRunTempRoot(process.env, run.root) to spawnSync, and invokes run.leave() in finally before propagating the c… (3) forgeConfigDir uses mkdtempSync(join(tmpdir(),'delendai-gh-')); while either runner is active tmpdir() resolves to its run root, so the established teardown ow… (4) The spec constructs the exact leaking fixture and child config, records readdirSync before/after, runs it, and both the pass and equality assertions pass. (5) Reviewed the delivered file scope: the S1 implementation adds/changes only run-temp-root.global-setup.spec.ts among specs; existing unrelated specs are untouch… — Reviewed the delivered diff and current implementation; no later change touches these slice files. The two focused spec files pass 6/6, including the child-vitest before/after test, and the temp-root lint exits 0. The global setup, Bun wrapper, and helper all share one removable run root.

### S2 — A lint refuses a test helper that writes outside the run root
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `tools/scripts/lint/test-temp-root.script.ts`, `tools/scripts/lint/test-temp-root.spec.ts`, `package.json`
- **Gate**: lint
- acceptance:
  - "lint:test-temp-root fails on a spec or test helper that passes a literal absolute /tmp path to mkdtemp or mkdtempSync instead of a path under tmpdir(), naming file and line."
  - "The lint is wired into lint:architecture so CI runs it."
  - "It passes on the current tree and fails on a fixture with mkdtempSync('/tmp/x-')."
- shipped-in: `8e80c0426110`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 92329ad5f4d3, validate exit 0 and tests 6/6 claimed, no recorded run cited; acceptance 3/3: (1) literalTmpMkdtemps returns path, 1-based line, and text for a literal `/tmp`/`/var/tmp` mkdtemp call; the script emits one `file:line — text` finding per match… (2) package.json includes `lint:test-temp-root` in the lint:architecture chain; the new script is the direct command invoked by that entry. (3) The live command printed `✓ test-temp-root: no test makes a directory outside tmpdir().`; the spec feeds the exact fixture and asserts line 2 plus the source t… — Reviewed the delivered diff and current implementation; no later change touches these slice files. The focused lint spec passes 2/2 (6/6 in the combined focused run), and running `bun run lint:test-temp-root` on the current tree exits 0. The lint is scoped to test files/helpers and wired into the architecture gate.

## acceptance

- A vitest globalSetup shared by every project config (through vitest.shared.ts) creates one directory under os.tmpdir() named delendai-test-run-<pid>, sets TMPDIR, TMP and TEMP to it before any worker starts, and removes it recursively in its teardown.
- bun-owned-specs.script.ts runs bun test with the same run root in its child environment and removes it when the child exits, whatever its exit code.
- forgeConfigDir in hermetic-environment.helper.ts creates its directory under the run root, so it is removed with it.
- run-temp-root.global-setup.spec.ts runs a child vitest over a fixture spec that calls mkdtempSync(join(tmpdir(), 'leak-')) and asserts the system temp directory holds the same entry names before and after the child run.
- No spec file outside S1 changes.
- lint:test-temp-root fails on a spec or test helper that passes a literal absolute /tmp path to mkdtemp or mkdtempSync instead of a path under tmpdir(), naming file and line.
- The lint is wired into lint:architecture so CI runs it.
- It passes on the current tree and fails on a fixture with mkdtempSync('/tmp/x-').
