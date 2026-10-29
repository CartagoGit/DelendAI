---
id: x00995
title: "No code a spec evaluates is built from a value, and every open CodeQL alert is fixed or dismissed with its reason"
kind: fix
status: in-progress
type: proposal
track: ci
date: 2026-10-29
last-transition-id: e493e6d1-5176-4776-b9dd-188dea898ee6
last-correlation-id: e493e6d1-5176-4776-b9dd-188dea898ee6
last-transition-from: ready
last-transition-at: 2026-10-29T11:41:52.313Z
---

# x00995 — No code a spec evaluates is built from a value, and every open CodeQL alert is fixed or dismissed with its reason

## goal

The repository has no open code-scanning alert without an owner: each one is fixed, or dismissed with the reason it does not apply, and an alert that appears on develop is reported where the queue reports a broken promise, not left for someone to find.

## why

On 2026-10-29 the owner found two CodeQL alerts open for two and four days:

- #463 `js/bad-code-sanitization` (medium), `plugins/proposals/tests/src/lib/proposals/acceptance-exec.spec.ts:241`: the spec built the source a grandchild process evaluates by splicing a temporary path into it with `JSON.stringify`.
- #464 `js/http-to-file-access` (medium), `packages/core/src/lib/shared/declared-agents.service.ts:225`: the agent installer writes the archive it downloaded. The bytes are compared with the registry's sha256 first and a mismatch throws before any write; writing a verified download is what the installer is for.

A pull request's CodeQL check fails only on alerts its own diff introduces, so an alert raised by develop's full analysis (which now sees more than a pull request's scoped one, v00144) stays open with every check green.

## non-goals

- Turning a reviewed design decision into a code change to silence a query.

## slices

- global_gate: type

### S1 — The two open alerts
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/proposals/acceptance-exec.spec.ts`
- **Gate**: type
- acceptance:
  - "The spec's grandchild writes a relative `late.txt` in the criterion's `cwd` (`runAcceptanceCriteria(..., { cwd: dir })`), so no value is spliced into evaluated code; left unkilled the same command writes the marker there, so the test still proves the process-group kill."
  - "#464 is dismissed as won't fix with the reason above, on 2026-10-29."

### S2 — An open alert is a broken promise
- **Status**: pending
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: type
- acceptance:
  - "The queue job (every hour and after each merge) runs `forge:promotion-alerts --branch=develop`, which lists every open code scanning alert with its rule and place and fails, so the job is red until each is fixed or dismissed with a reason; the release gate counted them only at a promotion."

## acceptance

- The spec's grandchild writes a relative `late.txt` in the criterion's `cwd` (`runAcceptanceCriteria(..., { cwd: dir })`), so no value is spliced into evaluated code; left unkilled the same command writes the marker there, so the test still proves the process-group kill.
- #464 is dismissed as won't fix with the reason above, on 2026-10-29.
- The queue job (every hour and after each merge) runs `forge:promotion-alerts --branch=develop`, which lists every open code scanning alert with its rule and place and fails, so the job is red until each is fixed or dismissed with a reason; the release gate counted them only at a promotion.
