---
id: x01038
title: "The reaper reads the activity before the status that freshens it"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-05
---

# x01038 — The reaper reads the activity before the status that freshens it

## goal

The reaper can tell a worktree nobody is working on from one somebody is sitting at, so a finished unit's worktree is reclaimed instead of piling up for ever.

## why

`observe` (tools/scripts/reclaim/reclaim-worktrees.script.ts) builds each worktree's facts in one object literal, and the properties are evaluated in the order they are written: `dirtyPaths` (which runs `git status --porcelain`) comes before `lastActivityMs` (which reads the mtime of the worktree's `index` and `HEAD`).

`git status` rewrites the index it reads when the index looks older than the file it compared against. So the reaper's own status call freshens the very index whose mtime says how long ago git last worked there. The worktree is then judged `active` — "git worked here 0 minute(s) ago; somebody is probably sitting at it" — and is kept.

The consequence is not a test that fails; it is a reaper that never reaps. `judgeWorktrees` only returns `spent` when `idleMs >= activeWindowMs`, and `idleMs` is measured from an index the reaper just refreshed, so it is always about zero. Every worktree in every project reads as active, and finished units keep their worktree, their branch and their disk for ever. This is the same accumulation of spent worktrees and branches that x01040 and q00040 try to clean up: the cleanup cannot work because the thing that decides which worktree is spent never says so.

Seen on 2026-11-05: `tools/scripts/reclaim/reclaim-worktrees.script.spec.ts > observe and main over a real repository > main only reports without apply, and with apply removes just the spent one` fails in develop's own CI (run 41881905780, job `tests: tools 2/4`) and in PR #1810 (job 127201560612) with `AssertionError: expected true to be false`: the spent worktree is still there after `main(root, true)`. The spec even names the cause in a comment it does not act on: "A dry run reads status too, which freshens the index."

The spec's own fix, ageing the index a second time after the dry run, only makes the spec pass. It leaves the product broken: the reaper still cannot tell an idle worktree from a busy one, because it always looks at an index it has just refreshed.

## non-goals

- Changing what counts as spent: a clean worktree whose head the integration branch already contains.
- Changing the active window, or reading activity from somewhere else (the reflog, the last commit): the mtime of git's own bookkeeping is a fine source, it just has to be read before anything touches it.
- The worktree's file mtimes: the index and HEAD are what git writes when it works there.

## slices

- global_gate: none

### S1 — The activity is read before the status that freshens it
- **Status**: pending
- **Files**: `tools/scripts/reclaim/reclaim-worktrees.script.ts`, `tools/scripts/reclaim/reclaim-worktrees.script.spec.ts`
- **Gate**: none
- acceptance:
  - "observe reads each worktree's last activity before it runs `git status` on it, so a worktree idle for longer than the active window is judged spent even though the reaper read its status."
  - "The spec proves it over a real repository: a worktree aged past the window is removed by `main(root, true)` while a dirty one and one whose status cannot be read stay, and the spec does not age the index a second time to make that happen."

## acceptance

- observe reads each worktree's last activity before it runs `git status` on it, so a worktree idle for longer than the active window is judged spent even though the reaper read its status.
- The spec proves it over a real repository: a worktree aged past the window is removed by `main(root, true)` while a dirty one and one whose status cannot be read stay, and the spec does not age the index a second time to make that happen.
- A reaper run over a repository with an idle, delivered worktree reports it as spent and removes it; today it reports it as active and keeps it.
