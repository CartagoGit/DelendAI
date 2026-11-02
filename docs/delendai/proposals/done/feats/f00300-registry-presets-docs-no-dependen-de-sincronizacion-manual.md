---
id: f00300
title: "Registry/presets/docs no dependen de sincronización manual."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
shipped-in: ["1bcc6f491"]  # docs(proposals): mark 94 migrated TODO placeholders done
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#registry-presets-docs-no-dependen-de-sincronizacion-manual
last-transition-id: aa13b2ba-6ac0-409f-8199-f39cb52eaaab
last-correlation-id: aa13b2ba-6ac0-409f-8199-f39cb52eaaab
last-transition-from: in-progress
---

# f00300 — Registry/presets/docs no dependen de sincronización manual.

## Goal

Migrated work item: Registry/presets/docs no dependen de sincronización manual..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00300-registry-presets-docs-no-dependen-de-sincronizacion-manual.md`
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
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 REG-002/REG-003 + section 21 MAN-001..007, manual arrays replaced by plugin.manifest.ts + generators for registry/web/docs/token-budgets/permissions) is shipped, done under a different proposal id: r00016 (registry: plugin manifests como unica fuente de verdad y generadores derivados, status done) explicitly cites and closes REG-002/003/004, MAN-001..010, DOC-003. Verified: 56 plugin.manifest.ts files exist (e.g. plugins/browser, plugins/security), define-plugin-manifest.ts + permissions.schema.ts + generated artifacts docs/mcp-vertex/generated/plugin-manifests.generated.{md,json} + apps/web/src/generated/plugin-manifest-catalog.generated.ts. Ran define-plugin-manifest.spec.ts + plugin-manifest.script.spec.ts: 25 tests pass, exit 0.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#registry-presets-docs-no-dependen-de-sincronizacion-manual` by `proposal_adopt`
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
