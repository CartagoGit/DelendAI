# @mcp-vertex/env

Environment-config validation plugin for [`@mcp-vertex/core`](../../packages/core).

## Tools

- **`env_check`** — validate a `.env` file and return normalized findings:
  duplicate keys (medium), empty values (low), malformed lines (low), and
  missing **required** variables (high, when a `required` list is passed).
  Pass `path` (default `.env`) and an optional `required` list of names.
  **Values are never included in the output** — only key names and line numbers.

Offline, pure. The parse + check are pure functions (exported from
`@mcp-vertex/env/public`) over an injected reader.

## Load

```bash
mcp-vertex --plugins=env
```

## License

BSD-3-Clause © Cartago
