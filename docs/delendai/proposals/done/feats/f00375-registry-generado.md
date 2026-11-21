---
id: f00375
title: "registry generado."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#registry-generado
shipped-in: ["82c54bcc"]
last-transition-id: 083d879b-a749-4beb-b234-b120641ec63b
last-correlation-id: 083d879b-a749-4beb-b234-b120641ec63b
last-transition-from: review
---

# f00375 — registry generado.

## Goal

Migrated work item: registry generado..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00375-registry-generado.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts exists and ran `bun tools/scripts/lint/check-generated-artifacts.script.ts` myself ("All generated artifacts are in sync"). MAN2-003 is satisfied.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#registry-generado` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below ("migration source no longer present ...
no actionable scope") was false — the source is MAN2-003 ("generar
`FIRST_PARTY_PLUGIN_INDEX` completo", recovered from commit
`11130767c`: eliminate the manual+generated mix, target a fully
generated registry). This was already implemented by `f00175`
("generators: registry, web catalog, docs y permission matrix
generados desde manifests (MAN2-003..006)"), shipped in `82c54bcc`.
Verified directly: `packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts`
exists and is derived from plugin manifests, and
`bun tools/scripts/lint/check-generated-artifacts.script.ts` (which
regenerates the manifests-derived artifacts including this registry
and diffs against the tracked copy) reports "All generated artifacts
are in sync." Closing on that evidence, not on the placeholder
review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts exists and ran `bun tools/scripts/lint/check-generated-artifacts.script.ts` myself ("All generated artifacts are in sync"). MAN2-003 is satisfied.
