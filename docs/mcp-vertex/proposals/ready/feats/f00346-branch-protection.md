---
id: f00346
title: "branch protection."
kind: feat
status: ready
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#branch-protection
shipped-in: ["e1ee275a4", "305515338"]
---

# f00346 — branch protection.

## Goal

Migrated work item: branch protection..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `ready/feats/f00346-branch-protection.md`
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

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#branch-protection` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Verified 2026-09-01

- The prior review-log's premise was false: a00092 is present and this
  title maps to §18 CI-004/CI-005 (required checks on `develop` and
  `main`). Verified against the current codebase: `.github/branch-protection.yml`
  + `.github/branch-protection.ts` (created in `e1ee275a4`,
  ci(track-g): harden develop checks and proposal evidence gate) declare
  the policy, `tools/scripts/ci/verify-branch-protection.script.ts` +
  `tools/scripts/ci/verify-develop-health.script.ts` +
  `tools/scripts/ci/verify-main-health.script.ts` (from `305515338`)
  enforce it, and `packages/cli/src/lib/doctor/checks/branch-protection.check.ts`
  surfaces drift. Ran the specs directly:
  `bun run vitest run tools/scripts/ci/verify-branch-protection.spec.ts tools/tests/ci/lib/github-protection.lib.spec.ts tools/tests/ci/verify-develop-health.spec.ts tools/tests/ci/verify-main-health.spec.ts`
  → 4 files, 48 tests passed.
- Closing on this evidence, not on the "no actionable scope" claim.


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
