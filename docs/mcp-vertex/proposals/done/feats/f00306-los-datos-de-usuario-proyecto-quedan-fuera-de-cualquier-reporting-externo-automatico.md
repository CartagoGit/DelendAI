---
id: f00306
title: "Los datos de usuario/proyecto quedan fuera de cualquier reporting externo automático."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#los-datos-de-usuario-proyecto-quedan-fuera-de-cualquier-reporting-externo-automatico
shipped-in: ["07225dbf7"] # migration commit that created this proposal file; no code change required (book-keeping only)
last-transition-id: 5a802f44-92b5-499e-a907-d2f6cb7d10ef
last-correlation-id: 5a802f44-92b5-499e-a907-d2f6cb7d10ef
last-transition-from: in-progress
---

# f00306 — Los datos de usuario/proyecto quedan fuera de cualquier reporting externo automático.

## Goal

Migrated work item: Los datos de usuario/proyecto quedan fuera de cualquier reporting externo automático..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00306-los-datos-de-usuario-proyecto-quedan-fuera-de-cualquier-reporting-externo-automatico.md`
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
- review-reviewer: sonnet-reviewer-2
- review-log: approved by sonnet-reviewer-2 — Verified independently: migration source is NOT gone - survives in done/audits/a00092 (Section 1 privacy invariant + ER-002/003/004/007). Checked plugins/error-reporting: ISafeMcpVertexReport DTO (reporter.interface.ts) carries only packageId/safeToolId/errorCode/failureClass/fingerprint/mcpFrames/syntheticExample - no message/stack/args/cwd/path/repo fields; privacy-validator.helper.ts blocks absolute-path/windows-path/url-not-allowlisted/email/ip/uuid/token/git-metadata/branch-name/json/xml/sql fragments by construction. Ran the adversarial privacy suites: tests/privacy-adversarial.spec.ts, tests/privacy-validator.spec.ts, tests/privacy-adversarial-llm-suffix-spoofing.spec.ts -> 19/19 passed.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#los-datos-de-usuario-proyecto-quedan-fuera-de-cualquier-reporting-externo-automatico` by `proposal_adopt`
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
