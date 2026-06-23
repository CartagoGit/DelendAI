---
id: q00001
status: ready
type: plan
track: proposals-plugin
date: 2026-06-23
kind: plan
title: Plan-of-plans — add the `plan` proposal kind (q prefix) that orchestrates other proposals
runner: copilot
model: minimax-m3
scope: proposals-plugin
shipped-in: []
related:
    - f00016 # proposal state machine v2 — the glossary this proposal extends
    - f00020 # proposals_edit + proposals_add_slice — mutate tools used by closure flow
    - f00024 # cascade priority — adds the new plan kind to the cascade resolver
    - f00033 # auto_work ↔ loop detector — the orchestrator that runs the slices
contains:
    proposals:
        - id: qs1
          kind: feat
          required: true
        - id: qs2
          kind: feat
          required: true
        - id: qs3
          kind: feat
          required: true
        - id: qs4
          kind: feat
          required: true
        - id: qs5
          kind: feat
          required: true
        - id: qs6
          kind: feat
          required: true
        - id: qs7
          kind: feat
          required: true
        - id: qs8
          kind: feat
          required: true
closureGate:
    requirePeerReview: true
    requireAllSlicesDone: true
    requireAllChildrenDone: true
globalGate: type
ownership:
    - { agent: implementation_runner, task: 'qs1: add `plan` kind (q) to PROPOSAL_KINDS' }
    - { agent: implementation_runner, task: 'qs2: parse `contains:` and `closureGate:` in frontmatter' }
    - { agent: implementation_runner, task: 'qs3: build plan-closure.ts (recursive evaluator + tests)' }
    - { agent: implementation_runner, task: 'qs4: guard proposal_transition → done for plan kind' }
    - { agent: implementation_runner, task: 'qs5: add proposals_close_plan tool' }
    - { agent: implementation_runner, task: 'qs6: exclude plans with pending children from auto_work' }
    - { agent: implementation_runner, task: 'qs7: add i18n keys for plan (12 languages)' }
    - { agent: implementation_runner, task: 'qs8: update skills + plugin README' }
    - { agent: implementation_runner, task: 'close q00001 via proposals_close_plan once all 8 slices are done' }
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun tools/scripts/verify/plugin-tool-verify.script.ts, expect: contains:'Total: 155 ok' }
    - { command: bun run --cwd apps/web check:i18n, expect: exit0 }
---

# q00001 — Plan-of-plans: the `plan` proposal kind

## goal

Add a **new proposal kind `plan`** (prefix `q`, glyph 🗂️) that acts as an **orchestrator
container**: a single proposal that aggregates references to other proposals (and
optionally other plans, recursively) and/or has its own executable slices. A plan cannot
transition to `done` until **every** contained proposal, sub-plan, and slice is in
`status: done` **AND** has been peer-reviewed.

## why

Today the swarm has no concept of "this is a coordinated workstream that needs to ship
together". A reviewer can see that `f00050` is ready and `f00049` is in-progress, but
there's no first-class entity that says "these 3 proposals are a single plan, don't ship
this branch until all 3 are done". Adding a `plan` kind:

1. Makes coordinated workstreams **discoverable** in `proposal_board` (with progress
   bars / `done/total`).
2. Makes coordinated workstreams **closable atomically** (peer-review enforced, all
   children must be done, no `done` button if anything is open).
3. Makes sub-plans **composable** (a plan can contain other plans, recursively, with
   cycle detection).
4. Keeps the existing kind union **closed** (12 kinds → 13 kinds; the new one is
   semantically orthogonal: it orchestrates, not produces work).

## acceptance

- [ ] `bun run validate` is green (typecheck + lint + 212+ test files pass).
- [ ] `bun tools/scripts/verify/plugin-tool-verify.script.ts` reports
      `Total: 155 ok, 42 need-input, 0 failed across 197 tools` (one more tool:
      `proposals_close_plan`).
- [ ] `apps/web/scripts/check-i18n.ts` passes (12 languages × all keys).
- [ ] Unit test: `evaluatePlanClosure` returns `closable: false` when any child proposal
      is `status: in-progress`.
- [ ] Unit test: `evaluatePlanClosure` returns `closable: false` when any child slice
      has `status: pending`.
- [ ] Unit test: `evaluatePlanClosure` returns `closable: true` when all children done
      AND peer-reviewed.
- [ ] Unit test: `evaluatePlanClosure` detects a self-reference cycle and returns an
      error (does not infinite-loop).
- [ ] Unit test: `evaluatePlanClosure` recurses into sub-plans.
- [ ] Integration test: `proposals_close_plan { planId: "q00001" }` rejects with
      blockers list (because q00001 is still in-progress by the time the test runs).
- [ ] Integration test: closing q00001 after marking every slice done succeeds.
- [ ] Skills + plugin README updated.

## Slices

### qs1 — add `plan` kind to the glossary

- **Files**:
  - `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`
- **Gate**: type
- **What**: extend the `IProposalKind` union with `'plan'`; add a `PROPOSAL_KINDS.plan`
  entry (`prefix: 'q'`, `glyph: '🗂️'`, `conventionalCommitType: ''`, `bump: 'none'`).
  The reverse `PROPOSAL_KIND_BY_PREFIX` map picks up the new prefix automatically
  (it's derived from `PROPOSAL_KINDS`).
- **Acceptance**: typecheck passes; a new file `q00001-*.md` parses via
  `parseProposalDocument` without "unknown kind" errors.

### qs2 — parse `contains:` and `closureGate:` blocks

- **Files**:
  - `plugins/proposals/src/lib/proposals/frontmatter-parser.ts`
  - `plugins/proposals/src/lib/proposals/proposal-document.ts`
- **Gate**: type
- **What**: extend the YAML parser to handle nested arrays of objects (`contains.proposals[]`,
  `contains.plans[]`, `contains.slices[]`) and the `closureGate:` block. The base
  `IProposalFrontmatter` interface grows two new optional fields:
  - `contains?: { proposals?, plans?, slices? }`
  - `closureGate?: { requirePeerReview?, requireAllSlicesDone?, requireAllChildrenDone? }`
- **Acceptance**: a `q00001-test.md` with the new frontmatter parses cleanly into
  `IProposalDocument` with the new fields populated; existing f00050 / a00033 / etc.
  proposals still parse unchanged (regression-free).

### qs3 — `plan-closure.ts` (recursive evaluator + tests)

- **Files** (new):
  - `plugins/proposals/src/lib/swarm/plan-closure.ts`
  - `plugins/proposals/src/lib/swarm/plan-closure.spec.ts`
- **Gate**: e2e (vitest)
- **What**: implement `evaluatePlanClosure(planPath, indexPath, options)`:
  - Reads the plan's frontmatter, builds the children list from `contains.proposals`,
    `contains.plans`, `contains.slices`.
  - For each child proposal, reads its `status` from the index (`proposals/*.json`).
  - For each child slice, parses the parent's `## Slices` block and checks
    `- status: done`.
  - Walks sub-plans recursively with a `visited: Set<string>` cycle guard.
  - Returns `IPlanClosureReport { planId, closable, blockingReasons, children[] }`.
  - `peerReviewed` is read from a new optional `peerReviewed: boolean` field in the
    index entry (populated by qs4; defaulted to `true` for legacy proposals to avoid
    a migration cliff).
- **Tests** (vitest, in-memory, no disk):
  - 4 happy-path + blocker cases
  - 1 self-reference cycle
  - 1 recursive sub-plan
  - 1 mixed case (proposal + sub-plan + own slice all open)
- **Acceptance**: `bun run test plugins/proposals/src/lib/swarm/plan-closure.spec.ts`
  is green.

### qs4 — guard `proposal_transition → done` for `type === 'plan'`

- **Files**:
  - `plugins/proposals/src/lib/proposals/proposal-policy-guards.ts`
  - `plugins/proposals/src/lib/swarm/swarm-types.ts` (new `peerReviewed: boolean` on
    the index entry shape)
- **Gate**: type
- **What**: extend `proposal-policy-guards.ts` with a new guard
  `assertPlanClosable(planPath, indexPath)`. Hook it into the existing
  `proposal_transition` tool's `done` transition so any proposal with
  `type === 'plan'` must pass `evaluatePlanClosure(closable === true)` before the
  transition is applied. The guard reuses the `ProposalPolicyError` machinery already
  in the file.
- **Acceptance**: a unit test on `assertPlanClosable` blocks the transition for an
  in-progress child and allows it for a fully-done child. typecheck + existing tests
  stay green.

### qs5 — `proposals_close_plan` tool

- **Files** (new + edits):
  - `plugins/proposals/src/lib/tools/close-plan.tool.ts` (new)
  - `plugins/proposals/src/lib/tools/index.ts` (register the tool)
  - `plugins/proposals/src/index.ts` (wire it into the plugin's `register()`)
- **Gate**: e2e
- **What**: a new MCP tool `proposals_close_plan { planId: string, reason?: string }`
  that:
  1. Reads the plan markdown.
  2. Calls `evaluatePlanClosure`.
  3. If not closable → returns `toolError` with `blockingReasons[]`.
  4. If closable → calls the existing `proposal_transition` to `done` (which is
     now guarded by qs4 — so this tool is just the user-facing wrapper that adds
     the preflight check + better error message).
- **Acceptance**: live test via the verify harness; the verify script reports
  `Total: 155 ok, 42 need-input, 0 failed across 197 tools` (one more tool than
  before, all green).

### qs6 — exclude plans with pending children from `auto_work`

- **Files**:
  - `plugins/proposals/src/lib/cascade/cascade-chain.ts`
  - `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`
  - `plugins/proposals/src/lib/tools/auto-work.tool.ts`
- **Gate**: type
- **What**:
  - Cascade: a `plan` proposal is `cascadePriority: 13` (after `p` legacy alias) and
    is **not** returned as the next actionable item if any child is non-`done`.
  - `continue_proposal` adds a `blockedBy?: string[]` field to its `auto` mode
    response, populated by a quick scan of `contains.*`.
  - `proposal_board` adds a new `plans` view: for each plan, show
    `{ planId, done/total, blockedBy[] }`.
  - `auto_work`'s idle detection stays unchanged (3-streak brake is independent of
    the new plan kind).
- **Acceptance**: unit tests on `continue_proposal` mode `auto` confirm a `plan`
  with an `in-progress` child returns `{ actionable: false, blockedBy: ['f00049'] }`.
  Existing tests stay green.

### qs7 — i18n keys for the plan kind (12 languages)

- **Files**:
  - `apps/web/src/i18n/ui.ts`
- **Gate**: lint (the `check:i18n` script in apps/web)
- **What**: add 3 new keys per language (12 languages × 3 keys = 36 entries):
  - `proposal.kind.plan` — the human label
  - `proposal.kind.plan.glyph` — `🗂️`
  - `proposal.status.closureBlocked` — the error message shown when
    `proposals_close_plan` rejects
- **Acceptance**: `bun run --cwd apps/web check:i18n` is green.

### qs8 — skills + plugin README

- **Files**:
  - `plugins/proposals/README.md`
  - `skills/proposals-workflow-playbook/SKILL.md`
  - `AGENTS.md` (add a short paragraph about the new kind in the
    "Conventions → Swarm proposals workflow" section)
- **Gate**: lint
- **What**: document the kind, its prefix, its closure rule, and link to the
  proposal (q00001) for the canonical example. The skill playbook adds a
  "Working with plans" section with a minimal `q00001-*.md` template.
- **Acceptance**: docs are present; no broken markdown links
  (`bun run site:strict` would catch those if it ran).

## global_gate

`type` — every slice's gate is `type`; qs3, qs4, qs5 also have a vitest e2e suite.
The plan's `globalGate: type` means "every slice must typecheck + tests must pass
before `proposals_close_plan` is callable".

## closure rule (re-stated for reviewers)

A plan closes (`status: done`) iff:

- `requireAllChildrenDone === true` (default) AND every referenced proposal is
  `status: done` AND every sub-plan is `status: done` AND every own slice has
  `- status: done`.
- `requirePeerReview === true` (default) AND every child proposal's index entry
  has `peerReviewed: true`.
- `requireAllSlicesDone === true` (default) AND the plan's own `## Slices` section
  has no `- status: pending` or `- status: in-progress` lines.

If any of those fail, `evaluatePlanClosure` returns a non-empty `blockingReasons[]`
and `proposals_close_plan` rejects with that list. The guard at qs4 makes
`proposal_transition → done` fail with the same message if the tool is bypassed.

## risks

- **Cascade priority 13** breaks the numeric sequence (1..12) used by
  `buildKindOrder`. Mitigated: the resolver is order-based, not rank-based;
  appending to the array is safe and the rank map auto-extends.
- **Index entry shape change** (`peerReviewed: boolean` in qs4) — existing
  index.json files do not have the field. Mitigated: `evaluatePlanClosure`
  defaults missing fields to `true` for legacy proposals (no migration cliff).
- **Sub-plan recursion** could infinite-loop on a self-reference. Mitigated:
  `evaluatePlanClosure` carries a `visited: Set<string>` and returns a
  `cycle-detected` blocker if the same `planId` is reached twice.
- **i18n gate** is a hard failure (rule 9 of AGENTS.md). Mitigated: 12 languages
  × 3 keys = 36 entries added in qs7, all reviewed for the same 3 meanings
  (kind label, glyph, error message).
