---
id: f00298
title: "`tools/list` tiene budget visible por preset/plugin."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
shipped-in: ["1bcc6f491"]  # docs(proposals): mark 94 migrated TODO placeholders done
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#tools-list-tiene-budget-visible-por-preset-plugin
last-transition-id: b3db7e33-0035-4cb9-853c-ecd8fcad54f9
last-correlation-id: b3db7e33-0035-4cb9-853c-ecd8fcad54f9
last-transition-from: in-progress
---

# f00298 — `tools/list` tiene budget visible por preset/plugin.

## Goal

Migrated work item: `tools/list` tiene budget visible por preset/plugin..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00298-tools-list-tiene-budget-visible-por-preset-plugin.md`
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
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 TOK-001, tools/list as first-order cost with per-preset/plugin breakdown) is shipped: docs/mcp-vertex/TOKEN-BUDGETS.md is a generated dashboard with per-preset and per-plugin bytes breakdown, built by tools/scripts/report/token-budget-dashboard.script.ts (verified presetToolsBudget/presetMarginalBudget/pluginList/pluginCount logic). Ran token-budget-dashboard.spec.ts directly (not full `bun run validate`, per reviewer instructions): 21 tests pass, exit 0. Bulk-close review-log claiming 'no actionable scope' was false; source audit a00092 is present at docs/mcp-vertex/proposals/done/audits/a00092-*.md.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#tools-list-tiene-budget-visible-por-preset-plugin` by `proposal_adopt`
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
