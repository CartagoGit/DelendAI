---
id: x00565
title: "A refreshed candidate carries correct derived files"
kind: fix
status: review
type: proposal
track: efficiency
date: 2026-09-20
tags:
    - ci
    - generated
    - automation
shipped-in:
  - 10eb7aa831274e730456ead37a022c5c0adb3750
---

# x00565 — A refreshed candidate carries correct derived files

## goal

Bringing a candidate up to the integration branch leaves it green,
including the files no person writes. Nobody re-runs a generator by hand.

## why

Measured over one session in this repository: **six** candidates went red
on `catalog:check`, and the fix every single time was the same two
commands and a push.

The cause is a good decision meeting a bad case. `forge:refresh` merges
the integration branch into a candidate through a THROWAWAY INDEX — that
is what lets it refresh a queue without moving the shared checkout, and
it is right. But a textual merge is the correct answer for authored
files and the wrong one for derived files: the agent catalog is rendered
from the proposals on disk, so merging two versions of it produces a
file neither generator would ever produce, and the gate that checks the
artifact against its generator fails on the result.

x00559 fixed this for merges that happen in a working tree — a merge
driver regenerates, and a `post-merge` hook recomputes against the
finished tree. A candidate refreshed through a throwaway index never
touches a working tree, so neither runs.

The cost is not the red check. It is that the queue stops for a reason
nobody caused, and the only thing that restarts it is a person noticing
— which is the exact dependency this whole line of work exists to
remove.

## non-goals

- **No touching the shared checkout.** Each candidate is refreshed in
  its own throwaway worktree, which is removed whatever happens.
- **No resolving somebody's conflict.** A candidate that does not merge
  trivially is reported and left exactly as it was.
- **No force-pushing.** A push that the forge refuses is reported.

## slices

### S1 — Merge, regenerate, push — per candidate, in its own worktree

- **Status**: done
  integration branch has moved past and, for each, merges in a throwaway
  worktree, runs the generators against the merged tree, commits only
  what they changed and pushes. A conflict, a failing generator or a
  refused push each leave the candidate untouched and say which.
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.constant.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.interface.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`,
  `package.json`
- **Gate**: `npx vitest run tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named merge 2b14cd3cd (a develop-merge); git log traces S1 to 10eb7aa83, full message read. Verified in the current tree: (1) forge:artifacts = refresh-candidate-artifacts.script.ts (package.json line 120) does per candidate that is behind: ONE throwaway worktree, merge integration, regenerate, commit only what the generators changed, push — the shared checkout never moves and nothing is force-pushed; (2) the root cause named in the commit is real and precisely diagnosed: a textual merge is right for authored files and wrong for derived ones (the agent catalog is rendered from proposals on disk, so merging two versions produces a file no generator would produce and catalog:check fails) — x00559 fixed working-tree merges, this covers the throwaway-index path; (3) failure handling: a conflict, a failing generator or a refused push each leave the candidate EXACTLY as it was and say which; (4) measured motivation: six candidates went red on catalog:check in one session with the same manual two-generator fix each time. Gate run verbatim: npx vitest run tools/scripts/git/refresh-candidate-artifacts.script.spec.ts = 19/19 exit 0. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: claude-opus-5 from Merge pull request #300 from CartagoGit/delendai/pr/claude-opus-5/x00565-S1-g1/derived-on-the-branch (refs/heads/delendai/wip/claude-opus-5/x00565-S1-g1/derived-on-the-branch) (10eb7aa831274e730456ead37a022c5c0adb3750), opened by qwen-3.8-max
### S2 — It runs on the same trigger as everything else

- **Status**: done
  here, beside the candidate refresh it completes.
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: `npx vitest run --project tools`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. S2 shipped in the same 10eb7aa83 delivery ('It runs on the same trigger as the rest, so the queue no longer waits for somebody to notice'). Verified in the current tree: hydrate-candidates-after-merge.script.ts line 92 runs tools/scripts/git/refresh-candidate-artifacts.script.ts with a generous 3,600,000 ms budget (an hour — regeneration and push per candidate is slow, unlike the 180s namespace pass) — hung off the exact moment the integration branch moves: the local post-merge hook path AND the host fast-forward tick (the same trigger x00564 S2 and x00557 S2 use), so no agent decides when derived files are regenerated. Gate run verbatim: npx vitest run --project tools = 2432 passed / 1 skipped (pre-existing) / 254 files, exit 0. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: claude-opus-5 from Merge pull request #300 from CartagoGit/delendai/pr/claude-opus-5/x00565-S1-g1/derived-on-the-branch (refs/heads/delendai/wip/claude-opus-5/x00565-S1-g1/derived-on-the-branch) (10eb7aa831274e730456ead37a022c5c0adb3750), opened by qwen-3.8-max
## acceptance

- After the integration branch moves, a candidate that was behind is
  level with it AND its derived files match what the generators produce
  from the merged tree.
- A candidate that does not merge trivially is unchanged on the remote.
- The shared checkout's `HEAD` never moves, and no worktree is left
  behind, in any outcome.
