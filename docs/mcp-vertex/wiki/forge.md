# Forge Plugin

Updated: 2026-07-24

## What it is

The forge plugin closes the gap between local git state and the remote forge.
It lets an agent inspect and act on GitHub or GitLab through the host's
existing gh or glab authentication, without handling tokens directly.

## Surface

- PR and MR reads: forge_pr_list, forge_pr_show.
- PR and MR writes: forge_pr_create, forge_pr_comment.
- Issue reads and writes: forge_issue_list, forge_issue_show, forge_issue_create.
- CI visibility: forge_ci_status.
- Remote discovery: forge_search_code.
- Release cut: forge_release.

## Design notes

- Provider auto-detection comes from git remote origin.
- Every CLI call goes through the shared external-tool seam, so command policy,
  bounded execution, and install remediation stay centralized.
- The release surface is consent-gated. A release is never created unless
  confirm: true is present.
- Remote code search normalizes GitHub and GitLab results into a compact hit
  list: path, repository, fragment.

## When to use it

- You need PR, issue, CI, release, or code-search visibility that the local git plugin cannot provide.
- You already have gh or glab authenticated on the host machine.
- You want proposal-aware PR creation without introducing PAT storage into mcp-vertex.

## Constraints

- No PAT storage, prompts, or logging.
- No local git replacement.
- No write action without explicit consent.
- Availability depends on gh or glab being installed and authenticated.