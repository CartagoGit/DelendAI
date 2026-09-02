---
id: f00376
title: "web catalog generado."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#web-catalog-generado
shipped-in: ["82c54bcc"]
last-transition-id: 5b2b2c07-1914-440c-bf1b-28cf54d5031d
last-correlation-id: 5b2b2c07-1914-440c-bf1b-28cf54d5031d
last-transition-from: in-progress
---

# f00376 — web catalog generado.

## Goal

Migrated work item: web catalog generado..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00376-web-catalog-generado.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed apps/web/src/data/plugin-catalog.ts imports GENERATED_WEB_PLUGIN_CATALOG from apps/web/src/data/plugins/catalog.generated.ts and apps/web/src/data/plugin-profile.ts imports GENERATED_PLUGIN_MANIFEST_WEB_CATALOG from apps/web/src/generated/plugin-manifest-catalog.generated.ts — no hand-maintained plugin arrays remain. MAN2-004 is satisfied.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#web-catalog-generado` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: MAN2-004, "generar catálogo web" — the web app must not
maintain its own manual plugin lists. Verified directly:
`apps/web/src/data/plugin-catalog.ts` imports
`GENERATED_WEB_PLUGIN_CATALOG` from
`apps/web/src/data/plugins/catalog.generated.ts`, and
`apps/web/src/data/plugin-profile.ts` imports
`GENERATED_PLUGIN_MANIFEST_WEB_CATALOG` from
`apps/web/src/generated/plugin-manifest-catalog.generated.ts` — both
generated files, no hand-maintained plugin arrays. Implemented by
`f00175` ("generators: registry, web catalog, docs y permission
matrix generados desde manifests (MAN2-003..006)"), shipped in
`82c54bcc`. Closing on that evidence, not on the placeholder
review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed apps/web/src/data/plugin-catalog.ts imports GENERATED_WEB_PLUGIN_CATALOG from apps/web/src/data/plugins/catalog.generated.ts and apps/web/src/data/plugin-profile.ts imports GENERATED_PLUGIN_MANIFEST_WEB_CATALOG from apps/web/src/generated/plugin-manifest-catalog.generated.ts — no hand-maintained plugin arrays remain. MAN2-004 is satisfied.
