---
id: v00142
title: "The queue lands a change in minutes: it arms while the last merge certifies, and CI brings candidates forward"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-28
---

# v00142 — The queue lands a change in minutes: it arms while the last merge certifies, and CI brings candidates forward

## goal

A green pull request lands within minutes of going green, not after the merges queued before it each wait for a full run, and a candidate that is behind is brought forward without anyone's machine having to be on.

## why

Measured on 2026-10-28: a pull request's CI takes about 5 minutes (run 40631749357: 04:20 to 04:25) and a full run of develop about 9 (run 40738207173). The queue then lands one change per cycle: the candidate's CI, the merge, a wait for develop's own full run (`integrationAllowsArming` accepts only `certified`), and the next candidate, now behind, brought forward and tested again. Twelve pull requests stood for 10 hours. Three more facts kept them standing:

- Bringing a candidate forward is done by the owner machine (`forge:refresh` there; CI only reports, because a push with the workflow token starts no runs). The owner's server had run code four days old, so nothing came forward and stale bases stayed red.
- The hourly cron runs the workflow of the default branch, `main`, 859 commits behind develop; that copy only reports. Only a push to develop or a dispatch runs the real queue.
- A candidate red because its base moved is handed to its author ("red again after being brought forward; its author pushes next"), and nothing tells the author.

## non-goals

- Weakening the required checks or the red-integration repair path.
- A long-lived token with write access in CI.

## slices

- global_gate: type

### S1 — Arm while the last merge certifies
- **Status**: pending
- **Files**: `tools/scripts/forge/queue-arming.ts`, `tools/scripts/forge/queue-arming.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: type
- acceptance:
  - "`integrationAllowsArming` accepts a `pending` integration commit whose first parent is certified, and nothing else that is not certified (queue-arming.spec.ts); a red one still arms only its repair."

### S2 — The clock runs the integration branch's queue
- **Status**: pending
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: type
- acceptance:
  - "The scheduled run dispatches `keep-the-queue-moving` on the integration branch (or the default branch is the integration branch), so the hourly run arms and reports with the current rules; the run's log names the ref it ran."

### S3 — An author's own commands bring its red candidates forward
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`
- **Gate**: type
- acceptance:
  - "Any `work` command an agent runs lists its own publications that are red because their base moved, and `work refresh` brings each forward (merge the integration branch, regenerate, push) from a throwaway worktree, so no owner machine has to be on."

## acceptance

- `integrationAllowsArming` accepts a `pending` integration commit whose first parent is certified, and nothing else that is not certified (queue-arming.spec.ts); a red one still arms only its repair.
- The scheduled run dispatches `keep-the-queue-moving` on the integration branch (or the default branch is the integration branch), so the hourly run arms and reports with the current rules; the run's log names the ref it ran.
- Any `work` command an agent runs lists its own publications that are red because their base moved, and `work refresh` brings each forward (merge the integration branch, regenerate, push) from a throwaway worktree, so no owner machine has to be on.
