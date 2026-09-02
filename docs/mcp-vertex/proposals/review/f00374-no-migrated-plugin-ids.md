---
id: f00374
title: "no `MIGRATED_PLUGIN_IDS`."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#no-migrated-plugin-ids
shipped-in: ["d98f3fd6"]
last-transition-id: c1c2fbff-a154-46c7-983b-4b88eff2b114
last-correlation-id: c1c2fbff-a154-46c7-983b-4b88eff2b114
last-transition-from: in-progress
---

# f00374 — no `MIGRATED_PLUGIN_IDS`.

## Goal

Migrated work item: no `MIGRATED_PLUGIN_IDS`..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00374-no-migrated-plugin-ids.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — ran `grep -rn MIGRATED_PLUGIN_IDS --include=*.ts .` (zero hits outside node_modules) and `bun tools/scripts/lint/check-generated-artifacts.script.ts` myself ("All generated artifacts are in sync"), confirming the generated registry at packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts replaces the manual list. MAN2-001 is satisfied.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#no-migrated-plugin-ids` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: MAN2-001, "eliminar `MIGRATED_PLUGIN_IDS`" — replace the
manual list of migrated plugins with a generated registry so a new
plugin with a manifest is picked up automatically. Verified directly:
`grep -rn "MIGRATED_PLUGIN_IDS" **/*.ts` returns zero hits anywhere in
the current source tree — no manual list exists. In its place,
`packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts`
is generated straight from every plugin's `plugin.manifest.ts` by
`tools/scripts/generate/first-party-plugin-index.script.ts`, and
`bun tools/scripts/lint/check-generated-artifacts.script.ts` confirms
it (and the other manifest-derived artifacts) has no drift. Shipped
by `r00016` (`d98f3fd6e`). Closing on that evidence, not on the
placeholder review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — ran `grep -rn MIGRATED_PLUGIN_IDS --include=*.ts .` (zero hits outside node_modules) and `bun tools/scripts/lint/check-generated-artifacts.script.ts` myself ("All generated artifacts are in sync"), confirming the generated registry at packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts replaces the manual list. MAN2-001 is satisfied.
