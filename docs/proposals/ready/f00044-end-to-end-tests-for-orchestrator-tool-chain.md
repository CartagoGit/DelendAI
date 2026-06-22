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
    - { command: bun run lint, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run test, expect: exit0 }
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
   ([auto-work.spec.ts](../../plugins/proposals/tests/src/lib/auto-work.spec.ts))
   resets the streak in `beforeEach`. Any change to how `auto_work`
   interacts with `runContinueProposal` (e.g. a swallowed exception that
   makes every "next-proposal" branch look like idle) is invisible.
2. **Cross-tool contract on slice close.** `auto_work` renders a plan that
   assumes `close_slice` will flip the slice `status: pending → done`,
   update `lock.json`, and be safe to call when no slice is open. If
   `proposal_transition` or `agent_lock` changes its output schema in a
   way that breaks `auto_work`'s downstream assumptions, the unit spec
   for `auto_work` keeps passing because it never calls the others.
3. **DFA enforcement on `proposal_transition`.** The transition tool
   rejects illegal transitions (`ready → done` is not legal;
   `in-progress → done` is not legal; only `ready → in-progress →
   review → done` is). The unit spec exercises the DFA, but nothing
   proves the *registered* tool (the one the MCP transport actually
   invokes) returns the documented `nextAction` over the wire. A
   regression in the `register` step that drops the structured content
   would only surface at runtime.

Two additional, smaller wins:

- **Harness as a reusable base.** A single
  `plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts`
  helper that other proposals can extend.
- **Schema parity evidence.** Calling the registered tools via the
  protocol proves the `outputSchema` declared in
  `auto-work.tool.ts:288`, `proposal-transition.tool.ts`,
  `sync-proposals.tool.ts`, etc. is what the wire actually delivers.

## non-goals

- No persistence (`git mv`, `git commit`, push) during tests — the e2e
  uses `mkdtempSync` and operates on a real but throwaway filesystem.
  `sync_proposals`'s `git mv` path is exercised through a sibling
  `git init` repo the harness sets up; pushing is **never** invoked.
- No real lock contention. The two-agent race scenario is simulated by
  two `Client` instances hitting the same assembled server, not by
  spawning child processes.
- No replacement of the existing unit specs. The unit specs are
  fast and tightly scoped; they stay. The e2e specs add coverage they
  cannot provide.
- No refactor of `auto_work`, `continue_proposal`, `proposal_transition`,
  `sync_proposals`, `agent_lock`, `agent_worktree`, or `task_queue`
  themselves. The proposal is **test-only**.
- No new fixtures under `docs/proposals/` — every e2e seeds its own
  proposals under `tmpdir`.

## slices

- global_gate: lint

### S1 — Shared harness + `auto_work` end-to-end
- **Files**: plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts, plugins/proposals/tests/src/lib/e2e/auto-work.e2e.spec.ts
- **Status**: pending
- **Gate**: `bun run test`
- **Acceptance**:
  - "An `assembled-proposals-server` helper exported from `plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts` mirrors the pattern at `packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts`: it spins up `parseCliArgs` + `assembleCliConfig` + `createMcpProject` + `InMemoryTransport` + a real `Client`, exposes `{ client, server, workspace, close }`, and an `await client.callTool({ name: 'proposals_*', arguments: {...} })` helper that returns the parsed `structuredContent`."
  - "The `auto-work.e2e.spec.ts` file proves, over the real MCP protocol: idle-when-empty (no proposals seeded → `state: 'idle'`, `stop: undefined`); idle-streak escalation (three consecutive idle calls → third carries `stop: true`, `idleStreak: 3`, `nextAction` starting with `STOP —`); actionable work resets the streak (one pending proposal → `state: 'work'`, then a subsequent idle no longer escalates); the work plan contains the configured validation command literally; every response satisfies the outputSchema parity invariant (`structuredContent` equals parsed `content[0].text`)."
  - "The harness runs each `it` against a fresh `mkdtempSync` workspace; no test mutates a real proposal, lock file, or git repo."

`assembled-proposals-server.ts` exports `createAssembledProposalsServer({
workspace, options? })` mirroring the pattern at
[`packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts:21-58`](../../packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts#L21-L58).
It must:

1. `mkdtempSync` a workspace (or accept an external one).
2. `parseCliArgs(['--plugins=proposals', `--workspace=${workspace}`], workspace)`.
3. `assembleCliConfig(args, { import: async () => ({ default: proposalsPlugin }),
   readFile: () => undefined })`.
4. `createMcpProject(config)`.
5. `InMemoryTransport.createLinkedPair()` + `Client.connect(...)`.
6. Expose `{ client, server, workspace, close }` and an `await
   client.callTool({ name: 'proposals_*', arguments: {...} })` helper
   that returns the parsed `structuredContent`.

`auto-work.e2e.spec.ts` exercises, over the real protocol:

- **Idle when no proposals exist.** Seed an empty `index.json` and a
  proposal directory; expect `state: 'idle'`, `stop: undefined`, and a
  `nextAction` string that does **not** call `auto_work` again.
- **Idle streak escalation.** Call three times in a row, expect the third
  response to carry `stop: true`, `idleStreak: 3`, and a `nextAction`
  starting with `STOP —`.
- **Actionable work resets the streak.** Seed one proposal with
  `status: pending` and an open slice; expect `state: 'work'`, a
  non-empty `steps` array, and that a subsequent idle call (after the
  proposal is closed) does not escalate again.
- **Work plan shape.** With `validationCommand: 'bun run validate'`,
  the `steps` array must contain the literal string
  `Validate: run \`bun run validate\`.`.
- **Output schema parity.** Every response must have
  `structuredContent` equal to the parsed `content[0].text` JSON (same
  invariant the unit spec enforces at
  [auto-work.spec.ts:18-26](../../plugins/proposals/tests/src/lib/auto-work.spec.ts#L18-L26)).

### S2 — `continue_proposal` end-to-end (plan / next / auto modes)
- **Files**: plugins/proposals/tests/src/lib/e2e/continue-proposal.e2e.spec.ts
- **Status**: pending
- **Gate**: `bun run test`
- **Acceptance**:
  - "With two seeded proposals (one in `ready/`, one already in `in-progress/`), calling `proposals_continue_proposal` with `mode: 'auto'` returns `kind: 'next-proposal'` pointing at the highest-priority pending proposal, with `proposalId`, `file`, and a non-empty `nextAction`."
  - "`mode: 'next'` advances past the in-progress proposal and returns the next pending one (or `kind: 'all-claimed'` when none)."
  - "`mode: 'plan'` returns an ordered step list for a given `proposalId`, structurally identical to what `auto_work` emits but without resolving the cascade."
  - "Every response satisfies the outputSchema parity invariant."

The three modes (`plan`, `next`, `auto`) are documented at the top of
[`continue-proposal.tool.ts`](../../plugins/proposals/src/lib/tools/continue-proposal.tool.ts).
The e2e covers each mode against a real server with two seeded
proposals in different folders (`ready/`, `in-progress/`):

- **`mode: 'auto'`** returns a `next-proposal` kind for the highest-priority
  pending proposal, with `proposalId`, `file`, and a `nextAction` string.
- **`mode: 'next'`** advances past a proposal already in `in-progress`
  and returns the next pending one (or `all-claimed` when none).
- **`mode: 'plan'`** returns an ordered step list for the given
  `proposalId`, identical in shape to what `auto_work` would emit but
  without resolving the cascade.
- **Output schema parity** assertion (same as S1) for every mode.

### S3 — `proposal_transition` end-to-end (DFA enforcement over the wire)
- **Files**: plugins/proposals/tests/src/lib/e2e/proposal-transition.e2e.spec.ts
- **Status**: pending
- **Gate**: `bun run test`
- **Acceptance**:
  - "Legal path: seed a proposal in `ready/`; calling `proposals_proposal_transition { id, to: 'in-progress' }` returns `ok: true`, the seeded file moves to `docs/proposals/in-progress/`, and `agents.lock.json` reflects the new task."
  - "Second legal transition: with the proposal now `in-progress`, `to: 'review'` returns `ok: true` and moves the file to `docs/proposals/review/`."
  - "Illegal skip rejected: from `ready`, `to: 'done'` directly returns `ok: false`, surfaces `error.nextAction` naming the legal next step, and the file remains in `ready/`."
  - "Illegal reverse rejected: from `in-progress`, `to: 'ready'` returns `ok: false`, surfaces a `reverse-not-allowed` or equivalent error code, and no folder move happens."
  - "Idempotency: repeating the same legal transition returns `ok: true` with `noop: true` (or the documented equivalent)."
  - "Every response, including the error ones, satisfies the outputSchema parity invariant."

The DFA rejects illegal transitions (see the `nextAction` field in the
error response, documented in the `proposal_transition.tool.ts`
header). The e2e proves the **registered** tool — not just
`runProposalTransition` — returns the correct shape:

- **Legal path.** Seed a proposal in `ready/`; call
  `proposals_proposal_transition` with `{ id, to: 'in-progress' }`;
  expect `ok: true`, expect `state.status: 'in-progress'` in the
  response, expect the file to have moved to `docs/proposals/in-progress/`
  in the seeded workspace, expect `agents.lock.json` to reflect the new
  task.
- **Second legal transition.** With the same proposal now
  `in-progress`, call `{ to: 'review' }`; expect `ok: true`, folder
  becomes `docs/proposals/review/`.
- **Illegal skip rejected.** From `ready`, call `{ to: 'done' }`
  directly; expect `ok: false`, expect `error.nextAction` to name the
  legal next step (i.e. `in-progress`), expect the file to remain in
  `ready/`.
- **Illegal reverse rejected.** From `in-progress`, call `{ to: 'ready' }`;
  expect `ok: false`, expect the response to surface a `reverse-not-allowed`
  or equivalent error code, expect no folder move.
- **Idempotency.** Repeating `{ to: 'in-progress' }` on a proposal that
  is already `in-progress` returns `ok: true` with `noop: true` (or
  the documented equivalent).
- **Output schema parity** assertion for every response, including the
  error ones.

### S4 — `sync_proposals` + `agent_lock` + `agent_worktree` + `task_queue` end-to-end
- **Files**: plugins/proposals/tests/src/lib/e2e/sync-and-locks.e2e.spec.ts
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "`agent_lock claim` from `client-A` on two seeded files returns `ok: true`; `agents.lock.json` lists both files under `client-A`'s ownership."
  - "Conflict detection: `client-B` calling `agent_lock claim` on one of those files returns a structured error naming the file and the current owner; `await_lock` accepts a `task_id` and returns a sentinel the harness can resolve when `client-A` releases."
  - "`agent_worktree create` with `agent: 'agent-A'`, `base_branch: 'HEAD'` returns a path under the workspace; `git status` inside that path shows a clean working tree."
  - "`sync_proposals` after dropping a new proposal file under `docs/proposals/ready/` updates `index.json` to include the new proposal; no git operation fails (the harness initialises a throwaway git repo with `git init` + a single initial commit on `main`)."
  - "`close_slice` + `agent_lock release` from `client-A` removes the released files from `agents.lock.json`; the pending `await_lock` for `client-B` resolves."
  - "`task_queue` enqueues a follow-up task referencing the released files; `subscribe` (via the existing in-process task-queue stream) delivers it; repeated `enqueue` for the same `task_id` returns the same handle (idempotency)."
  - "Safety invariant: the harness asserts `git -C <worktree> remote -v` is empty after the test — no `origin` was ever added, so `commit-and-push` could not have reached the wire."
  - "Every tool call in this slice satisfies the outputSchema parity invariant."

This is the slice that proves the *full* loop `auto_work` documents:

1. `agent_lock claim` — seed two files, claim both from `client-A`,
   expect `ok: true`, expect `agents.lock.json` to list both files
   under `client-A`'s ownership.
2. **Conflict detection.** `client-B` calls `agent_lock claim` on one of
   those files; expect a structured error naming the file and the
   current owner. Verify `await_lock` accepts a `task_id` and returns
   a sentinel that the harness can resolve when `client-A` releases.
3. **`agent_worktree create`** — call with `agent: 'agent-A'`,
   `base_branch: 'HEAD'`; expect a path under the workspace, expect
   `git status` inside that path to show a clean working tree.
4. **`sync_proposals`** — drop a new proposal file under
   `docs/proposals/ready/` in the workspace, call `sync_proposals`;
   expect `index.json` to contain the new proposal, expect no git
   operations to fail (the harness initialises a throwaway git repo
   with `git init` + a single initial commit on `main`).
5. **`close_slice` + `agent_lock release`** — `client-A` calls both
   atomically; expect `agents.lock.json` to no longer list the
   released files, expect `await_lock` for `client-B` to resolve.
6. **`task_queue`** — `enqueue` a follow-up task referencing the
   released files; expect `subscribe` (via the existing in-process
   task-queue stream) to deliver it. Idempotency on repeated `enqueue`
   for the same `task_id` returns the same handle.
7. **No `git push` ever invoked.** The harness asserts that
   `git -C <worktree> remote -v` is empty after the test (no `origin`
   added); this is a safety invariant the orchestrator relies on.
8. **Output schema parity** assertion for every tool call in this
   slice.

## acceptance

- All four e2e specs pass.
- `bun run typecheck` green.
- `bun run lint` green.
- `bun run lint:tools` green (no `.sh`, `.py`, etc. in `tools/`).
- `bun run test` green for the whole monorepo (no regressions in
  existing 1253+ specs).
- `bun run validate` green.
- The `assembled-proposals-server` helper is reusable: it lives in
  `plugins/proposals/tests/src/lib/e2e/` and is exported for future
  proposals in the same plugin.
- No new shell/python files under `tools/scripts/` (the
  `bun run lint:tools` gate).
- No new dependencies.

## notes

- The four slices are deliberately independent. S1 must land first
  because the harness is shared. S2 and S3 are independent of each
  other but both depend on S1. S4 depends on S1 and can land in
  parallel with S2/S3.
- The harness pattern is intentionally identical to
  `packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts`; if a
  future refactor extracts a shared `test-mcp-harness` package this
  proposal is the right time to consider it (out of scope here, but
  worth flagging in the slice close notes).
- `continue-proposal.spec.ts` and `proposal-transition.tool.spec.ts`
  (the existing unit specs) are intentionally not modified. They
  continue to test `runContinueProposal` / `runProposalTransition`
  directly with fakes; the e2e proves the *registered* tool behaves
  identically.
- The idle-streak counter in `auto-work.tool.ts:64` is module-level.
  This is fine for a real server (one process, one counter) but
  means the S1 spec cannot run two `auto_work` flows in parallel
  inside the same `describe`. The spec uses one harness per `it` to
  avoid streak bleed.
- `sync_proposals`'s git operations are limited to `git add`,
  `git mv`, and local `git commit`. The harness sets
  `user.email`/`user.name` and configures `commit.gpgsign=false` to
  keep the test hermetic.