---
id: x00555
title: "Every agent can see what the swarm is doing"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-19
shipped-in:
  - c910135c6
  - dfd088264aa55de528356067653bec321e5c2efb
  - 69408501831111213fb9539f90190302ffc257e0
tags:
    - swarm
    - coordination
    - claims
    - awareness
last-transition-id: 570f7736-b692-4e12-8cb3-eac531eaea4b
last-correlation-id: 570f7736-b692-4e12-8cb3-eac531eaea4b
last-transition-from: review
---

# x00555 — Every agent can see what the swarm is doing

## goal

Before an agent starts, it can see what every other agent is working on,
which paths are already claimed, and which proposals are in flight — so
two agents never solve the same thing twice, and never solve it in ways
that undo each other.

## why

The system already records almost all of it: leases, path claims, work
units, generations and their checkpoints all live in the operational
state. What is missing is that **nothing shows it to an agent at the
moment it decides what to do**. A boot prints a verdict; the claims are
consulted only when a write is attempted, which is after the work exists.

The result is what the swarm was supposed to prevent: an agent picks a
file another agent is mid-way through, or re-implements something that
is already three commits into another work ref, and the collision is
discovered at commit time, when the cheap options are gone.

A hive is not twenty agents each holding a lock. It is twenty agents
that can read the same picture before they move.

## non-goals

- **No new store.** Everything read here is already recorded; this is a
  view, not another source of truth.
- **No blocking.** Awareness is not a lock: the claims system stays the
  enforcement, this is what stops the collision from being created in
  the first place.
- **No personal data.** Agents are identified by the agent id the
  project already uses, never by machine or user identity.

## slices

### S1 — One view of the swarm, read from the state that exists

- **Status**: done
  with no MCP server: every unit of work anyone has published, the
  identity its ref carries, how far it is from the integration branch
  both ways, and — the part that avoids the collision rather than
  detecting it — which paths more than one unit of work is changing. Git
  was the right source: it is the one thing every clone in a swarm
  shares, while the operational database describes one machine.
- **Gate**: `npx vitest run packages/cli/src/lib/work-swarm.service.spec.ts`
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/cli/src/lib/work-swarm.service.ts`, `packages/cli/src/contracts/interfaces/work-swarm.interface.ts`
- `delendai work swarm` (and the equivalent MCP surface) answers: who
  holds which live claims, which work units have unmerged checkpoints,
  which proposals are in flight, and which publication refs are open —
  offline, from the operational state.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named c910135c6 (S2's commit); git log traces S1 to dfd088264, full message and stat read. Verified in the current tree: (1) `delendai work swarm` answers offline from git alone — work-swarm.service.ts (+179) lists every published unit of work, each ref's identity, ahead/behind vs integration and paths more than one unit changes; deliberately reads git rather than the operational DB so remote-only units are visible; (2) acceptance item 1 proven LIVE during this review: `bun packages/cli/dist/index.js work swarm` printed 4 live units from THREE different agents including two on other machines (claude-opus-5-5, glm-5.3-max) alongside my own — exactly the cross-machine visibility the slice promises; (3) the glob defect found while proving it (refs/remotes/*/<ns>/wip/ matches nothing because * does not cross path components) is fixed in the shipped code; (4) work-swarm.service.spec.ts + work.command.spec.ts pass within the combined 43/43 exit-0 run. bun run typecheck exit 0. No out-of-scope changes: the commit touches only work.command.ts, the swarm service + spec + interface, and generated artifacts.
- review-attribution: unrecorded — nothing in Git names who delivered dfd088264aa55de528356067653bec321e5c2efb: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — A collision is named before the work starts

- **Status**: done
  anything, whether another identity is already changing these paths, and
  refuses with who, which unit of work, and which paths overlap — only
  the shared ones, never the other agent's unrelated files. The overlap
  is read from the diffs the work refs carry rather than from a claim
  table, so an agent editing files without having announced it still
  collides with you: the truth is in the commits, not in the bookkeeping.
  The refusal carries the three answers that exist (wait, re-scope, or
  take the unit over with `delendai work claim`, which renames it and
  leaves a record) because an agent told only "no" guesses, and one of
  the guesses is "do it anyway". Comparison is on segment boundaries, so
  a scope claiming `src/app` collides with `src/app/main.ts` and not with
  `src/applet/main.ts`; a unit the same identity already holds is never a
  collision, or a second slice would be impossible.
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**: `packages/cli/src/commands/work.command.ts`,
  `packages/cli/src/lib/scope-collision.service.ts`,
  `packages/cli/src/lib/scope-collision.service.spec.ts`,
  `packages/cli/src/contracts/interfaces/scope-collision.interface.ts`,
  `packages/cli/src/commands/work.command.spec.ts`
- Claiming or checkpointing paths that overlap another live claim
  reports the other agent, its work unit and the overlapping paths, with
  the choices (wait, re-scope, or take it over with proof) instead of a
  bare refusal.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. Read the full commit c910135c6 message + diff stat (scope-collision.service.ts + spec + interface, work.command.ts changes). Verified: (1) `work checkpoint` now asks BEFORE it writes whether another live unit of work is already changing the same path — reusing the overlap data S1's `work swarm` computes from the refs, so the collision is caught at the cheap moment (before the first edit) not at publication; (2) acceptance item 2: the refusal NAMES the other agent, its work unit and the overlapping paths ONLY (never the other agent's unrelated files), plus the three real answers — wait, re-scope, or take the unit over with `work claim`; a bare 'no' that makes the agent guess is explicitly avoided; (3) overlap is compared on path-segment boundaries so a scope claiming src/app collides with src/app/x but not with src/apple; (4) scope-collision.service.spec.ts + work.command.spec.ts green within the combined 43/43 exit-0 run. bun run typecheck exit 0. No out-of-scope changes. Acceptance item 3 (picture available before the first edit) is satisfied jointly by S1 swarm + this pre-write check.
- review-attribution: claude-opus-5 from Merge pull request #343 from CartagoGit/delendai/pr/claude-opus-5/x00555-S2-g1/a-collision-is-named-before-the-work-starts (refs/heads/delendai/wip/claude-opus-5/x00555-S2-g1/a-collision-is-named-before-the-work-starts) (c910135c66f3c135bdd71df6f3401a660c4a1ee6), opened by qwen-3.8-max
### S3 — The picture reaches the agent that needs it

- **Status**: done
  holds a live unit of work, on what, and which paths more than one unit
  is already changing. It was the missing moment. S1 made the picture
  available, S2 made it refuse a scope somebody else is in — but the
  first is a command an agent must think of running, and the second only
  speaks once the work exists. `enter` is where an agent is handed a
  worktree and decides what to touch, so that is where the briefing
  belongs. It is attached to the payload as well as printed, because the
  caller is as often a machine as a person and an agent driving `--json`
  must not need a second command to learn what a human read on the way
  in. When nobody else is live it says so out loud rather than printing
  nothing: silence cannot be told apart from a briefing that failed to
  run.
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**: `packages/cli/src/commands/work.command.ts`,
  `packages/cli/src/lib/work-briefing.service.ts`,
  `packages/cli/src/lib/work-briefing.service.spec.ts`,
  `packages/cli/src/contracts/interfaces/work-briefing.interface.ts`,
  `packages/cli/src/commands/work.command.spec.ts`
- The swarm view is part of what an agent reads when it starts a unit of
  work, so "what is everyone else doing" is answered before the first
  edit rather than after the first conflict.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Independence OK: implementer claude-opus-5, reviewer qwen-3.8-max. The queue named 4e9e0ee3f (a catalog regeneration after the move to review); git log traces S3 to 694085018, full message read. Verified: (1) `work enter` states the swarm unasked — who else holds a live unit of work, on what, and which paths more than one unit is already changing — placed exactly at the moment the slice argues for (between receiving a tree and deciding what to touch); (2) the briefing is attached to the --json payload as well as printed, so a machine caller does not need a second command; (3) when nobody else is live it says so out loud rather than printing nothing — silence cannot be confused with a briefing that failed; (4) work-briefing.service.spec.ts + work.command.spec.ts green within the combined 43/43 exit-0 run. EMPIRICAL corroboration: this reviewer's own `work enter` yesterday printed 'swarm 1 other unit(s) of work are live: claude-opus-5-5 f00536-S4-g1/...' — the delivered behaviour observed in production use. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: claude-opus-5 from Merge pull request #344 from CartagoGit/delendai/pr/claude-opus-5/x00555-S3-g1/the-picture-reaches-the-agent-that-needs-it (refs/heads/delendai/wip/claude-opus-5/x00555-S3-g1/the-picture-reaches-the-agent-that-needs-it) (69408501831111213fb9539f90190302ffc257e0), opened by qwen-3.8-max
## acceptance

- One command answers who holds which claims, which work units carry
  unmerged checkpoints and which publication refs are open, offline.
- Claiming paths that overlap another live claim names the other agent,
  its work unit and the overlapping paths.
- That picture is available before the first edit, not after the first
  conflict.

