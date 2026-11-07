---
id: x01027
title: "A check that could not read a file or run a probe fails instead of reporting clean"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-04
last-transition-id: 4c466a0d-c21d-4682-b2e0-360b1de83cc9
last-correlation-id: 4c466a0d-c21d-4682-b2e0-360b1de83cc9
last-transition-from: review
last-transition-at: 2026-11-04T20:34:09.966Z
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
- **Status**: pending
- **Files**: `tools/scripts/lint/no-control-bytes.script.ts`, `tools/scripts/lint/no-control-bytes.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A tracked source file that cannot be read makes the lint fail and names the file."
  - "A spec makes one file unreadable and expects exit 1."
- shipped-in: `4079bdb2efdd`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: this slice currently lacks attached empirical evidence from a reproducible current-develop run for both acceptance checks (unreadable tracked file fails lint and spec expecting exit 1). Please re-run and attach evidence before re-submitting.

### S2 — A failed secrets listing is reported unknown, not empty
- **Status**: pending
- **Files**: `plugins/security/src/lib/secrets/real-deps.ts`, `plugins/security/tests/src/lib/secrets/real-deps.spec.ts`
- **Gate**: type
- acceptance:
  - "A git listing that fails makes the scan report unknown or failed, never zero files."
  - "A spec fails the listing and expects the unknown state."
- shipped-in: `4079bdb2efdd`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: this slice currently lacks attached reproducible evidence on current develop for the unknown/failed state behavior when git listing fails, including the spec expectation. Please re-run and resubmit with fresh empirical proof.

### S3 — A probe that did not exit is not an accepted run
- **Status**: pending
- **Files**: `tools/scripts/lint/lib/empty-root-probe.lib.ts`, `tools/scripts/lint/lib/empty-root-probe.lib.spec.ts`
- **Gate**: type
- acceptance:
  - "A probe whose status is null (timeout or failed start) makes the check fail with the cause."
  - "A spec returns status null and expects a failure."
- shipped-in: `c424cb36ad51`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Rework required: this slice currently lacks attached empirical evidence from a reproducible current-develop run proving status=null is treated as failure with cause (including the spec case). Please re-run and include fresh evidence before re-submitting.

## acceptance

- A tracked source file that cannot be read makes the lint fail and names the file.
- A spec makes one file unreadable and expects exit 1.
- A git listing that fails makes the scan report unknown or failed, never zero files.
- A spec fails the listing and expects the unknown state.
- A probe whose status is null (timeout or failed start) makes the check fail with the cause.
- A spec returns status null and expects a failure.
