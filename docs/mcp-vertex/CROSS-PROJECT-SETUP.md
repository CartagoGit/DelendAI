# Cross-project setup

This is the canonical guide for wiring `@mcp-vertex/core` into any repository and getting the GitHub `issues` plugin ready for that repo. If another page, host, or wizard gives you a shorter version, this document is the source of truth it should match.

Use this page for the first run in a new project, for fixing an `issues` setup that only half works, or for checking that your `mcp.json`, preset choice, and per-repo config still agree.

## Who this is for

- You are registering `mcp-vertex` in a project for the first time and want one known-good launch shape.
- You want the `issues` plugin to read GitHub issues for the current repository without guessing which config key or auth path to use.
- You need to debug a mismatch between what your host launches from `mcp.json` and what the repo declares in `mcp-vertex.config.json`.

## One-call adoption (`adopt_project`)

Adopting a project used to require chaining config → proposals → launch →
agents → issues by hand. Today it is one MCP call, and it is **additive**:
it writes only what is missing and never overwrites a file the project
already owns (an existing config is merged, an existing instruction or
agent file wins). The project's own instructions are always the
authority — mcp-vertex never replaces them.

```text
mcp-vertex_adopt_project { write: true }
```

One call does the mechanical wiring end-to-end:

| What it writes | Where |
|---|---|
| Derived config (preset expanded to the `plugins` map) | `mcp-vertex.config.json` |
| Proposals store (7 status folders + `README.md`) | `<docsDir>/proposals/` |
| Orchestrator + 4 subagents, Copilot format | `.github/agents/*.agent.md` |
| Orchestrator + 4 subagents, Claude Code format | `.claude/agents/*.md` |
| Orchestrator + 4 subagents, Codex CLI format | `.codex/agents/*.md` |
| Shared instructions pointer | `.github/copilot-instructions.md` |

It returns a verified checklist (`created` / `skipped` / `residual`). The
only steps left are the ones that genuinely need a human or the network:

1. **Relaunch the host** with the command the tool printed (e.g.
   `bunx --package @mcp-vertex/cli mcpv __serve --workspace . --preset full`).
2. **Optional GitHub issues** — run `mcp-vertex_setup_github` (read-only
   guide) and set `plugins.issues.options.repo`, or pass `repo:
   "owner/name"` to `adopt_project` so it writes the wiring for you.

Skills, prompts, knowledge and every other utility are **not** copied into
the project: they are served live by the MCP server once the host is
relaunched. The project keeps only the thin agent/instruction pointers.

Dry-run first to preview without writing:

```text
mcp-vertex_adopt_project
```

## Session and context hygiene

Every adopted project should keep its host instruction file as a pointer to
[`AGENT-BOOTSTRAP.md`](./AGENT-BOOTSTRAP.md). That shared policy is how
`mcp-vertex` keeps session lifetime and context carry-over consistent across
Claude Code, Codex, Copilot, and other hosts: checkpoint a completed slice,
compact the relevant working state, and start fresh before the host's context
warning rather than preserving an idle background chat.

The server cannot read a host's private subscription meter. Use the host UI as
the authority for quota/context, and use the `memory` compaction loop plus
`usage-tracking` only for the local state and MCP activity they can actually
observe. The `lean`, `standard`, and larger presets include `memory`; projects
that deliberately use a smaller explicit plugin list should load it when they
want the same compact-and-resume workflow.

## `setup-github` — read-only detection + a paste-ready guide

`setup-github` (the CLI subcommand and the `setup_github` MCP tool) is
**read-only**: it detects the repo, the auth tier and whether the issues
plugin is already configured, then returns a paste-ready guide. It never
writes config and never calls GitHub — the agent executes the returned
steps. The CLI and the MCP tool share one step engine, so they always
agree on the guide.

The returned guide has up to four ordered steps:

| # | Step | What the agent does |
|---|---|---|
| 1 | Auth | If `gh` is not authenticated, run `gh auth login` (or export `GITHUB_TOKEN`). Skipped when `gh` is already the best tier. |
| 2 | Config | Add the `plugins.issues.options.repo` block to `mcp-vertex.config.json` (or run `init_config` with `write: true` to derive the whole config). |
| 3 | Load | Launch the host with `--plugins=proposals,issues` (issues hard-depends on proposals). |
| 4 | Verify | Run `mcpv issues list` (or call the `issues_list` MCP tool) to confirm the repo + auth tier resolve. |

The config block step 2 adds:

```jsonc
{
	"plugins": {
		"issues": {
			"options": {
				"repo": "owner/name"
			}
		}
	}
}
```

## Auth tier decision matrix

The `issues` runtime and the `setup-github` step engine share one tier
vocabulary (`gh`, `rest-authed`, `rest-anon`).

| Tier | Use it when | What you do |
|---|---|---|
| `gh` | You are on a development machine and can sign in interactively with GitHub CLI. | Install `gh`, run `gh auth login`, then confirm `gh auth status` is healthy before launching `mcp-vertex`. |
| `rest-authed` | You are in CI, a remote shell, or any environment where a token is easier than an interactive login. | Export `GITHUB_TOKEN` before starting the host and keep the token outside `mcp-vertex.config.json`. |
| `rest-anon` | You are only smoke-testing the plugin and can tolerate strict read-rate limits. | Launch without `gh` and without `GITHUB_TOKEN`, then expect a hard cap of `60` GitHub REST requests per hour and switch tiers as soon as you need sustained usage. |

## Plugin preset wiring

The source of truth for preset membership is [../packages/core/src/lib/plugins/preset-catalog.ts](../../packages/core/src/lib/plugins/preset-catalog.ts). Today `full` resolves to everything in `swarm` plus the host-only plugins that stay user-facing (`web-fetch`, `issues`); `audit` is opt-in via `--plugins=audit`. Prefer `--preset=full` when you want the whole user-facing surface. Use an explicit plugin list only when you intentionally want a smaller launch shape.

For ordinary single-agent implementation work, prefer the explicit
`--preset=lean` surface: git, search, memory and docs. It avoids registering
the collaboration tools and their schemas until you actually need them. Switch
to `--preset=swarm` for locks, proposals and coordination; use `full` only
when the host-only integrations are also required.

Preferred launch:

```bash
bunx --package @mcp-vertex/cli mcpv __serve --workspace . --preset full
```

Explicit minimal alternative for just proposals plus issues:

```bash
bunx --package @mcp-vertex/cli mcpv __serve --workspace . --plugins proposals,issues
```

The server block is the same across VS Code, Cursor, and Claude Code; only the host-specific `mcp.json` location changes:

```jsonc
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["--package", "@mcp-vertex/cli", "mcpv", "__serve", "--workspace", ".", "--preset", "full"]
		}
	}
}
```

If you intentionally avoid `full`, keep the config file and launch shape aligned: a repo that declares `plugins.issues.options.repo` still needs either `--preset=full` or `--plugins=proposals,issues` so the host actually loads the issues tools.

## Model providers and the orchestrator (opt-in)

The `orchestrator-runner` (headless routing brain) and `usage-tracking`
(spend/usage observability) plugins are **opt-in**. They are **not** part of any
preset — `minimal`, `standard`, `swarm`, and `full` all leave them out — so you
only pay their cost when you deliberately load them. `orchestrator-runner` has a
hard dependency on `usage-tracking`: the loader refuses the batch unless both are
present, because every routing decision it advises (and, once execution is
enabled, every call it runs) must be recorded for spend auditing.

Load them alongside a preset by adding both to `--plugins`:

```bash
bunx --package @mcp-vertex/cli mcpv __serve --workspace . --preset swarm --plugins usage-tracking,orchestrator-runner
```

The router needs a **provider roster**. The canonical home is a root-level
`providers` block in `mcp-vertex.config.json`; the two plugins stay opt-in under
`plugins` and are **never** folded into the `swarm` preset. A worked example with
one `api` provider:

```jsonc
{
	// Root-level roster the router scores against. API keys are referenced by
	// ENV-VAR NAME (read at call time) — never embed a cleartext key here.
	"providers": [
		{
			"id": "openai-gpt-4o",
			"kind": "api",
			"modelId": "gpt-4o",
			"contextWindow": 128000,
			"costTier": 3,
			"strengths": ["reasoning", "json-strict"],
			"weaknesses": ["very-long-context"],
			"invoke": {
				"kind": "api",
				"url": "https://api.openai.com/v1/chat/completions",
				"method": "POST",
				"envVar": "OPENAI_API_KEY"
			}
		}
	],
	// Opt-in plugins — NOT in the swarm preset. Kill either by omitting it here
	// (or with `--exclude-plugins=<name>`); there is no `options.enabled` flag.
	// `orchestrator-runner` requires `usage-tracking` to also be loaded.
	"plugins": {
		"usage-tracking": {},
		"orchestrator-runner": {
			"options": {
				"defaultCostPreference": "balanced",
				"executeApi": false
			}
		}
	}
}
```

Export the referenced env var in the shell that launches the host
(`export OPENAI_API_KEY=…`) and keep the literal key out of version control — the
`no-cleartext-secrets` gate fails any tracked config that inlines a secret rather
than referencing a `${ENV_VAR}` / `ENV_VAR` name. With `executeApi: false` (the
safe default) the runner **advises and hands off** but never spends; flipping it
to `true` still requires a per-invocation signed confirmation token.

Until core surfaces the root-level `providers` block on the plugin context, the
runner also reads a roster from its own
`plugins.orchestrator-runner.options.providers` as a pragmatic, fully-typed
fallback with the identical shape.

## Troubleshooting

| Failure mode | Remediation |
|---|---|
| `gh: command not found` | Install GitHub CLI, then run `gh auth login` followed by `gh auth status`. If you cannot install `gh`, switch to the `rest-authed` path with `GITHUB_TOKEN`. |
| `GITHUB_TOKEN` rate-limited | Replace the token with one that is still valid and has enough quota, export it in the shell that launches your host, and rerun the tier verification step. For long-lived local use, prefer `gh auth` over a fragile shell token. |
| `mcp-vertex.config.json` not found | Create `mcp-vertex.config.json` at the workspace root, add the `plugins.issues.options.repo` block shown above, then relaunch the host so it reads the config file from the expected root. |
| Repo slug malformed | Rewrite the value to plain `owner/name`, stripping protocol prefixes, `.git`, extra path segments, or issue numbers. Then rerun the detection/confirmation step until the slug is exactly two path segments. |
| Anonymous tier hits the `60` requests/hour limit | Stop using `rest-anon` for normal work. Authenticate with `gh auth login` or export `GITHUB_TOKEN`, relaunch the host, and rerun verification so the effective tier changes to `gh` or `rest-authed`. |
| Host loads `mcp-vertex` but no issues tools appear | Your `mcp.json` launch shape is missing the required preset/plugin flags. Change it to `--preset=full` or `--plugins=proposals,issues`, then restart the host and confirm the compact overview lists `issues` as loaded. |

## Where to next

- [IDE-EXTENSION.md](./IDE-EXTENSION.md) for the VS Code host and extension-specific commands.
- [CROSS-IDE.md](./CROSS-IDE.md) for the same setup shape across other hosts.
- [PLUGIN-CONFIGURATION-GUIDE.md](./PLUGIN-CONFIGURATION-GUIDE.md) for the LLM-facing map of which plugins exist and how to configure them per project need (commit/push, clean code/SOLID, file conventions).
- [PLUGINS-MCP-VERTEX.md](./PLUGINS-MCP-VERTEX.md) for plugin authoring and the issues-plugin setup note.
- [NPM_PUBLISH.md](./NPM_PUBLISH.md) if you are packaging or shipping the repo after setup is working.

Last reviewed: 2026-06-22. Source proposal: [f00030-cross-project-setup-and-github-config.md](./proposals/ready/f00030-cross-project-setup-and-github-config.md).
