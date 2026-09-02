---
id: f00370
title: "proposals static cost reducido o justificado."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#proposals-static-cost-reducido-o-justificado
shipped-in: ["71fb21cf5977c16db1720c1b36463ec10029b50b"]
last-transition-id: 5680b7ac-63ac-4b23-adca-021beda2eb51
last-correlation-id: 5680b7ac-63ac-4b23-adca-021beda2eb51
last-transition-from: in-progress
---

# f00370 — proposals static cost reducido o justificado.

## Goal

Migrated work item: proposals static cost reducido o justificado..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00370-proposals-static-cost-reducido-o-justificado.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun run tokens:gate'; live measurement: proposals plugin measures 50,347 B, under the governed marginalPluginHard=80,000 B ceiling in packages/core/src/lib/contracts/constants/token-budgets.constant.ts (lines ~285-292); confirmed commit 71fb21cf5 (x00283) is an ancestor of develop HEAD. Justified-branch acceptance genuinely met.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#proposals-static-cost-reducido-o-justificado` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun run tokens:gate'; live measurement: proposals plugin measures 50,347 B, under the governed marginalPluginHard=80,000 B ceiling in packages/core/src/lib/contracts/constants/token-budgets.constant.ts (lines ~285-292); confirmed commit 71fb21cf5 (x00283) is an ancestor of develop HEAD. Justified-branch acceptance genuinely met.

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): a second audit pass (a00093, TOK2-005) flagged the 'proposals' plugin's static schema cost (~76,776 B measured at audit time) with a target of '<40 KB static o justificar otro target'. This was resolved by x00283 (docs/mcp-vertex/proposals/done/fixes/x00283-*.md, shipped-in 71fb21cf597, 'fix(tokens): budget ceilings that can refuse a raise, and one honest wire measurement') which chose the 'justify' branch: it introduced an explicit, documented marginalPluginHard/marginalPluginWarning governance ceiling (80,000/70,000 bytes) for the full/vertex presets specifically because they carry 'proposals' at its measured size, with an inline comment explaining the decision (packages/core/src/lib/contracts/constants/token-budgets.constant.ts lines ~285-292). Ran 'bun run tokens:gate' live: 'proposals' currently measures 50,347 B in the vertex/full/swarm presets, under the governed 80,000 B ceiling, and 'bun run tokens:ceiling-ratchet' confirms no undocumented raise. Acceptance genuinely met (justified branch, not reduced-below-40KB branch); closing.
