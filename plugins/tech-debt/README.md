# @mcp-vertex/tech-debt

Tech-debt visibility plugin for [`@mcp-vertex/core`](../../packages/core).

## Tools

- **`debt_scan`** — scan source comments across the workspace for tech-debt
  markers and return severity-ranked findings: **FIXME/BUG** (high),
  **XXX/HACK/DEPRECATED** (medium), **TODO** (low), **NOTE** (info). Skips
  `node_modules`, `dist`, `build`, `.cache`, `.git`. Pass `only` (e.g.
  `["FIXME"]`) to narrow to specific marker kinds. Great for a pre-release
  sweep: "what did we mark to fix before shipping?"

Offline, pure. The scan is a pure function (exported from
`@mcp-vertex/tech-debt/public`) over an injected reader.

## Load

```bash
mcp-vertex --plugins=tech-debt
```

## License

BSD-3-Clause © Cartago
