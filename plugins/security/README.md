# @mcp-vertex/security

Security scanning plugin for [`@mcp-vertex/core`](../../packages/core).

## Tools

- **`security_secrets`** — scan the project's source for leaked secrets
  (private keys, AWS/GitHub/Google/Slack/OpenAI tokens) with high-precision,
  offline rules. Returns normalized findings (`severity` critical…info, rule
  id, `file:line`, redacted match) plus a per-severity summary.
  - `scope`: `"changed"` (default — git working-tree changes) or `"tracked"`
    (all tracked files).
  - `includeTests`: `false` by default — test/fixture files legitimately carry
    sample secrets and are skipped unless you opt in.

Offline, no network, no bundled binaries. The matched secret is never shown in
full. Built on the shared external-tool/scanner core (`@mcp-vertex/core`
`IFinding`/`IScanResult`), so its findings render identically to every other
scanner.

## Load

```bash
mcp-vertex --plugins=security
```

## License

BSD-3-Clause © Cartago
