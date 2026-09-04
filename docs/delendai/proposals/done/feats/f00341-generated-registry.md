---
id: f00341
title: "generated registry"
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#generated-registry
last-transition-id: 41c1e964-71da-4cb8-9d41-81b7ac9eb494
last-correlation-id: 41c1e964-71da-4cb8-9d41-81b7ac9eb494
last-transition-from: in-progress
---

# f00341 — generated registry

## Goal

Document the recovered MAN-003 scope in canonical proposal form and
record that the first-party plugin registry is already generated from
plugin manifests rather than maintained by hand.

## Why

The migrated source item was originally closed with placeholder
book-keeping notes. This proposal keeps the status unchanged but
replaces that migration noise with the real derived scope, the owned
implementation surface, and focused validation evidence.

## Non-Goals

- Introduce new registry-generation behavior.
- Fold adjacent manifest-generator work, such as preset data or docs,
  into this proposal.
- Preserve placeholder migration review logs once the real scope is
  captured here.

## Slices

### S1 — Canonicalize recovered scope and evidence

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00341-generated-registry.md`
- **Gate**: `npx vitest run tools/scripts/generate/from-manifests.script.spec.ts`
- **Acceptance**:
  - The proposal states the recovered MAN-003 scope in canonical terms.
  - The proposal identifies the generator entrypoint and generated
    registry artifact that satisfy the scope.
  - The proposal records focused validation evidence for the documented
    behavior.

## Acceptance

- First-party plugin registry entries are generated from
  `plugin.manifest.ts` inputs, not maintained as a hand-written array.
- The implementation path from manifest discovery to generated registry
  output is explicit in this proposal.
- Focused validation evidence is captured for the existing
  implementation.

## Evidence

- Recovered source scope: MAN-003, "Generator de registry", from
  `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`
  calls for generating the first-party plugin registry from plugin
  manifests.
- Existing implementation: `tools/scripts/generate/from-manifests.script.ts`
  discovers manifests via `discoverPluginManifests` and
  `parsePluginManifest`, then writes
  `packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts`
  as `GENERATED_FIRST_PARTY_MANIFEST_ENTRIES`.
- Validation: `npx vitest run tools/scripts/generate/from-manifests.script.spec.ts`
  passed on 2026-09-02.

## Notes

- Migrated from
  `docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#generated-registry`.
- This remains a documentary cleanup only; status and transition
  metadata are intentionally unchanged.
