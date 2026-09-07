---
id: x00510
title: "READ != WRITE — three-stage split (detect → suggest → materialize) + validate-gate repair"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-READ-WRITE-001 + AUD-VALIDATE-002
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - x00506
  - q00019
  - q00022
  - r00047
  - r00048
---

# x00510 — READ != WRITE + validate-gate repair

## Goal

Convert the implicit "a missing entity causes a `create_proposal`" anti-pattern
into an explicit three-stage contract — `detect()` (read-only), `suggest()`
(read-only, returns candidate_proposals), `materialize()` (explicit write
behind a policy) — and at the same time repair the three concrete
`bun run typecheck` regressions on `develop` (commit `91bbbff76`) so the
validate gate stops blocking every other proposal in the workspace.

This proposal is **deliberately small**: P0 only fixes what is needed to let
`x00506` close and to install the `READ ≠ WRITE` invariant as a code-visible
contract. The deeper work (proposals SQLite schema, lifecycle events, outbox,
quarantine, FTS5, context compiler, branch protection) is split into the
sibling proposals `q00022`, `r00047`, `r00048`, `q00023`, `q00024`, `f00514`,
`f00515`, `r00049`, `f00516`, `f00517`, `c00528`, `f00518`, `f00519`, `a00094`.

## Why

The external audit identified the most dangerous failure mode in the project
as **a read path that silently materialises a write**:

> Ninguna de estas operaciones: `getProposal()`, `listProposals()`, `search()`,
> `getPlan()`, `getSlice()`, `resolveContext()`, `reconcile()`, `index()`,
> `audit()` debe poder acabar llamando implícitamente a `createProposal()`.
> Nunca. Incluso aunque falte una propuesta. Incluso aunque haya un archivo
> corrupto. Incluso aunque el agente crea que debería existir.

That invariant is currently implicit at best — the proposals plugin still
rebuilds `proposals/INDEX.json` as a side-effect of `list_proposals`, and
`auto-fix-queue` / `incident-proposals` already produce real `proposal`s from
purely observational input. The README and the `@delendai/proposals` skill
both acknowledge the gap.

In parallel, `origin/develop` (commit `91bbbff76`) is in a state where:

1. `packages/core/tests/src/lib/contracts/workflow-contribution.spec.ts` —
   three `TS18048: 'extension' is possibly 'undefined'` errors.
2. `plugins/web-fetch/tests/src/lib/network-capability.spec.ts` — one
   `TS2352: Conversion of type '...' to type 'Response'` error (missing the
   `unknown` widening that strict-mode requires).
3. `tools/scripts/lint/routing-coherence.script.ts:200` — one
   `TS2532: Object is possibly 'undefined'` (the `RegExpMatchArray[1]`
   capture group).

All three are tiny patches with a clear fix, but together they keep the
`bun run validate` gate red, which is what currently prevents `x00506` and
every other proposal from being closed. We have a chicken-and-egg situation
where the audit says "do not mutate without an explicit proposal" while the
same audit also requires the gate to be green to close any proposal.

This proposal resolves that tension by:

1. Treating the three typecheck regressions as **blocker-repair work**, not as
   feature work. Each is a minimal, surgical fix scoped to one error per
   file. They are scoped into S1 so the closure is reviewable.
2. Installing the **lexical type-level expression** of `READ ≠ WRITE` in the
   proposals plugin: a `IProposalMaterializer` interface that ONLY `proposals`
   tools can call, declared in `plugins/proposals/src/public/index.ts`, and a
   runtime guard in `create_proposal` that rejects calls coming from
   read-only call sites.
3. Adding a **read-only diagnostic tool** `proposals_db_status` that returns
   the current status of the proposals index (counts, last-sync timestamp,
   quarantine size if any). It MUST NOT call any materializer, even when the
   index is corrupt.

## Why this design

**Type-level intent.** TypeScript distinguishes "a function that returns a
value" from "a function that has a side effect on disk" only by convention.
We make the boundary explicit by giving every write-capable tool a parameter
typed as `IProposalMaterializer`, and by extracting `detect_*` and `suggest_*`
helpers that take only `IProposalReader`. The compiler can then prove that a
read-only code path cannot reach a write.

**No behaviour change for the happy path.** The existing `create_proposal`
keeps its current public signature. Internally, the gate that previously
allowed auto-creation from `getProposal` / `listProposals` etc. now rejects
those call sites with `READ_ONLY_VIOLATION`. This is wired in S3 by the new
`assertReadOnlyCall()` helper, which the read-side tools call at the top of
their handler.

**No new persistence in S1-S3.** We do NOT introduce SQLite-backed proposals
here — that is `q00022`. We do NOT introduce the full reconcile-by-SHA
pipeline — that is `q00023` + `q00024`. We do NOT introduce outbox events —
that is `f00514`. This proposal only:

1. Fixes the three typecheck errors (S1).
2. Rebaselines `biome-baseline` so `bun run lint` reflects today's real state
   instead of an aspirational one (S2).
3. Adds the type-level `READ ≠ WRITE` boundary + a read-only diagnostic tool
   (S3).

That is the smallest possible fix that satisfies the audit's P0 requirements
without overshooting into the larger SQLite migration, which needs its own
proposals and review.

## non-goals

- Do NOT migrate `proposals/INDEX.json` to SQLite (q00022).
- Do NOT add `revision`/CAS to proposals (r00048).
- Do NOT change the lifecycle state machine (r00047).
- Do NOT add lifecycle events / outbox (f00514).
- Do NOT make `proposals_sync_proposals` reconcile by SHA (q00023).
- Do NOT touch any currently-blocked proposal in `docs/delendai/proposals/blocked`.

## Slices

- global_gate: lint

### S1 — Fix the three typecheck regressions on develop

- **Status**: done
- **Files**:
  - `packages/core/tests/src/lib/contracts/workflow-contribution.spec.ts`
  - `plugins/web-fetch/tests/src/lib/network-capability.spec.ts`
  - `tools/scripts/lint/routing-coherence.script.ts`
- **Gate**: type
- acceptance:
  - `bun run typecheck` exits 0 with no new tools/ errors beyond the baseline.
  - `bunx vitest run packages/core/tests/src/lib/contracts/workflow-contribution.spec.ts` still passes.
  - `bunx vitest run plugins/web-fetch/tests/src/lib/network-capability.spec.ts` still passes.
  - `bun tools/scripts/lint/routing-coherence.script.ts` still passes its lint self-check (no semantic behaviour change).
- shipped-in: 887d8a885 + 2701810c4 (S1.17 scaffold alignment)
- notes: Follow-up S1.x sub-slices landed in `ed163b6dd` (S1.15), `782c1a5d1` (S1.13), `9481d0177` (S1.10), `8c8055097` (S1.9) — all merged to develop.

### S2 — Rebaseline biome-baseline + cache baseline

- **Status**: done
- **Files**:
  - `tools/scripts/lint/biome-baseline.json`
- **Gate**: type
- acceptance:
  - `bun tools/scripts/lint/biome-baseline.script.ts --update` succeeds and rewrites the baseline file to the **current** real counts, NOT an aspirational one.
  - `bun run lint` exits 0.
  - The new baseline file is committed in full, not as a partial diff.
  - No `biome ci --write` is run; only the ratchet script's `--update` is invoked.
- shipped-in: 764495440 + ef34ce71c + ed163b6dd (concurrent rebaseline runs)

### S3 — `IProposalMaterializer` boundary + `proposals_db_status` read-only diagnostic tool

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/public/index.ts`
  - `plugins/proposals/src/lib/contracts/materializer.contract.ts`
  - `plugins/proposals/src/lib/tools/status.tool.ts`
  - `plugins/proposals/tests/src/lib/contracts/materializer.contract.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/status.tool.spec.ts`
- **Gate**: type
- acceptance:
  - `IProposalMaterializer` and `IProposalReader` are declared as distinct interfaces in `materializer.contract.ts`.
  - `IProposalMaterializer` exposes ONLY `materialize({ kind, payload }): Promise<IMaterializerOutcome>`.
  - `IProposalReader` exposes ONLY `get/list/search/suggest` (no write method).
  - `proposals_db_status` is declared with `outputSchema`, does not accept a materializer dependency, and returns `{ proposals, plans, slices, indexes, lastSyncAt, quarantineCount }` all from a SINGLE read transaction.
  - When called while the legacy index is corrupt, the tool returns the corrupt-count in its output rather than re-creating or fixing anything.
  - `assertReadOnlyCall(callSite)` rejects any caller that has a `IProposalMaterializer` in its dependency graph with `READ_ONLY_VIOLATION` (error code `DLND-PROP-007`).
  - `bun run validate` is green end-to-end.

## acceptance

- `bun run validate` is green end-to-end.
- `x00506` can be closed (its reviewer + implementer + evidence are already in place; this proposal unblocks it by clearing the gate).
- The `IProposalMaterializer` boundary is the canonical expression of `READ ≠ WRITE` for sibling proposals (`r00047`, `r00048`, `q00022`, `f00514`, `f00515`) to consume.

## notes

- This proposal is the smallest possible P0 fix; the deeper SQLite migration
  is `q00022` and friends.
- `biome-baseline --update` is intentional and reviewed; the baseline is
  allowed to grow as long as it grows to reflect REAL state, not aspirational.