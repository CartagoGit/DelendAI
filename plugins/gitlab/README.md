# `@mcp-vertex/gitlab`

GitLab provider plugin for `@mcp-vertex/core`. This slice only wires the
configuration and hermetic HTTP client seams for future read-only tools; it
does not depend on `plugin-git` or on a local checkout.

## Activation requirements

1. Enable the `gitlab` plugin in the host configuration.
2. Set `GITLAB_TOKEN` or the legacy `GITLAB_PRIVATE_TOKEN` variable in the
   process environment. The token is read at runtime and must never be
   committed, persisted, logged or returned.
3. Set `GITLAB_URL` only for GitLab self-managed. Leave it unset for
   GitLab.com so the default API base URL is used.
4. Provide a default project only when it helps the host, using either a
   numeric project ID or a URL-encoded `namespace/project` path.

## Context

- The plugin stays usable without `git`.
- The HTTP client is injectable so tests can stay hermetic.
- Future read tools will reuse the same provider context and base URL.
