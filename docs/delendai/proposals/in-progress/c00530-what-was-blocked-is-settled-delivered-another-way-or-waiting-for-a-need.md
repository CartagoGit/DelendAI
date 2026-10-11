---
id: c00530
title: "What was blocked is settled: delivered another way, or waiting for a need"
kind: chore
status: in-progress
type: proposal
track: general
date: 2026-10-11
last-transition-id: 658e37ce-dd51-49da-a6c4-405c0290e6f8
last-correlation-id: 658e37ce-dd51-49da-a6c4-405c0290e6f8
last-transition-from: ready
last-transition-at: 2026-10-11T14:41:35.085Z
---

# c00530 — What was blocked is settled: delivered another way, or waiting for a need

## goal

No proposal stays blocked on a blocker that no longer exists: each of the six is closed by what already delivered it, given back to work, or parked with the reason it waits.

## why

On 2026-10-11, with nothing left in progress, six proposals were blocked. Read one by one against the code, none was blocked by anything that still existed:

| proposal | what it waited on | what the code says today | outcome |
| --- | --- | --- | --- |
| f00270, one token budget registry | its parent plan, closed | the registry exists since f00186; the dashboard and the preset gate measure through one module and read one table of ceilings | retired: delivered another way |
| f00277, agent sessions and `delendai agents` | the event bus and the progress projector, both done | `work swarm` lists every unit with agent, proposal, worktree, branch, tip and files; `work progress --agents` lists who did something lately | retired: superseded; its one delivered slice had no consumer and is removed here |
| f00278, work intent and completion gates | f00277 | a slice's `Files` is the intent, and the hand-over and the close refuse work that does not match it | retired: superseded |
| f00279, a taxonomy of rules | an effect broker (done) and f00278 | the rules plugin is a registry of framework dogmas; what an agent must do is rendered from the policy and enforced by the git guards | retired: its premise is gone |
| f00500, no model named as author | nothing recorded | four of its five open slices shipped on 2026-09-04 and were never marked | to review, with what shipped recorded and the renaming of closed documents retired |
| f00639, optional capability providers | the consolidation of authorities, done | no consumer asks for a provider | paused, with the vertical features, until one does |

## non-goals

- Running the history rewrite f00500 prepared: it rewrites published history and is the owner's to call.

## slices

- global_gate: none

### S1 — Each blocked proposal is closed, given back to work, or parked with its reason

- **Status**: review
- **Files**:
  - `docs/delendai/proposals/ready/chores/c00530-what-was-blocked-is-settled-delivered-another-way-or-waiting-for-a-need.md`
- **Gate**: none
- shipped-in: `54450c5fa251`
- acceptance:
  - No proposal is blocked.
  - Each of the six carries, in its own document, why it ended where it did.

### S2 — The agent-session derivation nobody consumed goes

- **Status**: review
- **Files**:
  - `tools/scripts/inspect/core-proposals-boundary.script.ts`
- **Gate**: unit
- shipped-in: `f92f9dacebc7`
- acceptance:
  - `derive-agent-sessions.service.ts`, its contract and its spec are deleted, with the five exceptions the boundary lint kept for them.

### S3 — A pause keeps the reason it is given, and a retired unit does not linger

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/proposals/proposal-frontmatter-writer.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
  - `packages/core/src/lib/work-units/unit-reaper.service.ts`
  - `packages/core/tests/src/lib/work-units/unit-reaper.service.spec.ts`
- **Gate**: unit
- shipped-in: `54450c5fa251`
- acceptance:
  - A transition to `paused` writes the caller's reason as the document's `paused-reason`; it becomes a block only on an explicit "blocked by <id>" or an existing dependency.
  - A frontmatter field that did not exist is written inside the frontmatter.
  - `work reap` removes a unit left behind here whose tip the remote keeps as retired.

Met while doing S1. Parking f00639 with "recorded in c00530" for a reason blocked it on c00530, and the dependency was written under the closing fence, in the body. And the swarm's units that the queue had retired on the remote were still listed here as units at work.

## acceptance

- `proposals status` reports `blocked: 0`.
