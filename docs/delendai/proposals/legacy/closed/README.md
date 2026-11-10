# `legacy/closed/` — proposal archive

This folder mirrors the `done/<kind>/` subtree of the active proposals tree
and is the destination for proposals that have been **reaped** out of
`done/` because they have outlived their active-review window. The mechanism
is specified in **proposal `f00076`** (status: `ready`, see
[`ready/f00076-legacy-closed-archive-mechanism.md`](../../../ready/f00076-legacy-closed-archive-mechanism.md)).

## Semantics

| Property              | Active `done/`                                | Archive `legacy/closed/`               |
| --------------------- | --------------------------------------------- | -------------------------------------- |
| `status` frontmatter  | `done`                                        | `done` (unchanged)                     |
| `archived-on:` field  | not present                                   | present, ISO date                      |
| Path                  | `done/<kind>/<id>-<slug>.md`                   | `legacy/closed/<kind>/<id>-<slug>.md`  |
| Index entry           | included, `archived` field absent              | included, `archived: true`             |
| `proposal_transition` | unrestricted                                  | **frozen** (lint refuses edits)        |
| Slice-completeness    | enforced by `proposal-slice-completeness` lint | **exempt** (frozen by definition)       |
| Re-reaping            | N/A                                           | idempotent (reaper skips already-archived) |

A proposal here is **done** in the workflow sense — but it has also been
**archived**, which means: future agents do not need to look at it again, the
slice-completeness lint does not flag missing files, and the closed-frozen-guard
lint refuses anyone who quietly edits it.

## What lives here today

| Kind       | Count |
| ---------- | ----- |
| audits     | 0     |
| feats      | 0     |
| fixes      | 0     |
| refactors  | 0     |
| chores     | 0     |
| docs       | 0     |
| tests      | 0     |
| perfs      | 0     |
| plans      | 0     |
| resumes    | 0     |
| **Total**  | **0** |

(Total reflects only proposals on disk. The reaper populates this folder over
time.)

## How to reap proposals

```bash
# Dry-run: list which `done/` proposals are vintage
bun tools/scripts/lint/reap-legacy-proposals.script.ts

# Dry-run with a different vintage threshold (e.g. 60 days)
bun tools/scripts/lint/reap-legacy-proposals.script.ts --older-than=60d

# Apply (move with `git mv`, write `archived-on:` frontmatter)
bun tools/scripts/lint/reap-legacy-proposals.script.ts --apply

# Apply alias (wired in `package.json` after S4 ships)
bun run archive:proposals:reap
```

A proposal is **vintage** when its `shipped-in:` frontmatter is older than
`--older-than=30d` (default), or when `shipped-in:` is missing and `date:` is
older than `--older-than=60d`. The reaper prints one line per match and exits
0 in dry-run mode.

## How the freeze works

```bash
# Lint that catches drift in `legacy/closed/`
bun tools/scripts/lint/closed-frozen-guard.script.ts

# Wired alias (after S4)
bun run lint:closed-frozen-guard
```

The guard catches four kinds of drift:

- `[missing-archived-on]` — `archived-on:` frontmatter is missing
- `[status-drift]` — `status:` is no longer `done`
- `[mtime-drift]` — file mtime is newer than `archived-on:` (someone edited the body)
- `[slice-drift]` — any `### S<n>` status has changed since archival

When any drift is detected, the script exits 1 and `bun run validate` fails.

## Why this is a folder, not a status

`closed` is **not** a DFA status. The archive is a *location*, not a workflow
state — adding a status would cascade through `proposal_transition`,
`proposal_force_transition`, `proposal_review`, `auto_work`, `state_repair`,
and the slice-completeness gate. A folder is one new scan root, one new lint,
and zero DFA changes.

## See also

- [`f00076`](../../../ready/f00076-legacy-closed-archive-mechanism.md) — the proposal that ships this mechanism
- `done/<kind>/` — the active home for proposals that closed recently
- `retired/` — proposals that were deliberately stopped before completion (a workflow status, distinct from archive)