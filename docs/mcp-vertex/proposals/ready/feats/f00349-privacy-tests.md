---
id: f00349
title: "privacy tests."
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#privacy-tests
shipped-in: ["e746316dc"]
---

# f00349 — privacy tests.

## Goal

Migrated work item: privacy tests..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `ready/feats/f00349-privacy-tests.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#privacy-tests` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Verified 2026-09-01

- The prior review-log's premise was false: a00092 is present and this
  title maps to §2 ER-007 ("Test suite adversarial de privacidad").
  Verified against the current codebase:
  `plugins/error-reporting/tests/privacy-adversarial.spec.ts`,
  `privacy-validator.spec.ts`, and
  `privacy-adversarial-llm-suffix-spoofing.spec.ts` (landed in
  `e746316dc`, test(error-reporting): t00005 — suite adversarial de
  privacidad). Ran them directly: `bun run vitest run plugins/error-reporting/tests`
  → passed (included in the 22-file/160-test run below).
- Closing on this evidence, not on the "no actionable scope" claim.


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
