---
id: x00566
title: "A guard that cannot run must not pass"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - git-hooks
    - worktrees
    - fail-closed
shipped-in:
  - c0445a69e
last-transition-id: f72a8721-c413-49eb-8c3d-d92067d53e6a
last-correlation-id: f72a8721-c413-49eb-8c3d-d92067d53e6a
last-transition-from: review
---

# x00566 — A guard that cannot run must not pass

## goal

Every git hook this repository relies on runs identically in the shared
checkout and in an agent worktree, and refuses instead of passing when it
cannot run at all.

## why

The work-ref doctrine rests on git hooks. `no-llm-attribution` keeps an
LLM out of the authorship trailer, `publication-proof` refuses a push
that has not been proven, `drift-check` refuses a stale generated
artifact, and the git guard refuses a commit made on a work ref inside
the pinned checkout. None of those are advisory; they are the rails.

Two facts, both observed live in this repository on 2026-09-20, mean the
rails are absent exactly where the agents are.

**The generated hook is blind in a worktree.** Lefthook writes each
`.git/hooks/*` as a shell script that finds its binary by way of
`git rev-parse --show-toplevel`. In an agent worktree that answers the
worktree, and a worktree has no `node_modules`. Four candidate refreshes
in one session pushed with the single line `Can't find lefthook in PATH`
and no gate ran.

**The search fails open.** When nothing is found, the generated script
echoes that line and exits 0. The commit is created; the push goes
through. A guard that passes when it cannot run is not a guard — it is a
guard-shaped gap that reports itself once, in a place nobody reads.

There is a third edge with a longer fuse. Lefthook bakes an *absolute*
path to the binary it was installed from. Running `bun install` inside a
throwaway worktree rewrites the **shared** `.git/hooks/*` to point into
that worktree; removing the worktree then breaks the hooks for the
shared checkout and every other worktree. This repository's hooks were
in exactly that state when the defect was found — pointing at
`.cache/delendai/.worktrees/x00565`, already deleted.

This is the same shape as the rest of this cycle: the behaviour was
correct only as long as somebody remembered to work in the one place it
had been tested.

## non-goals

- Replacing lefthook, or vendoring its binary.
- Adding a second hook mechanism alongside it. Lefthook stays the only
  owner of `.git/hooks/*`; this hardens what it writes.
- Changing which checks run, or what any of them accept.

## architecture

`tools/scripts/git/harden-git-hooks.script.ts` rewrites the generated
text at the one moment it can appear — after `lefthook install`, from
`prepare`. It inserts a preamble that sets `LEFTHOOK_BIN` from
`git rev-parse --git-common-dir`, the one path that answers identically
in the shared checkout and in every worktree, so the generated search is
short-circuited before it can consult a worktree with no dependencies or
an absolute path baked in from a worktree since removed. It then replaces
the fallback that echoed and passed with one that writes to stderr and
exits non-zero.

The rewrite is marked and idempotent, so `prepare` running on every
install changes the file exactly once.

## slices

### S1 — the hook resolves from the common directory, and refuses when it cannot

- **Status**: done
- **Files**: [`tools/scripts/git/harden-git-hooks.script.ts`, `tools/scripts/git/harden-git-hooks.constant.ts`, `tools/scripts/git/harden-git-hooks.interface.ts`, `tools/scripts/git/harden-git-hooks.script.spec.ts`, `package.json`]
- **Gate**: `npx vitest run tools/scripts/git/harden-git-hooks.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5 (PR #301, merge 9c2a35fa2), reviewer glm-5.3-max. Diff read: harden-git-hooks.script.ts rewrites generated lefthook hooks after install, inserting a preamble that sets LEFTHOOK_BIN from `git rev-parse --git-common-dir` (identical answer in shared checkout and worktrees) and replacing the fall-open fallback (echo + exit 0) with a stderr message + non-zero exit. Marked and idempotent. Gate green: harden-git-hooks.script.spec.ts part of an 18/18 run covering all four acceptance lines (worktree runs the binary; no-binary exits non-zero; shared checkout still works; second pass byte-identical).
- review-attribution: claude-opus-5 from commit c0445a69e92f names refs/heads/delendai/wip/claude-opus-5/x00566-S1-g1/guards-run-in-every-worktree (c0445a69e92f50db6f2f498e63932d6a7a4faec7), opened by glm-5.3-max
## acceptance

- A hardened hook invoked from a worktree runs the binary; the generated
  one does not.
- A hardened hook with no resolvable binary exits non-zero; the generated
  one exits 0.
- A hardened hook still runs from the shared checkout.
- A second hardening pass leaves the file byte-identical.
- A hook that is not lefthook's is left alone.

## risks and mitigations

- **The generated text changes in a future lefthook.** The rewrite keys
  on two literals. If either disappears the hook is left alone and
  reported as skipped rather than corrupted; the spec carries the shape
  it expects, so the change surfaces as a failing test.
- **`LEFTHOOK_BIN` already set by the caller.** The preamble sets it only
  when it is empty, so an explicit override still wins.
