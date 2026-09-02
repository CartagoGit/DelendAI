---
id: context-for-change
package: @mcp-vertex/context-for-change
version: 0.1.0
maturity: experimental
generated: 2026-09-02T06:52:14.677Z
---

# Context For Change

> Auto-generated. Do not edit. Regenerate with bun run generate:from-manifests.

## Summary

Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.

## Tags

- context
- orchestration
- compact
- f00165

## Presets

- vertex

## Permissions

- filesystem-read

## Dependencies

- @mcp-vertex/core
- @mcp-vertex/git
- @mcp-vertex/search
- @mcp-vertex/memory
- @mcp-vertex/docs
- @mcp-vertex/conventions
- @mcp-vertex/refactor
- @mcp-vertex/test-policy
- @modelcontextprotocol/sdk
- zod

## Capabilities

- context-orchestration

## Notes

### Filesystem safety

The plugin now reads source files exclusively through SafeWorkspaceReader from @mcp-vertex/core.

Rejected inputs:

- Absolute paths outside the workspace root.
- Relative traversal that escapes the workspace.
- Symlinks inside the workspace that resolve outside it.
- Reserved paths such as .git, .env, and node_modules.

Operationally, callers receive a structured tool error whose reason starts with workspace-containment instead of a raw filesystem exception.
