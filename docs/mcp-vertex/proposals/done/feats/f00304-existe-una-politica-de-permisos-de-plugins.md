---
id: f00304
title: "Existe una política de permisos de plugins."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
shipped-in: ["1bcc6f491"]  # docs(proposals): mark 94 migrated TODO placeholders done
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#existe-una-politica-de-permisos-de-plugins
last-transition-id: e8d1571c-5966-4cc5-8db7-80f838881764
last-correlation-id: e8d1571c-5966-4cc5-8db7-80f838881764
last-transition-from: in-progress
---

# f00304 — Existe una política de permisos de plugins.

## Goal

Migrated work item: Existe una política de permisos de plugins..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00304-existe-una-politica-de-permisos-de-plugins.md`
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
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 section 21 MAN-007 / permissions field in the manifest schema, existe una politica de permisos de plugins) is shipped: packages/core/src/lib/manifest/permissions.schema.ts defines a canonical PERMISSION_CATEGORIES enum + a per-tool toolPermissionsSchema (unique keys, non-empty category subsets); packages/cli/src/lib/doctor/checks/permissions.check.ts statically validates every plugin.manifest.ts's permissions array against that canonical set and flags unknown ones as silent capability loss; docs/mcp-vertex/generated/plugin-manifests.generated.md/.json publish the resulting permission catalog per plugin. This is the permission policy the finding asked for.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#existe-una-politica-de-permisos-de-plugins` by `proposal_adopt`
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
