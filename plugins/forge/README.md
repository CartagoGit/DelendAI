# @mcp-vertex/forge

Read-only forge surface for [@mcp-vertex/core](../../docs/mcp-vertex/README-MCP-VERTEX.md):
GitHub/GitLab pull requests, remote issues and CI status through the host's
already-authenticated `gh` or `glab` CLI.

## Load it

```bash
mcp-vertex --plugins=forge
```

The plugin auto-detects GitHub vs GitLab from the `origin` remote.

## Tools

- `forge_pr_list { cwd?, limit?, state?, timeoutMs? }`
- `forge_pr_show { number, cwd?, timeoutMs? }`
- `forge_ci_status { cwd?, headSha?, failingJobsOnly?, limit?, timeoutMs? }`
- `forge_issue_list { cwd?, limit?, state?, timeoutMs? }`
- `forge_issue_show { number, cwd?, timeoutMs? }`

Each tool returns a structured `{ ok, provider, ... }` envelope and never asks
for credentials.

## Missing CLI

When the required CLI is not installed, the tool returns an actionable hint
instead of crashing.

- GitHub: `brew install gh` or `sudo apt install gh`
- GitLab: `brew install glab` or `sudo apt install glab`

## Security contract

- No PAT storage.
- No auth prompts.
- No token logging.
- Every subprocess is bounded by a timeout (15s by default).
- Stdout/stderr are redacted before surfacing back to the caller.

## Scope

S1 is read-only. Any future write actions must require `confirm: true`, but
that contract is documented only here and is not implemented in this slice.

BSD-3-Clause © Cartago# @mcp-vertex/forge

Read-only forge plugin for @mcp-vertex/core. It auto-detects GitHub or GitLab
from the origin remote and then uses the host's authenticated gh or glab CLI
through the shared runExternalTool seam.

S1 exposes:

- forge_pr_list
- forge_pr_show
- forge_ci_status
- forge_issue_list
- forge_issue_show

The plugin does not store tokens or read credentials directly. If gh or glab is
missing, the tools return a structured remediation hint instead of throwing.
