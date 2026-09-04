# `@delendai/commit-policy`

> Commit-authority plugin for `@delendai/core`. Configurable identity, cadence
> and audit-trail policy on top of the [`git`](../../git) plugin's primitives.
> Off by default — opt in via `delendai.config.json`.

## What it does

`@delendai/git` already exposes `git_commit` / `git_push` — but only as
primitives: every agent has to choose the author, decide when to push, and
remember to add an audit trailer. `commit-policy` wraps those primitives with
three configurable policies and exposes five tools to drive the engine:

| Tool                                      | Purpose                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `commit_policy_status`                    | Read-only snapshot of the effective configuration.                       |
| `commit_policy_commit`                    | Commit through the engine (identity + audit + protected-branch refusal). |
| `commit_policy_push`                      | Push through the engine (protected-branch refusal + force policy).       |
| `commit_policy_run`                       | Manually fire any configured trigger.                                    |
| `commit_policy_refresh_branch_protection` | Refresh remote branch protection on demand.                              |

The engine is **off by default**: no host sees a single commit unless they
opt in. See "Configuration" below for the exact knobs.

## Configuration

```jsonc
// delendai.config.json
{
  "plugins": {
    "commit-policy": {
      "options": {
        "commit":   { "enabled": true },
        "push":     { "enabled": true, "onCommit": true },
        "cadence":  { "triggers": [{ "kind": "slice" }] },
        "identity": { "mode": "explicit", "owner": { "name": "Cartago", "email": "cartago@example.com" } }
      }
    }
  }
}
```

| Knob                           | Default              | What it controls                                                                                                                                                            |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit.enabled`               | `false`              | Master switch — no commit ever without `true`.                                                                                                                              |
| `commit.requireConventional`   | `true`               | Refuse non-Conventional-Commit messages.                                                                                                                                    |
| `commit.autoScopeFromProposal` | `true`               | Wrap bare `feat: x` as `feat(<proposalId>): x` when a slice context is present.                                                                                             |
| `commit.refuseWhenDisabled`    | `true`               | Surface a typed refusal instead of silently dropping the call.                                                                                                              |
| `stash.enabled`                | `false`              | Whether agents may use git stash operations. Keep `false` to require work on the current branch.                                                                            |
| `identity.mode`                | `"global"`           | One of `explicit / agent / repo / global / env / auto`.                                                                                                                     |
| `identity.owner`               | _none_               | Required when `mode === "explicit"` — `{ name, email }`.                                                                                                                    |
| `cadence.triggers`             | `[]`                 | Empty array = no automatic commits; configured `slice` and `interval` triggers run in the background, while `threshold` and `manual` are fired through `commit_policy_run`. |
| `cadence.triggers[].kind`      | —                    | `"slice" \| "threshold" \| "interval" \| "manual"`.                                                                                                                         |
| `cadence.sliceScoping`         | `true`               | `true` scopes commits to the slice's `files:` list; `false` commits the current dirty workspace snapshot when a slice closes.                                               |
| `cadence.allowForeignChanges`  | `false`              | Explicitly permits slice commits to include dirty files changed by other agents. When enabled, the shared-workspace snapshot is used for slice commits.                     |
| `audit.trailer`                | `"none"`             | `"none" \| "co-authored-by" \| "body-metadata"`. Default `"none"` keeps LLM attribution off GitHub (f00500). Set explicitly to `"co-authored-by"` only if a project needs the trailer. |
| `audit.agentFormat`            | `"${host}/${model}"` | Template for the agent portion of the trailer.                                                                                                                              |
| `push.enabled`                 | `false`              | Master switch — no push ever without `true`.                                                                                                                                |
| `push.onCommit`                | `false`              | Push immediately after every successful commit.                                                                                                                             |
| `push.everyNCommits`           | _none_               | Push every N commits (alternative to `onCommit`).                                                                                                                           |
| `push.everyNMinutes`           | _none_               | Push every N minutes if there are unpushed commits.                                                                                                                         |
| `push.force`                   | `"with-lease"`       | `"with-lease" \| "allow" \| "never"`.                                                                                                                                       |
| `push.protectedBranches`       | `[]`                 | Exact branch names configured here are protected; no names are assumed.                                                                                                     |
| `push.remote` / `push.branch`  | _none_               | Optional explicit defaults; falls back to upstream / current branch.                                                                                                        |
| `push.providerByHost`          | _none_               | Optional host-to-provider map for self-hosted GitHub/GitLab remotes, for example `{ "git.example.test": "gitlab" }`.                                                        |

Remote branch protection is refreshed manually by
`commit_policy_refresh_branch_protection`. The adapter uses `push.remote` when
configured, then the current upstream remote, then `origin` as a compatibility
fallback. GitHub and GitLab public hosts are supported through their
authenticated CLIs; self-hosted hosts can be mapped with `push.providerByHost`;
unmapped hosts return an explicit `unsupported` state and leave the local configuration active. The refresh is not executed during
plugin registration unless the host explicitly sets
`DELENDAI_COMMIT_POLICY_REFRESH_BRANCH_PROTECTION_ON_REGISTER=true`.

### Branch rules

Before an automatic commit or push, inspect `commit_policy_status` and its
`branchPolicy` field:

- `push.protectedBranches` and `push.protectedPrefixes` are the only local protection source; both default to empty lists.
- Any other branch permits direct commit and push when `commit.enabled` and
  `push.enabled` are enabled.
- Any branch, including `main`, `develop`, and `master`, permits direct commit and push when it is absent from those configured lists and the relevant switches are enabled.
The remote provider check is available through
`commit_policy_refresh_branch_protection`. Its result includes `fresh`,
`stale`, `unsupported` or `error`, together with the remote name/host and the
effective protected branches. Unsupported remotes and missing authentication
do not replace the local policy.

### Identity modes

| Mode       | Resolves to                                                                                |
| ---------- | ------------------------------------------------------------------------------------------ |
| `explicit` | The owner declared in `identity.owner` (host-supplied).                                    |
| `agent`    | The LLM host identity (`host + model`) when one is wired; otherwise the global git config. |
| `repo`     | The repo-local `git config user.name / user.email`, falling back to global.                |
| `global`   | `git config --global user.name / user.email`.                                              |
| `env`      | `GIT_AUTHOR_NAME` + `GIT_AUTHOR_EMAIL` from the process environment.                       |
| `auto`     | Deterministic priority: `env → global → repo → agent`.                                     |

### Trigger kinds

| Kind        | Fires when                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `slice`     | A `proposals` slice transitions to a configured status (default `done`). Polls the proposals `index.json` every 1 s.                           |
| `threshold` | `git status --porcelain` reports at least N dirty files (default 10). Manual only — the agent calls `commit_policy_run { kind: "threshold" }`. |
| `interval`  | At least N minutes have elapsed since the last fire and the worktree is dirty. Runs automatically when configured.                             |
| `manual`    | Always available, regardless of `cadence.triggers`.                                                                                            |

### Push force policy

| `push.force`             | Maps to                                            |
| ------------------------ | -------------------------------------------------- |
| `"with-lease"` (default) | `git push --force-with-lease` — safe force.        |
| `"allow"`                | `git push --force` — only when you really mean it. |
| `"never"`                | No `--force` flag ever.                            |

### Compatibility with other plugins

The host configuration is the persistent authority. `commit-policy` can
complement other plugins when their effects are distinct, but startup is
blocked before registration when effective options contradict each other.
Diagnostics name the exact keys and values, state precedence, and include a
JSON patch for `delendai.config.json`.

For slice automation, `commit-policy` owns persistence whenever its commit
policy is enabled with a `slice` cadence. In that case, `proposals` resolves
its effective persistence mode to `"none"`, even if its configured fallback is
`"commit"` or `"commit-and-push"`. Without an enabled slice policy,
`proposals.persist.mode` remains the fallback owner. Both plugins may be
loaded together, and `commit-policy` also works without `proposals`.

`push.branch` is a branch name, not a refspec. A value such as
`HEAD:wip/example` is rejected with `INVALID_PUSH_BRANCH_TARGET`. An enabled
automatic push also cannot target a branch listed in `push.protectedBranches`.

## Tools

### `commit_policy_status`

Read-only snapshot. Reports:

- `commit.enabled`, `commit.requireConventional`, etc.
- `identity.mode` and the **effective author** (already resolved).
- `cadence.triggerCount`, `cadence.triggers[]`, `cadence.sliceScoping`.
- `push.enabled`, `push.onCommit`, `push.everyNCommits`, `push.everyNMinutes`,
  `push.force`, `push.protectedBranches`, `push.remote`, `push.branch`.

Bilingual summary via `DELENDAI_LOCALE` (`en` default, `es` available).

### `commit_policy_commit`

```jsonc
{
  "message": "feat: dogfood smoke",
  "files": ["plugins/commit-policy/src/index.ts"],
  "slice": {
    "proposalId": "f00181",
    "sliceId": "S3",
    "files": ["plugins/commit-policy/src/index.ts"]
  }
}
```

Refuses when:

- `commit.enabled` is `false`.
- `identity` cannot resolve to a non-empty `Name <email>`.
- The current branch is in `push.protectedBranches` (when `slice` is set).
- The message does not start with a Conventional Commit prefix (when
  `commit.requireConventional` is `true`).

### `commit_policy_push`

```jsonc
{ "remote": "origin", "branch": "develop", "force": "with-lease" }
```

Refuses when `push.enabled` is `false`, when the target branch is in
`push.protectedBranches`, or when the policy forces `never`. Honors the
configured `force` policy unless overridden.

### `commit_policy_run`

```jsonc
{ "kind": "slice" | "threshold" | "interval" | "manual" }
```

`manual` always works (as long as `commit.enabled` is `true`). The other
kinds are gated by `cadence.triggers`: passing one that isn't configured
returns a structured refusal.

## Dogfooding on this repo

The root `delendai.config.json` opts in with:

```jsonc
"commit-policy": {
  "options": {
    "commit":   { "enabled": true },
    "push":     { "enabled": true, "onCommit": true, "force": "with-lease",
                  "protectedBranches": ["main", "master"],
                  "remote": "origin", "branch": "develop" },
    "cadence":  { "triggers": [{ "kind": "slice" }] },
    "identity": { "mode": "global" }
  }
}
```

That means: every time a `proposals` slice transitions to `done`, the engine
commits as the configured explicit owner and pushes the result to
`origin/develop` (with `--force-with-lease`). Only branches listed in
`protectedBranches` or matching `protectedPrefixes` are refused; `main` and
`master` have no special treatment.
This repository also enables `cadence.allowForeignChanges`, so the snapshot
may include work from other agents and may be committed before the wider task
is complete.

## Why off by default

The plugin is **conservative by design**. Hosts must explicitly enable
commits (`commit.enabled`) and pushes (`push.enabled`) so accidental
adoption never produces an unintended commit, much less an unintended
push. The defaults are safe to ship — running with the plugin loaded and
no options set is a no-op.

## License

BSD-3-Clause © Cartago