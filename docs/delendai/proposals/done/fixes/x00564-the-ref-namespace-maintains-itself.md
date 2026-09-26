---
id: x00564
title: "The ref namespace maintains itself"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - automation
    - swarm
shipped-in:
  - 79863b5c274b4c299380836ffa138af39a082371
---

# x00564 — The ref namespace maintains itself

## goal

Names that drifted from the convention are corrected, refs the
integration branch already contains are removed, and neither depends on
an agent deciding to do it.

## why

Every piece of this already existed as something a person could run. The
convention has one source of truth (x00563), the reaper can prove a ref
spent (x00547), and the candidate refresh runs on its own (x00554 S2).
And yet, measured in this repository after all of that shipped:

```
delendai/wip/visual-studio-code/a00033-S2-g1-fix-the-agent-events-bridge-…
delendai/wip/visual-studio-code/a00033-S3-g1-decouple-loop-detector-…
delendai/wip/desktop-9ctqrs7/x00080-S3-g1-skill-bootstrap-documentation-…
delendai/pr/x00563-ref-shape                    ← its pull request merged
```

Four names that do not carry the shape, and a publication ref whose work
is in the integration branch. Nothing was broken; nobody ran the tools.

That is the whole finding: **a rule that depends on an agent remembering
is not a rule.** Giving agents rails is worth doing, but the part that
can be automatic has to actually be automatic, or the next agent — or
the same one, later — leaves the same mess.

## non-goals

- **No renaming that guesses.** A ref is renamed only when its own
  identity can still be read from the name; one that cannot be parsed is
  left exactly as it is and reported.
- **No reaping that assumes.** The proof is an empty three-dot diff
  against the integration branch: deleting the ref cannot lose a line.
  Age is never evidence.
- **No touching work in progress.** A ref a worktree has checked out is
  never renamed and never reaped, whatever it looks like from outside.

## slices

### S1 — One pass that renames, reaps, and proves both

- **Status**: done
  namespaces and, for each ref: leaves it alone if a worktree holds it;
  reaps it when the integration branch already contains everything it
  adds; renames it to the canonical name when its identity parses but
  its name has drifted. It reads the SAME parser the reconciler
  attributes refs with, so a rename can never produce a name the reader
  cannot read. Read-only by default.
- **Files**: `tools/scripts/git/maintain-ref-namespace.script.ts`,
  `tools/scripts/git/maintain-ref-namespace.interface.ts`,
  `tools/scripts/git/maintain-ref-namespace.script.spec.ts`,
  `package.json`
- **Gate**: `npx vitest run tools/scripts/git/maintain-ref-namespace.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named merge faf93e61b (a develop-merge carrying other work); git log traces S1 to 79863b5c2, full message read. Verified in the current tree: (1) maintain-ref-namespace.script.ts exists as forge:namespace and per ref: skips what a worktree holds, reaps what the integration branch already contains, renames a drifted name to the canonical one using the SAME parser the reconciler reads with (so a rename can never produce an unreadable name); (2) the two deliberate refusals are implemented and spec-pinned: an unparsable name is left alone rather than renamed by guess, and a ref exactly at the integration tip is never reaped (cannot distinguish uncheckpointed from fast-forwarded work); (3) acceptance items map 1:1 to these behaviours. Gate run verbatim: npx vitest run tools/scripts/git/maintain-ref-namespace.script.spec.ts = 16/16 exit 0. bun run typecheck exit 0. Follow-up 13eff3e11 ('the remote is the authority for a shared ref') tightened reaping further — consistent with the acceptance.
- review-attribution: claude-opus-5 from Merge pull request #299 from CartagoGit/delendai/pr/claude-opus-5/x00564-S1-g1/namespace-maintains-itself (refs/heads/delendai/wip/claude-opus-5/x00564-S1-g1/namespace-maintains-itself) (79863b5c274b4c299380836ffa138af39a082371), opened by qwen-3.8-max
### S2 — It runs when the branch moves, not when somebody remembers

- **Status**: done
  runs the maintenance pass: a local merge through `post-merge`, and a
  fast-forward performed by the running server's hydration watch. No
  agent decides; nothing waits for one.
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: `npx vitest run --project tools`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. S2 landed inside the same 79863b5c2 delivery ('It runs on the same trigger that refreshes stale candidates — a local merge, and the server's fast-forward — so no agent decides'). Verified in the current tree: hydrate-candidates-after-merge.script.ts runs maintain-ref-namespace.script.ts as its LAST step (line 93, with a 180s budget) and its own comment (line 85) explains why last: it reads the namespace after candidates have been refreshed; this is the same trigger x00557 S2 hangs the candidate refresh off, so namespace maintenance fires when the branch moves — a local post-merge and the host's fast-forward tick — not when somebody remembers. Acceptance item 1 ('after work lands, the ref disappears the next time the integration branch moves here, without anybody asking') is exactly this wiring plus S1's reap rule. Gate run verbatim: npx vitest run --project tools = 2432 passed, 1 skipped (pre-existing), 254 files, exit 0. bun run typecheck exit 0.
- review-attribution: claude-opus-5 from Merge pull request #299 from CartagoGit/delendai/pr/claude-opus-5/x00564-S1-g1/namespace-maintains-itself (refs/heads/delendai/wip/claude-opus-5/x00564-S1-g1/namespace-maintains-itself) (79863b5c274b4c299380836ffa138af39a082371), opened by qwen-3.8-max
## acceptance

- After work lands, the ref that carried it disappears on the next time
  the integration branch moves here, without anybody asking.
- A ref whose name drifted is renamed to the canonical one, keeping its
  commit, and the old name is gone from this clone and the remote.
- A ref a worktree has checked out is never touched, and a ref sitting
  exactly at the integration tip is never reaped — a unit of work that
  has not checkpointed yet is indistinguishable from one whose work
  landed by fast-forward, and only one of those is safe to delete.
