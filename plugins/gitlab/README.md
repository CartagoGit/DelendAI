# `@mcp-vertex/gitlab`

GitLab read-only provider for `@mcp-vertex/core`. It works against GitLab.com
and GitLab self-managed without `plugin-git`, without a local checkout and
without requiring a configured `origin` remote.

## Activation

1. Enable the `gitlab` plugin in the host configuration.
2. Export `GITLAB_TOKEN` or the legacy `GITLAB_PRIVATE_TOKEN` only in the
    process environment.
3. Set `GITLAB_URL` only for GitLab self-managed, for example
    `https://gitlab.example/api/v4`. Leave it unset for GitLab.com.
4. Optionally set a default project by numeric project ID or by the URL-encoded
    `namespace/project` path.

Tokens are runtime-only. Do not place them in config files, tool arguments,
snapshots, proposal files or logs. The plugin reports the token source metadata
only, never the token value.

## Read-only surface

The current surface is read-only and exposes typed `inputSchema` and
`outputSchema` contracts for:

- provider context
- projects and variable metadata without values
- issues with comments
- merge requests with discussions
- commits and ref comparison
- pipelines and jobs
- bounded job logs
- artifact metadata and bounded downloads into the plugin temp dir
- releases, tags and deployments

All tools return compact normalized payloads. They do not expose raw HTTP
responses, mutation affordances or secret values.

## Limits and truncation

- Pagination is explicit through response metadata and `nextPage` where the
   GitLab API paginates.
- Job logs are truncated by byte, line and optional duration caps.
- Artifact downloads are capped by explicit byte limits and confined to the
   plugin temp dir.
- Search-like list surfaces stay bounded by validated page and per-page limits.
- Rate-limit metadata from GitLab headers is preserved in normalized response
   metadata when available.

## Errors and permissions

Use a read-only token with the minimum `read_api` and `read_repository`
permissions required by the selected tools.

The client normalizes and returns actionable failures for:

- missing token
- 401 unauthorized
- 403 forbidden
- 404 not found
- 429 rate limited
- timeout
- invalid or schema-incompatible responses

These errors do not echo the token, authorization headers or raw secret-bearing
payloads.

## Composition

- The plugin remains fully usable when `plugin-git` is disabled.
- If a local checkout exists and `plugin-git` is enabled separately, a
   higher-level agent may compose local branch or SHA context with these
   GitLab read-only results.
- The HTTP client is injectable, so tests stay hermetic and never require real
   network access.
