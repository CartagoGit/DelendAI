{/* Auto-generated discovery fragment for GitHub Copilot Chat. */}
{/* Regenerate with `bun run catalog:hints`. Do not edit by hand. */}

{/* BEGIN GENERATED: f00056 S4 - regenerate with `bun run catalog:hints`. Do not edit by hand. */}
{/* Generated at: 2026-06-27T11:23:44.275Z. Source: docs/mcp-vertex/agent-catalog.generated.json. */}

## Discovery (canonical, generated)

Canonical first move: call `mcp-vertex_overview { compact: true } -> mcp-vertex_agent_catalog` whenever you need to
route work to a tool, a skill, or an actionable proposal. The catalog
snapshot is byte-identical across reruns and is regenerated whenever
the live registry, the skill manifest, or the proposal index drift.

### Actionable proposals

| id | title | kind | status |
| --- | --- | --- | --- |
| `c00002` | c00002 | chore | paused |
| `f00050` | f00050 | feat | paused |
| `f00055` | f00055 | feat | ready |
| `f00056` | f00056 | feat | ready |
| `f00057` | f00057 | feat | in-progress |
| `f00058` | f00058 | feat | ready |
| `f00059` | f00059 | feat | ready |
| `f00060` | f00060 | feat | ready |

### Top skills (from skills/manifest.json)

| skill id | when to use |
| --- | --- |
| `mcp-vertex-audit-playbook` | Use before creating an audit proposal to follow the mandatory reading order, evidence b... |
| `mcp-vertex-audit-runner` | Use when running or consolidating audits to follow the tool-level lifecycle, rubric, an... |
| `mcp-vertex-concurrency-patterns` | Use when concurrent agents or processes may touch the same files to choose between with... |
| `mcp-vertex-conventional-commits-and-release` | Use before release-facing commits or bun run release so commit type, derived semver bum... |
| `mcp-vertex-failure-modes` | Use when a tool returns ok:false or a swarm stalls to recover from lock conflicts, corr... |
| `mcp-vertex-legacy-proposal-migration` | Use only when migrating pre-f00016 pNNN proposals so the legacy mapping and required sc... |
| `mcp-vertex-multi-agent-coordination` | Use when several agents share this repo to choose locks, await release notifications, a... |
| `mcp-vertex-operator` | Use at session start to call overview first, read recommendedNextAction, and choose the... |
| `mcp-vertex-plugin-authoring` | Use when adding or changing an mcp-vertex plugin so tools, schemas, state, path contain... |
| `mcp-vertex-proposal-swarm-runner` | Use as the compact entrypoint for proposal work when you need the canonical swarm workf... |

{/* END GENERATED: f00056 S4 */}


> Drop this fragment into `.github/copilot-instructions.md` by
> referencing it (or by copying the discovery block above into the
> bottom of the human-edited file). The host file keeps the
> status-marker / orchestration prose; only the discovery surface
> is generated.
