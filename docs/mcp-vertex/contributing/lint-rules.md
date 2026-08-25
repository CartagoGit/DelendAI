# Lint Rules

## architecture-readfile-via-safe-reader

This lint scans plugins whose manifest declares `filesystem-read` and blocks direct `readFile` or `readFileSync` usage in their `src` tree.

The rule exists to preserve the filesystem containment invariant introduced by SafeWorkspaceReader in @mcp-vertex/core.

Allowed patterns:

- Reads routed through SafeWorkspaceReader.
- Local implementation files named safe-reader.ts or safe-workspace-reader.ts.
- Explicit legacy allowlist entries inside the lint script, each with a mandatory reason.

Rejected patterns:

- `import { readFile } from 'node:fs/promises'` in a filesystem-read plugin source file.
- `import { readFileSync } from 'node:fs'` in a filesystem-read plugin source file.
- `fs.readFile(...)` or `fs.readFileSync(...)` through a namespace import from node:fs.

To migrate a plugin off the allowlist, replace direct reads with SafeWorkspaceReader and then remove its allowlist entry from the lint script.