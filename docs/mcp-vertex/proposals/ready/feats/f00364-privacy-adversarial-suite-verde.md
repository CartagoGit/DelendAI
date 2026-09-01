---
id: f00364
title: "privacy adversarial suite verde."
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#privacy-adversarial-suite-verde
shipped-in: ["e746316dca20027867ce1d8efee9248dde60c17e"]
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
- **Files**: `ready/feats/f00364-privacy-adversarial-suite-verde.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#privacy-adversarial-suite-verde` by `proposal_adopt`
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

Independent re-verification (sonnet-verifier-8): plugins/error-reporting/tests/privacy-adversarial.spec.ts and privacy-adversarial-llm-suffix-spoofing.spec.ts exist and are green. Ran 'bun test plugins/error-reporting/tests/privacy-adversarial.spec.ts' -> 3 pass, 0 fail, 467 expect() calls. This is also wired into the repo's own validate pipeline as 'test:privacy-adversarial' inside package.json's validate:run script. Acceptance genuinely met; closing.
