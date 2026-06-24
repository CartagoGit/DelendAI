# mcp-vertex monorepo

Project-agnostic core for building MCP servers + a CLI plugin loader, by
[@mcp-vertex](https://www.npmjs.com/org/mcp-vertex).

- **[README-MCP-VERTEX.md](./docs/README-MCP-VERTEX.md)** — what it is, how to use it,
  CLI arguments, built-in tools, the hybrid bootstrap flow.
- **[PLUGINS-MCP-VERTEX.md](./docs/PLUGINS-MCP-VERTEX.md)** — how to create plugins.
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — layers, contracts, request flow,
  invariants (with a diagram).
- **[CONTRIBUTING.md](./.github/CONTRIBUTING.md)** · **[SECURITY.md](./.github/SECURITY.md)** ·
  **[AGENTS.md](./AGENTS.md)** — how to contribute, report vulnerabilities, and the
  rules agents follow.

## Layout

| Path | Package | What |
|---|---|---|
| `packages/core` | `@mcp-vertex/core` | The agnostic core + `mcp-vertex` CLI. |
| `plugins/proposals` | `@mcp-vertex/proposals` | Proposal store + agent locks + task queue (swarm coordination). |
| `plugins/rules` | `@mcp-vertex/rules` | Per-framework ESLint/TS presets + per-area detection + enforcement modes (project config wins). |
| `plugins/memory` | `@mcp-vertex/memory` | Persistent project notes (save/recall/list/forget) for cross-session continuity. |
| `plugins/git` | `@mcp-vertex/git` | Read-only git orientation: status, changed files, diff stat, log. |
| `plugins/quality` | `@mcp-vertex/quality` | Quality-gate runner: executes lint/test/build per scope, structured pass/fail. |
| `plugins/search` | `@mcp-vertex/search` | Grep-like, low-token textual `search` over allow-listed workspace files. |
| `plugins/notification` | `@mcp-vertex/notification` | Watches the shared lock file and pushes an MCP `notifications/message` on release, so agents stop polling. |
| `plugins/docs` | `@mcp-vertex/docs` | Catalogue + read the repo markdown (`docs_list` / `docs_read`), anti-traversal. |
| `plugins/deps` | `@mcp-vertex/deps` | Dependency inventory + offline health (`deps_list` / `deps_check`); no network. |

## Typed tool outputs (SDK)

Every tool that declares a Zod `outputSchema` ships a generated TypeScript type
for its `structuredContent`, so MCP clients can consume responses type-safely:

```ts
import type { GitToolOutputs } from '@mcp-vertex/git/public';

const status: GitToolOutputs['git_status'] = result.structuredContent;
```

Each package exposes a `<Pkg>ToolOutputs` map (MCP tool name → output type) from
its public surface. The types are generated from the live schemas — never edited
by hand — and a drift guard in the test suite fails if they go stale:

```bash
bun run types:generate   # regenerate src/generated/tool-outputs.ts per package
```

## Develop

## Local MCP Host

The checked-in `.vscode/mcp.json` is the **canonical launch shape** for this
repo. GitHub Copilot, Cursor, and Antigravity all read it from the workspace
root; Claude Code and Codex read equivalents from `~/.claude.json` and
`~/.codex/config.toml` respectively, but wrap the **same** launch arguments.

| Client | Config file | Loaded by |
|---|---|---|
| GitHub Copilot (VS Code) | `.vscode/mcp.json` | workspace root |
| Cursor | `.vscode/mcp.json` | workspace root (reuses the VS Code file) |
| Antigravity | `.vscode/mcp.json` | workspace root (reuses the VS Code file) |
| Claude Code | `~/.claude.json` | user home (`mcpServers.<name>`) |
| Codex | `~/.codex/config.toml` | user home (`[mcp_servers.<name>]`) |

The launch path is `tools/scripts/host/host-server.script.ts` with
`--workspace`, `--config` and `--preset=swarm`. The host uses the same
loader as the CLI, so plugins declared in `mcp-vertex.config.json` are
loaded automatically in addition to the preset unless excluded with
`--exclude-plugins`. See [`docs/README-MCP-VERTEX.md`](./docs/README-MCP-VERTEX.md)
for the full snippet per client and the plugin-resolution precedence.

```bash
bun install
bun run validate         # typecheck + tests (incl. the type-SDK drift guard)
bun run types:generate   # regenerate the typed tool-output SDK

# Quick parity check from the terminal — confirms mcp.json vs config.json match:
bun run cli -- overview --json   # pluginDiagnostic.loaded == requested - missing
```

BSD-3-Clause © Cartago
