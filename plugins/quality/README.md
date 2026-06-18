# @mcp-vertex/quality

Quality-gate **runner** plugin for
[`@mcp-vertex/core`](../../docs/README-MCP-CORE.md). Executes the project's
validation commands (lint/test/build/typecheck) per scope and returns a
structured pass/fail report.

## Enable

```jsonc
{
	"servers": {
		"mcp-core": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=quality"]
		}
	}
}
```

## Tools

| Tool | Purpose |
|---|---|
| `get_quality_scopes` | List the scopes and their commands (read-only). |
| `run_quality` | Run a scope and return per-command `{ ok, code, tail }`. Executes commands. |

## Where the commands come from (precedence)

1. plugin `options.scopes` (`{ "feature": ["bun run lint", "bun run test"] }`)
2. `mcp-core.config.json` → `validationMatrix.scopes`
3. detected `package.json` scripts (as one `all` scope)

## Trust boundary & command policy (M13)

`run_quality` **executes** the configured commands via `spawn` (`shell: true`).
The commands come from the host config — so the trust boundary is the host, not
the agent: only expose this plugin with scopes you trust. To harden a setup
where a less-trusted agent can call `run_quality`, restrict which binaries may
run with an allow/deny policy (enforced *before* any spawn; a blocked command is
reported as failed with code 126, never executed):

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome"],
          "deny": ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

`deny` wins over `allow`; an empty/absent `allow` means "any binary not denied".

BSD-3-Clause © Cartago
