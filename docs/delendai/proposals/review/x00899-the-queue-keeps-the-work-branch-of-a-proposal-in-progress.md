---
id: x00899
title: "the queue keeps the work branch of a proposal in progress"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-14
last-transition-id: 16732765-50fa-4d95-b0a8-8877566e3c22
last-correlation-id: 16732765-50fa-4d95-b0a8-8877566e3c22
last-transition-from: in-progress
last-transition-at: 2026-10-14T08:26:32.360Z
---

# x00899 — the queue keeps the work branch of a proposal in progress

## goal

The `keep-the-queue-moving` job never deletes, on the forge, the work branch of a proposal that is in progress at the branch's tip, even when the branch's content is already in its publication or the integration branch.

## why

In progress is the one state that keeps a work branch (x00892): the proposal's next slice is committed on it, and leaving the state is what publishes the rest and ends it. The queue job runs `ref-lifecycle --reap` after every merge, and it judged a work branch reapable as soon as its content was in a publication. On 2026-10-14, run 38527156929 printed `deleted delendai/wip/claude-opus-5-5/implement/f00761-all-g1/plugin-in-any-language (its content is already in delendai/pr/…)` right after #1081 merged S2–S4, with S5 still to do. The unit on the machine that held it went with it. f00762 lost its branch the same way after #1080 (S1 and S2, with S3 pending), and x00898 was opened to find out who was removing such units.

The guard's own comment still said "a work branch ends when it is published", which was the lifecycle before x00892.

## non-goals

- Changing what the guard reports or when CI fails: a kept branch is neither deleted nor counted as blocking, exactly as a reapable one was not.

## slices

- global_gate: type

### S1 — A work ref whose proposal is in progress at its tip is kept, and said to be

- **Status**: review
- **Files**:
  - `tools/scripts/lint/in-progress-work-refs.helper.ts`
  - `tools/scripts/lint/in-progress-work-refs.helper.spec.ts`
  - `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - Among the refs the guard finds reapable, a work ref (not a publication) whose proposal file sits under `docs/delendai/proposals/in-progress/` in the tree of its tip, read through the forge API, is kept and logged as `kept: its proposal is in progress`. Everything else reapable is deleted as before.
  - A tip whose tree has no such folder, or a ref whose unit cannot be read, is judged as before.
  - The guard runs against the live forge without failing (checked on 2026-10-14: 4 refs, all belonging to somebody).
- shipped-in: `7be8a87d4c5b`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A proposal published slice by slice keeps its one work branch on the forge until it leaves in progress.
