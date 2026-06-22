---
id: f00044
status: ready
type: proposal
track: plugins/proposals+tests+core
date: 2026-06-22
kind: feat
title: End-to-end tests for the orchestrator tool chain (auto_work, continue_proposal, proposal_transition, sync/agent_*/task_queue)
shipped-in: []
related:
    - f00020
    - f00032
    - f00036
globalGate: lint
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00044 — End-to-end tests for the orchestrator tool chain

## goal

Cover the orchestrator tool surface (the chain an autonomous agent walks on
each slice: `auto_work → continue_proposal → proposal_transition → sync_proposals
→ agent_lock / agent_worktree / task_queue`) with a real end-to-end test
layer — assembled MCP server, in-memory transport, real `Client` from the
MCP SDK, real filesystem under a `tmpdir`. The existing unit specs (one
per tool, fakes for state) stay as fast feedback; the new e2e specs prove
the cross-tool contracts the unit specs cannot see.

Today the only e2e specs in the repo live under `packages/core/tests/src/lib/e2e/`
and `packages/client/tests/e2e/` (5 files total). `plugins/proposals/` — the
plugin that defines the orchestrator tools — has **zero** end-to-end
coverage. Every multi-step flow an agent relies on (loop-stop after N
idles, claim → implement → close → sync → release, DFA transitions on
proposal lifecycle, lock acquisition across agents) is only proven by
isolated unit tests that mock the surrounding state.

## why

Three regressions that are not caught today and that the unit specs
*cannot* catch by construction:

1. **`auto_work` idle loop-stop drift.** `runAutoWork` reads
   `consecutiveIdle` from a module-level `let`. The unit spec
   resets the streak in `beforeEach`. Any change to how `auto_work`
   interacts with `runContinueProposal` (e.g. a swallowed exception
   that makes every "next-proposal" branch look like idle) is invisible.
2. **Cross-tool contract on slice close.** `auto_work` renders a plan
   that assumes `close_slice` will flip the slice `status: pending → done`,
   update `lock.json`, and be safe to call when no slice is open. If
   `proposal_transition` or `agent_lock` changes its output schema in a
   way that breaks `auto_work`'s downstream assumptions, the unit spec
   for `auto_work` keeps passing because it never calls the others.
3. **DFA enforcement on `proposal_transition`.** The transition tool
   rejects illegal transitions (`ready → done` is not legal;
   `in-progress → done` is not legal; only `ready → in-progress →
   review → done` is). The unit spec exercises the DFA, but nothing
   proves the *registered* tool (the one the MCP transport actually
   invokes) returns the documented `nextAction` over the wire.

Two additional wins:

- A single `assembled-proposals-server` harness that other proposals
  in the same plugin can extend.
- Calling the registered tools via the protocol proves the
  `outputSchema` declared in `auto-work.tool.ts`,
  `proposal-transition.tool.ts`, `sync-proposals.tool.ts`, etc. is
  what the wire actually delivers.

## non-goals

- No persistence (`git mv`, `git commit`, push) against a real repo.
  The e2e uses `mkdtempSync` and operates on a real but throwaway
  filesystem. `sync_proposals`'s `git mv` path is exercised through a
  sibling `git init` repo the harness sets up locally; pushing is
  **never** invoked.
- No real lock contention. The two-agent race scenario is simulated by
  two `Client` instances hitting the same assembled server, not by
  spawning child processes.
- No replacement of the existing unit specs. They stay.
- No refactor of `auto_work`, `continue_proposal`,
  `proposal_transition`, `sync_proposals`, `agent_lock`,
  `agent_worktree`, or `task_queue` themselves. This proposal is
  **test-only**.
- No new fixtures under `docs/proposals/` — every e2e seeds its own
  proposals under `tmpdir`.

## Slices

- global_gate: lint

### S1 — Shared harness + `auto_work` end-to-end
- **Files**: plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts
- **Files**: plugins/proposals/tests/src/lib/e2e/auto-work.e2e.spec.ts
- **Status**: pending
- **Gate**: type
- acceptance:
  - "An `assembled-proposals-server` helper exported from `plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts` mirrors the pattern at `packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts`: it spins up `parseCliArgs` + `assembleCliConfig` + `createMcpProject` + `InMemoryTransport` + a real `Client`, exposes `client`, `server`, `workspace`, `close`, and an `await client.callTool({ name: 'proposals_*', arguments })` helper that returns the parsed `structuredContent`."
  - "`auto-work.e2e.spec.ts` proves, over the real MCP protocol: idle-when-empty returns `state: 'idle'` and `stop: undefined`; three consecutive idle calls escalate with the third carrying `stop: true`, `idleStreak: 3`, and a `nextAction` starting with `STOP —`; one seeded pending proposal returns `state: 'work'` with a non-empty `steps` array containing the configured `validationCommand` literally; the idle streak is reset by the work response."
  - "Every response in the spec satisfies the outputSchema parity invariant: `structuredContent` equals parsed `content[0].text`."
  - "Each `it` runs against a fresh `mkdtempSync` workspace; no test mutates a real proposal, lock file, or git repo."

### S2 — `continue_proposal` end-to-end (plan / next / auto modes)
- **Files**: plugins/proposals/tests/src/lib/e2e/continue-proposal.e2e.spec.ts
- **Status**: pending
- **Gate**: type
- acceptance:
  - "With two seeded proposals (one in `ready/`, one already in `in-progress/`), `mode: 'auto'` returns `kind: 'next-proposal'` for the highest-priority pending proposal, with `proposalId`, `file`, and a non-empty `nextAction`."
  - "`mode: 'next'` advances past the in-progress proposal and returns the next pending one, or `kind: 'all-claimed'` when none."
  - "`mode: 'plan'` returns an ordered step list for a given `proposalId` with `claimableSliceIds` populated, structurally identical to what `auto_work` would emit but without resolving the cascade."
  - "Every response satisfies the outputSchema parity invariant."

### S3 — `proposal_transition` end-to-end (DFA enforcement over the wire)
- **Files**: plugins/proposals/tests/src/lib/e2e/proposal-transition.e2e.spec.ts
- **Status**: pending
- **Gate**: type
- acceptance:
  - "Legal path: seed a proposal in `ready/`; calling `proposals_proposal_transition { id, to: 'in-progress' }` returns `ok: true`, the seeded file moves to `docs/proposals/in-progress/`, and `agents.lock.json` reflects the new task."
  - "Second legal transition: with the proposal now `in-progress`, `to: 'review'` returns `ok: true` and moves the file to `docs/proposals/review/`."
  - "Illegal skip rejected: from `ready`, `to: 'done'` directly returns `ok: false`, surfaces `error.nextAction` naming the legal next step, and the file remains in `ready/`."
  - "Illegal reverse rejected: from `in-progress`, `to: 'ready'` returns `ok: false`, surfaces a `reverse-not-allowed` or equivalent error code, and no folder move happens."
  - "Idempotency: repeating the same legal transition returns `ok: true` with `noop: true` or the documented equivalent."
  - "Every response, including the error ones, satisfies the outputSchema parity invariant."

### S4 — `sync_proposals` + `agent_lock` + `agent_worktree` + `task_queue` end-to-end
- **Files**: plugins/proposals/tests/src/lib/e2e/sync-and-locks.e2e.spec.ts
- **Status**: pending
- **Gate**: e2e
- acceptance:
  - "`agent_lock claim` from `client-A` on two seeded files returns `ok: true`; `agents.lock.json` lists both files under `client-A`'s ownership."
  - "Conflict detection: `client-B` calling `agent_lock claim` on one of those files returns a structured error naming the file and the current owner; `await_lock` accepts a `task_id` and returns a sentinel the harness resolves when `client-A` releases."
  - "`agent_worktree create` with `agent: 'agent-A'`, `base_branch: 'HEAD'` returns a path under the workspace; `git status` inside that path shows a clean working tree."
  - "`sync_proposals` after dropping a new proposal file under `docs/proposals/ready/` updates `index.json` to include the new proposal; no git operation fails because the harness initialises a throwaway git repo with `git init` plus a single initial commit on `main`."
  - "`close_slice` plus `agent_lock release` from `client-A` removes the released files from `agents.lock.json`; the pending `await_lock` for `client-B` resolves."
  - "`task_queue` enqueues a follow-up task referencing the released files; `subscribe` (via the in-process task-queue stream) delivers it; repeated `enqueue` for the same `task_id` returns the same handle (idempotency)."
  - "Safety invariant: after the test, `git -C <worktree> remote -v` is empty — no `origin` was ever added, so `commit-and-push` could not have reached the wire."
  - "Every tool call in this slice satisfies the outputSchema parity invariant."

## acceptance

- All four e2e specs pass.
- `bun run typecheck` is green.
- `bun run test` is green for the whole monorepo, including the new
  e2e specs and the existing 1253+ specs (no regressions).
- `bun run lint` is green.
- `bun run lint:tools` is green (no `.sh`, `.py`, etc. in `tools/`).
- `bun run validate` is green.
- The `assembled-proposals-server` helper is reusable: it lives in
  `plugins/proposals/tests/src/lib/e2e/` and is exported for future
  proposals in the same plugin.
- No new dependencies are introduced.

## notes

- Slices are independent: S1 must land first because the harness is
  shared. S2 and S3 are independent of each other but both depend on
  S1. S4 depends on S1 and can land in parallel with S2 and S3.
- The harness pattern is intentionally identical to
  `packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts`; if a
  future refactor extracts a shared `test-mcp-harness` package this
  proposal is the right time to consider it (out of scope here, but
  worth flagging in the slice close notes).
- Existing unit specs (`continue-proposal.spec.ts`,
  `proposal-transition.tool.spec.ts`, `auto-work.spec.ts`) are
  intentionally not modified. They continue to test the runXxx
  functions directly with fakes; the new e2e specs prove the
  *registered* tools behave identically over the wire.
- The idle-streak counter in `auto-work.tool.ts` is module-level.
  This is fine for a real server (one process, one counter) but
  means the S1 spec cannot run two `auto_work` flows in parallel
  inside the same `describe`. The spec uses one harness per `it` to
  avoid streak bleed.
- `sync_proposals`'s git operations are limited to `git add`,
  `git mv`, and local `git commit`. The harness sets
  `user.email` and `user.name` and configures
  `commit.gpgsign=false` to keep the test hermetic.
- Gate values follow the canonical enum (`type`, `e2e`, `lint`,
  `none`); the slice-level `Gate` field is what
  `proposal-slice-plan.ts` parses, and non-enum values silently fall
  back to `none`.
