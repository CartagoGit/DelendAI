---
id: f00303
title: "El runtime tiene una estrategia clara de activación dinámica."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
shipped-in: ["1bcc6f491"]  # docs(proposals): mark 94 migrated TODO placeholders done
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#el-runtime-tiene-una-estrategia-clara-de-activacion-dinamica
last-transition-id: f4552766-8b22-466d-a310-d795f94ad852
last-correlation-id: f4552766-8b22-466d-a310-d795f94ad852
last-transition-from: in-progress
---

# f00303 — El runtime tiene una estrategia clara de activación dinámica.

## Goal

Migrated work item: El runtime tiene una estrategia clara de activación dinámica..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00303-el-runtime-tiene-una-estrategia-clara-de-activacion-dinamica.md`
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
- review-log: approved by sonnet-reviewer-6-verify — Audit finding (a00092 TOK-006, dynamic tool activation: bootstrap a small toolset like overview/plugin_search/plugin_activate/tool_search and load domain tools on demand) is shipped: packages/core/src/lib/registry/plugin-search.tool.ts (plugin_search) and packages/core/src/lib/tools/tool-surface.tool.ts (plugin_activate/plugin_deactivate) implement exactly this runtime; a full ToolSurfaceRuntime with eviction, search-and-refusals and exposure tracking exists under packages/core/src/lib/project/. These tools are live on the running host (visible in this session's own MCP tool list as mcp-vertex_tool_search / mcp-vertex_plugin_activate). Ran plugin-search.tool.spec.ts + tool-surface-runtime.spec.ts: 10 tests pass, exit 0.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#el-runtime-tiene-una-estrategia-clara-de-activacion-dinamica` by `proposal_adopt`
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
