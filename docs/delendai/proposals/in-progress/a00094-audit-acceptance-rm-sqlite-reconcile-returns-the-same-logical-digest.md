---
id: a00094
title: "Audit acceptance — `rm sqlite && reconcile` returns the same logical digest"
kind: audit
status: in-progress
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-DIGEST-EQUALITY-018
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - q00023
  - q00024
last-transition-id: a00094-start-2026-09-07
last-correlation-id: a00094-autonomous-orchestration
last-transition-from: ready
last-idempotency-key: a00094-start-1
---

# a00094 — Audit acceptance: rm sqlite + reconcile == same logical digest

## Goal

Codify the audit's "obligatory test" as a permanent CI check:

```text
rm .delendai/state/proposals.sqlite
delendai reconcile --sha <commit>
digest_before == digest_after
```

This is the canary that turns "SQLite as source of truth" from a
slide into a verified invariant. The audit explicitly calls it
"obligatorio":

> Un test que considero obligatorio. Borrar DB: `rm state.sqlite`.
> Después: `delendai reconcile`. Y comparar: `digest before ==
> digest after`. Si no coincide, hay un bug. Este test debería
> ejecutarse en CI.

## Why

The proposals plugin today has no end-to-end rebuild test; the only
guarantees are (a) incremental updates work and (b) the index JSON
is consistent with the filesystem. There is no test that says
"deleting the operational state and rebuilding it from Git gives the
same answer". Adding this test is what closes the gap between
"works for normal updates" and "works for catastrophic recovery".

## Why this design

**Same SHA in, same SHA out.** The test captures a `digestBefore`
against a known fixture (50+ proposals, plans and slices), deletes
the active DB, runs `reconcile({ mode: 'shadow', sha })`, promotes,
and asserts `digestAfter === digestBefore`.

**Runs in CI.** The test is wired into `ci.yml` as a separate job
(`delendai-rebuild-digest`) so a regression fails the build.

**100 iterations, no flakes.** The test runs the round trip 100
times against the same fixture and verifies zero drift. The audit
mandates this.

**Property-based.** A second test uses `fast-check` to generate
random sequences of `create / update / close / resurrect` and
verifies `digest_before == digest_after` after every sequence.

## verified state

Pending — q00022 S5 (digest rebuild test) is not yet implemented. The
proposal is the canonical "what success looks like" before that
slice lands; nothing is being claimed as verified until the e2e
suite ships and goes green in CI.

## findings

Pending — this proposal is the FINDING itself. The `## findings`
section is the place to enumerate the current audit failures; until
the rest of q00022 lands, the only finding is "no rebuild-digest
test exists for the proposals plugin".

## scoreboard

| Dimension | Score | Note |
| --- | --- | --- |
| rebuild-digest test | 0/1 | not implemented (this proposal adds it) |
| CI job | 0/1 | not wired (this proposal adds it) |
| property-based test | 0/1 | not implemented (this proposal adds it) |
| rebuild on race | 0/1 | covered indirectly via q00024 (atomic reconcile) |

## non-goals

- Do NOT add a separate digest for `@delendai/state`; the State
  Engine DB already has parity tests in q00019 S5.
- Do NOT change the digest algorithm; SHA-256 over canonical
  projections is fixed by `q00022 S3`.

## Slices

- global_gate: e2e

### S1 — `digest-rebuild.e2e.spec.ts`: rm + reconcile == same digest, 100 iterations

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts`
    (new)
  - `packages/proposals-sqlite/tests/fixtures/large-proposal-set.ts`
    (new — 50+ proposals / plans / slices fixture)
- **Gate**: e2e
- acceptance:
  - The test captures `digestBefore`, deletes the active DB, runs
    `reconcile({ mode: 'shadow', sha })`, promotes, and asserts
    `digestAfter === digestBefore`.
  - The test runs 100 times against the same fixture and never
    flakes.
  - `bunx vitest run packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts`
    exits 0.

### S2 — Property-based test: random CRUD sequences preserve the digest invariant

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/tests/e2e/digest-property.spec.ts`
    (new — `fast-check` based)
- **Gate**: e2e
- acceptance:
  - `fast-check` generates random sequences of
    `createProposal | updateProposal | transitionProposal |
    closeProposal | reopenProposal | createPlan | createSlice`.
  - For each sequence, the test runs the sequence against the DB,
    captures `digestBefore`, deletes the DB, rebuilds, and asserts
    `digestAfter === digestBefore`.
  - 50 iterations are run; the test exits 0.
  - `fast-check` shrinking produces the smallest failing sequence
    on regression.

### S3 — CI job: `delendai-rebuild-digest` runs on every PR and on every push to develop

- **Status**: pending
- **Files**:
  - `.github/workflows/ci.yml` (modified — adds the new job)
  - `tools/scripts/ci/rebuild-digest.script.ts` (new — thin
    wrapper that orchestrates the round trip)
  - `tools/tests/ci/rebuild-digest.script.spec.ts` (new)
- **Gate**: lint
- acceptance:
  - The new job runs `bun tools/scripts/ci/rebuild-digest.script.ts`
    on the same fixture used in S1.
  - The job fails if `digestAfter !== digestBefore`.
  - The branch protection from `c00528` references this job as a
    required check.

## acceptance

- All S1-S3 slices land.
- The CI build fails on any regression in the rebuild-digest
  invariant.
- The audit's "obligatorio" test is permanently codified.

## notes

- The test fixture is intentionally large (50+ entities) so that
  ordering bugs in the digest projection surface immediately.
- This proposal closes the loop on the entire migration: the
  proposals plugin has a verified, CI-gated, rebuild-digest
  invariant that turns "SQLite as source of truth" into a tested
  property.