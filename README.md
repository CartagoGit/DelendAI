# mcp-core monorepo

Project-agnostic core for building MCP servers + a CLI plugin loader, by
[@cartago-git](https://www.npmjs.com/org/cartago-git).

- **[README-MCP-CORE.md](./docs/README-MCP-CORE.md)** — what it is, how to use it,
  CLI arguments, built-in tools, the hybrid bootstrap flow.
- **[PLUGINS-MCP-CORE.md](./docs/PLUGINS-MCP-CORE.md)** — how to create plugins.

## Layout

| Path | Package | What |
|---|---|---|
| `packages/core` | `@cartago-git/mcp-core` | The agnostic core + `mcp-core` CLI. |
| `plugins/proposals` | `@cartago-git/mcp-proposals` | Proposal store + agent locks + task queue (swarm coordination). |
| `plugins/rules` | `@cartago-git/mcp-rules` | Per-framework ESLint/TS presets + per-area detection + enforcement modes (project config wins). |
| `plugins/memory` | `@cartago-git/mcp-memory` | Persistent project notes (save/recall/list/forget) for cross-session continuity. |
| `plugins/git` | `@cartago-git/mcp-git` | Read-only git orientation: status, changed files, diff stat, log. |
| `plugins/quality` | `@cartago-git/mcp-quality` | Quality-gate runner: executes lint/test/build per scope, structured pass/fail. |

## Develop

```bash
bun install
bun run validate   # typecheck + tests
```

MIT © Cartago
