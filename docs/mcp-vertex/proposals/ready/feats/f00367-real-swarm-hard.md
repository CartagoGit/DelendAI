---
id: f00367
title: "real swarm <= hard."
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#real-swarm-hard
shipped-in: ["71fb21cf5977c16db1720c1b36463ec10029b50b"]
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
- **Files**: `ready/feats/f00367-real-swarm-hard.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#real-swarm-hard` by `proposal_adopt`
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

Independent re-verification (sonnet-verifier-8): ran 'bun run tokens:gate' (tools/scripts/test/run-actual-preset-budget.script.ts) directly against the live tool registry. Measured output: '[swarm] 166 tools, 193,678 B tools/list — tools/list: 193,678 B (warning 204,000 / hard 210,000) => ok'. The real, currently-measured swarm preset cost is under its documented hard ceiling (packages/core/src/lib/contracts/constants/token-budgets.constant.ts, presets.swarm.toolsList.hard = 210_000). Acceptance genuinely met; closing.
