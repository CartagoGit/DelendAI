---
id: f00373
title: "todos los plugins públicos con manifest."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#todos-los-plugins-publicos-con-manifest
shipped-in: ["d98f3fd6"]
last-transition-id: 5a3408f4-84c1-48e3-9d95-1aecbc790ddb
last-correlation-id: 5a3408f4-84c1-48e3-9d95-1aecbc790ddb
last-transition-from: in-progress
---

# f00373 — todos los plugins públicos con manifest.

## Goal

Migrated work item: todos los plugins públicos con manifest..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00373-todos-los-plugins-publicos-con-manifest.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — ran `find plugins -maxdepth 2 -iname plugin.manifest.ts` (56 hits, 100% coverage) and re-ran the enforcement gates myself: `bun tools/scripts/lint/plugin-manifest.script.ts` (0 errors), `manifest-vs-package.script.ts` (OK), `manifest-vs-presets.script.ts` (OK), `capabilities-declared.script.ts` (56 plugins, all declared). MAN2-002 is satisfied.
- review-state: done
- review-implementer: verifier-independent
- review-reviewer: sonnet-reviewer-12
- review-log: approved by sonnet-reviewer-12 — sonnet-reviewer-12: ran find plugins -maxdepth 2 -iname plugin.manifest.ts (56 hits, 100% coverage) and re-ran the enforcement gates myself: plugin-manifest.script.ts (0 errors), manifest-vs-package.script.ts (OK), manifest-vs-presets.script.ts (OK), capabilities-declared.script.ts (56 plugins, all declared).
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#todos-los-plugins-publicos-con-manifest` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: MAN2-002, "manifest obligatorio para plugins públicos"
with required fields (id, package, version, visibility, summary,
tags, maturity, permissions, toolPermissions, presets, tokenBudget,
dependencies, capabilities). Verified directly: `find plugins -maxdepth
2 -iname plugin.manifest.ts` returns 56 files for 56 plugin
directories (100% coverage). Ran the actual enforcement gates:
`bun tools/scripts/lint/plugin-manifest.script.ts` → "0 error(s)";
`bun tools/scripts/lint/manifest-vs-package.script.ts` → "OK";
`bun tools/scripts/lint/manifest-vs-presets.script.ts` → "OK";
`bun tools/scripts/lint/capabilities-declared.script.ts` → "56
plugin(s) ... every used capability is declared." Shipped by `r00016`
("plugin manifests como única fuente de verdad + generadores",
`d98f3fd6e`). Closing on that evidence, not on the placeholder
review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — ran `find plugins -maxdepth 2 -iname plugin.manifest.ts` (56 hits, 100% coverage) and re-ran the enforcement gates myself: `bun tools/scripts/lint/plugin-manifest.script.ts` (0 errors), `manifest-vs-package.script.ts` (OK), `manifest-vs-presets.script.ts` (OK), `capabilities-declared.script.ts` (56 plugins, all declared). MAN2-002 is satisfied.
