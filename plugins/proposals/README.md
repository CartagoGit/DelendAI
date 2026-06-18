# @mcp-vertex/proposals

The **proposals workflow** plugin for
[`@mcp-vertex/core`](../../docs/README-MCP-CORE.md): a file-based proposal store,
file-level agent locks, a persistent task queue and multi-agent ("swarm")
coordination — including naming the whole agent tree (orchestrator included).

## Enable

```jsonc
// .vscode/mcp.json
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=proposals"]
		}
	}
}
```

## Tools (namespaced `proposals_*` by default)

| Tool | Purpose |
|---|---|
| `auto_work` | One call → next proposal + a compact ordered action plan. Start here. |
| `continue_proposal` | Next proposal (mode `auto`), or a parallel slice plan/claim (`plan`/`claim`). |
| `agent_lock` | Claim files before editing, release after (`claim`/`release`/`status`/`gc`). |
| `agent_names` | Name the whole agent tree — orchestrator (depth 0) included, not only subagents. |
| `task_queue` | Multi-agent coordination queue (`enqueue`/`dequeue`/`subscribe`/`report`). |
| `round_context` | Persisted multi-agent round digest + staleness, for resumed work. |
| `sync_proposals` | Rebuild the proposal index after creating/renaming files. |
| `get_proposal_workflow` | Families, locations, naming and template as JSON. |
| `create_proposal` / `close_slice` | Author a proposal (frontmatter + disjoint slices); mark a slice done + release its lock. |
| `proposal_review` | Peer-review loop: `submit` a finished slice → a **different** agent `approve`s (→ done) or `request_changes` (→ reworkable); repeat until no objection. |
| `proposal_adopt` | Make an existing proposals folder followable: canonical layout + a scan of the real folder + a plan to organize it for mcp-vertex (read-only; you run the steps). |

### Folder layout (`<docsDir>/proposals`, default `docs/mcp-vertex/proposals`)

```
docs/mcp-vertex/proposals/
├─ index.json          machine-readable registry (run sync_proposals to (re)build)
├─ README.md           human guide to this folder
├─ p<N>-<title>.md     a proposal (feature/refactor) — frontmatter: id, type, status
├─ f<N>-<title>.md     a fix (cascades before proposals: f before p)
└─ done/               completed + verified proposals, archived
                       (+ optional host buckets via the `extraFolders` option)
```

Pointing mcp-vertex at a project that already has a proposals folder? Call
`proposal_adopt` — it explains this layout, scans what you have, and hands you a plan.

## Configure (`mcp-vertex.config.json`)

```jsonc
{
	"plugins": {
		"proposals": {
			"prefix": "work",
			"options": {
				"namePool": ["orion", "lyra", "vega"],
				"familyCascade": ["f", "p"],
				"validationCommand": "bun run validate"
			}
		}
	}
}
```

## Paths

State under `.cache/mcp-vertex/proposals/`; human-edited proposals under
`docs/mcp-vertex/proposals/`. All tools share one layout so locks, queue,
round-context and the store always agree.

## Use as a library

```ts
import {
	buildAgentLockRegistration,
	runAutoWork,
	buildSwarmPaths,
} from '@mcp-vertex/proposals/public';
```

BSD-3-Clause © Cartago
