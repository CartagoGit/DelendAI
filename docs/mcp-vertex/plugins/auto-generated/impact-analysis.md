---
id: impact-analysis
package: @delendai/impact-analysis
version: 0.1.0
maturity: experimental
generated: 2026-09-02T06:52:14.677Z
---

# Impact Analysis

> Auto-generated. Do not edit. Regenerate with bun run generate:from-manifests.

## Summary

Bounded impact analysis and test selection across changed symbols, dependents and related specs.

## Tags

- impact
- tests
- f00169

## Presets

- vertex

## Permissions

- filesystem-read

## Dependencies

- @delendai/core
- @delendai/git
- @delendai/search
- @delendai/refactor
- @delendai/test-policy
- @modelcontextprotocol/sdk
- zod

## Capabilities

- impact-analysis
- test-selection

## Notes

### Filesystem safety

The impact-analysis and tests-for-change tools now resolve user-supplied file anchors through SafeWorkspaceReader from @delendai/core.

Rejected inputs:

- Absolute paths outside the workspace root.
- Relative traversal that escapes the workspace.
- Symlink chains that leave the workspace.
- Reserved paths such as .git, .env, and node_modules.

When containment fails, the tool returns the standard structured error envelope with a workspace-containment reason instead of reading external files or crashing.
