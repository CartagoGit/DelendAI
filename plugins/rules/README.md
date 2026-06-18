# @mcp-vertex/rules

Lint/type **rules** plugin for
[`@mcp-vertex/core`](../../docs/README-MCP-CORE.md). Ships per-framework default
ESLint + TypeScript presets, detects each project area's framework, materialises
the defaults to cache, and lets any agent apply them with a configurable
enforcement mode — **the project's own config always wins**.

## Enable

```jsonc
// .vscode/mcp.json
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=rules", "--rules-mode=mixed"]
		}
	}
}
```

## How it knows which rules to apply

Rules are resolved **per project area** (a Vue app and a Laravel API in the same
repo get different rules). On first run the plugin writes
`.cache/mcp-vertex/rules/rules-map.json`:

```jsonc
{
	"mode": "mixed",
	"projects": {
		"demo": {
			"apps/web":  { "framework": "vue",     "eslint": ["apps/web/eslint.config.mjs", ".cache/mcp-vertex/rules/vue.eslint.config.mjs"], "typecheck": ["apps/web/tsconfig.json", ".cache/mcp-vertex/rules/vue.tsconfig.json"] },
			"apps/admin":{ "framework": "angular", "eslint": [".cache/mcp-vertex/rules/angular.eslint.config.mjs"], "typecheck": ["apps/admin/tsconfig.json", ".cache/mcp-vertex/rules/angular.tsconfig.json"] }
		}
	}
}
```

Each array is **priority order: the project's own config first, our default
behind it.** Detection uses each area's deps + TS presence; override per area in
the config.

## Supported presets

`angular`, `react-ts`, `react-js`, `vue`, `svelte`, `vanilla-ts`, `vanilla-js`,
`jquery`. Architecture is extensible to other linters (e.g. PHP/Laravel).

## Tools

| Tool | Purpose |
|---|---|
| `get_rules` | The rules map (per area: framework, configs, conventions) + the mode. |
| `check_rules` | The resolved configs + the exact ESLint command to validate (you run it). |
| `apply_rules` | A mode-aware plan to make code comply (you execute the steps). |

## Enforcement mode (`--rules-mode` or `options.mode`, default `mixed`)

- **strict** — bring everything into compliance.
- **mixed** — only fix files you create/touch.
- **none** — report only; never auto-change.
- **proposal** — create proposals (proposals plugin) for the changes.

## Configure

```jsonc
{
	"plugins": {
		"rules": {
			"options": {
				"mode": "mixed",
				"framework": "react",   // force root area
				"language": "ts",
				"overrides": { "apps/api": "vanilla-ts" }
			}
		}
	}
}
```

BSD-3-Clause © Cartago
