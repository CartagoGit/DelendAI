# `@mcp-vertex/gitlab`

GitLab provider plugin for `@mcp-vertex/core`. This slice wires the
configuration, hermetic HTTP client and read-only resource tools; it does not
depend on `plugin-git` or on a local checkout.

## Activation requirements

1. Enable the `gitlab` plugin in the host configuration.
2. Set `GITLAB_TOKEN` or the legacy `GITLAB_PRIVATE_TOKEN` variable in the
   process environment. The token is read at runtime and must never be
   committed, persisted, logged or returned.
3. Set `GITLAB_URL` only for GitLab self-managed. Leave it unset for
   GitLab.com so the default API base URL is used.
4. Provide a default project only when it helps the host, using either a
   numeric project ID or a URL-encoded `namespace/project` path.

## Read tools

The plugin now exposes read-only tools for context, projects, issues, merge
requests, comments/discussions, commits, ref comparison, pipelines, jobs,
limited logs, artifacts, releases, tags and deployments. Pagination is
explicit and search surfaces are bounded.

## Context

- The plugin stays usable without `git`.
- The HTTP client is injectable so tests can stay hermetic.
- Artifact downloads are confined to the plugin temp dir and are capped by
  explicit byte limits.
- The tools never return raw HTTP responses or secret values.
