# @mcp-vertex/issues

Opt-in **GitHub issues** plugin for [`@mcp-vertex/core`](../../packages/core).
Ingests a GitHub issue, runs a mechanical pre-analysis inside the server, and
lets the host (the LLM driving the editor) decide whether to promote it to a
proposal — without ever embedding an LLM client in the MCP server itself.

> **Hard dependency: requires the `proposals` plugin.**
> `@mcp-vertex/issues` cannot run without `@mcp-vertex/proposals` loaded in
> the same process — every `issues_*` tool reads/writes scaffold files under
> `docs/proposals/retired/issues/**`, which is part of the `proposals`
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

This package currently ships the **plugin skeleton and the `dependsOn`
contract only** (S1 of the proposal). The plugin loads, declares its
dependency on `proposals`, and registers zero tools. The GitHub client,
scaffold builder and the 5 `issues_*` tools (`issues_list`, `issues_fetch`,
`issues_ingest`, `issues_analyze`, `issues_resolve`) land in later slices —
see `docs/proposals/ready/f00029-github-issues-plugin-ingest-and-propose.md`
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

## Scope (non-goals, by design)

- **No LLM client inside the server.** The server returns structured
  analysis; the host's LLM decides whether/how to promote an issue.
- **No automatic proposal creation.** Promotion is a separate
  `proposals_create_proposal` call the host makes.
- **No write-back to GitHub.** This plugin never comments on, closes or
  labels issues.
- **Not in the `swarm` preset.** Opt-in only, same shape as `plugins/logs`
  and `plugins/web-fetch`.
