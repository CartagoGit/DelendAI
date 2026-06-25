# @mcp-vertex/issues

Opt-in **GitHub issues** plugin for [`@mcp-vertex/core`](../../packages/core).
Ingests a GitHub issue, runs a mechanical pre-analysis inside the server, and
lets the host (the LLM driving the editor) decide whether to promote it to a
proposal — without ever embedding an LLM client in the MCP server itself.

> **Hard dependency: requires the `proposals` plugin.**
> `@mcp-vertex/issues` cannot run without `@mcp-vertex/proposals` loaded in
> the same process — every `issues_*` tool reads/writes scaffold files under
> `docs/mcp-vertex/proposals/retired/issues/**`, which is part of the `proposals`
> plugin's managed namespace. Loading `issues` without `proposals` fails the
> **entire** plugin load (no partial registration, exit code ≠ 0):
>
> ```bash
> mcp-vertex --plugins=proposals,issues
> ```
>
> ```json
> { "plugins": { "proposals": {}, "issues": { "options": { "repo": "<owner>/<name>" } } } }
> ```

## Status

**Implemented and shipped.** The 5 `issues_*` tools
(`issues_list`, `issues_fetch`, `issues_ingest`, `issues_analyze`,
`issues_resolve`) are all wired in `src/index.ts#register(ctx)` and
register conditionally on the `repo` option being set.

The recommended setup path is `mcp-vertex setup-github`, which detects the
repo from `git remote get-url origin`, asks you to confirm it, and writes the
config atomically. Manual `mcp-vertex.config.json` wiring still works when you
need it.

| Tool | Purpose | File |
|---|---|---|
| `issues_list` | List issues filtered by `state` / `labels` / `assignee`. | `src/lib/tools/list-issues.tool.ts` |
| `issues_fetch` | Fetch a single issue (cached, redacted). | `src/lib/tools/fetch-issue.tool.ts` |
| `issues_ingest` | Fetch + write a scaffold file under `docs/mcp-vertex/proposals/retired/issues/`. | `src/lib/tools/ingest-issue.tool.ts` |
| `issues_analyze` | Mechanical pre-analysis (labels, linked PRs, comments count). | `src/lib/tools/analyze-issue.tool.ts` |
| `issues_resolve` | Mark an ingested issue as resolved (move/remove the scaffold file). | `src/lib/tools/resolve-issue.tool.ts` |

See `docs/mcp-vertex/proposals/done/feats/f00029-github-issues-plugin-ingest-and-propose.md`
for the full design.

## Load it

```bash
mcp-vertex --plugins=proposals,issues
```

Without `proposals` in the same `--plugins` list, the server refuses to
boot with a combined error naming every unmet dependency, e.g.:

```
plugin "issues" requires "proposals" (not in load set)
```

### Without `repo` configured

If the plugin loads with `--plugins=proposals,issues` but
`plugins.issues.options.repo` is **not set in `mcp-vertex.config.json`**
(or is the empty string), the plugin **registers zero tools** but does
**not** error. It also emits a single `IKnowledgeEntry` named
`issues-needs-repo-config` that explains how to fix the situation. Agents
that boot the server can discover the entry via `mcp-vertex_knowledge`
or read it from `mcp-vertex_overview` (which lists knowledge ids).

**Two ways to fix it:**

1. Run the interactive setup subcommand (recommended):

  ```bash
  mcp-vertex setup-github
  ```

  The subcommand detects the GitHub repo from `git remote get-url
  origin`, verifies the auth tier (`gh` / `GITHUB_TOKEN` / anonymous),
  writes the config block, and prints the canonical launch shape.

2. Edit `mcp-vertex.config.json` manually:

   ```jsonc
   {
     "plugins": {
       "proposals": {},
       "issues": { "options": { "repo": "<owner>/<name>" } }
     }
   }
   ```

## Scope (non-goals, by design)

- **No LLM client inside the server.** The server returns structured
  analysis; the host's LLM decides whether/how to promote an issue.
- **No automatic proposal creation.** Promotion is a separate
  `proposals_create_proposal` call the host makes.
- **No write-back to GitHub.** This plugin never comments on, closes or
  labels issues.
- **Only in the `full` preset.** Among presets, this host-only plugin ships in
  `full` and nowhere else.

## Configuration

```jsonc
{
  "plugins": {
    "issues": {
      "options": {
        "repo": "owner/name",            // required for the 5 tools to register
        "scaffoldDir": "docs/mcp-vertex/proposals/retired/issues" // optional override
      }
    }
  }
}
```

| Option | Type | Default | Purpose |
|---|---|---|---|
| `repo` | `string` (e.g. `"CartagoGit/mcp-vertex"`) | — | The GitHub repo to fetch issues from. **Without it, the plugin registers zero tools + emits an `issues-needs-repo-config` knowledge entry** (discoverable via `mcp-vertex_overview` and `mcp-vertex_knowledge`). |
| `scaffoldDir` | workspace-relative path | `docs/mcp-vertex/proposals/retired/issues` | Where `issues_ingest` / `issues_resolve` write scaffold files. Must stay inside the workspace (validated by `resolveWorkspaceContained`). |

## Tools in detail

All 5 tools follow the same conventions:

- `inputSchema` is strict (no `catchall`).
- `outputSchema` is typed (see `AGENTS.md` invariant 8).
- All workspace paths are validated through `resolveWorkspaceContained`
  (no `..` escape).
- Persisted state uses `withFileMutex` + `writeFileAtomic`
  (`src/lib/github-client.ts` + `src/lib/tools/ingest-issue.tool.ts`).
- The GitHub client applies `redactSecrets` before returning
  (`src/lib/github-client.ts:fetchIssue` / `listIssues`).

### `issues_list` — list issues in the configured repo

```ts
{ state?: "open" | "closed" | "all"; labels?: readonly string[]; assignee?: string; limit?: number }
```

Returns `{ count, issues: IIssueSummary[] }`. Filter-only, no writes.

### `issues_fetch` — fetch one issue

```ts
{ number: number }
```

Returns `{ number, title, body, state, labels, author, createdAt, updatedAt, comments: number, url }`.

### `issues_ingest` — fetch + persist a scaffold

```ts
{ number: number; reason?: string }
```

Fetches the issue, runs `redactSecrets` over the body, and writes a
scaffold file to `<scaffoldDir>/<owner>-<repo>-<number>.md`. Returns
`{ scaffoldPath, summary, redactedFields: readonly string[] }`.

### `issues_analyze` — mechanical pre-analysis

```ts
{ scaffoldPath: string }
```

Reads the scaffold file, computes linked PRs, label cross-references,
comment count, and a 1-line summary. Returns `{ labels, linkedPrs,
commentCount, summary, suggestedNextAction }`.

### `issues_resolve` — mark an issue as resolved

```ts
{ scaffoldPath: string; resolution: "completed" | "rejected" | "duplicate" }
```

Removes (or moves to `scaffoldDir/resolved/`) the scaffold file.
Returns `{ removed: boolean, movedTo?: string }`.

## See also

- `docs/mcp-vertex/proposals/done/feats/f00029-github-issues-plugin-ingest-and-propose.md` — the original design proposal.
- `docs/mcp-vertex/proposals/ready/f00030-cross-project-setup-and-github-config.md` — `setup-github` subcommand + cross-project setup guide.
- `docs/mcp-vertex/CROSS-PROJECT-SETUP.md` — canonical cross-project setup.
