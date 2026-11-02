### Filesystem safety

The impact-analysis and tests-for-change tools now resolve user-supplied file anchors through SafeWorkspaceReader from @delendai/core.

Rejected inputs:

- Absolute paths outside the workspace root.
- Relative traversal that escapes the workspace.
- Symlink chains that leave the workspace.
- Reserved paths such as .git, .env, and node_modules.

When containment fails, the tool returns the standard structured error envelope with a workspace-containment reason instead of reading external files or crashing.
