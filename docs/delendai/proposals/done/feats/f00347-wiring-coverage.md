---
id: f00347
title: "wiring coverage."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#wiring-coverage
shipped-in: ["87f3f269f"]
last-transition-id: 23e7b701-5ca3-4c25-95cc-03c7838e4c6b
last-correlation-id: 23e7b701-5ca3-4c25-95cc-03c7838e4c6b
last-transition-from: in-progress
---

# f00347 — wiring coverage.

## Goal

Migrated work item: wiring coverage..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00347-wiring-coverage.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
- review-state: done
- review-implementer: copilot-orchestrator-bulk-retire-placeholders
- review-reviewer: sonnet-verifier-7
- review-log: approved by sonnet-verifier-7 — Independently verified against a00092 section 19 TEST-001; vitest.config.ts's isPureBarrelIndex() detection (shipped in 87f3f269f, t00006) covers real wiring code in index.ts instead of blanket-excluding it.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#wiring-coverage` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Verified 2026-09-01

- The prior review-log's premise was false: a00092 is present and this
  title maps to §19 TEST-001 ("Revisar exclusión global de `index.ts`" —
  a lot of real wiring code lives in barrel files, so excluding all
  `index.ts` from coverage hides it; propose excluding only pure-barrel
  files by detection). Verified against the current codebase:
  `vitest.config.ts` implements exactly this — `isPureBarrelIndex()`
  statically detects barrel-only `index.ts` files and only those are
  coverage-excluded (`pureBarrelCoverageExcludes`), landed in `87f3f269f`
  (test(t00006): cobertura — barrels por detección, apps/web y
  property-based).
- Closing on this evidence, not on the "no actionable scope" claim.


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
