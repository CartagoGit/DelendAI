# 10 — Plugin `forge`

The remote-forge companion to the local `git` plugin. `forge` keeps mcp-vertex
credential-free: it wraps the host's already-authenticated `gh` or `glab` CLI
and exposes the remote collaboration surface as structured MCP tools.

---

## Why this name

The plugin talks to the remote forge, not to the local repository alone.

- `git` remains the local workspace surface: status, diff, commit, branch, log.
- `forge` owns the hosted collaboration surface: pull requests, issues, CI,
  releases and remote code search.
- The short name matches both GitHub and GitLab without baking a single vendor
  into the package slug.

The package slug is `@mcp-vertex/forge`; the runtime namespace prefix is
`forge_`.

---

## What it owns

| Surface | Read | Write |
|---|---|---|
| Pull requests / merge requests | `forge_pr_list`, `forge_pr_show` | `forge_pr_create`, `forge_pr_comment` |
| Issues | `forge_issue_list`, `forge_issue_show` | `forge_issue_create` |
| CI | `forge_ci_status` | — |
| Releases + remote code search | `forge_release { kind: "search_code" }` | `forge_release { kind: "create" }` |

The plugin deliberately does not own clone, diff, commit, log or local branch
manipulation. Those stay in `git`.

---

## Safety model

- No PAT storage, prompting or logging.
- Provider auto-detection comes from the `origin` remote.
- Missing `gh` or `glab` returns an install hint instead of crashing.
- The CLI seam is bounded and redacted.
- Every write action is consent-gated with `confirm: true`.
- Remote code search is read-only and does not require consent.

Release creation and search both reuse the same release service/tool layer, but
the write path is unskippably gated while the search path stays read-only.

---

## Tool surface

| Tool | Purpose |
|---|---|
| `forge_pr_list` | List open remote pull requests / merge requests with compact CI summary. |
| `forge_pr_show` | Show one PR / MR with checks, mergeability and review state. |
| `forge_ci_status` | Show recent workflow or pipeline runs, jobs and failing logs. |
| `forge_issue_list` | List remote issues with state, labels and author. |
| `forge_issue_show` | Show one remote issue with body and comments. |
| `forge_pr_create` | Create a PR / MR from the current branch discipline. Requires `confirm: true`. |
| `forge_pr_comment` | Post a PR / MR comment. Requires `confirm: true`. |
| `forge_issue_create` | Create a remote issue. Requires `confirm: true`. |
| `forge_release` | `kind=create` cuts a release with `confirm: true`; `kind=search_code` performs read-only remote code search. |

The plugin ships in the collaboration-oriented preset path and in the repo's
own host config so the host can see the full branch → PR → CI → release loop.

---

## Status

Implemented through proposal `f00121`.

- S1 shipped the read surface for PRs, issues and CI.
- S2 shipped the consented write surface for PRs and issues.
- S3 shipped release creation, remote code search, monorepo wiring, packaging,
  README updates and this wiki page.