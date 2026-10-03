# @delendai/forge

Forge plugin for @delendai/core. It auto-detects GitHub or GitLab from the
origin remote, then drives the host's authenticated gh or glab CLI through the
shared external-tool seam. No personal access token is stored, prompted, or
logged by the plugin.

## Overview

The plugin covers three forge surfaces:

- Pull requests and merge requests: list, show, create, comment.
- Issues: list, show, create.
- Delivery and discovery: CI status, remote code search, release creation.

## Tools

- forge_pr_list: list open pull requests or merge requests with compact CI summary.
- forge_pr_show: show one pull request or merge request with checks and review state.
- forge_ci_status: list recent workflow or pipeline runs, jobs, and failing logs.
- forge_issue_list: list remote issues with state, labels, and author.
- forge_issue_show: show one remote issue with body and comments.
- forge_pr_create: create a pull request or merge request. Requires confirm: true.
- forge_pr_comment: comment on a pull request or merge request. Requires confirm: true.
- forge_issue_create: create a remote issue. Requires confirm: true.
- forge_search_code: search remote code on the forge with optional language/repo filters.
- forge_release: create a release from a tag. Requires confirm: true.

## Usage

```bash
delendai --plugins=forge
```

```json
{
	"tool": "forge_search_code",
	"arguments": {
		"query": "definePlugin",
		"language": "ts",
		"repo": "CartagoGit/delendai",
		"limit": 5
	}
}
```

```json
{
	"tool": "forge_release",
	"arguments": {
		"tag": "v0.1.0",
		"notes": "Ship forge S3.",
		"confirm": true
	}
}
```

## Operational notes

- Provider detection comes from the origin remote, not from a hardcoded option.
- Missing gh/glab returns a structured remediation hint instead of crashing.
- Write actions never execute without confirm: true.
- The plugin complements the local git plugin; it does not reimplement clone, diff, commit, or log.
