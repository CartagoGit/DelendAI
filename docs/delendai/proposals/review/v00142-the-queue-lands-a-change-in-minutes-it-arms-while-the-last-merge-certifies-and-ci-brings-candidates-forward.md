---
id: v00142
title: "The queue lands a change in minutes: it arms while the last merge certifies, and CI brings candidates forward"
kind: perf
status: review
type: proposal
track: ci
date: 2026-10-28
last-transition-id: cbba4d8e-7578-4f19-bcb2-e66d6274fa3b
last-correlation-id: cbba4d8e-7578-4f19-bcb2-e66d6274fa3b
last-transition-from: in-progress
last-transition-at: 2026-10-29T04:14:30.514Z
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
- **Status**: review
- **Files**: `tools/scripts/forge/queue-arming.ts`, `tools/scripts/forge/queue-arming.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: type
- acceptance:
  - "`integrationAllowsArming` accepts a `pending` integration commit whose first parent is certified, and nothing else that is not certified (queue-arming.spec.ts); a red one still arms only its repair."
- shipped-in: `9c43b6214938`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The clock runs the integration branch's queue
- **Status**: review
- **Files**: `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: type
- acceptance:
  - "The default branch is the integration branch (repository setting, 2026-10-28), so the hourly run is develop's queue, and the workflow says why next to its schedule."
- shipped-in: `2726a782c991`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — An author's own commands bring its red candidates forward
- **Status**: review
- **Files**: `tools/scripts/forge/candidate-disposition.ts`, `tools/scripts/forge/candidate-disposition.spec.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`
- **Gate**: type
- acceptance:
  - "`bun run forge:refresh -- --apply --author=<agent>` brings forward the agent's own publications the queue hands back to their author (merge the integration branch, regenerate, push, from a throwaway worktree; a conflict is reported and left), so no owner machine has to be on (candidate-disposition.spec.ts)."
- shipped-in: `2726a782c991`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `integrationAllowsArming` accepts a `pending` integration commit whose first parent is certified, and nothing else that is not certified (queue-arming.spec.ts); a red one still arms only its repair.
- The default branch is the integration branch (repository setting, 2026-10-28), so the hourly run is develop's queue, and the workflow says why next to its schedule.
- `bun run forge:refresh -- --apply --author=<agent>` brings forward the agent's own publications the queue hands back to their author (merge the integration branch, regenerate, push, from a throwaway worktree; a conflict is reported and left), so no owner machine has to be on (candidate-disposition.spec.ts).
