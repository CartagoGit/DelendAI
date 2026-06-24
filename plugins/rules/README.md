# @mcp-vertex/rules

Lint/type **rules** plugin for
[`@mcp-vertex/core`](../../docs/README-MCP-VERTEX.md). Ships per-framework default
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

The plugin is language-aware: it detects each area's stack from its manifest
(`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`,
`build.gradle.kts`/`pom.xml`, `Package.swift`, `*.csproj`/`*.sln`, `mix.exs`,
`composer.json`) and emits the right linter/formatter/typecheck commands for
that language — not a hardcoded ESLint command for everything.

- **JS/TS** (ESLint): `angular`, `react-ts`, `react-js`, `vue`, `svelte`,
  `vanilla-ts`, `vanilla-js`, `jquery`.
- **PHP** (Pint): `laravel`.
- **Other languages** (each ships a baseline preset + idiomatic *dogmas*):
  Python (`ruff` + basedpyright), Go (`golangci-lint`), Rust (`clippy` +
  rustfmt), Ruby (`rubocop`), Java (`checkstyle`), Kotlin (`ktlint`), Swift
  (`swiftlint`), C#/.NET (`dotnet format`), Elixir (`credo`).

Each preset carries its own `check` / `fix` / `typecheck` commands, and each
language exposes a **dogma** (ownership/error model/null-safety/naming/async/
testing + idiomatic do/don't bullets) so an agent learns *how to write* the
language before the first line. The architecture is open/closed: adding a
language is a new adapter + dogma + preset entry, not an edit to the detector,
the tools, or the manifest writer. (Full ~70-language coverage is the f00051
long-tail follow-up.)

## Tools

| Tool | Purpose |
|---|---|
| `get_rules` | The rules map (per area: framework, configs, conventions) + the mode. |
| `check_rules` | The resolved configs + the exact per-language lint/typecheck command to validate (you run it). |
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
