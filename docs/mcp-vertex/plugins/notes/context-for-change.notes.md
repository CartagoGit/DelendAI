### Filesystem safety

The plugin now reads source files exclusively through SafeWorkspaceReader from @mcp-vertex/core.

Rejected inputs:

- Absolute paths outside the workspace root.
- Relative traversal that escapes the workspace.
- Symlinks inside the workspace that resolve outside it.
- Reserved paths such as .git, .env, and node_modules.

Operationally, callers receive a structured tool error whose reason starts with workspace-containment instead of a raw filesystem exception.
