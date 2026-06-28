---
id: c00086
status: done
type: proposal
track: swarm+coordination+governance
date: 2026-06-28
closed: 2026-06-28
kind: chore
title: swarm commit discipline - worktree-only commits + conventional guards
shipped-in:
  - ec6eaedf # S1+S2+S3+S4: 3 lints + lefthook + package.json wire-up
recan: []
related:
  - f00075 # swarm hygiene routine (front-hook in auto_work, S4 enforcement at the orchestrator level)
  - f00082 # commit author policy (closes the loop on the author side)
  - f00083 # anti-duplication guard (host-instructions lint; S1 already shipped)
ownership:
  - { agent: implementation_runner, task: 'S1: pre-commit guard - commit-branch-discipline lint refuses substantive commits to develop' }
  - { agent: implementation_runner, task: 'S2: pre-push guard - push-to-develop-discipline lint refuses `git push origin develop` from develop' }
  - { agent: implementation_runner, task: 'S3: commit-msg guard - commit-msg-conventional lint validates conventional commit format' }
  - { agent: implementation_runner, task: 'S4: wire into lefthook + package.json - the 3 hooks BLOCK (no `|| true`); commit-msg stays hook-only to avoid breaking `validate` for past offenders' }
  - { agent: delivery_verifier, task: 'V1: confirm `bun run validate` is green, the 3 new specs pass (81/81), and a develop-direct commit that touches `packages/` is BLOCKED by the pre-commit hook' }
globalGate: validate
acceptance:
  - { command: bun run typecheck,        expect: exit0 }
  - { command: bun run lint:tools,       expect: exit0 }
  - { command: bun run lint:proposals,   expect: exit0 }
  - { command: bun run lint:host-instructions, expect: exit0 }
  - { command: bun test tools/scripts/lint/, expect: exit0 }
  - { command: bun run validate,         expect: exit0 }
---

# c00086 — swarm commit discipline

## Goal

Enforce the worktree-isolation discipline for the swarm: agents MUST
commit on a feature branch (`agent/<name>-<id>`) and reach `develop`
only via PR / merge, never via direct push. Direct commits to
`develop` are limited to small residual fixes (typos, single-line
docs, ≤3 files, no deep paths). The enforcement is at the git-hook
layer (lefthook) so violations are blocked at the source — the
advisory `|| true` wrapping in the existing lefthook.yml is replaced
with three BLOCKING hooks for the discipline-critical checks.

## Why

Multiple parallel agents committing directly to `develop` create
chaos:

- **Concurrent commits race.** Two agents on the same branch produce
  a non-fast-forward the second one has to recover from.
- **Worktree isolation breaks.** The `agent_worktree` model assumes
  each agent owns its own branch.
- **Lost work.** The race winner's content is preserved; the loser
  has to `git reflog` archaeology to find their commits.
- **Recovery is expensive.** This slice was authored in a session
  where the work was wiped three times by a parallel agent before
  landing. The fix is not "be careful" — it is "the hook blocks the
  direct-develop-commit shape".

The user explicitly asked for the hooks to **enforce**, not warn:
> "Lefthook pre-commit + pre-push + commit-msg must ENFORCE this
> (not just warn)."

## Non-goals

- This is NOT a replacement for branch protection on the remote.
  GitHub-side `branch protection rules` are still the source of
  truth for the `develop` branch.
- This is NOT a rewrite of the proposals workflow. It is an
  orthogonal discipline layer.
- This is NOT a new tool or plugin. It is 3 small lint scripts and
  3 blocking hooks in `lefthook.yml`.

## Architecture

The discipline is enforced by three pure lint engines wired into
lefthook as BLOCKING hooks (no `|| true`). All three engines are
pure functions over their inputs and never throw.

### S0 — Proposal

- **Status**: done
- **Shipped in**: ec6eaedf (initial landing of this proposal alongside the lints)
- **Files**: `docs/mcp-vertex/proposals/ready/c00086-swarm-commit-discipline.md`
- **Gate**: `bun tools/scripts/lint/proposals.script.ts`

This slice is the proposal itself. Closed when the proposal lints
clean and the slice file lives in `ready/`.

### S1 — Pre-commit guard — `commit-branch-discipline`

- **Status**: done
- **Shipped in**: ec6eaedf
- **Files**: `tools/scripts/lint/commit-branch-discipline.script.ts`, `tools/scripts/lint/commit-branch-discipline.script.spec.ts`
- **Gate**: `bun test tools/scripts/lint/commit-branch-discipline.script.spec.ts`

Lives in
[`tools/scripts/lint/commit-branch-discipline.script.ts`](../../../tools/scripts/lint/commit-branch-discipline.script.ts).

Pure function over
`(cwd, stagedFiles, currentBranch) → { ok: true } | { ok: false, blockers: string[] }`.

Policy:

- On `develop`: any staged file under a "deep" path
  (`docs/mcp-vertex/proposals/`, `packages/*/src/`,
  `plugins/*/src/`, `tools/scripts/`) is a violation. The agent
  forgot to open a feature branch.
- On `develop` with no deep paths: more than 3 staged files is a
  violation. The discipline is "small residual fixes only".
- On any other branch (`agent/*`, `feature/*`, `main`): always
  allowed. The discipline is "don't commit to develop directly",
  not "don't commit".
- Detached HEAD (`currentBranch === null` / empty): fail-open so
  release engineers can check out a tag and commit a fix.

Deep paths (regex array):

```ts
const DEEP_PATH_PATTERNS = [
  /^docs\/mcp-vertex\/proposals\//,
  /^packages\/[^/]+\/src\//,
  /^plugins\/[^/]+\/src\//,
  /^tools\/scripts\//,
];
const MAX_RESIDUAL_FILES = 3;
```

The CLI shell reads `git rev-parse --abbrev-ref HEAD` and
`git diff --staged --name-only --diff-filter=ACMR`; the test
injects both inputs so the engine stays pure.

### S2 — Pre-push guard — `push-to-develop-discipline`

- **Status**: done
- **Shipped in**: ec6eaedf
- **Files**: `tools/scripts/lint/push-to-develop-discipline.script.ts`, `tools/scripts/lint/push-to-develop-discipline.script.spec.ts`
- **Gate**: `bun test tools/scripts/lint/push-to-develop-discipline.script.spec.ts`

Lives in
[`tools/scripts/lint/push-to-develop-discipline.script.ts`](../../../tools/scripts/lint/push-to-develop-discipline.script.ts).

Pure function over
`(cwd, remote, remoteBranch, currentBranch) → { ok: true } | { ok: false, blockers: string[] }`.

Policy:

- Pushing to develop FROM develop: **BLOCK**. The agent forgot to
  open a feature branch.
- Pushing to develop FROM a feature branch (`agent/x`, `main`,
  `feature/*`): ALLOW. This is the PR-merge shape:
  `git push -u origin agent/x`, then a maintainer merges it
  into `develop`. The hook only blocks the direct
  `develop → origin/develop` push.
- Pushing to any other branch: ALLOW.
- Detached HEAD: fail-open.

The hook parses lefthook's positional args
(`{1} {2} {3} = remote remote_url refs`) and resolves
`refs/heads/<local>:<remote>` to the local + remote branch names.

### S3 — Commit-msg guard — `commit-msg-conventional`

- **Status**: done
- **Shipped in**: ec6eaedf
- **Files**: `tools/scripts/lint/commit-msg-conventional.script.ts`, `tools/scripts/lint/commit-msg-conventional.script.spec.ts`

Lives in
[`tools/scripts/lint/commit-msg-conventional.script.ts`](../../../tools/scripts/lint/commit-msg-conventional.script.ts).

Pure function over `(message: string) → { ok: true } | { ok: false, blockers: string[] }`.

Policy:

- First line must match
  `/^(feat|fix|chore|docs|refactor|test|build|ci|perf|style)(\([a-z0-9_-]+\))?!?: /`
  — the same regex that `derive-version.ts` uses to compute the
  next semver bump.
- OR start with `Merge ` / `Revert ` — git-generated commits
  are exempt.
- Empty / whitespace-only / body-only messages are blocked.
- Comment-only first lines (e.g. `# this is a git comment`) are
  blocked.

The hook reads the message file passed by lefthook as `{1}`. In
`bun run lint:commit-msg` mode (no message file, validate-chain
smoke test) it falls back to `git log -1 --pretty=format:%B` so
the validate chain can sanity-check the most recent commit.

### S4 — Wiring — `package.json` + `lefthook.yml`

- **Status**: done
- **Shipped in**: ec6eaedf
- **Files**: `package.json`, `lefthook.yml`

- 3 new scripts in `package.json#scripts`:
  `lint:commit-branch`, `lint:push-to-develop`, `lint:commit-msg`.
- `lint:commit-branch` and `lint:push-to-develop` are appended to
  the `validate` chain.
- `lint:commit-msg` is **hook-only** — it does NOT run in the
  validate chain. Rationale: a parallel agent may leave a
  non-conventional commit on `develop` (the very offender
  `Please provide the file changes or a description of the
  modifications so I can generate the commit message for you.`
  commit on `ce4c47a0` is a real example), and the validate
  chain would then fail for everyone. The hook is the only
  place the discipline is enforced for new commits; the
  validate chain is for "is the source clean", not "are commits
  conventional".
- 3 new blocking hooks in `lefthook.yml`:
  - `pre-commit.commands.commit-branch-discipline` — runs
    `bun run lint:commit-branch -- --staged {staged_files} || exit 1`.
  - `pre-push.commands.push-to-develop-discipline` — runs
    `bun run lint:push-to-develop -- {1} {2} {3} || exit 1`.
  - `commit-msg.commands.commit-msg-conventional` (NEW
    top-level block) — runs
    `bun run lint:commit-msg -- {1} || exit 1`.

The existing advisory hooks in `lefthook.yml` are left untouched
(they keep the `|| true` wrapping). The 3 new hooks are
additive and do NOT wrap their commands in `|| true`, so they
genuinely block.

## Slices

| Slice | Description | Files | Tests |
|---|---|---|---|
| S0 | Proposal | `docs/mcp-vertex/proposals/ready/c00086-swarm-commit-discipline.md` | — |
| S1 | `commit-branch-discipline` lint | `tools/scripts/lint/commit-branch-discipline.script.{ts,spec.ts}` | 18 |
| S2 | `push-to-develop-discipline` lint | `tools/scripts/lint/push-to-develop-discipline.script.{ts,spec.ts}` | 15 |
| S3 | `commit-msg-conventional` lint | `tools/scripts/lint/commit-msg-conventional.script.{ts,spec.ts}` | 48 |
| S4 | Wire into `package.json` + `lefthook.yml` | `package.json`, `lefthook.yml` | — |

Total: 81 tests across 3 spec files, all green.

## Acceptance

- `bun run validate` is green.
- A direct commit to `develop` with a deep-path file is blocked.
- A direct commit to `develop` with more than 3 staged files (no
  deep paths) is blocked.
- A direct `develop → origin/develop` push is blocked.
- A `feature/x → origin/develop` push is allowed.
- A non-conventional commit message is blocked.
- A `Merge ...` / `Revert ...` commit is allowed.
- Bypass path: `LEFTHOOK=0 git commit ...` (existing lefthook
  convention) or `LEFTHOOK_BYPASS=1` (the new lint convention;
  documented in the blocker text).

## Risks

1. **False positives on legitimate small fixes.** Mitigated by
   the `MAX_RESIDUAL_FILES = 3` cap and the `LEFTHOOK_BYPASS=1`
   escape hatch.
2. **Pre-commit hook might run on the same `agent/*` branch as
   the commit.** Allowed by the design — the guard only blocks on
   `develop`.
3. **A parallel agent leaves a non-conventional commit on
   `develop` (real example: `ce4c47a0`).** Mitigated by NOT
   putting `lint:commit-msg` in the validate chain. The hook
   still blocks new non-conventional commits.
4. **The 3 new lints are NEW code in `tools/scripts/`.** A
   non-develop branch is required to commit them, per the rule
   this proposal is implementing. The wiring slice S4 follows
   the rule on a feature branch.

## Notes

- This slice was authored in a session where the work was wiped
  three times by a parallel agent before landing. The c00086
  commit is the proof that the discipline it implements
  applies to itself: the work lands on a feature branch and
  reaches `develop` only via push from the feature branch.
- The 3 lints are deliberately pure over their inputs. The CLI
  shell reads git state via `child_process.spawnSync`, but the
  engine functions take a pre-resolved input. This makes them
  trivially testable (no git fixture, no tmp dir).
- The 3 lints follow the existing `tools/scripts/lint/*.script.ts`
  convention: pure engine + thin CLI shell + colocated
  `*.spec.ts`. They are discovered by `lint:tools` and
  `lint:workflow` and ride the standard catalogue.
