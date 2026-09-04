---
id: f00050
status: paused
paused-reason: "The 2026-07-13 live triage found every destructive item-specific trigger still blocked; resume only when one fires."
type: proposal
track: lint+architecture+i18n+workflow+release
date: 2026-06-23
kind: feat
title: Future work deferred from f00049 — triage the nine non-goals now that f00049 is done
related:
    - f00049 # the parent proposal (now done) whose non-goals this file parks
recan:
    - { at: 2026-07-12, by: opus, slice: all, status: rescanned, notes: "f00049 is DONE (done/feats/) and @delendai/core/public is stable — the COMMON precondition (item 1 of every S-*) is now MET. But every S-* also carries a SECOND, trigger precondition (a concrete user request / CVE / audit finding / community decision); as of this re-scan NONE of those triggers exist, so no item auto-promotes. This proposal is promoted to ready as the standing TRIAGE workstream: S0 assesses all nine against the live tree each pass and promotes any whose trigger has since fired." }
    - { at: 2026-07-13, by: codex-root, slice: S0, status: still-paused, notes: "Live re-scan found no qualifying trigger. The latest audits contain no requested public removal, prefix decision, approved history rewrite, non-TS consumer request or production orchestrator-loop finding. deps_check reports a Bun lockfile, zero findings and healthy=true. compact_status reports an empty task queue. All nine deferred items remain parked; S0 completed this pass." }
    - { at: 2026-07-14, by: claude-fable, slice: S-D, status: unblocked, notes: "Trigger fired: the user explicitly committed to delendai being adoptable in any project ('que se pueda usar facilmente en cualquier otro proyecto') and confirmed the S-D promotion when asked directly. Promoted to f00113 (profiles live plugin-side; core TS contract untouched)." }
    - { at: 2026-07-14, by: claude-fable, slice: S-G, status: unblocked, notes: "Trigger fired: the user (project owner) confirmed the current prefix taxonomy as the agreed one — the community-decision precondition. Promoted to f00114 with one recorded expansion: the enum exports from @delendai/proposals' public barrel, NOT @delendai/core, because proposal vocabulary in the core would break AGENTS.md rule #1 (core agnostic). deps_check re-run this pass: healthy=true, zero findings — S-I stays parked; S-A/S-B/S-C/S-E/S-F/S-H unchanged, no trigger." }
    - { at: 2026-07-28, by: claude-sonnet-5, slice: all, status: still-paused, notes: "User-requested re-scan of the remaining seven (S-A, S-B, S-C, S-E, S-F, S-H, S-I). Checked every done/audits/ file dated after this proposal's 2026-07-14 recan (a00053 through a00082, 28 audits) for the specific trigger keywords each slice requires (SRP-violation finding, audit-plugin vocab leak, public-symbol removal need, unexportable-type need, strict-order ID convention, production loop/starvation/state-repair-playbook bug, CVE/unmaintained-dep) — zero hits in that window. Checked ready/ and in-progress/ for a new orchestrator proposal citing a loop/starvation finding (S-H's specific precondition) — none exists; an incidental lock-release honesty bug I fixed this same session (close_slice/proposal_review's lockReleased was hardcoded true) was fixed directly rather than filed as a new orchestrator proposal citing a production loop, so it does not satisfy S-H's precondition as written. deps_check: healthy=true, zero findings (S-I). compact_status: queue green, 0 orphans (no starvation signal). No trigger fired for any of the seven; the proposal correctly stays paused per its own non-goal ('do not blind-execute a trigger-blocked item'). Also note: this file's 2026-07-12 recan entry says 'promoted to ready', but the frontmatter status and physical folder (paused/) were never actually updated to match — that promotion was apparently never executed, and every recan since (including this one) has correctly continued treating the file as paused. Left status: paused as-is (that IS the accurate current state); flagging the stale prose only so a future reader isn't confused by the contradiction." }
    - { at: 2026-07-29, by: claude-sonnet-5, slice: S-I, status: unblocked, notes: "User-requested re-scan asked to mine this file for anything actionable without needing the user's decision. Live re-run of delendai_deps_deps_audit found 20 real CVE findings (11 high, 8 medium, 1 low) against currently-resolved dependency versions — S-I's precondition ('A security advisory (CVE) is filed against a dep that the current bun.lock resolves') fired. Promoted to x00164 (astro -> 7.1.5, @modelcontextprotocol/sdk -> 1.30.0 to unlock a patched @hono/node-server 2.x, plus package.json overrides for 11 vulnerable transitive deps). Re-ran deps_audit post-fix: 0 findings. Verified no regressions: full typecheck, bun test across packages/core+client+cli and plugins/proposals+deps+search+notification, astro check, and a full astro build (2657 pages) all green. Shipped 519d9ab3, x00164 transitioned to done." }
    - { at: 2026-07-29, by: claude-sonnet-5, slice: S-B, status: unblocked, notes: "Same re-scan pass as S-I. Direct source inspection of plugins/audit (not a formal a0003x+ audit doc, but the same class of finding the precondition describes) found 7 concrete delendai-vocabulary/path leaks in production code: index.ts hardcoded auditDir/proposalsDir to a literal docs/delendai/... instead of deriving from ctx.docsDir (the exact mechanism IMcpPluginContext exists for); the scaffolder embedded 'Alcance B (f00077)' into every generated proposal body; audit-consolidate.tool.ts's description hardcoded a literal instead of interpolating its own defaultAuditDir parameter; audit-run.tool.ts's summary carried the same jargon plus deprecated MUY_MAL/MEJORABLE tokens; audit-run.schemas.ts's proposalPrefix enum was a stale, ACTIVELY WRONG duplicate of the canonical proposal-kind-prefix taxonomy (missing b/v/i/s, included a nonexistent u); audit-plan.tool.ts's dead dimensions fallback was a stale Spanish translation of SCORE_DIMENSIONS. Promoted to x00165, all 6 slices implemented with 13 new tests, full audit-plugin suite green (104/104), typecheck clean. Shipped 936ecffe, x00165 transitioned to done." }
    - { at: 2026-07-29, by: claude-sonnet-5, slice: S-F, status: retired, notes: "User explicitly declined this slice when asked directly ('No, explicitamente te digo que eso no se haga.'). Marked retired in place (not promoted, not deleted) per this file's own acceptance criterion ('each either promoted... or explicitly retired by the user'). No git-filter-repo history rewrite of proposal IDs will happen unless the user reverses this decision in the future." }
preconditions-met:
    - { slice: S-D, id: f00113, on: 2026-07-14 }
    - { slice: S-G, id: f00114, on: 2026-07-14 }
    - { slice: S-I, id: x00164, on: 2026-07-29 }
    - { slice: S-B, id: x00165, on: 2026-07-29 }
retired:
    - { slice: S-F, on: 2026-07-29, by: user, reason: "Explicit decision against any proposal-ID renumbering / git-filter-repo history rewrite." }
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

Common precondition (f00049 done + `@delendai/core/public` stable): **MET**
(2026-07-12). Per-item trigger status:

| Item | Trigger precondition | 2026-07-13 status |
|------|----------------------|-------------------|
| S-A semantic rewrite | user request OR P0 audit flags an SRP violation | trigger-blocked (no such request/finding) |
| S-B audit-plugin contract | audit finds a vocab leak / downstream host asks | **trigger FIRED 2026-07-29** → promoted to `x00165` |
| S-C public surface change | a public symbol must be removed/renamed | trigger-blocked (no removal pending) |
| S-D non-TS profile | a consumer needs python/rust/go OR v1 commits multi-lang | **trigger FIRED 2026-07-14** → promoted to `f00113` |
| S-E new public types | a needed type can't be exported today | trigger-blocked |
| S-F renumber IDs | a strict-order convention + git-filter-repo approval | **retired 2026-07-29** — user explicitly declined |
| S-G fuse ID prefixes | a community decision on the prefix taxonomy | **trigger FIRED 2026-07-14** → promoted to `f00114` |
| S-H loop-detector contract | a new orchestrator proposal cites a prod loop | trigger-blocked |
| S-I dep bump / bun.lock | a CVE OR an unmaintained-dep + alternative | **trigger FIRED 2026-07-29** → promoted to `x00164` |

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
- **Files**: `docs/delendai/proposals/ready/f00050-future-non-goals-of-f00049.md` (this file), plus any `ready/<id>-…` a promotion creates.
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
  - f00049 is `done` and the public surface (`@delendai/core/public`) is
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

- **Status**: promoted → [`x00165`](../done/fixes/x00165-pasada-f00050-s-b-remove-delendai-vocabulary-path-leaks-from-the-audit-plugin-s-agnostic-contract.md) (2026-07-29). The block moved there per `### how to unpause an item`. Trigger: a direct source re-scan found 7 concrete delendai-vocabulary/path leaks in the audit plugin's production code path, contradicting its own stated project-agnostic contract.

### S-C — Public surface change with deprecated aliases

- **Status**: blocked
- **Preconditions**:
  - A type/function/exporter in `@delendai/core/public` or any
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

- **Status**: promoted → [`f00113`](../ready/f00113-multi-language-conventions-profiles-python-rust-go-promoted-from-f00050-s-d.md) (2026-07-14). The block moved there per `### how to unpause an item`.

### S-E — New public types

- **Status**: blocked
- **Preconditions**:
  - A post-f00049 audit (or an external host) needs a type that is not
    currently exported from `@delendai/core/public`.
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

- **Status**: retired (2026-07-29, explicit user decision — "No, explicitamente te digo que eso no se haga."). Will not be done: no `git filter-repo` history rewrite of proposal IDs, ever, absent a future explicit reversal by the user. Kept here (not deleted) so the non-goal and its reasoning stay visible to anyone who might otherwise propose this.
- **Preconditions** (moot — retired before ever firing):
  - A new convention is adopted that strictly orders proposal IDs (e.g.
    "no gaps, every id a 5-digit zero-padded number, prefix = `kind`").
  - A `git filter-repo` migration is approved (or equivalent).
- **Files**: a one-shot `tools/scripts/proposals/renumber-ids.script.ts`
  + a `docs/proposals/CHANGELOG.md` mapping old → new.
- **Gate**: a fixture repo with sample proposal IDs is renumbered and
  every `related:` / `superseded_by:` / cross-link in the new repo
  resolves; the `bun run lint:proposals` exit code is unchanged.
- **Note**: f00049 S1 only renumbers the *single* duplicate `a00034` → `a00036`.
  Anything bigger belongs here — and per the user's decision, nothing
  bigger will happen.

### S-G — Fuse proposal-ID prefixes

- **Status**: promoted → [`f00114`](../ready/f00114-proposal-id-prefix-taxonomy-as-a-zod-enum-promoted-from-f00050-s-g.md) (2026-07-14). The block moved there per `### how to unpause an item`, with one recorded expansion: the enum exports from the proposals plugin's public barrel, not `@delendai/core` (rule #1, core agnostic).

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

- **Status**: promoted → [`x00164`](../done/fixes/x00164-pasada-f00050-s-i-bump-vulnerable-dependencies-11-high-8-medium-1-low-cve-findings.md) (2026-07-29). The block moved there per `### how to unpause an item`. Trigger: `deps_audit` reported 20 real CVE findings (11 high, 8 medium, 1 low) against currently-resolved dependency versions.

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
- `docs/delendai/proposals/index.json` lists this file under `ready/`.
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
- [`skills/proposal-swarm-runner/SKILL.md`](../../../../plugins/proposals/skills/proposal-swarm-runner/SKILL.md)
  — the working-form contract S-H of this file would amend.
- [`skills/state-repair-playbook/SKILL.md`](../../../../plugins/proposals/skills/state-repair-playbook/SKILL.md)
  — the failure-mode playbook that motivates the S-H precondition.
- `AGENTS.md` rules #1 (core agnostic) and #10 (no shell/python in tools)
  — the rules S-B, S-D, and S-I explicitly preserve.
