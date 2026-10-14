---
id: c00530
title: "What was blocked is settled: delivered another way, or waiting for a need"
kind: chore
status: review
type: proposal
track: general
date: 2026-10-11
last-transition-id: 35787d68-275e-42e3-8ee4-9ccf842f78b6
last-correlation-id: 35787d68-275e-42e3-8ee4-9ccf842f78b6
last-transition-from: in-progress
last-transition-at: 2026-10-14T18:59:34.383Z
shipped-in:
  - "4fc13ebe3cceca89035746f0be479aa7c3e8c838"
  - "f2ed45067a9e921eb1f7edec07e9dd8db1c152b0"
  - "1fbd9d145a5e41930392b4e625843e482a5ee80c"
  - "cb182154db00d050ae0fe3f738720a564ffbed7c"
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

- **Status**: done
- **Files**:
  - `docs/delendai/proposals/ready/chores/c00530-what-was-blocked-is-settled-delivered-another-way-or-waiting-for-a-need.md`
  - `docs/delendai/proposals/retired/f00270-tokenbudgetregistry-unificado.md`
  - `docs/delendai/proposals/retired/f00277-agentsession-delendai-agents-ver-que-hacen-todos-los-agentes-en-worktrees-sin-cambiar-de-rama.md`
  - `docs/delendai/proposals/retired/f00278-workintent-completion-gates-intent-vs-actual-con-deriva-determinista.md`
  - `docs/delendai/proposals/retired/f00279-taxonomia-de-reglas-guidance-verification-enforcement-cada-una-con-su-mecanismo.md`
  - `docs/delendai/proposals/in-progress/f00500-hide-llm-attribution-from-github-surface-no-co-authors-no-ai-brands-only-cartagogit.md`
- **Gate**: none
- shipped-in: `54450c5fa251`
- acceptance:
  - No proposal is blocked.
  - Each of the six carries, in its own document, why it ended where it did.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: requested_changes by gpt-5.4 — The slice clears the global blocked count, but it does not satisfy the second acceptance criterion as written. f00270, f00277, f00278, and f00279 now have status retired, yet their own documents do not record why they ended there: I do not see a superseded-by field, a paused-reason, or an explicit explanatory block in those four files, only the status change. The outcome table in c00530 explains the reasons centrally, but the acceptance requires each affected proposal to carry its own reason in its own document. Please add that per-proposal traceability and resubmit S1.
- review-log: requested_changes by minimax-m3.1-flash-preview — gpt-5.4 asked for per-proposal traceability and got most of it: all four retired documents now carry a `- Retired on 2026-10-14 (c00530 S1):` line and f00639 carries a paused-reason. That part of the objection is resolved and I checked each of the five rather than taking the diff's word. But the slice says six, and the sixth is f00500: status in-progress, no reason field, and zero mentions of c00530 or of having been blocked. It was the one gpt-5.4 did not name, because it was returned to work rather than retired, and it is the one still missing. Criterion 1 is met — nothing in the tree is blocked any more. Criterion 2 is not, for exactly one document. Gate is `none`, so there is nothing else to weigh.
- review-log: approved by glm-5.3-flash — verified at cb182154db00, validate exit 0, tests 1/1; acceptance 2/2: (1) docs/delendai/proposals/blocked/ holds nothing but its README on the candidate merge cb182154db (checked with ls); the six proposals the slice names sit in ret… (2) f00270/f00277/f00278/f00279 each carry a '- Retired on 2026-10-14 (c00530 S1):' line naming its own reason (verified by grep in each file); f00639 carries a pa… — Judged the candidate merge cb182154db (PR #1128), which is an ancestor of origin/develop. This is the fix round for the two objections already recorded: gpt-5.4 asked for per-proposal traceability and minimax-m3.1-flash-preview confirmed all but f00500; the candidate adds exactly that missing piece — f00500's own document now records why it was blocked, what shipped on 2026-09-04, and what remains (S8d history rewrite, explicitly out of scope per non-goals). I verified all six documents in the tree at the candidate: four retired with their own reason lines, one paused with paused-reason, one in-progress with its paragraph. Criterion 1 verified by the empty blocked/ directory. Gate is declared none; I ran lint:proposals (exit 0, no new findings) and proposal-uniqueness (1039 proposals, every id in exactly one place) as document-level checks.

### S2 — The agent-session derivation nobody consumed goes

- **Status**: done
- **Files**:
  - `tools/scripts/inspect/core-proposals-boundary.script.ts`
  - `docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md`
  - `packages/core/tests/src/architecture/core-proposals-boundary.spec.ts`
- **Gate**: unit
- shipped-in: `f92f9dacebc7`
- acceptance:
  - `derive-agent-sessions.service.ts`, its contract and its spec are deleted, with the five exceptions the boundary lint kept for them.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 4fc13ebe3cce, validate exit 0, tests 137/137 — Reviewed the c00530 cleanup around the merged delivery 4fc13ebe3cceca89035746f0be479aa7c3e8c838. The unused derive-agent-sessions implementation, contract, and spec are removed, the remaining mentions are documentary, and the focused specs passed 137/137.

### S3 — A pause keeps the reason it is given, and a retired unit does not linger

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at f2ed45067a9e, validate exit 0, tests 137/137 — Reviewed the pause-and-reap follow-up delivered for c00530 S3. The pause reason is preserved as frontmatter, blocking only happens on explicit or existing dependencies, retired remote tips let local leftovers be reaped, and the focused specs passed 137/137.

### S4 — What a finished unit leaves behind is reaped by the pass that runs after every merge

- **Status**: done
- **Files**:
  - `tools/scripts/git/reap-finished-units.script.ts`
  - `tools/scripts/git/reap-finished-units.script.spec.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: unit
- shipped-in: `ee77fc419a9b`
- acceptance:
  - The hydration pass runs `delendai work reap --apply` after it has maintained the ref namespace, and says what it reaped.
  - A unit whose worktree holds an uncommitted edit is reported and kept while its owner may still come back; once it is abandoned, S5 applies.

Asked by the owner on 2026-10-11: refs, worktrees and branches had been left along the way. Counted then: four worktrees and local branches of review units the queue had retired on the forge hours before; a slice reservation of a unit whose pull request had merged; ten probe refs of the orchestrator's own in the shared clone (deleted by hand, they were never the product's); and twenty-three retired refs on the forge. The reaper already judged each of the first two kinds spent, with S3's rule for the retired ones. It had no caller: `work reap --apply` ran when somebody remembered. It is now a step of the one pass this machine runs after every merge. One of the four worktrees holds an edit its agent never committed; it is reported on every pass and not removed.

Left as it is, and said: the retired refs. A retired tip is kept so that nothing is lost, and only one whose work the integration branch came to hold is dropped. Seventeen of the twenty-three belong to proposals that are closed; whether a closed proposal's retired units go after some days is a rule the owner has not given.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 1fbd9d145a5e, validate exit 0, tests 137/137 — Reviewed the post-merge reaper wiring for c00530 S4. Hydration now runs the reaper after namespace maintenance and reports what it reaped, while edited units are still kept unless they have crossed into the abandoned path handled in S5. Focused specs passed 137/137.

### S5 — An abandoned unit's uncommitted edits are kept on the forge, and the unit removed

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/unit-edits-kept.service.ts`
  - `packages/core/src/lib/work-units/unit-reaper.service.ts`
  - `packages/core/src/lib/work-units/unit-removal.service.ts`
  - `packages/core/src/lib/work-units/unit-lease.interface.ts`
  - `packages/core/tests/src/lib/work-units/unit-edits-kept.service.spec.ts`
  - `tools/scripts/reclaim/reclaim-orphans.script.ts`
- **Gate**: unit
- shipped-in: `88723b0ab309`
- acceptance:
  - `work reap --apply` commits what an abandoned unit left uncommitted (tracked or not, never what git ignores) on top of its tip, pushes it under the retired refs, removes the worktree and the local branch, and reports `retired` with the ref the edits are kept at.
  - Without `--apply` the unit is reported as `would-retire` and nothing is written.
  - A unit that is not abandoned, or whose edits could not be pushed, stays where it is and is reported `kept`.

Found after S4 landed: the pass removed three of the four worktrees the swarm had left and kept the fourth for good — a review unit whose only content was a state transition of another proposal that it never committed, long since overtaken on the integration branch. "Kept and reported" has no end when the owner is gone; a retired ref has the same content and `work retired` lists it.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at f2ed45067a9e, validate exit 0, tests 137/137 — Reviewed the abandoned-unit retirement flow for c00530 S5. Uncommitted tracked and untracked edits are kept on the forge before removal, dry-run reports would-retire without writing, push failures stay kept, and the focused specs passed 137/137.

## acceptance

- `proposals status` reports `blocked: 0`.
