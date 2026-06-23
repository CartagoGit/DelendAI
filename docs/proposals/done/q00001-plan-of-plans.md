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

## non-goals

- A plan is NOT a replacement for a single proposal with its own `## Slices`. If your
  work is one proposal, use that.
- A plan does NOT produce its own conventional commit (it is an orchestrator, not a
  producer of work). The work that ships comes from the children.
- A plan does NOT introduce a new status. The 7-status union from f00016 is the
  canonical state machine; plans use `ready → in-progress → review → done` like every
  other kind.
- A plan does NOT replace the proposal-review peer-review log. The `peerReviewed` flag
  defaults to `true` for legacy entries to avoid a migration cliff — a tighter
  integration is left for a follow-up.

## architecture

The new `plan` kind plugs into four existing extension points without changing the
core cascade or the state machine:

1. **`PROPOSAL_KINDS`** (`proposal-glossary.constant.ts`) gains a `plan` entry with
   prefix `q`, glyph 🗂️, no conventional commit, no semver bump.
2. **`IProposalFrontmatter`** gains optional `contains` and `closureGate` blocks.
3. **`plan-closure.ts`** is a new pure evaluator (`evaluatePlanClosure`) with a
   disk-backed resolver and an in-memory test resolver.
4. **`proposal-transition.tool.ts`** consults `evaluatePlanClosure` whenever the
   target status is `done` and the proposal's frontmatter declares `type: plan`.

## Slices

### S1 — Add `plan` kind to the glossary

- **Files**:
  - `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`
- **Gate**: type
- **What**: extend the `IProposalKind` union with `'plan'`; add a `PROPOSAL_KINDS.plan`
  entry (`prefix: 'q'`, `glyph: '🗂️'`, `conventionalCommitType: ''`, `bump: 'none'`).
- **Acceptance**: typecheck passes; a new file `q00001-*.md` parses via
  `parseProposalDocument` without "unknown kind" errors.

### S2 — Parse `contains:` and `closureGate:` blocks

- **Files**:
  - `plugins/proposals/src/lib/proposals/proposal-document.ts`
  - `plugins/proposals/src/lib/proposals/index.ts`
- **Gate**: type
- **What**: extend the `IProposalFrontmatter` interface with two new optional fields:
  - `contains?: { proposals?, plans?, slices? }`
  - `closureGate?: { requirePeerReview?, requireAllSlicesDone?, requireAllChildrenDone? }`
- **Acceptance**: a `q00001-test.md` with the new frontmatter parses cleanly;
  existing proposals parse unchanged.

### S3 — `plan-closure.ts` (recursive evaluator + tests)

- **Files** (new):
  - `plugins/proposals/src/lib/swarm/plan-closure.ts`
  - `plugins/proposals/tests/src/lib/swarm/plan-closure.spec.ts`
- **Gate**: e2e (vitest)
- **What**: implement `evaluatePlanClosure` with a disk-backed resolver (reads the
  proposal index) and an in-memory resolver (used by tests). Cycle detection via
  `visited: Set<string>`. Returns a structured `IPlanClosureReport`.
- **Tests**: 12 vitest cases (child status, peer review, own slices, sub-plan
  recursion, cycle detection, mixed scenarios, `closureGate` overrides).
- **Acceptance**: `bun run test plugins/proposals/tests/src/lib/swarm/plan-closure.spec.ts`
  is green.

### S4 — Guard `proposal_transition → done` for `type === 'plan'`

- **Files**:
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/proposals/proposal-policy-guards.ts`
- **Gate**: type
- **What**: extend the transition tool so any proposal with `type: plan` must pass
  `evaluatePlanClosure(closable === true)` before the transition to `done` is
  applied. The guard reuses the `ProposalPolicyError` machinery already in
  `proposal-policy-guards.ts`.
- **Acceptance**: a unit test on the guard blocks the transition for an in-progress
  child and allows it for a fully-done child.

### S5 — `proposals_close_plan` tool

- **Files** (new + edits):
  - `plugins/proposals/src/lib/tools/close-plan.tool.ts` (new)
  - `plugins/proposals/src/lib/tools/index.ts` (register the tool)
  - `plugins/proposals/src/index.ts` (wire it into the plugin's `register()`)
- **Gate**: e2e
- **What**: a new MCP tool `proposals_close_plan { planId, reason?, dryRun? }` that
  runs the closure preflight and (when closable) delegates the actual transition to
  `proposal_transition`. With `dryRun: true` it only reports the preflight.
- **Acceptance**: live test via the verify harness; the verify script reports one
  more tool than before, all green.

### S6 — Exclude plans with pending children from `auto_work`

- **Files**:
  - `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`
- **Gate**: type
- **What**: when the next proposal returned by `mode: auto` is a `type: plan`, the
  response gains a `blockedBy: string[]` field listing the IDs of contained
  proposals + sub-plans that are not `status: done`. The orchestrator uses this to
  explain why the plan is not closable yet.
- **Acceptance**: a `q00001-test.md` with one in-progress child returns
  `{ actionable: false, blockedBy: ['f00049'] }` in the board.

### S7 — i18n keys for the plan kind (12 languages)

- **Files**:
  - `apps/web/src/i18n/shared.ts`
  - `apps/web/src/i18n/proposals.ts`
- **Gate**: lint (the `check:i18n` script in apps/web)
- **What**: add a `plan` entry to `IProposalGlossaryTranslations.kinds` and to the
  `en` and `es` translations (the 10 other languages currently alias `en`, so they
  inherit the new key automatically). The shared interface change forces every
  consumer to declare the new key.
- **Acceptance**: `bun run --cwd apps/web check:i18n` is green.

### S8 — Skills + plugin README

- **Files**:
  - `plugins/proposals/README.md`
  - `skills/proposals-workflow-playbook/SKILL.md`
- **Gate**: lint
- **What**: document the kind, its prefix, its closure rule, and link to this
  proposal (q00001) for the canonical example. The skill playbook adds a
  "Working with plans" section with a minimal `q00001-*.md` template.
- **Acceptance**: docs are present; no broken markdown links.

## acceptance

- [ ] `bun run validate` is green.
- [ ] `bun tools/scripts/verify/plugin-tool-verify.script.ts` reports
      `Total: 155 ok, 42 need-input, 0 failed across 197 tools` (one more tool:
      `proposals_close_plan`).
- [ ] `apps/web/scripts/check:i18n` passes (12 languages × all keys).
- [ ] Unit test: `evaluatePlanClosure` returns `closable: false` when any child
      proposal is `status: in-progress`.
- [ ] Unit test: `evaluatePlanClosure` returns `closable: true` when all children
      done AND peer-reviewed.
- [ ] Unit test: `evaluatePlanClosure` detects a self-reference cycle.
- [ ] Unit test: `evaluatePlanClosure` recurses into sub-plans.
- [ ] Integration test: `proposals_close_plan { planId: "q00001" }` rejects with
      a blockers list before all children are done.
- [ ] Skills + plugin README updated.

## risks and mitigations

- **Cascade priority**: a new kind entry extends the cascade order. The resolver
  is order-based, not rank-based; appending is safe.
- **Index entry shape change** (`peerReviewed: boolean` in the resolver): the
  resolver defaults missing fields to `true` for legacy proposals (no migration
  cliff).
- **Sub-plan recursion** could infinite-loop on a self-reference. The
  `evaluatePlanClosure` carries a `visited: Set<string>` and returns a
  `cycle-detected` blocker if the same `planId` is reached twice.
- **i18n gate** is a hard failure (rule 9 of AGENTS.md). 12 languages × 1 new key
  = 12 entries added in S7, all reviewed for the same meaning.

## notes

The `plan` kind is the 13th entry in the proposal glossary and the first one that
is purely **orchestrative** (no work of its own). The cascade priority is appended
at rank 12 (after `p` legacy alias); a host that wants a different rank can use the
`cascadeOverride` frontmatter escape hatch on any plan.

For the canonical example of a plan markdown, see this file. For the closure
evaluator and the in-memory test resolver, see
`plugins/proposals/src/lib/swarm/plan-closure.ts`. For the user-facing tool, see
`plugins/proposals/src/lib/tools/close-plan.tool.ts`.
