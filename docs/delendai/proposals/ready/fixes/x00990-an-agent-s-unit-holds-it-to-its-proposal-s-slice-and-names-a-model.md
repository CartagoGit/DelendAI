---
id: x00990
title: "An agent's unit holds it to its proposal's slice, and names a model"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-28
---

# x00990 — An agent's unit holds it to its proposal's slice, and names a model

## goal

Whoever enters a unit — Claude, Codex, or a Copilot BYOK model — can only implement a slice that is still open, commits under a subject that says what changed, signs with an identity that names a model, and is told when another live unit is changing the same files.

## why

On 2026-10-28 the owner ran three Copilot BYOK agents on a MiniMax account beside this session. Their refs on the forge show:

- `minimax-m3.1-flash-preview` entered `implement/x00722-S1-g1` although x00722 is in `done/`, and committed there a change unrelated to x00722's slice: `packages/core/src/lib/development-policy/project-branches.ts` now reads the config with `parseJsonc`. Nothing refused a unit on a closed proposal, or a commit outside the slice's `Files`.
- That commit's subject is `feat(x00722): commit via slice S1`, written by the commit-policy engine (`composeMessage` in `plugins/commit-policy/src/lib/engine.ts`), which says nothing of the change.
- A second agent signed as `delendai-m3-docs-20261028`, the product's name, a task word and a date, and entered `create/f00794-all-g1`. The identity is only normalised (`normalizeWorkAgentId`), never checked against the models the catalogue knows, so it became a work ref.
- Three live units changed one concern at once: x00989 (the editor's MCP config read as JSONC), f00794 (seven readers of `delendai.config.json` still on `JSON.parse`, `project-branches.ts` among them) and the x00722 commit above, on that very file. No unit was told of the others.

- The f00794 work (24 paths, among them `tools/scripts/lint/config-jsonc-only.script.ts`, its spec and a `package.json` hunk wiring it into `lint`) was written uncommitted in the shared checkout. The product kept it twice as stranded work, at 09:20 and 09:23, under `refs/delendai/stranded/minimax-m3.1-flash-preview/…`, the name of another agent, not of the one that wrote it.
- That same `package.json` hunk is committed in two units of `minimax-m3.1-flash-preview`, `implement/x00950-S3-g1` and `implement/x00956-S2-g1`, as their only change: proposals unrelated to it, both in `review/`.
- `minimax-m3.1-flash-preview` approved x00950 S1 as a reviewer (review batch g40) and opened implement units on x00950 S1 and S3 while x00950 is in review.
- Claiming a unit (`work claim`) renamed its ref but left its worktree bound to the old session and its holder registered: `work enter` on the claimed unit was still refused as held by the previous agent.

## non-goals

- Judging the content of x00989 or f00794; they go through review as usual.
- The prose language of proposals (bilingual by design).

## slices

- global_gate: type

### S1 — A unit is entered only for an open slice, and stays inside it
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/closed-proposal.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/outside-slice.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/tests/src/lib/work-units/closed-proposal.service.spec.ts`, `packages/core/tests/src/lib/work-units/outside-slice.service.spec.ts`
- **Gate**: type
- acceptance:
  - "work enter --kind=implement on a proposal in done/ (or a slice whose status is done) is refused, naming the proposal's state and the command for a new fix proposal."
  - "A commit in an implement unit that touches a file outside the slice's Files is reported on the unit (work status), naming the file."

### S2 — A slice commit says what changed
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/engine.spec.ts`
- **Gate**: type
- acceptance:
  - "The slice event's subject is built from the slice's title (or the paths it staged), never the fixed text `commit via slice`."

### S3 — An identity that names no model is marked unverified
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/agent-name-canon.service.ts`, `packages/core/src/lib/work-units/unverified-agents.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/tests/src/lib/work-units/agent-name-canon.service.spec.ts`, `packages/core/tests/src/lib/work-units/unverified-agents.service.spec.ts`
- **Gate**: type
- acceptance:
  - "An agent id that matches no model of the model catalogue, or carries a date or the product's name, is recorded with an unverified confidence and work status says so; the project's identity policy decides whether it may enter."

### S4 — Units changing the same files hear of each other
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter-briefing.service.ts`, `packages/core/src/lib/work-units/work-briefing.service.ts`, `packages/core/src/lib/contracts/interfaces/work-briefing.interface.ts`, `packages/core/tests/src/lib/work-units/work-briefing.service.spec.ts`, `tools/scripts/hooks/commit-time-checks.script.ts`, `tools/scripts/hooks/commit-time-checks.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Entering or committing in a unit whose changed files overlap another live unit's lists that unit, its agent and the shared files."

### S5 — Stranded work is kept under the agent that wrote it
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/tests/src/lib/work-units/stranded-edits.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Work left uncommitted in the shared checkout is kept under the identity of the session that wrote it (or `unknown` with the evidence), never the identity of whichever session found it."

### S6 — A unit commits only what was written in it
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/commit-call-writes.ts`
- **Gate**: type
- acceptance:
  - "A call's automatic commit takes only paths written inside the unit's worktree by that call; a hunk present only in the shared checkout never enters a unit."

### S7 — A reviewer does not implement what it reviews
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`
- **Gate**: type
- acceptance:
  - "work enter --kind=implement on a proposal in review/ is refused to an agent that holds or held a review round on it, naming the round."

### S8 — Claiming a unit hands over its worktree and its hold
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-claim.service.ts`, `packages/core/src/lib/work-units/slice-reservation.service.ts`, `packages/core/tests/src/lib/work-units/slice-reservation.service.spec.ts`
- **Gate**: type
- acceptance:
  - "After `work claim`, `work enter` with the claimed generation enters the same worktree for the claimant, and the previous agent no longer holds the slice."

## acceptance

- work enter --kind=implement on a proposal in done/ (or a slice whose status is done) is refused, naming the proposal's state and the command for a new fix proposal.
- A commit in an implement unit that touches a file outside the slice's Files is reported on the unit (work status), naming the file.
- The slice event's subject is built from the slice's title (or the paths it staged), never the fixed text `commit via slice`.
- An agent id that matches no model of the model catalogue, or carries a date or the product's name, is recorded with an unverified confidence and work status says so; the project's identity policy decides whether it may enter.
- Entering or committing in a unit whose changed files overlap another live unit's lists that unit, its agent and the shared files.
- Work left uncommitted in the shared checkout is kept under the identity of the session that wrote it (or `unknown` with the evidence), never the identity of whichever session found it.
- A call's automatic commit takes only paths written inside the unit's worktree by that call; a hunk present only in the shared checkout never enters a unit.
- work enter --kind=implement on a proposal in review/ is refused to an agent that holds or held a review round on it, naming the round.
- After `work claim`, `work enter` with the claimed generation enters the same worktree for the claimant, and the previous agent no longer holds the slice.

## notes

- 2026-11-02. S1: `work enter --kind=implement` on a proposal in done/ or a done slice is refused, naming the state and the commands for a new fix proposal (tried on x00722: refused, exit 4). `work status` lists, under `outsideSlice`, each implement unit with the authored files it changed that no slice of its proposal names, reading the proposal as the unit holds it, since one unit carries a whole proposal and names the files it needs as it goes; the proposals folder is never outside. S2: the slice commit's subject names the files it changed (`feat(x1): S1 changes a.ts, b.ts +2 more`); the slice event carries no title. S7 was already in place: since b0dbbb782 (2026-10-03) `work enter` refuses an implement unit to an agent named as a reviewer of that slice.
- S4, 2026-11-02. Entering a unit adds `shared` to its briefing: each other live or published unit that changes a file this one changes, its agent and the files. A commit on a work ref prints, from the commit hook, each other unit that also changes a staged file; it tells and never refuses, and reading the swarm costs about 0.4 s.
- S8, 2026-11-02. The worktree already followed a claim (`renameUnitRef` moves a worktree standing on the old name) and the lease already moved to the claimant. What held the slice was its reservation on the forge, which names the unit by its old name and stayed taken through its grace window. The claim now gives those reservations back (`releaseClaimedSlices`, reported as `releasedReservations`), so the claimant's entry reserves the slice for itself.
- S3, 2026-11-02. A date alone is no sign: real model ids carry one (`claude-3-5-sonnet-20241022`), so it is not refused. The product's name with a version is: `delendai-` is followed by words only when this product signs its own work, so `delendai-m3-docs-20261028` is refused at entry as the product's name posing as a model's maker. Every other name at work that no model seen on this machine and no roster entry confirms is listed by `work status` under `unverifiedAgents`; whether it may enter stays with the identity policy (`development.identity`).
- S5, 2026-11-02. Git cannot tell who wrote an uncommitted file, and the session that keeps it is only the one that found it (keeping never used it). The edits were named after any agent whose unit covered one of the paths: minimax's unit held one `package.json` hunk of 24 paths another agent wrote. An agent is now named only when its units cover every path; otherwise they are kept as `unattributed`, and the commit lists each unit that changes some of them, as evidence.
- S6, analysed 2026-11-02 and left pending: the per-call commit (`commit-call-writes.ts`) cannot take a hunk from the shared checkout, since it commits only paths whose state changed in the unit's own worktree during the call. The incident's commits were commit-policy slice commits (`feat(x00722): commit via slice S1`), which checkpoint the slice's declared Files from the shared checkout into the work ref: a `package.json` hunk another agent left there entered every unit whose slice named `package.json`. The fix belongs in commit-policy's slice persistence, which must take only what its own unit wrote; this slice's Files should move there before it is implemented.
