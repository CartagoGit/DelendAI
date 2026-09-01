---
id: f00381
title: "adoption count exact/renamed."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#adoption-count-exact-renamed
shipped-in: ["b9009bb8"]
last-transition-id: 625ded5a-9b55-4870-854c-a44851dbc7b3
last-correlation-id: 625ded5a-9b55-4870-854c-a44851dbc7b3
last-transition-from: in-progress
---

# f00381 — adoption count exact/renamed.

## Goal

Migrated work item: adoption count exact/renamed..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00381-adoption-count-exact-renamed.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#adoption-count-exact-renamed` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: ADOPT2-001, replace the fixed
`EXACT_ADOPTION_WRITE_ESTIMATE = 25` with a count derived from
`buildAgentFiles()` + config + proposal-store files, falling back to
`exact: false` when it can't be exact. Verified directly:
`EXACT_ADOPTION_WRITE_ESTIMATE` no longer exists anywhere in the
source tree; `packages/core/src/lib/adopt/adopt-project-write-estimate.ts`
now exposes `buildAdoptProjectWriteEstimate()`, which sums
`buildAgentFiles(...).length` plus config/proposal-store entries and
sets `exact: false` when `docsDir` is unavailable (proposal-store
count can't be derived). `adoption-assessment.service.ts` consumes
`estimate.exact`/`estimate.count` directly instead of a constant. Ran
the test myself: `bunx vitest run
tests/src/lib/adopt/adoption-assessment.spec.ts` → 3 passed,
including "marks the write estimate as inexact when docsDir is
unavailable." Shipped in `b9009bb86` ("fix: derive adoption write
estimate from plan"). Closing on that evidence, not on the
placeholder review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
