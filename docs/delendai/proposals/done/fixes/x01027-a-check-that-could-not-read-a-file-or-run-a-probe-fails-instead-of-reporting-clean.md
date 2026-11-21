---
id: x01027
title: "A check that could not read a file or run a probe fails instead of reporting clean"
kind: fix
status: done
type: proposal
track: general
date: 2026-11-04
last-transition-id: 8c88647e-0140-4cec-883f-f5cbbf07213a
last-correlation-id: 8c88647e-0140-4cec-883f-f5cbbf07213a
last-transition-from: review
last-transition-at: 2026-11-18T03:03:27.729Z
shipped-in:
  - "6d32d7ab0fe076a2e33e6f47c1e4b2169cbb8d47"
---

# x01027 — A check that could not read a file or run a probe fails instead of reporting clean

## goal

The no-control-bytes lint, the secrets git listing and the empty-root probe treat an unreadable file, a failed listing or a probe that did not exit as a failure that names what it could not do, never as no findings.

## why

External review in a ChatGPT conversation about develop (reviewer active 2026-10-20 to 2026-10-29). Remark of 2026-10-25 on the then-open x00950 candidate: no-control-bytes.script.ts skips a file it cannot read with catch returning [], so a set it could not fully scan is declared clean; and the empty-root probe does not classify a spawnSync result with status null (timeout or failed start) as a failure. Remark of 2026-10-27 on develop after x00950 merged: no-control-bytes still returns an empty list for an unreadable file, and plugins/security real-deps.ts still turns some git listing failures into empty lists. The reviewer rated it P2 and said it keeps the pattern the product exists to remove. Verified in the code on develop (3188f9414, 2026-11-04): tools/scripts/lint/no-control-bytes.script.ts lines 77-83 catch and return []; plugins/security/src/lib/secrets/real-deps.ts line 55 returns [] when the git listing is not ok; tools/scripts/lint/lib/empty-root-probe.lib.ts line 38 only accepts exitCode === 0 and keeps exitCode null as a plain non-zero. x00950 and x00987 closed the other silent-pass paths and do not cover these. Product principles (AGENT-BOOTSTRAP section 0): robust and bounded, a state an agent cannot talk past.

## non-goals

- Adding new lints.

## slices

- global_gate: type

### S1 — An unreadable file fails the control-byte lint
- **Status**: done
- **Files**: `tools/scripts/lint/no-control-bytes.script.ts`, `tools/scripts/lint/no-control-bytes.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A tracked source file that cannot be read makes the lint fail and names the file."
  - "A spec makes one file unreadable and expects exit 1."
- shipped-in: `4079bdb2efdd`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by gpt-5.3-codex — Stale review round; rebase on current develop and re-validate this slice with fresh evidence before approval.
- review-log: approved by mai-code-2 — verified at 6d32d7ab0fe0, validate exit 0 and tests 7/7 claimed, no recorded run cited; acceptance 2/2: (1) main reports unreadable count/names and returns 1; the scoped spec passed. (2) no-control-bytes.script.spec.ts unlinks tracked b.ts and asserts code 1 with its name; 7/7 passed. — Verified 6d32d7ab: scanForControlBytes records unreadable files, main returns 1 and names each one, and the real-spec path deletes a tracked source file to assert failure. The scoped no-control-bytes spec passed.

### S2 — A failed secrets listing is reported unknown, not empty
- **Status**: done
- **Files**: `plugins/security/src/lib/secrets/real-deps.ts`, `plugins/security/tests/src/lib/secrets/real-deps.spec.ts`
- **Gate**: type
- acceptance:
  - "A git listing that fails makes the scan report unknown or failed, never zero files."
  - "A spec fails the listing and expects the unknown state."
- shipped-in: `4079bdb2efdd`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by gpt-5.3-codex — Stale review round; rebase on current develop and re-validate this slice with fresh evidence before approval.
- review-log: approved by mai-code-2 — verified at 6d32d7ab0fe0, validate exit 0 and tests 2/2 claimed, no recorded run cited; acceptance 2/2: (1) listFiles and listIgnored throw listingFailure with the git command and cause when the tool is not ok. (2) real-deps.spec.ts invokes both listings outside a repository and asserts rejection; 2/2 passed. — Verified 6d32d7ab: realScanDeps throws a named git-listing error whenever runExternalTool is not ok, for tracked/changed and ignored listings, instead of returning an empty list. The security regression spec passed.

### S3 — A probe that did not exit is not an accepted run
- **Status**: done
- **Files**: `tools/scripts/lint/lib/empty-root-probe.lib.ts`, `tools/scripts/lint/lib/empty-root-probe.lib.spec.ts`
- **Gate**: type
- acceptance:
  - "A probe whose status is null (timeout or failed start) makes the check fail with the cause."
  - "A spec returns status null and expects a failure."
- shipped-in: `c424cb36ad51`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by gpt-5.3-codex — Stale review round; rebase on current develop and re-validate this slice with fresh evidence before approval.
- review-log: approved by mai-code-2 — verified at 6d32d7ab0fe0, validate exit 0 and tests 5/5 claimed, no recorded run cited; acceptance 2/2: (1) judgeEmptyRootRuns filters exitCode null and emits did-not-exit detail independently of allowlisting. (2) empty-root-probe.lib.spec.ts checks null both allowed and unallowed and expects a finding; 5/5 passed. — Verified 6d32d7ab: judgeEmptyRootRuns emits a failure for exitCode null before considering allowlisting, names timeout/failed-start as unmeasured, while runOverEmptyRoot preserves spawnSync status null. The scoped probe spec passed.

## acceptance

- A tracked source file that cannot be read makes the lint fail and names the file.
- A spec makes one file unreadable and expects exit 1.
- A git listing that fails makes the scan report unknown or failed, never zero files.
- A spec fails the listing and expects the unknown state.
- A probe whose status is null (timeout or failed start) makes the check fail with the cause.
- A spec returns status null and expects a failure.
