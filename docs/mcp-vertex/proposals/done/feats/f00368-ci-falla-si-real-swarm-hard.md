---
id: f00368
title: "CI falla si real swarm > hard."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#ci-falla-si-real-swarm-hard
shipped-in: ["71fb21cf5977c16db1720c1b36463ec10029b50b"]
last-transition-id: 6e1b17e8-ccf3-46fc-867c-5815fe127e21
last-correlation-id: 6e1b17e8-ccf3-46fc-867c-5815fe127e21
last-transition-from: review
---

# f00368 — CI falla si real swarm > hard.

## Goal

Migrated work item: CI falla si real swarm > hard..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00368-ci-falla-si-real-swarm-hard.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun run tokens:ceiling-ratchet' -> '54 ceiling(s) checked, no undocumented raise'; confirmed tokens:gate and tokens:ceiling-ratchet are both wired into package.json's validate:run (which gates CI). Acceptance genuinely met.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#ci-falla-si-real-swarm-hard` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-verifier-11 -- independently ran 'bun run tokens:ceiling-ratchet' -> '54 ceiling(s) checked, no undocumented raise'; confirmed tokens:gate and tokens:ceiling-ratchet are both wired into package.json's validate:run (which gates CI). Acceptance genuinely met.

### Verified 2026-09-01

Independent re-verification (sonnet-verifier-8): 'tokens:gate' and 'tokens:ceiling-ratchet' (tools/scripts/lint/token-budget-ceiling-ratchet.script.ts, shipped r00036, 71fb21cf597) are both wired into package.json's validate:run, which gates CI. Ran 'bun run tokens:ceiling-ratchet' directly: '✓ token-budget-ceiling-ratchet: 54 ceiling(s) checked, no undocumented raise.' The ratchet refuses any undocumented ceiling increase (including swarm's), and tokens:gate fails the build if a measured preset exceeds its hard ceiling — this is the CI-fails-if-over-hard mechanism. Acceptance genuinely met; closing.
