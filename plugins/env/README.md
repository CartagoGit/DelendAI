# @mcp-vertex/env

Environment-config validation plugin for [`@mcp-vertex/core`](../../packages/core).

## Tools

- **`env_check`** — validate a `.env` file and return normalized findings:
  duplicate keys (medium), empty values (low), malformed lines (low), and
  missing **required** variables (high, when a `required` list is passed).
  Pass `path` (default `.env`) and an optional `required` list of names.
  **Values are never included in the output** — only key names and line numbers.

- **`env_explains`** — diff a parsed `.env` against an injected
  **requirements catalog** (built by walking other plugins' `optionsSchema`
  for `.describe("...env:VAR...")` markers) and report which plugin
  capabilities are **unlocked** vs **blocked**. Useful for onboarding:
  "Which keys do I need to set to enable the GitHub provider?"
  Pass `path` (default `.env`) and the `requirements` catalog.
  **Values are never included in the output.**

Offline, pure. The parse + check + extract + explain primitives are all
pure functions (exported from `@mcp-vertex/env/public`) over an injected
reader.

## Load

```bash
mcp-vertex --plugins=env
```

## Catalog + pack

`env_check` and `env_explains` are exposed via the `env-usage` knowledge
entry in `plugins/env/src/index.ts`. The plugin ships in the **`standard`**
preset (see `packages/core/src/lib/plugins/preset-catalog.ts`) so an
`mcp-vertex --plugins=env` host picks it up automatically.

## License

BSD-3-Clause © Cartago
