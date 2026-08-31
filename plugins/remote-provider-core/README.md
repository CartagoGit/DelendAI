# `@mcp-vertex/remote-provider-core`

Shared foundation for read-only remote HTTP providers (GitHub, GitLab).
This package exposes validated configuration, an injectable HTTP client,
secret redaction, hard output limits, and SSRF-safe URL validation.

## Activation requirements

### GitHub

To use a remote provider against the repository that hosts `mcp-vertex` on GitHub:

1. Enable the `github` plugin in the host configuration.
2. Set `GITHUB_TOKEN` to a token owned by the user or automation identity running
   mcp-vertex. The token is read at runtime and **must never** be committed,
   persisted in config, logged, or returned by a tool.
3. Set `GITHUB_API_URL` **only** when using GitHub Enterprise Server.  Leave it
   unset for GitHub.com (the provider uses `https://api.github.com` by default).
4. Provide the repository as `owner` and `repository`, or configure equivalent
   defaults. Use the GitHub owner and repository that actually host `mcp-vertex`;
   do not infer them from the local folder name.
5. For read-only inspection, grant the minimum `repo` visibility required by the
   selected tools. A token with write permissions is not required.

### GitLab

To use a remote provider against the repository that hosts `mcp-vertex` on GitLab:

1. Enable the `gitlab` plugin in the host configuration.
2. Set `GITLAB_TOKEN` (or the documented legacy `GITLAB_PRIVATE_TOKEN` variable)
   to a token owned by the user or automation identity running mcp-vertex. The
   token is read at runtime and **must never** be committed, persisted in config,
   logged, or returned by a tool.
3. Set `GITLAB_URL` when using GitLab self-managed. Leave it unset for GitLab.com
   (the provider uses `https://gitlab.com` by default). The value must be an
   `https://` URL; `http://` and bare IP addresses are rejected at startup.
4. Provide the project as a numeric project ID or URL-encoded `namespace/project`
   path, or configure an equivalent default. Use the GitLab project that actually
   hosts `mcp-vertex`; do not infer it from the local folder name.
5. For read-only inspection, grant the minimum `read_api` and `read_repository`
   access required by the selected tools. A token with write permissions is not
   required.

### Local checkout composition

If the host also enables the `git` plugin, the agent may combine local context
(current branch, commit SHA, diff, remotes, worktrees) with remote provider data.
**This is optional composition only.** GitHub and GitLab remain fully usable when:

- the `git` plugin is disabled, or
- no local checkout exists, or
- the local origin does not match the configured remote project.

GitHub and GitLab **do not depend on** the `git` plugin. The `git` plugin
contributes local-only context as an independent, opt-in source.

### Diagnostic composition

The shared diagnostic engine lives in `@mcp-vertex/remote-provider-core` and the
provider-specific adapters live in `@mcp-vertex/github` and `@mcp-vertex/gitlab`.
Each adapter reuses its plugin's existing read-only HTTP client and translates the
provider's runs, jobs, logs and artifacts into the common remote-diagnostics model.

- `diagnoseGitHubWorkflow(...)` reconstructs a GitHub Actions workflow run.
- `diagnoseGitLabPipeline(...)` reconstructs a GitLab pipeline.

Both adapters stay read-only:

- They never dispatch workflows, retry pipelines, comment, cancel or mutate state.
- They only fetch bounded evidence and let the common engine produce the
   summary, probable cause and proposed fix.
- The proposed fix is conceptual diagnostic output, not an instruction to mutate
   the remote provider automatically.

Optional higher-level composition remains explicit and external to this package:

- `git` may enrich the diagnosis with local branch, diff or worktree context.
- `logs` may persist or forward the final diagnostic report, but diagnostics do
   not require that plugin at runtime.
- `proposals` may capture the proposed fix as tracked follow-up work.
- `quality` may validate a human-approved fix after diagnosis.
- `notification` may announce the final result or handoff.

None of those integrations are imported or required by the provider adapters.

---

## Security

### Secret redaction (`redaction.ts`)

Tokens, auth headers, and values of environment variables whose names contain
`token`, `secret`, `password`, `api_key`, `auth`, `credential`, or `private`
are replaced with `[REDACTED]` before any string leaves the plugin boundary
(errors, logs, tool outputs, snapshots).

### SSRF protection (`url-policy.ts`)

`assertSafeBaseUrl` enforces:

- Only `https:` scheme is accepted.
- Loopback (`127.x`, `::1`), private (`10.x`, `172.16–31.x`, `192.168.x`),
  link-local (`169.254.x`), cloud metadata, and raw IP addresses are rejected.
- Operator-supplied `allowedHosts` can allow-list specific hostnames for
  on-premises deployments.

### Output limits (`limits.ts`)

| Limit          | Default | Enforcement           |
| -------------- | ------- | --------------------- |
| `maxBytes`     | 512 000 | `applyByteLimit`      |
| `maxLines`     | 4 000   | `applyLineLimit`      |
| `maxPages`     | 10      | `shouldFetchNextPage` |
| `maxArtifacts` | 500     | `shouldFetchNextPage` |

Truncation metadata is always included in the tool response so agents know
what was omitted.

---

## Architecture notes

- **No dependency on `plugin-git`.**  This package may be used without a local
  checkout.
- **Injectable dependencies.**  `fetch`, the clock, and backoff are injected so
  tests run without a real network.
- **Read-only.**  No mutable operations are exposed; retries are only applied to
  transient failures (5xx, network errors) and never to mutations.