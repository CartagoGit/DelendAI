# @delendai/github

GitHub provider for @delendai/core. The default surface is read-only. Remote mutations are a separate opt-in capability and stay disabled unless the host explicitly enables them. The plugin works without plugin-git, without a local checkout, and without relying on a local remote origin.

## What this plugin is for

Use this plugin when you want mcp-vertex to read a GitHub repository directly over the GitHub API. For this repository, the remote project slug is `CartagoGit/delendai`.

This is the normal fit when you need to:

- inspect repository metadata and constrained repository search
- read issues, pull requests, comments, reviews, commits, statuses, and checks
- inspect workflows, runs, jobs, truncated logs, artifacts metadata, releases, tags, and deployments
- work from a remote repository even when you do not have plugin-git loaded or a local checkout available

## Activation

The activation flow has two parts:

1. export the token in the shell that launches mcp-vertex
2. load the `github` plugin in `mcp-vertex.config.json`

Export the token only through the environment:

```sh
export GITHUB_TOKEN=your-token-here
```

For GitHub Enterprise Server, also export the API base URL:

```sh
export GITHUB_API_URL=https://ghe.example/api/v3
```

If `GITHUB_API_URL` is unset, the plugin targets GitHub.com.

Do not place the token in `mcp-vertex.config.json`, tool arguments, snapshots, or logs.

## Configure the remote repository

You can provide the default repository either through environment variables or through plugin options.

Environment-based repository selection:

```sh
export GITHUB_OWNER=CartagoGit
export GITHUB_REPOSITORY=mcp-vertex
```

Config-based repository selection in `mcp-vertex.config.json`:

```json
{
	"plugins": {
		"github": {
			"options": {
				"defaultRepository": {
					"owner": "CartagoGit",
					"repository": "mcp-vertex"
				}
			}
		}
	}
}
```

If both environment variables and plugin options are present, the plugin can resolve repository context without needing a local checkout.

## Minimal read-only setup for mcp-vertex

The smallest practical setup for read-only access to the remote repository is:

```json
{
	"plugins": {
		"github": {
			"options": {
				"defaultRepository": {
					"owner": "CartagoGit",
					"repository": "mcp-vertex"
				}
			}
		}
	}
}
```

And in the launching shell:

```sh
export GITHUB_TOKEN=your-token-here
```

Add `GITHUB_API_URL` only when you are targeting GitHub Enterprise Server.

## Minimum permissions

Use a read-only token with only the scopes needed for the data you intend to query. For the default read surface, keep the token limited to the minimum read permissions for:

- repository metadata
- contents metadata
- issues
- pull requests
- Actions and checks
- releases
- deployments

If you later enable remote mutations, prefer a separate token or a narrower write-scoped token for that specific operation instead of broadening the read-only token.

## Operating without plugin-git or a local checkout

This plugin is designed to operate independently.

- It does not require plugin-git.
- It does not require a checked out copy of `CartagoGit/delendai`.
- It does not need a local `origin` remote to discover the repository.
- It can resolve the remote repository directly from `GITHUB_OWNER` and `GITHUB_REPOSITORY`, or from `plugins.github.options.defaultRepository`.

That means you can point mcp-vertex at the remote repository even from a clean environment that only has the plugin configuration and the required environment variables.

## Optional composition with git

Plugin-git is optional, not a prerequisite.

If you do have a local checkout, you can compose this plugin with git-oriented tooling or agents to combine:

- local branch and diff context from git
- remote repository data from the GitHub API

The GitHub plugin still remains independently usable. Loading plugin-git does not replace the need for `GITHUB_TOKEN`, and not loading plugin-git does not reduce the GitHub plugin's read-only capabilities.

## Read-only surface

The default surface is read-only and includes:

- provider context
- repositories and constrained search
- Actions variables metadata without secret values
- issues and pull requests, including comments and reviews where applicable
- commits, commit statuses, and check runs
- workflows, runs, jobs, and truncated logs
- artifacts metadata, releases, tags, deployments, and deployment statuses

Artifacts are exposed as metadata and optional plugin-cache snapshots only. Large artifact payloads are not downloaded. Log responses support byte, line, and time-budget truncation with explicit truncation metadata.

All tools return compact typed envelopes with explicit input and output schemas, bounded limits, explicit pagination where relevant, and normalized errors. They do not expose raw HTTP responses.

The read-only surface is tested hermetically for HTTP 200, pagination, 401, 403, 404, 429, timeout, invalid payloads, rate limiting, and truncation. The token value is never printed in errors, logs, snapshots, or structured outputs. Only its safe provenance is retained, for example `env:GITHUB_TOKEN`.

## Optional remote mutations

Mutable tools remain disabled unless the host explicitly sets `plugins.github.options.allowWrite: true`. A write-capable token alone does not enable that surface.

Operational invariants:

- every mutation requires `confirm: true`
- mutable requests do not auto-retry, including on 401, 403, or 429
- results remain typed and normalized under the same input and output schema contract
- audit receipts redact tokens, authorization headers, and known sensitive text
- idempotency guards reduce accidental duplicate writes and normalize duplicate tag or release outcomes

Rollback expectations:

- issue updates and comments require a new corrective mutation
- workflow and repository dispatches should be treated as irreversible triggers
- duplicate release or tag creation returns a typed `duplicate` result instead of auto-retrying
- accidental release or tag creation must be corrected by an explicit follow-up mutation with a new confirmation

## Operational behavior

- GitHub.com and GitHub Enterprise Server share the same read-only contract; only the base URL and reported host change.
- 401, 403, 404, 429, timeout, and invalid payload responses are normalized into actionable envelopes.
- The plugin test suite does not rely on real network access.