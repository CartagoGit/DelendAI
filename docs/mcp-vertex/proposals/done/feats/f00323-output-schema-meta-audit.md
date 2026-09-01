---
id: f00323
title: "Output schema/meta audit."
kind: feat
status: done
type: proposal
track: migrated
shipped-in: ["1bcc6f491717d22ab8514a1ca00b36ec956cb097"]  # bulk book-keeping close of migrated placeholder
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#output-schema-meta-audit
last-transition-id: 162005e2-b077-48d8-98ad-f483f5974a83
last-correlation-id: 162005e2-b077-48d8-98ad-f483f5974a83
last-transition-from: in-progress
---

# f00323 — Output schema/meta audit.

## Goal

Migrated work item: Output schema/meta audit..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00323-output-schema-meta-audit.md`
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
- review-reviewer: sonnet-reviewer-5
- review-log: approved by sonnet-reviewer-5 — Independent review: audit TODO MCP-001/MCP-002 (post-hoc advisory metadata like logHint/checkpoint/__stuck_detected/handoffPath must not violate a tool's outputSchema; needs an envelope/meta channel) is shipped via x00229 (commits ff476e024, 22ef3a31c): tool-response.ts ensureToolResultMeta/injectToolResultMeta write advisories into result._meta (the MCP-native, schema-unvalidated channel), never into structuredContent; instrument-tool-handlers.helper.ts routes logHint/checkpoint/stuck/handoffPath through this. Verified with tool-response.golden.spec.ts and tool-response.spec.ts (passing).
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#output-schema-meta-audit` by `proposal_adopt`
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
