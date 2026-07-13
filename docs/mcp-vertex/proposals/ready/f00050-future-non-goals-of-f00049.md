---
id: f00050
status: ready
paused-reason: "The 2026-07-13 live triage found every destructive item-specific trigger still blocked; resume only when one fires."
type: proposal
track: lint+architecture+i18n+workflow+release
date: 2026-06-23
kind: feat
title: Future work deferred from f00049 — triage the nine non-goals now that f00049 is done
related:
    - f00049 # the parent proposal (now done) whose non-goals this file parks
recan:
    - { at: 2026-07-12, by: opus, slice: all, status: rescanned, notes: "f00049 is DONE (done/feats/) and @mcp-vertex/core/public is stable — the COMMON precondition (item 1 of every S-*) is now MET. But every S-* also carries a SECOND, trigger precondition (a concrete user request / CVE / audit finding / community decision); as of this re-scan NONE of those triggers exist, so no item auto-promotes. This proposal is promoted to ready as the standing TRIAGE workstream: S0 assesses all nine against the live tree each pass and promotes any whose trigger has since fired." }
    - { at: 2026-07-13, by: codex-root, slice: S0, status: still-paused, notes: "Live re-scan found no qualifying trigger. The latest audits contain no requested public removal, prefix decision, approved history rewrite, non-TS consumer request or production orchestrator-loop finding. deps_check reports a Bun lockfile, zero findings and healthy=true. compact_status reports an empty task queue. All nine deferred items remain parked; S0 completed this pass." }
---

# f00050 — Triage the nine non-goals deferred from f00049

## goal

f00049 (conventions unification) is **done**. This proposal parks the nine
non-goals it explicitly refused to cross, each behind a precondition, and —
now promoted to `ready/` — serves as the standing **triage workstream** for
them: on each pass, re-scan every item against the live tree and promote any
whose trigger has fired into its own `ready/<id>-…` proposal (per the
`### how to unpause an item` procedure). It is deliberately conservative:
executing a gated item **before** its trigger (a semantic rewrite, an ID
renumber, a dep bump) would break the very discipline f00049 established, so
S0's job is triage + promotion, never blind execution.

**Re-scan 2026-07-12 (this promotion):** the common precondition — f00049
done + public surface stable — is MET for every item. The per-item trigger
status is the table under `## Re-scan outcome` below; today all nine remain
trigger-blocked, so the actionable work is S0 (triage), and each item moves
only when its concrete trigger appears (a user asks for the semantic rewrite,
a CVE lands for S-I, an audit flags the audit-plugin vocab for S-B, etc.).

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

- **Do not blind-execute a trigger-blocked item.** Promotion requires the
  item's concrete trigger (a user request, a CVE, an audit finding, a
  community decision) to have fired — the re-scan proves it, S0 records it.
  Running a semantic rewrite / ID renumber / dep bump without its trigger
  breaks the f00049 discipline this file exists to protect.
- Do not link this proposal from `f00049` as a dependency of f00049's slices —
  f00049 explicitly does not depend on f00050.

### Re-scan outcome (2026-07-13)

Common precondition (f00049 done + `@mcp-vertex/core/public` stable): **MET**
(2026-07-12). Per-item trigger status:

| Item | Trigger precondition | 2026-07-13 status |
|------|----------------------|-------------------|
| S-A semantic rewrite | user request OR P0 audit flags an SRP violation | trigger-blocked (no such request/finding) |
| S-B audit-plugin contract | audit finds a vocab leak / downstream host asks | trigger-blocked |
| S-C public surface change | a public symbol must be removed/renamed | trigger-blocked (no removal pending) |
| S-D non-TS profile | a consumer needs python/rust/go OR v1 commits multi-lang | trigger-blocked |
| S-E new public types | a needed type can't be exported today | trigger-blocked |
| S-F renumber IDs | a strict-order convention + git-filter-repo approval | trigger-blocked |
| S-G fuse ID prefixes | a community decision on the prefix taxonomy | trigger-blocked |
| S-H loop-detector contract | a new orchestrator proposal cites a prod loop | trigger-blocked |
| S-I dep bump / bun.lock | a CVE OR an unmaintained-dep + alternative | trigger-blocked (run `deps_check` each pass) |

**Consequence:** S0 (triage) is the only active slice; it re-runs this table
each pass and promotes any row that flips to "trigger fired." The nine item
blocks (`### S-A …` through `### S-I …`) below are the ready-to-copy contracts
for that promotion — unchanged, still the source of truth for each item's
files + gate.


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

## Slices
### S0 — standing triage (re-scan + promote)

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/f00050-future-non-goals-of-f00049.md` (this file), plus any `ready/<id>-…` a promotion creates.
- **Gate**: `bun run lint:proposals` (the file stays lint-clean; any promoted child passes on its own).
- **Acceptance**:
  - "Each pass: re-run the `## Re-scan outcome` table against the live tree (f00049 slices, latest audits under `done/audits/`, `deps_check` for S-I, `proposals_compact_status`). Append a `recan:` frontmatter entry with the outcome. Any row whose trigger has fired is promoted per `### how to unpause an item` (copy its S-* block into a fresh `ready/<id>` proposal, remove it here, record `preconditions-met:`)."
  - "The proposal is `done` only when all nine items have been either promoted out (trigger fired → own proposal) or explicitly retired by the user (trigger declared never-going-to-fire). Between triage passes it stays `paused` so trigger-blocked work cannot starve executable proposals; a fired trigger resumes it."
- **Evidence (2026-07-13)**:
  - "The live dependency check returned `healthy: true`, a Bun lockfile and no findings; the proposal queue is empty and the complete repository validation passes."
  - "Current audits and user requirements do not satisfy any item-specific destructive trigger, so no semantic rewrite, history migration, public removal or dependency churn was promoted."


### S-A — Semantic rewrite of services and tools beyond renames

- **Status**: blocked
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

- **Status**: blocked
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

- **Status**: blocked
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

- **Status**: blocked
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

- **Status**: blocked
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

- **Status**: blocked
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

- **Status**: blocked
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

- **Status**: blocked
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

- **Status**: blocked
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

The proposal is `done` when **all nine** items have left this file — each
either promoted into its own `ready/<id>-…` proposal (its trigger fired) or
explicitly retired by the user. Until then it stays `ready` as the live
triage surface. Concretely:

- The nine non-goals from f00049 are captured below as `### S-* …` blocks,
  each with its precondition (the ready-to-copy promotion contract).
- `docs/mcp-vertex/proposals/index.json` lists this file under `ready/`.
- Each re-scan pass appends a `recan:` frontmatter entry (S0 acceptance).
- A promotion copies the item's block into a fresh `ready/<id>` proposal,
  removes it here, and records `preconditions-met:` — per `### how to
  unpause an item`.
- `bun run lint:proposals` stays green throughout.

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
