---
id: f00367
title: "real swarm <= hard."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#real-swarm-hard
shipped-in: ["71fb21cf5977c16db1720c1b36463ec10029b50b"]
last-transition-id: 0ed8d1de-3f7a-4944-a675-0a063cb8518b
last-correlation-id: 0ed8d1de-3f7a-4944-a675-0a063cb8518b
last-transition-from: review
---

# f00367 — real swarm <= hard.

## Goal

Migrated work item: real swarm <= hard..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00367-real-swarm-hard.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun run tokens:gate'; live measurement: [swarm] 166 tools, 193,678 B tools/list (warning 204,000 / hard 210,000) => ok. Confirmed commit 71fb21cf5 is an ancestor of develop HEAD. Acceptance genuinely met.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#real-swarm-hard` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun run tokens:gate'; live measurement: [swarm] 166 tools, 193,678 B tools/list (warning 204,000 / hard 210,000) => ok. Confirmed commit 71fb21cf5 is an ancestor of develop HEAD. Acceptance genuinely met.

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): ran 'bun run tokens:gate' (tools/scripts/test/run-actual-preset-budget.script.ts) directly against the live tool registry. Measured output: '[swarm] 166 tools, 193,678 B tools/list — tools/list: 193,678 B (warning 204,000 / hard 210,000) => ok'. The real, currently-measured swarm preset cost is under its documented hard ceiling (packages/core/src/lib/contracts/constants/token-budgets.constant.ts, presets.swarm.toolsList.hard = 210_000). Acceptance genuinely met; closing.
