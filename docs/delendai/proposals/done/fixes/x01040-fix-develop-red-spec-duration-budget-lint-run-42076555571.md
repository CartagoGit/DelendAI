---
id: x01040
title: "Fix develop red: spec-duration-budget lint (run 42076555571)"
kind: fix
status: done
type: proposal
track: ci
date: 2026-11-07
last-transition-id: 9b1f5df1-3d84-4629-91c8-191ebd0c1829
last-correlation-id: 9b1f5df1-3d84-4629-91c8-191ebd0c1829
last-transition-from: review
last-transition-at: 2026-11-09T21:24:42.932Z
shipped-in:
  - "24b2552180c314b6cd0a84e07f3500d7db38c5b2"
---

# x01040 — Fix develop red: spec-duration-budget lint (run 42076555571)

## goal

Develop is red at 1f8f5acee (CI run 42076555571): spec-duration-budget fails kept-unit-hydration.service.spec.ts (7495 ms) and shared-checkout-clean.service.spec.ts (6142 ms). Make both fast with test-kit; make the gate robust to runner noise.

## why

CI run 42076555571 left develop red at 1f8f5acee: the spec-duration-budget lint (q00045 S1) failed two specs over 5 s that are not in its baseline, so the queue arms no pull request. A wall clock on shared runners must not turn develop red from noise, so the gate also needs a margin, a median, and a report-only mode on the integration branch.

## notes

- Root cause of the reclaim-worktrees flake in #1812 (run 42364090265): the dry run's plain `git status` rewrote the spent worktree's index, the very file whose mtime dates its activity, so the applying run judged it busy and kept it. Fixed in the product with `git --no-optional-locks status`, and pinned by a spec that checks the index mtime is unchanged.

## non-goals

- Optimising `work enter` itself (about 115 git calls per enter).
- Wiring the download of earlier runs' timings in CI (the median is supported by `--history`).

## slices

- global_gate: none

### S1 — Fast specs and a noise-robust duration gate
- **Status**: done
- **Files**: `packages/core/tests/src/lib/work-units/kept-unit-hydration.service.spec.ts`, `packages/core/tests/src/lib/work-units/shared-checkout-clean.service.spec.ts`, `tools/scripts/ci/spec-duration-budget.ts`, `tools/scripts/ci/spec-duration-budget.script.ts`, `tools/scripts/ci/spec-duration-budget.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: none
- shipped-in: `bcb929bbe885`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 24b2552180c3, validate exit 0 and tests 53/53 claimed, no recorded run cited; acceptance 4/4: (1) both import and use createGitRepoTemplate; both pass on develop (~3 s together) (2) CLEAR_MS = FAIL_MS*NOISE_MARGIN; failures filter ms > CLEAR_MS; judgedDuration medians current+history; specs 'fails only a file over the limit by the margin' … (3) script returns 0 in integration mode after writing --report-out; ci.yml step 'Open or refresh the slow-spec issue' runs gh issue edit/create when offenders.md … (4) default mode returns 1 when verdict.failures is non-empty; ci.yml runs --mode=pull-request on PR timings — Read 24b2552180c3. Both specs now build on createGitRepoTemplate and together run in ~3 s locally (were 7.5 s / 6.1 s on CI). spec-duration-budget.ts adds NOISE_MARGIN 1.5 / CLEAR_MS 7500, judgedDuration = median of this run and --history runs, offenders (>5 s) vs failures (>7.5 s). The script's --mode=integration returns 0, prints ::warning:: lines and writes --report-out; ci.yml writes offenders.md on develop and opens or edits one 'Slow specs' issue (issues: write added), while pull requests run --mode=pull-request on their own changed-spec timings. Ran kept-unit-hydration, shared-checkout-clean, spec-duration-budget and reclaim-worktrees specs: 53/53 pass. Not blocking: the integration-mode exit-0/report-out path is covered only by reading, not by a spec.

## acceptance

- The two specs use `createGitRepoTemplate` and pass under vitest.
- A file is a failure only over 7.5 s (5 s with a 1.5 margin); the median of `--history` runs is judged when given.
- `--mode=integration` exits 0 and writes the offenders; CI opens or refreshes an issue for them.
- `--mode=pull-request` still fails a clearly slow spec.
