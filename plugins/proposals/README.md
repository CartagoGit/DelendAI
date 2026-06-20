# @mcp-vertex/proposals

The **proposals workflow** plugin for
[`@mcp-vertex/core`](../../docs/README-MCP-VERTEX.md): a file-based proposal store,
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
| `agent_worktree` | Isolate a concurrent agent into its own git worktree + branch (`create`/`list`/`remove`) — use when 2+ agents share this repo, so `git add`/`commit` never race on a shared `.git/index`. |
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

### `auto_work` persistence modes (l109)

The `auto_work` tool can optionally commit (and push) the slice's
claimed files when the orchestrator closes the slice. Three modes,
resolved by `input.persist` (per call) > `options.persist.mode` (per
project) > `'none'` (default):

| Mode | What `auto_work` does at slice close |
|---|---|
| `none` (default) | nothing — preserves the "analyse before committing" workflow |
| `commit` | `git add <slice files> && git commit -m "<template>"` |
| `commit-and-push` | the above + `git push <pushTarget>` |

```jsonc
{
	"plugins": {
		"proposals": {
			"options": {
				"persist": {
					"mode": "commit",
					"messageTemplate": "<area>(<proposalId>): <sliceId>",
					"pushTarget": "origin agent/<name>"
				}
			}
		}
	}
}
```

- **Default template** follows Conventional Commits
  (`<area>(<proposalId>): <sliceId>`); `<area>` is inferred from the
  proposal path (`docs`, `plugins/proposals`, …), `<proposalId>` from
  the filename, `<sliceId>` from the slice the orchestrator is closing.
- **Safety net:** the push to `main` is always refused — the commit
  lands, the push is skipped with `reason: "refusing to push to main
  automatically"`. This preserves the "no commit-back loop on `main`"
  invariant from `AGENTS.md` without any extra CI check. Use a
  worktree branch like `agent/<name>` if you want automatic push.
- **Git missing or commit failed:** the helper never throws; the
  result is `{ committed: false, pushed: false, reason }` and the
  rest of the slice flow continues.
- **Files are explicit:** the helper receives the exact list from
  `claim.files`; it never runs `git add .` so a slice can't drag in
  unrelated changes.

The full spec lives in [docs/proposals/l109-feat-auto-work-persist-modes.md](../../docs/proposals/l109-feat-auto-work-persist-modes.md).

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
