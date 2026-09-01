---
id: f00301
title: "CI obliga los gates arquitectónicos importantes."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
shipped-in: ["1bcc6f491"]  # docs(proposals): mark 94 migrated TODO placeholders done
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#ci-obliga-los-gates-arquitectonicos-importantes
last-transition-id: 26ca652e-0059-4852-8988-dd424ac87759
last-correlation-id: 26ca652e-0059-4852-8988-dd424ac87759
last-transition-from: in-progress
---

# f00301 — CI obliga los gates arquitectónicos importantes.

## Goal

Migrated work item: CI obliga los gates arquitectónicos importantes..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00301-ci-obliga-los-gates-arquitectonicos-importantes.md`
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
- review-implementer: sonnet-reviewer-6
- review-reviewer: sonnet-reviewer-6-verify
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 CI-001/CI-002/CI-004/CI-005, architectural lints must be required checks, not bundled into one generic 'lint' job) is shipped: .github/workflows/ci.yml has a dedicated lint-architecture job (separate from lint-biome/lint-presets/lint-docs/lint-security/lint-governance) and an aggregating ci-complete job whose `needs` list includes lint-architecture, tokens-budget-real, manifests-check, generated-artifacts-check; .github/branch-protection.yml requires ci-complete + release-pr-gate as required_status_checks on main with enforce_admins true. tier2.yml also runs architecture lint on develop-facing PRs. This is a deliberate, documented split (full gate matrix required on main; lighter feedback on develop, per ci.yml's own header comment), not an oversight.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#ci-obliga-los-gates-arquitectonicos-importantes` by `proposal_adopt`
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
