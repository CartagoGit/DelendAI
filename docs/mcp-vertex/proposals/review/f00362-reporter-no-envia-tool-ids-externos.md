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
- **review-log**: approved by sonnet-verifier-11 -- confirmed commit 0d546d5eb (x00245, derive safe tool identity from registry) is an ancestor of develop HEAD and 'internalOnly' grep against plugins/error-reporting/src/lib/contracts/constants/options.constant.ts returns nothing (no external toolId surface). Acceptance genuinely met.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#reporter-no-envia-tool-ids-externos` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- confirmed commit 0d546d5eb (x00245, derive safe tool identity from registry) is an ancestor of develop HEAD and 'internalOnly' grep against plugins/error-reporting/src/lib/contracts/constants/options.constant.ts returns nothing (no external toolId surface). Acceptance genuinely met.

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): this exact concern was already fixed and shipped as x00245 (docs/mcp-vertex/proposals/done/fixes/x00245-*.md, shipped-in 0d546d5eb, commit 'fix(error-reporting): derive safe tool identity from registry'), which replaced raw toolName passthrough with an ISafeToolIdentity registry-driven lookup so no external/host tool name reaches the public DTO. Confirmed the commit is on develop's history and the sibling x00249 (LLM tool provenance via IToolIdentityRegistry) hardens the LLM-surface case too. Acceptance genuinely met by already-shipped work; closing.
