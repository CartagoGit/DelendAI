# Examples

Worked, copy-pasteable examples for `@mcp-vertex/core`.

| Example | What it shows |
|---|---|
| [`custom-plugin/`](custom-plugin/) | Authoring your own plugin — the full contract in one tested file (`definePlugin`, options/input/output schemas, a tool, knowledge). **Self-verified by a test.** |
| [`minimal/`](minimal/) | The smallest useful server: orientation + a couple of read-only plugins via a preset. |
| [`swarm/`](swarm/) | Multi-agent coordination: the `swarm` preset (proposals + notification + …) over a repo. |

All examples assume `@mcp-vertex/core` is available (installed, or this
monorepo's workspace). The CLI runs under **Node, Deno or bun**.
