# Cross-project setup

This is the canonical guide for wiring `@mcp-vertex/core` into any repository and getting the GitHub `issues` plugin ready for that repo. If another page, host, or wizard gives you a shorter version, this document is the source of truth it should match.

Use this page for the first run in a new project, for fixing an `issues` setup that only half works, or for checking that your `mcp.json`, preset choice, and per-repo config still agree.

## Who this is for

- You are registering `mcp-vertex` in a project for the first time and want one known-good launch shape.
- You want the `issues` plugin to read GitHub issues for the current repository without guessing which config key or auth path to use.
- You need to debug a mismatch between what your host launches from `mcp.json` and what the repo declares in `mcp-vertex.config.json`.

## The 7 steps of `setup-github`

| # | Step | What it does | Verifiable by |
|---|---|---|---|
| 1 | Detect repo | Runs `git remote get-url origin` and normalizes the GitHub remote to `owner/name`. | The detected slug matches `owner/name` and points at the repo you expect. |
| 2 | Confirm owner/name | Prompts you to confirm or override the detected repo slug before writing config. | Your confirmed value is exactly `owner/name`. |
| 3 | Pick auth tier | Chooses `gh` when `gh auth status` succeeds, `rest-authed` when `GITHUB_TOKEN` is set, or `rest-anon` otherwise. Anonymous mode must warn about the `60` requests/hour cap. | The reported tier is `gh`, `rest-authed`, or `rest-anon`, and anonymous mode prints the rate-limit warning. |
| 4 | Write config | Writes `plugins.issues.options.repo` into `mcp-vertex.config.json` without touching unrelated plugin settings. | Re-reading `mcp-vertex.config.json` shows the expected `plugins.issues.options.repo` value. |
| 5 | Verify tier | Calls `issues_fetch` against a sentinel issue path to prove the chosen auth tier actually works. | The result reports the effective `tier` and completes without an auth error. |
| 6 | Print invocation | Prints the exact launch command and `mcp.json` shape to use in your host. | The command and JSON match the canonical preset/plugin wiring below. |
| 7 | Mark configured | Optionally records `setup_github_completed_at` so later runs can tell the repo was already configured once. | Re-reading the config shows the completion timestamp when you opted in. |

The per-repo config written by step 4 is intentionally small:

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

| Tier | Use it when | What you do |
|---|---|---|
| `gh` | You are on a development machine and can sign in interactively with GitHub CLI. | Install `gh`, run `gh auth login`, then confirm `gh auth status` is healthy before launching `mcp-vertex`. |
| `rest-authed` | You are in CI, a remote shell, or any environment where a token is easier than an interactive login. | Export `GITHUB_TOKEN` before starting the host and keep the token outside `mcp-vertex.config.json`. |
| `rest-anon` | You are only smoke-testing the plugin and can tolerate strict read-rate limits. | Launch without `gh` and without `GITHUB_TOKEN`, then expect a hard cap of `60` GitHub REST requests per hour and switch tiers as soon as you need sustained usage. |

## Plugin preset wiring

The source of truth for preset membership is [../packages/core/src/lib/plugins/preset-catalog.ts](../packages/core/src/lib/plugins/preset-catalog.ts). Today `full` resolves to everything in `swarm` plus the host-only plugins that stay user-facing (`web-fetch`, `issues`); `audit` is opt-in via `--plugins=audit`. Prefer `--preset=full` when you want the whole user-facing surface. Use an explicit plugin list only when you intentionally want a smaller launch shape.

Preferred launch:

```bash
bunx @mcp-vertex/core --preset=full
```

Explicit minimal alternative for just proposals plus issues:

```bash
bunx @mcp-vertex/core --plugins=proposals,issues
```

The server block is the same across VS Code, Cursor, and Claude Code; only the host-specific `mcp.json` location changes:

```jsonc
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--preset=full"]
		}
	}
}
```

If you intentionally avoid `full`, keep the config file and launch shape aligned: a repo that declares `plugins.issues.options.repo` still needs either `--preset=full` or `--plugins=proposals,issues` so the host actually loads the issues tools.

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
- [PLUGINS-MCP-VERTEX.md](./PLUGINS-MCP-VERTEX.md) for plugin authoring and the issues-plugin setup note.
- [NPM_PUBLISH.md](./NPM_PUBLISH.md) if you are packaging or shipping the repo after setup is working.

Last reviewed: 2026-06-22. Source proposal: [f00030-cross-project-setup-and-github-config.md](./proposals/ready/f00030-cross-project-setup-and-github-config.md).