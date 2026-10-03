---
id: f00365
title: "stale reclaim race reproducido o descartado con test determinista."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#stale-reclaim-race-reproducido-o-descartado-con-test-determinista
shipped-in: ["7bb6d35138db047d35491c68eebfd2435b897b12"]
last-transition-id: 53ccd062-0380-467b-8af5-cdcd64770d96
last-correlation-id: 53ccd062-0380-467b-8af5-cdcd64770d96
last-transition-from: review
---

# f00365 — stale reclaim race reproducido o descartado con test determinista.

## Goal

Migrated work item: stale reclaim race reproducido o descartado con test determinista..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00365-stale-reclaim-race-reproducido-o-descartado-con-test-determinista.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun test packages/core/tests/src/lib/shared/with-file-mutex-reclaim.spec.ts packages/core/tests/src/lib/shared/with-file-mutex.spec.ts packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts' -> 17 pass, 0 fail, 473 expect() calls; confirmed commit 7bb6d3513 (x00219, CAS/lease stale reclaim) is an ancestor of develop HEAD. Acceptance genuinely met.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#stale-reclaim-race-reproducido-o-descartado-con-test-determinista` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun test packages/core/tests/src/lib/shared/with-file-mutex-reclaim.spec.ts packages/core/tests/src/lib/shared/with-file-mutex.spec.ts packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts' -> 17 pass, 0 fail, 473 expect() calls; confirmed commit 7bb6d3513 (x00219, CAS/lease stale reclaim) is an ancestor of develop HEAD. Acceptance genuinely met.

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): the race was reproduced and fixed at x00219 (shipped-in 7bb6d3513, 'fix(mutex): x00219 — reclaim seguro de stale lock (CAS/lease) + métricas de contención'). A deterministic regression test exists: packages/core/tests/src/lib/shared/with-file-mutex-reclaim.spec.ts::'does not reclaim when a holder heartbeats between stale observation and reclaim' plus 'reclaims a genuinely stale lock and enters the critical section'. Ran 'bun test packages/core/tests/src/lib/shared/with-file-mutex-reclaim.spec.ts packages/core/tests/src/lib/shared/with-file-mutex.spec.ts packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts' -> 17 pass, 0 fail, 473 expect() calls. Acceptance genuinely met; closing.
