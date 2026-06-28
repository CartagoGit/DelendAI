---
id: f00050
status: paused
paused-reason: Deferred until prerequisites of f00049 land
type: proposal
track: lint+architecture+i18n+workflow+release
date: 2026-06-23
paused: 2026-06-23
kind: feat
title: Future work deferred from f00049 — the nine non-goals that will become a separate proposal when their prerequisites land
related:
    - f00049 # the parent proposal that explicitly defers this work
---

# f00050 — Future work deferred from f00049

## goal

Capture the nine non-goals that [`f00049`](../ready/f00049-conventions-unification-r10-slices.md)
explicitly chose **not** to do, so they survive past the unification's close. Each item
gets its own S* slice with its own gate, but the proposal itself stays `paused` until
its prerequisites are met (one per item, listed below). Moving this file to `ready/`
requires a per-item decision recorded in this frontmatter (`preconditions-met:` array).

This is a **parking lot**, not a workstream. Slices are not claimable while the
proposal is `paused` — the slice gates below are the contract for the future
proposal, not a TODO for today.

## why

f00049's non-goals are the lines the unification explicitly refused to cross. Some
are discipline ("do not silently rewrite semantics"), some are scope ("do not touch
the lock-released contract"), and some are sequenced ("not yet — the orchestration
mechanic is not stable enough"). Forgetting them is exactly how a unification
becomes a rewrite.

Listing them in a single place, with preconditions, makes them:

1. **Visible** to the next agent that touches the touched areas (the audit plugin
   will see the `audit-plugin-agnostic` slice referenced; the `bun.lock` auditor
   will see the `release-discipline` slice; the orchestrator author will see the
   `lock-released` slice).
2. **Claimable** as standalone slices when their preconditions are met — no need
   to expand f00049 or write a new proposal from scratch.
3. **Auditable** — `proposals_compact_status` includes `paused/` and counts these
   as parked work, not lost work.

## non-goals

- Do not implement any of the nine slices while the proposal is `paused`.
- Do not move this file to `ready/` until the `preconditions-met:` array records
  which slices are now unblocked.
- Do not link this proposal from `f00049` as a dependency of f00049's slices —
  f00049 explicitly does not depend on f00050.


### Re-scan before unpausing any S-* slice (pre-flight, mandatory)

> **Why this section exists.** A precondition is a snapshot in time. Between the
> day this proposal is parked (`date: 2026-06-23`) and the day an agent decides
> to unpause a slice, the repo — and the f00049 unification it depends on —
> will have moved. New audits land, new plugins ship, new S-* slices may have
> been added to f00049, and the unification's S0 re-scan will have produced a
> new evidence baseline. **The unpausing agent MUST re-validate the precondition
> against the live tree, not against the parking-lot text.**

- **When it runs**: every time an agent considers moving a slice from this
  file into `docs/proposals/ready/`. **Before** the `### how to unpause an item`
  procedure below starts.
- **Files read** (no writes during the re-scan itself):
  - This file (for the slice's declared preconditions).
  - The corresponding slice in `f00049` (because every S-* here is a
    deferred non-goal of a specific f00049 slice; if that f00049 slice has
    changed, the non-goal may have become moot, or its scope may have shifted).
  - The f00049 `recan:` array in frontmatter (the post-S0 evidence baseline).
  - The most recent `proposals_compact_status` output.
  - The current `docs/proposals/index.json` and the corresponding
    `proposals/done/audits/` files for the audit slices (S-A, S-B, S-H).
- **Re-scan rules** (same semantics as f00049 S0):
  1. **Re-validate the precondition** as written. If the precondition is
     satisfied, proceed to step 2. If it is not, the slice stays parked.
  2. **Check for new related preconditions.** The deferred work may have
     grown in scope because f00049 S0 found a new dimension that the
     original preconditions did not account for. If so, the agent
     **expands** the preconditions in this file (in place) before copying
     to `ready/`.
  3. **Check for unification drift on the *mechanism* of unpausing.** The
     `### how to unpause an item` procedure below is part of the repo's
     working form (a workflow-shape concern). If f00049 S10's
     `lint:workflow` (or its successor) flags this procedure as drifted,
     the procedure is updated *here* in the parking lot before the slice
     is unpaused.
  4. **Append a `recan:` entry to this file's frontmatter** with the
     re-scan outcome:
     `recan: [{ at: <ISO date>, by: <agent>, slice: S-<X>, status: <unblocked | still-paused | expanded>, notes: "..." }]`
  5. **No new parking-lot slices are added by the re-scan.** This file is a
     parking lot, not a workstream. If the re-scan finds a *new* parked
     non-goal (e.g. f00049 S9 added a tenth non-goal after the parking lot
     was written), the new slice is added by **amending this file** in a
     small follow-up commit, never inline during an unpause.
- **Commit for the re-scan itself** (when the re-scan changes the
  frontmatter or the procedure): `chore(f00050): re-scan preconditions —
  S-<X> now <unblocked|still-paused|expanded>`.
- **Cadence**: at minimum, once before every unpause. Optionally, a
  periodic re-scan (e.g. weekly) by an agent that has nothing else to
  do, to keep the `recan:` trail warm. The trail is read by f00049 S0 on
  the day a sibling slice is unblocked, so the two proposals stay in
  sync.

## slices
### S0 — parking-lot placeholder (this proposal stays paused)

- **Status**: paused
- **Files**: docs/proposals/paused/f00050-future-non-goals-of-f00049.md (this file only).
- **Gate**: none (paused — the proposal is a parking lot, not a workstream).
- **Acceptance**: each item parked below (`### S-A — …`, `### S-B — …`, …) carries its own precondition; the proposal as a whole is `done` when all nine items have been moved out into their own `ready/<id>-…` proposals. Until then, the proposal stays `paused` and the slice below remains unclaimable.


### S-A — Semantic rewrite of services and tools beyond renames

- **Status**: paused
- **Preconditions**:
  - f00049 is `done` and the public surface (`@mcp-vertex/core/public`) is
    verified byte-identical.
  - At least one of:
    - A user request explicitly asks for a behavioral change to a service/tool
      named in the f00049 S4/S5 migration list.
    - A P0 finding in a post-f00049 audit flags a service that f00049's
      renames revealed to be doing two things (SRP violation that the rename
      surfaced, not created).
- **Files** (illustrative — written when unpaused): per-service rewrite PRs,
  one commit per service, each gated by its existing tests + a new
  behavior-preservation spec (golden output).
- **Gate**: existing tests pass; the new behavior-preservation spec passes;
  `bun run validate` green.
- **Note**: this is the only slice that, if it ever runs, **does** break
  f00049's "no semantic rewrite" non-goal. That is by design — the user
  asked us to keep f00049 honest by parking the rewrite here.

### S-B — Touch the audit plugin's agnostic contract

- **Status**: paused
- **Preconditions**:
  - A specific finding in a post-f00049 audit (most likely an a0003x+ audit)
    calls out a remaining mcp-vertex-vocabulary leak in the audit plugin.
  - OR: a downstream host (e.g. a non-mcp-vertex consumer using the audit
    plugin) reports that the current contract does not fit their vocabulary.
- **Files**: targeted additions to `plugins/audit/src/lib/{brief,consolidate}.ts`
  + the corresponding `plan-tool.ts` and `consolidate-tool.ts` options. The
  existing `crossCuttingAdditions`, `projectName`, `configFileName` fields
  from a00032-S4 are the surface; new fields add, never replace.
- **Gate**: 42/42 audit tests pass (per a00032-S4 baseline); the new spec
  proves the new field is honored by `buildBrief` end-to-end.
- **Note**: f00049 S7 already invokes `crossCuttingAdditions` as evidence;
  this slice is for *new* additions, not refinements of the existing one.

### S-C — Public surface change with deprecated aliases

- **Status**: paused
- **Preconditions**:
  - A type/function/exporter in `@mcp-vertex/core/public` or any
    `src/public/index.ts` needs to be removed or renamed.
  - A migration window of at least one minor release (`feat:` → minor bump)
    is acceptable to the project.
- **Files**: per-rename PR, with `@deprecated` JSDoc pointing at the new
  name, the new name exported in parallel, and a CHANGELOG entry under
  "Deprecated" with the removal version.
- **Gate**: a "no removals in same release" lint check (the new lint asserts
  the deprecated symbol still exists in the public barrel for one minor
  after the deprecation lands).
- **Note**: f00049 keeps public barrels byte-identical. This slice is the
  *only* sanctioned way to break that.

### S-D — Non-TypeScript surface (Python/Rust/Go profile)

- **Status**: paused
- **Preconditions**:
  - A consumer host using the conventions plugin (currently
    `plugins/conventions/`) reports they need a non-TS profile.
  - OR: the mcp-vertex v1 release notes commit to multi-language support
    (currently out of scope per AGENTS.md).
- **Files**: a new `plugins/conventions/src/lib/profiles/{python,rust,go}.ts`
  module per language, each extending the base classifier with the
  language-native equivalents (`*.py` module, `__init__.py` package marker,
  `mod.rs` for Rust, `go.mod` for Go). The plugin core stays agnostic
  per AGENTS.md rule #1.
- **Gate**: per-language `conventions check --profile=<lang>` exits 0 on a
  fixture repo of the target language; `conventions check --profile=typescript`
  on a TS repo still exits 0 (regression).
- **Note**: the gate for *removing* the `tools/scripts/lint/no-shell-python.script.ts`
  ban on Python in `tools/` is unrelated to this slice and lives in its own
  proposal if/when it is ever filed.

### S-E — New public types

- **Status**: paused
- **Preconditions**:
  - A post-f00049 audit (or an external host) needs a type that is not
    currently exported from `@mcp-vertex/core/public`.
  - The type cannot be expressed as a Zod-derived `*Input` / `*Output` (per
    f00049 S9's type-suffix convention) because it is not a tool schema.
- **Files**: per-type PR, the new type added to the appropriate
  `contracts/interfaces/*.interface.ts` and re-exported from the matching
  `src/public/index.ts`. The PR includes at least one consumer in the same
  repo (a plugin, a test, or an example) to prove the type is not dead.
- **Gate**: `bun run types:generate` clean; the type appears in
  `packages/core/src/generated/tool-outputs.ts` (or its public-types
  equivalent) without an "unused" warning.
- **Note**: f00049's renames are internal — this slice is the *only* path
  that adds net-new exports.

### S-F — Re-number historical proposal / audit IDs

- **Status**: paused
- **Preconditions**:
  - A new convention is adopted that strictly orders proposal IDs (e.g.
    "no gaps, every id a 5-digit zero-padded number, prefix = `kind`").
  - A `git filter-repo` migration is approved (or equivalent).
- **Files**: a one-shot `tools/scripts/proposals/renumber-ids.script.ts`
  + a `docs/proposals/CHANGELOG.md` mapping old → new.
- **Gate**: a fixture repo with sample proposal IDs is renumbered and
  every `related:` / `superseded_by:` / cross-link in the new repo
  resolves; the `bun run lint:proposals` exit code is unchanged.
- **Note**: f00049 S1 only renumbers the *single* duplicate `a00034` → `a00036`.
  Anything bigger belongs here.

### S-G — Fuse proposal-ID prefixes

- **Status**: paused
- **Preconditions**:
  - A community decision is made on which prefix represents what (today the
    table is implicit: f/x/r/c/d/t/l/a/n/u, with `u` unassigned).
  - The prefix taxonomy is moved from prose in f00049 S9 to a Zod enum
    (per f00049 S3's schema), with the union of allowed prefixes exported
    from `@mcp-vertex/core`.
- **Files**: the proposal ID Zod schema gains an enum over the agreed
  prefixes; a migration script (one-shot, in the same PR) updates every
  proposal's `id:` frontmatter to a valid prefix.
- **Gate**: `bun run lint:proposals` exits 0; `proposals_compact_status`
  reports the same count of proposals before and after (no file deleted);
  the `index.json` regenerates identically.
- **Note**: f00049 S9 documents the current taxonomy; this slice *changes*
  it. Until then, the f00049 table is the only authority.

### S-H — Touch the loop detector / idle-streak / lock-released contract

- **Status**: paused
- **Preconditions**:
  - A new orchestrator proposal (most likely in
    `plugins/proposals/src/lib/tools/auto-work.tool.ts` or
    `plugins/proposals/src/lib/agents/agent-lock-engine.ts`) is filed and
    `ready`.
  - That proposal's `## why` section cites one of:
    - A loop detected in production (false negative of the current brake).
    - A peer-agent starvation event in the swarm.
    - A documented bug in `state-repair-playbook` recovery that the current
      contract cannot paper over.
- **Files**: scoped to the orchestrator engine files; the proposals plugin
  itself stays project-agnostic per AGENTS.md rule #1.
- **Gate**: the existing `auto_work` budget tests still pass; a chaos spec
  (5+ concurrent agents in a fixture repo) shows the new contract handles
  the failure mode the proposal cites.
- **Note**: f00049 S10's `lint:workflow` reads the contract but does not
  change it. This slice is the *only* sanctioned way to change the brake.

### S-I — Bump / swap / remove dependencies (touch `bun.lock`)

- **Status**: paused
- **Preconditions**:
  - A security advisory (CVE) is filed against a dep that the current
    `bun.lock` resolves.
  - OR: a dep's upstream is unmaintained for >12 months AND a maintained
    alternative exists with comparable API surface.
  - OR: a new dep is needed to land a feature that cannot be built from
    the current dep set.
- **Files**: a single `package.json` + regenerated `bun.lock` + per-package
  spec updates. The PR cites the precondition explicitly in its body.
- **Gate**: `bun install` clean; `bun run validate` green; the
  `deps_list` / `deps_check` lints report no unpinned ranges.
- **Note**: f00049 touches zero deps. This slice is the *only* sanctioned
  way to change `bun.lock` as part of convention work.

### how to unpause an item

0. **Run the re-scan** described in the `## Re-scan before unpausing any S-* slice`
   section above. The re-scan may amend the slice's preconditions or
   re-classify the slice; if it does, the procedure below uses the
   post-re-scan state.
1. Copy the slice's S-* block (preconditions + files + gate + note) into a
   new file under `docs/proposals/ready/` with the next correlative id
   (`f00051`, `f00052`, …; or `x*` if the work is a fix, etc.). The new
   proposal's `related:` lists this file.
2. Remove the S-* block from this file.
3. Update this file's frontmatter: add a `preconditions-met:` array entry
   with the slice id and date, e.g. `preconditions-met: [{ slice: S-B,
   id: f00051, on: 2026-07-15 }]`. **Also append a `recan:` entry** with
   the re-scan outcome (step 4 of the re-scan procedure).
4. Re-run `proposals_sync_proposals` (per the
   `proposal-swarm-runner` "never do" rule #4, this is the only sanctioned
   moment to sync after moving files in this folder).

## acceptance

The proposal closes when **all nine** of these are true:

- ✅ The 9 non-goals from f00049 §"non-goals (kept explicit per the user's
  'todo esto también' request)" are captured below as S* slices with
  preconditions.
- ✅ `docs/proposals/index.json` lists this file under `paused/`.
- ✅ `proposals_compact_status` shows `paused: 1` incrementing on this proposal's
  creation.
- ✅ `f00049` references this file from its own "see also" — done at the time
  f00049 was written; the link is `paused/f00050-future-non-goals-of-f00049.md`.
- ✅ The next agent who unblocks an item copies its slice out of this file into
  a fresh `ready/f00051-…` (or appropriate id) and removes the slice from here.

## notes

- [`f00049`](../ready/f00049-conventions-unification-r10-slices.md) — the
  parent proposal whose non-goals this file parks.
- [`paused/c00002`](../paused/c00002-pause-npm-publish.md) — the canonical
  example of a `status: paused` proposal in this repo (checkpoint, not a
  workstream; this file follows the same shape).
- [`skills/proposal-swarm-runner/SKILL.md`](../../skills/proposal-swarm-runner/SKILL.md)
  — the working-form contract S-H of this file would amend.
- [`skills/state-repair-playbook/SKILL.md`](../../skills/state-repair-playbook/SKILL.md)
  — the failure-mode playbook that motivates the S-H precondition.
- `AGENTS.md` rules #1 (core agnostic) and #10 (no shell/python in tools)
  — the rules S-B, S-D, and S-I explicitly preserve.
