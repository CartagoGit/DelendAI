---
id: f00371
title: "vertex tiene budget explícito."
kind: feat
status: in-progress
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#vertex-tiene-budget-explicito
shipped-in: ["71fb21cf5977c16db1720c1b36463ec10029b50b"]
last-transition-id: 1ac33533-7983-4bb8-882a-f8e07ecc40d9
last-correlation-id: 1ac33533-7983-4bb8-882a-f8e07ecc40d9
last-transition-from: ready
---

# f00371 — vertex tiene budget explícito.

## Goal

Migrated work item: vertex tiene budget explícito..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/in-progress/f00371-vertex-tiene-budget-explicito.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#vertex-tiene-budget-explicito` by `proposal_adopt`
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

Independent re-verification (sonnet-verifier-8): packages/core/src/lib/contracts/constants/token-budgets.constant.ts defines an explicit 'vertex' preset profile with hard=384,000 / warning=320,000 toolsList ceilings and its own marginalPluginHard/marginalPluginWarning (80,000/70,000), addressing TOK2-006's 'crear hard/warning explícitos también para vertex, no solo swarm/lean'. Ran 'bun run tokens:gate' live: '[vertex] 197 tools, 262,834 B tools/list — tools/list: 262,834 B (warning 320,000 / hard 384,000) => ok'. Explicit budget exists and the live measurement is within it. Acceptance genuinely met; closing.
