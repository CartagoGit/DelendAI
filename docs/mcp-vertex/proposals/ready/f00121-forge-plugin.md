---
id: f00121
kind: feat
title: forge plugin — GitHub/GitLab PRs, remote issues, CI status and releases via the host's authenticated CLI
status: ready
date: 2026-07-23
track: plugin+forge+collab
---

# f00121 — forge plugin

## goal

Close mcp-vertex's **local-only git** gap with a `forge` plugin that lets an
agent see and act on the remote forge: list/show/create/review **pull
requests**, read/write **remote issues**, read **CI status + failing logs**,
and cut **releases** — plus remote **code search**. It drives the host's
already-authenticated `gh` (GitHub) / `glab` (GitLab) CLI through the shared
external-tool core (r00012) and command-policy, so **no personal access token
is ever stored, read, or logged**. Project-aware: PR bodies and branch
discipline follow the repo's own conventions, and a `proposals`/`issues`
document maps cleanly onto a PR.

## why

GitHub is the single most-adopted developer MCP server, and mcp-vertex's `git`
plugin is **local-only** — agents can't see PR or CI state today. This is the
highest daily dogfooding win: this very repo's workflow is branch → PR → CI →
merge-to-develop, all on GitHub, and the whole loop is currently invisible to
the agent. Wrapping the user's existing `gh` auth means zero secret handling
and instant value.

## why this design

Wrap the **already-authenticated** `gh`/`glab` CLI via r00012's runner rather
than embedding an API client or storing PATs — it inherits the user's auth,
handles enterprise hosts, and keeps mcp-vertex out of the credential business
entirely. All formatters are **pure over an injected exec**, so PR/CI parsing
is unit-tested without network. `forge` **complements** local `git` (never
duplicates commit/diff/log) and integrates with `proposals`/`issues` (a
proposal becomes a conventional PR body). Provider (`gh` vs `glab`) is
auto-detected from the `origin` remote.

## non-goals

- No PAT storage, prompting, or logging — auth is entirely the host CLI's.
- No write action without explicit consent — opening a PR, commenting,
  merging, or creating a release each require an explicit confirm flag.
- No re-implementation of local git — clone/commit/diff/log stay in `git`.
- No hosted webhook server or long-lived listener — request/response only.

The presence probe + install hint (`gh`/`glab` missing → one-command fix),
bounded/redacted exec, and normalized results all come from r00012, so `forge`
stays a thin adapter: map the CLI's JSON output into the shared shapes.

## slices

### S1 — read surface (PR / CI / issues)

- **Status**: done (2026-07-24)
- **Files**: `plugins/forge/src/lib/read/`, `plugins/forge/src/lib/tools/forge-read.tool.ts`
- **Gate**: bun run validate

`forge_pr_list`, `forge_pr_show`, `forge_ci_status` (+ failing-job logs) and
`forge_issue_list`/`forge_issue_show` over `gh`/`glab --json`, via r00012's
probe + runner. Pure parsers over an injected exec; provider auto-detected
from the remote. Missing CLI → actionable install hint, never a crash.

Close evidence: `plugins/forge/` now contains the read-only surface, schema
coverage and stub-exec tests for provider detection, PR/CI parsing and issue
reads, validated with plugin-local tests plus repo typecheck/lint gates.

### S2 — write surface (consented)

- **Status**: done (2026-07-24)
- **Files**: `plugins/forge/src/lib/write/`, `plugins/forge/src/lib/tools/forge-write.tool.ts`
- **Gate**: bun run validate

`forge_pr_create` (body assembled from the linked proposal/commits, honouring
branch discipline), `forge_pr_comment`, `forge_issue_create` — each requires an
explicit `confirm: true`. Body/templating is pure; only the final call spawns.

Close evidence: `plugins/forge/` now exposes the consented write surface with
strict input/output schemas, confirm-gate tool coverage, stub-exec service
tests for PR creation/commenting and issue creation, and the plugin entry now
registers the write tools alongside the landed S1 read surface.

### S3 — releases, remote code search, packaging

- **Status**: pending
- **Files**: `plugins/forge/src/lib/tools/forge-release.tool.ts`, `plugins/forge/README.md`, `docs/mcp-vertex/wiki/`
- **Gate**: bun run validate

`forge_release` (consented) and `forge_search_code` (remote search). Full
wiring (via f00120 when available), README, wiki, catalog registration, and
membership in the collaboration-oriented packs (r00011).

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`, `catalog:check`).
- With `gh` authenticated, `forge_pr_list` shows this repo's open PRs and
  `forge_ci_status` its latest run; `forge_pr_create` produces a conventional
  body from a proposal.
- No token is ever written or logged; a missing `gh`/`glab` yields an install
  hint, not a failure.
- All write tools refuse to act without `confirm: true`.

## notes

Reuses r00012 (runner/probe/finding), command-policy, and the
`proposals`/`issues` model. Prior art: the official GitHub MCP server — but
`forge` is project-aware (branch discipline, proposal→PR) and credential-free.
