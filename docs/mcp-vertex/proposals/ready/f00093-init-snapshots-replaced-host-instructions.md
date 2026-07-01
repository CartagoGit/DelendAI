---
id: f00093
status: ready
type: proposal
kind: feat
track: cli+bootstrap+proposals+host-discovery
date: 2026-07-01
title: init snapshots pre-overwrite host-instructions into a review proposal
shipped-in: []
recan: []
related:
    - f00084 # `init` command whose S4 host-instructions centralizer is the surface this slice extends
    - f00103 # `init:default` non-interactive variant — this slice keeps its default behaviour and only changes what gets preserved
    - f00089 # adoption-plan umbrella — defines the `renderAdoptionPlan` shape that this slice mirrors
    - f00092 # host-hints single fragment — the canonical mcp-vertex block this slice writes; the LLM will compare what's lost against this block in context
ownership:
    - { agent: proposal_guardian,    task: 'S1: classify the three overwrite modes (`overwrite` / `append` / `skip`); pick the modes that qualify for a snapshot (only `overwrite` against a non-canonical block) and document why' }
    - { agent: implementation_runner, task: 'S2: add `renderSnapshotHostInstructionsProposal(answers, options)` in a new `packages/cli/src/lib/init/init-host-snapshot.service.ts`; it reads the three host files, builds an inventory of what the overwrite would replace (with the canonical mcp-vertex block + host-specific footnote marked as the "incoming" baseline), and renders a proposal stub similar to `renderAdoptionPlan`'s shape' }
    - { agent: implementation_runner, task: 'S3: wire the new step into `renderInitBundle` next to `renderMigrationProposalIfRequested`; gate it on `hostInstructions === "overwrite"` AND ANY host file reading non-canonical content; the proposal is always `ready`, never opened/in-progress, so it sits in the queue for the next `auto_work` pass' }
    - { agent: implementation_runner, task: 'S4: bake the new step into `init:default` — it already passes `hostInstructions: "overwrite"` and `migrateFromLegacy: true`; verify the snapshot path is non-blocking (does not fail the bootstrap if the proposal write fails — log + continue, like the migration offer)' }
    - { agent: delivery_verifier,    task: 'S5: e2e spec: in a tmpdir with three non-empty host files, run `renderInitBundle({hostInstructions: "overwrite"})` and assert (a) the host files were overwritten, (b) the proposal exists with the three pre-overwrite payloads inside `<pre>` blocks, (c) the proposal is allocated the next free id (not a hardcoded `f00001` per f00088/f00089), (d) `bun run validate` is green' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
    - { command: bun run cli -- init --help, expect: exit0 }
    - { command: bun run cli -- init:default --help, expect: exit0 }
---

# f00093 — `init` snapshots pre-overwrite host-instructions into a review proposal

## goal

Today, when `init` runs with `hostInstructions: 'overwrite'` (which is
also the default for `init:default`, f00103), the three host files at

- `AGENTS.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`

are silently overwritten with the canonical mcp-vertex block (f00092:
the single `agent-instructions.generated.md` fragment reference +
the host-specific footnote inline). The user has no opportunity to
review what got replaced, and the workspace loses whatever custom
instructions the previous agent had been reading.

After this slice lands, `init` (and `init:default` by extension) captures
**what was there before the overwrite** into a proposal under
`docs/mcp-vertex/proposals/ready/`, allocated the next free id (per
f00088/f00089), titled
`f0NNNN-review-replaced-host-instructions-<workspace-hash>`. The
proposal arrives `ready`, never auto-opens, and waits for the next
`mcp-vertex_proposals_auto_work` pass — at which point the LLM
already has the mcp-vertex bootstrap in context (via the canonical
fragment + the now-overwritten host files), so it can decide for each
captured rule: **drop, port to bootstrap, port to a new host file,
port to a project-local convention file (.editorconfig, README, …)**.

The canonical mcp-vertex rules are the **single source of truth**
(`docs/mcp-vertex/AGENT-BOOTSTRAP.md`); the proposal is the workspace's
audit log of what it used to say, not a parallel ruleset.

## why

1. **Silent overwrite is a liability.** `init:default` exists because the
   operator runs it on every project they own. Today, the second
   `init:default` against any project that has hand-edited host files
   destroys those edits with no record. We've already seen this in
   memory: lost legacy instructions on `Beateam/mazinger-alfa-frontend`
   after a similar sweep. The fix is not "always preserve" — that
   would leave stale mcp-vertex rules in the host file forever. The
   fix is "overwrite + audit-trail".
2. **The LLM already knows the new rules.** When the proposal enters
   `auto_work`, the agent's first call is `mcp-vertex_overview`,
   which surfaces the bootstrap. By the time the agent reaches the
   review slices, it has read both the *new* rules (from the bootstrap)
   and the *old* rules (from the proposal). It is the only entity
   positioned to decide which old rules are still needed and where
   they belong. Putting the comparison in front of a human instead
   doubles the work (human reads old, human reads new, human compares)
   for decisions a model can make faster and consistently.
3. **The proposal system is the right ledger.** f00089's
   `renderAdoptionPlan` already proves the pattern: `init` writes
   a `ready` proposal that lives in `proposals/ready/`, gets picked
   up by `auto_work`, and ships (or closes) on its own. This slice
   is the **second consumer** of that pattern. The shape, id
   allocation, frontmatter, and slice template all mirror f00089
   intentionally — no new convention is invented.
4. **The single source of truth stays single.** The proposal captures
   *historical* context, not *current* rules. Future runs of
   `init` overwrite the host file again, but the proposal is **never
   re-applied** to the host file: it is a checklist, not a template.
   The bootstrap remains the only place agent rules live, exactly
   as f00056 §1 mandates.

## why this design

- **Single source of truth is preserved.** The bootstrap remains
  the only place rules live; the proposal is a one-shot audit log,
  not a ruleset that gets re-applied.
- **LLM has full context.** By the time `auto_work` picks up the
  proposal, the agent has already read the bootstrap (via
  `mcp-vertex_overview`) AND the new canonical block (via the
  refreshed host file). Reading the proposal's captured content
  gives the LLM the third side of the triangle. This is the
  minimum number of mental hops: 1 read each, 1 comparison slice.
- **Mirrors f00089.** The shape (`renderAdoptionPlan`-style),
  the predicate (`overwrite && nonCanonical`), the id allocation
  (next-free), the swallow-failure posture, the recap line — every
  decision follows a precedent already on `develop`. Zero new
  conventions, zero new lints, zero new i18n keys.
- **`init:default` does not change.** The operator's
  "answer the prompts once and run everywhere" workflow stays
  one-button; the only behavioural difference is "and on each
  run, write a small audit-trail proposal". The recap stays silent
  so the operator's command line stays quiet.

## non-goals

- **No detection of brand-new rules to inject back.** The proposal
  captures *what was there* for the LLM to decide; it does NOT
  attempt to auto-merge anything into the host file. The LLM
  classifies per-rule during the review slices.
- **No git diff, no `git log` integration.** The pre-overwrite file
  content is what we capture — git history is a separate recovery
  channel the LLM can invoke (`git log -p AGENTS.md`) from a slice if
  it needs to roll back further than this run.
- **No change to `init` interactive behaviour.** The new step is
  on by default only for `overwrite`; `append` and `skip` keep their
  existing semantics. The interactive `init` prompts already cover
  `append` as the recommended first-run choice.
- **No automatic opening of the proposal.** It lands `ready` and
  waits. The LLM (or a human) reviews on its own schedule. No
  preemption of `auto_work`.
- **No new plugin.** The proposals plugin already provides
  everything needed (`create_proposal`, `auto_work`, slice review).
- **No handling of non-repo host config.** `.cursorrules`,
  `~/.aider.conf.yml`, etc. stay out of scope; a follow-up
  `f00094-host-instructions-audit-tool` (separate proposal) can
  scan them when the user wants a manual audit.

## architecture

```
packages/cli/src/lib/init/
  init-render.service.ts                   # extend: add the new step next to
                                          #   renderMigrationProposalIfRequested
  init-host-snapshot.service.ts            # NEW: renderSnapshotHostInstructionsProposal
  init-host-snapshot.service.spec.ts       # NEW: unit spec (3 host files + 2 baselines)
packages/cli/src/commands/init/
  init.command.ts                          # no changes (orchestrator already calls
                                          #   renderInitBundle)
  init-default.command.ts                  # no changes (defaults stay `overwrite`)
                                          #   — but the snapshot is now automatic
                                          #   under that mode
docs/mcp-vertex/proposals/ready/
  f00093-init-snapshots-replaced-host-instructions.md   # NEW: this file
```

The orchestrator (`renderInitBundle`) gains a new step after
`renderHostInstructionsBlocks`. Snapshot generation is gated on:

```ts
if (
  answers.hostInstructions === 'overwrite'
  && anyHostFileHasNonCanonicalContent(reader, workspaceRoot)
) {
  files.push(
    ...(await renderSnapshotHostInstructionsProposal(answers, {
      reader,
    })),
  );
}
```

`anyHostFileHasNonCanonicalContent` is the key predicate: it reads each
host file and returns `true` if any of the following holds:

1. The file does not exist (a fresh-init case — snapshot the
   three-way "what was there = nothing" so the LLM sees the
   workspace started blank).
2. The file exists but lacks the canonical `<!-- mcp-vertex:begin -->`
   marker entirely (the file pre-dates any `init` run on this
   repo).
3. The file has the marker but the body between `begin` and `end`
   differs from the canonical block (host-specific footnote excluded
   — see S2).

The predicate and the snapshot writer treat each host file
**independently**: one missing, two pristine is a valid snapshot
target. The LLM review slices iterate per file.

The proposal has the same frontmatter shape as
`renderAdoptionPlan` (`status: ready`, `kind: feat`,
`track: cli+bootstrap+...`, `globalGate: validate`), with these
differences:

- **`id`** — allocated the same way as `renderAdoptionPlan`
  (`allocateNextProposalId(reader)`, never hardcoded). Title suffix:
  `-review-replaced-host-instructions-<workspace-hash>`.
- **`related`** — links to f00084, f00092, f00089 (rules parity).
- **`goal`** — states the LLM's mandate: "For each captured rule,
  decide: drop (the bootstrap covers it), port to bootstrap, port
  to a project-local convention file, or keep (rare — only when
  the rule is genuinely project-specific). The captured content is
  verbatim; you choose the destination."
- **`inventory`** — three fenced code blocks (one per host file),
  each containing the **full** pre-overwrite content. Code fences,
  not inline code, so wrapping doesn't matter. A header above each
  block names the file path and the canonical-mcp-vertex block that
  *replaced* it (so the LLM has both sides in one read).
- **`slices`** — three slices that match the audit plan: S1
  inventory (already provided by the proposal body), S2 classify
  (per-rule decision), S3 integrate (write back into the right
  place; close when no carry-overs remain).

## slices

### S1 — Classify the snapshot trigger

- **Status**: pending
- **Files**: `docs/mcp-vertex/proposals/ready/f00093-init-snapshots-replaced-host-instructions.md`
- **Gate**: typecheck
- **Acceptance**:
  - "The proposal frontmatter lists the three modes that COULD trigger
    a snapshot (`overwrite`, `append`, `skip`) and explains why only
    `overwrite` (and only when the host file is non-canonical) is the
    surface that needs this."
  - "Mode behaviour table agrees with `init-default.command.ts`'s
    existing defaults."

### S2 — Implement the snapshot renderer

- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-host-snapshot.service.ts`
  (new), `packages/cli/src/lib/init/init-host-snapshot.service.spec.ts`
  (new)
- **Gate**: typecheck
- **Acceptance**:
  - "The new module exports
    `renderSnapshotHostInstructionsProposal(answers, { reader })`
    mirroring `renderAdoptionPlan`'s signature so the
    orchestrator pattern matches."
  - "When all 3 host files are empty or absent, the function
    returns `[]` (no empty proposal is written — we don't pollute
    the proposals queue with no-ops)."
  - "When ANY host file has non-canonical content, the function
    returns one `IRenderedFile` with
    `relPath: docs/mcp-vertex/proposals/ready/<id>-review-replaced-host-instructions-<workspace-hash>.md`
    whose content embeds the three pre-overwrite payloads in
    `<pre>`-fenced code blocks."
  - "Allocation of the proposal id uses the same
    `allocateNextProposalId`-equivalent already used by
    `renderAdoptionPlan` (per f00088 — never hardcoded `f00001`)."
  - "Snapshot failures are LOGGED + SWALLOWED (do not break the
    bootstrap) — same posture as `renderMigrationProposalIfRequested`."

### S3 — Wire the snapshot step into the bundle orchestrator

- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-render.service.ts`
- **Gate**: typecheck
- **Acceptance**:
  - "`renderInitBundle` calls the snapshot step after
    `renderHostInstructionsBlocks`. The snapshot step is gated on
    `answers.hostInstructions === 'overwrite'` AND the
    `anyHostFileHasNonCanonicalContent` predicate."
  - "The summary line surfaced in the recap mentions whether the
    snapshot was written."

### S4 — Verify `init:default` still passes

- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-default.command.spec.ts`
  (extend)
- **Gate**: test
- **Acceptance**:
  - "An e2e spec drives `init:default`-equivalent answers through
    `renderInitBundle` against a tmpdir seeded with non-empty
    host files and asserts the snapshot proposal lands."
  - "The default `init:default` recap does not mention the snapshot
    (it is silent, like the migration offer) — but in `--json` mode
    the recap array includes `snapshot-proposal: <relPath>` when
    one was written."

### S5 — End-to-end gate

- **Status**: pending
- **Files**: the 4 files above + this proposal
- **Gate**: validate
- **Acceptance**:
  - "`bun run validate` is green (typecheck + lint + 3 fragment
    lints + i18n + tests)."
  - "`bun run cli -- init --help` exit 0."
  - "`bun run cli -- init:default --help` exit 0."
  - "A manual run of `init:default` against a real workspace with
    non-empty host files writes a proposal with all 3 payloads
    captured verbatim and the host files replaced with the
    canonical block."

## dependency graph

- **Upstream (already shipped)**: f00056 (bootstrap), f00084 (init),
  f00089 (adoption-plan shape), f00092 (single fragment),
  f00103 (`init:default`).
- **No new plugin / no new tool / no new i18n key.**
- **One new service file + one new spec file** under
  `packages/cli/src/lib/init/`.
- **One small orchestrator edit** to `init-render.service.ts`
  (one new `if (...) files.push(...)` block).
- **No change to any external contract** (no CLI flags added,
  no default changed, no spec dragnet outside the init namespace).

## acceptance

- `bun run validate` is green (exit 0).
- `init` and `init:default` against a workspace with non-canonical
  host files produce a `ready` proposal whose body carries the three
  pre-overwrite payloads in fenced code blocks.
- The proposal id is allocated via the same mechanism as
  `renderAdoptionPlan` (next free, not hardcoded).
- Snapshot failures never break the bootstrap; they log a warning
  and continue.
- The bootstrap canonical rule ("rules live in
  `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, not in checked-in host
  files") is preserved: the proposal is an audit-trail, not a
  second source of truth.

## risks and mitigations

- **Risk**: the proposal becomes a graveyard if the LLM never gets
  to it. **Mitigation**: the recap mentions the snapshot
  (in `--json` mode) and `auto_work` already surfaces `ready`
  proposals in its cascade; on the operator's machine,
  `mcp-vertex_proposals_auto_work` is the very next call after
  `init:default` finishes.
- **Risk**: workspace-hash collision on the proposal filename in
  different sub-trees of the same repo. **Mitigation**: hash is
  scoped to `workspaceRoot`; the same workspace never gets two
  snapshots with the same hash unless the same `init` run runs
  twice (idempotent append, the file already exists — second run
  does nothing). The `--force` flag is unchanged.
- **Risk**: the proposal body grows unbounded if the user has
  pasted large configuration into a host file. **Mitigation**:
  the renderer warns (operator-facing recap line) when any single
  payload exceeds 16 KiB and offers to write the oversize file
  to `.cache/mcp-vertex/legacy-host-instructions/<host>.md` and
  link to it from the proposal.

## notes

- **Open question for the slice owners**: do we want to also
  include a `<current-canonical-block>` snapshot in the proposal
  body (next to the `<pre>-fenced pre-overwrite payload`), so the
  LLM can diff in one read? Cheap to add — just one extra fenced
  block per file. Will commit on `yes` in S2.
- **Follow-up proposal idea**: a `mcp-vertex_proposals_inherit_host_instructions`
  tool for projects that use `init` WITHOUT `init:default` and want
  the same audit trail on demand.
