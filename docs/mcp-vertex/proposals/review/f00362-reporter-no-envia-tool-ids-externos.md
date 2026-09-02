---
id: f00362
title: "reporter no envía tool ids externos."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#reporter-no-envia-tool-ids-externos
shipped-in: ["0d546d5eb59311e697f66cc89d5be736de144ad3"]
last-transition-id: 3638961e-f221-4332-84d6-21c0893bd955
last-correlation-id: 3638961e-f221-4332-84d6-21c0893bd955
last-transition-from: in-progress
---

# f00362 — reporter no envía tool ids externos.

## Goal

Migrated work item: reporter no envía tool ids externos..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00362-reporter-no-envia-tool-ids-externos.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#reporter-no-envia-tool-ids-externos` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): this exact concern was already fixed and shipped as x00245 (docs/mcp-vertex/proposals/done/fixes/x00245-*.md, shipped-in 0d546d5eb, commit 'fix(error-reporting): derive safe tool identity from registry'), which replaced raw toolName passthrough with an ISafeToolIdentity registry-driven lookup so no external/host tool name reaches the public DTO. Confirmed the commit is on develop's history and the sibling x00249 (LLM tool provenance via IToolIdentityRegistry) hardens the LLM-surface case too. Acceptance genuinely met by already-shipped work; closing.
