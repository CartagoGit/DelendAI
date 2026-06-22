# Cross-project setup — wiring mcp-vertex (and the issues plugin) into any project.

Cross-project setup — wiring mcp-vertex (and the issues plugin) into any project.

## Who this is for

- A new contributor adding `mcp-vertex` to a repository for the first time.
- A new project owner who needs one canonical, repeatable launch shape.
- Anyone wiring the GitHub `issues` plugin into a repo and needing the config and auth path to match.

## Prerequisites

- `bun` installed so the host can launch `mcp-vertex`.
- `git` installed so the setup can detect the current GitHub remote.
- Optional `gh` CLI if you want the preferred `gh` auth tier instead of token or anonymous REST access.

## The 7 steps

### 1. Detect repo

What it does: reads the current repository remote and normalizes it to the GitHub HTTPS shape `https://github.com/<owner>/<name>.git`. The setup flow uses this as the default source for `owner/name`.

How to verify: the normalized value matches `^https://github\.com/[^/]+/[^/]+$` after stripping the trailing `.git`.

```bash
git remote get-url origin

# expected raw shape:
# https://github.com/<owner>/<name>.git
```

### 2. Confirm owner/name

What it does: asks you to confirm the detected `owner/name` pair before anything is written. The default comes from step 1, but you can override it if the repo remote is missing or points at the wrong fork.

How to verify: the final confirmed value is exactly `<owner>/<name>` and matches the repository you intend to query.

```bash
# implemented by S2 of this proposal:
mcp-vertex setup-github

# prompt shape:
# Detected repository: <owner>/<name>
# Confirm repository [<owner>/<name>]:
```

### 3. Pick auth tier

What it does: chooses the first working tier in this order: `gh`, `rest-authed`, then `rest-anon`. `gh` is healthy when `gh auth status` exits `0`; `rest-authed` is used when `GITHUB_TOKEN` is set; `rest-anon` is the fallback and must warn about the `60` requests/hour limit.

How to verify: `gh auth status` exits `0`, or `printenv GITHUB_TOKEN` prints a value, or the setup explicitly reports `rest-anon` with the rate-limit warning.

```bash
gh auth status
printenv GITHUB_TOKEN

# preferred order:
# 1. gh
# 2. rest-authed
# 3. rest-anon (warn: 60 req/h)
```

### 4. Write config

What it does: writes `mcp-vertex.config.json#plugins.issues.options.repo` atomically and preserves unrelated config keys. Tokens are never persisted to disk; that follows the `redactSecrets` invariant, so auth stays in `gh` or environment state rather than in the config file.

How to verify: re-read `mcp-vertex.config.json` and assert that `plugins.issues.options.repo` equals `<owner>/<name>`.

```bash
cat mcp-vertex.config.json

# expected block:
# {
#   "plugins": {
#     "issues": {
#       "options": {
#         "repo": "<owner>/<name>"
#       }
#     }
#   }
# }
```

### 5. Verify tier

What it does: invokes `issues_fetch` against a sentinel issue to prove that the selected auth tier can actually talk to GitHub. Implemented by S2 of this proposal, with the sentinel chosen as the last open issue or the user's own `#1`.

How to verify: the response completes and its `tier` field matches the effective tier you expect.

```bash
# implemented by S2 of this proposal:
mcp-vertex issues fetch --issue 1

# or the equivalent MCP tool call:
# issues_fetch { "issue": 1 }
```

### 6. Print invocation

What it does: prints the exact command your host should launch after setup. The default is `mcp-vertex --plugins=proposals,issues --preset=full`; if the catalog picks a different explicit plugin set, the printed line must match that catalog output exactly.

How to verify: the emitted command string is exactly `mcp-vertex --plugins=proposals,issues --preset=full` or the matching `--plugins=...` line chosen by the catalog.

```bash
mcp-vertex --plugins=proposals,issues --preset=full
```

### 7. Mark configured

What it does: optionally appends `setup_github_completed_at: <iso>` to the repo config so a later run can tell the setup has already been completed once. This marker is opt-in and does not change plugin loading by itself.

How to verify: re-read `mcp-vertex.config.json` and confirm `setup_github_completed_at` exists and is an ISO timestamp.

```bash
cat mcp-vertex.config.json

# expected extra field when opted in:
# "setup_github_completed_at": "2026-06-22T12:34:56.000Z"
```

## Troubleshooting

- `401 Unauthorized`: your `GITHUB_TOKEN` expired or no longer has the expected access. Re-export a valid token or switch to `gh auth login`, then rerun tier verification.
- `403 Forbidden` with low remaining quota: you are on `rest-anon` and hit the anonymous rate limit. Wait for the window to reset or move to `gh` or `rest-authed`.
- `404 Not Found`: the configured `owner/name` is wrong, usually due to the wrong fork or a typo. Re-run detection and confirmation, then verify the repo slug before retrying.
- `mcp-vertex.config.json` not writable: fix file permissions or workspace ownership, then rerun the config-write step so the atomic patch can complete.
- The issues plugin is not loaded: your host launch shape is missing `--preset=full` or the needed explicit plugin list. Relaunch with the printed invocation and confirm the `issues` tools appear.

## See also

- [README-MCP-VERTEX.md](README-MCP-VERTEX.md)
- [IDE-EXTENSION.md](IDE-EXTENSION.md)
- [CROSS-IDE.md](CROSS-IDE.md)
- [PLUGINS-MCP-VERTEX.md](PLUGINS-MCP-VERTEX.md)