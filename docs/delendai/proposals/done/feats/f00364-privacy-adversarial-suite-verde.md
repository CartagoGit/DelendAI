---
id: f00364
title: "privacy adversarial suite verde."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#privacy-adversarial-suite-verde
shipped-in: ["e746316dca20027867ce1d8efee9248dde60c17e"]
last-transition-id: ac7bae7b-41a9-4466-a7ef-e22eddd3cbf1
last-correlation-id: ac7bae7b-41a9-4466-a7ef-e22eddd3cbf1
last-transition-from: review
---

# f00364 — privacy adversarial suite verde.

## Goal

Migrated work item: privacy adversarial suite verde..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00364-privacy-adversarial-suite-verde.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun test plugins/error-reporting/tests/privacy-adversarial.spec.ts' -> 3 pass, 0 fail, 467 expect() calls and 'bun test plugins/error-reporting/tests/privacy-adversarial-llm-suffix-spoofing.spec.ts' -> 8 pass, 0 fail, 12 expect() calls; confirmed test:privacy-adversarial is wired into package.json's validate:run. Acceptance genuinely met.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#privacy-adversarial-suite-verde` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun test plugins/error-reporting/tests/privacy-adversarial.spec.ts' -> 3 pass, 0 fail, 467 expect() calls and 'bun test plugins/error-reporting/tests/privacy-adversarial-llm-suffix-spoofing.spec.ts' -> 8 pass, 0 fail, 12 expect() calls; confirmed test:privacy-adversarial is wired into package.json's validate:run. Acceptance genuinely met.

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): plugins/error-reporting/tests/privacy-adversarial.spec.ts and privacy-adversarial-llm-suffix-spoofing.spec.ts exist and are green. Ran 'bun test plugins/error-reporting/tests/privacy-adversarial.spec.ts' -> 3 pass, 0 fail, 467 expect() calls. This is also wired into the repo's own validate pipeline as 'test:privacy-adversarial' inside package.json's validate:run script. Acceptance genuinely met; closing.
