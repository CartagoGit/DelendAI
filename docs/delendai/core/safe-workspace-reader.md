# SafeWorkspaceReader

SafeWorkspaceReader is the public filesystem-read primitive for packages that need to open workspace files safely through @delendai/core.

The API centralizes three checks before a plugin consumes file content:

- Lexical containment: relative traversal and absolute paths outside the workspace are rejected.
- Realpath containment: symlinks that resolve outside the workspace are rejected before reads, stats, or directory walks.
- Reserved paths: .git, .env, and node_modules are blocked by default even when they live inside the workspace.

Public surface:

```ts
const reader = new SafeWorkspaceReader(workspaceRootAbs);
const file = await reader.readText('src/index.ts');
const stats = await reader.stat('src/index.ts');
const listed = await reader.list('src', { recursive: true, maxDepth: 2 });
```

Behavioral notes:

- Absolute paths are accepted only when they stay inside the workspace root.
- Relative paths are normalized and returned as forward-slash workspace-relative paths.
- Symlink chains are followed during read/stat/list containment checks.
- `exists()` returns null for missing, reserved, or out-of-workspace inputs.

Migration guidance for plugins:

- Replace normalizePath + path.resolve + readFile with SafeWorkspaceReader.readText.
- Replace direct readFileSync hot-path reads with the async SafeWorkspaceReader methods.
- Map WorkspaceContainmentError to the plugin's structured tool failure envelope instead of leaking raw filesystem errors.