# @delendai/git

Git orientation plugin for
[`@delendai/core`](../../docs/delendai/README-DELENDAI.md). Status, changed files, diff
stat and recent log as structured JSON, so agents cheaply see what changed —
agnostic of language or framework. It is read-only by default; write tools are
registered only with `plugins.git.options.allowWrite: true`. Stash management
is separately opt-in with `plugins.git.options.allowStash: true`.

## Enable

```jsonc
{
	"servers": {
		"delendai": {
			"command": "bunx",
			"args": ["@delendai/core", "--plugins=git"]
		}
	}
}
```

## Tools

| Tool | Purpose |
|---|---|
| `git_status` | Branch + working-tree status (clean flag + entries). |
| `git_changed` | Just the changed file paths (cheapest orientation). |
| `git_diff` | `git diff --stat` (optionally staged or path-scoped). |
| `git_log` | Recent commits (hash + subject). |
| `git_blame` | Attribution for a file or line range. |
| `git_show` | Commit metadata and stat without a full patch. |
| `git_worktree` | List worktrees. |

With `allowWrite`, `git_commit` and `git_push` are added. Commits require a
Conventional Commit message; protected destinations are refused and the only
force mode is `with-lease`. With `allowStash`, `git_stash` is added; it is
disabled by default so agents cannot create, apply, or drop stashes unless the
host explicitly permits it.

BSD-3-Clause © Cartago
