---
id: f00813
title: "The boot summary shows the branch a server runs, and a branch-pointed server follows its origin"
kind: feat
status: done
type: proposal
track: general
date: 2026-11-09
last-transition-id: 5f22732e-46e2-4414-b39b-b40ca1686935
last-correlation-id: 5f22732e-46e2-4414-b39b-b40ca1686935
last-transition-from: review
last-transition-at: 2026-11-18T04:56:06.950Z
shipped-in:
  - "6c4c43f6f39cbf06e060e07dddb715923a12b31f"
---

# f00813 — The boot summary shows the branch a server runs, and a branch-pointed server follows its origin

## goal

A server's boot summary, status tool and editor tooltip say exactly what it runs: the tag on a release, or <branch>@<sha12> with its level, ahead or behind origin, and dirty on a branch. A server or runtime configured to follow a branch fast-forwards to origin before serving.

## why

Today the boot summary prints `version 0.3.0` while the server runs develop, so an owner cannot tell what is serving. A branch-pointed runtime also serves whatever its cached tree held at the last start, which can be behind origin. Any project that points its MCP entry at a delendai branch has the same gap. f00810 already pins a release with --version and names the version or branch at startup; this proposal builds on its branch-runtime helper and adds the precise state and the follow-origin step.

## non-goals

- Pinning a release: that is f00810, reused here and not repeated.
- Resetting, rebasing or merging a checkout that holds local commits: the server never does it.
- Choosing which branch a project follows: the project's MCP entry already says it.

## slices

- global_gate: type

### S1 — One resolver says what a server runs
- **Status**: done
- **Files**: `tools/scripts/host/branch-runtime.helper.ts`, `tools/scripts/host/branch-runtime.helper.spec.ts`, `packages/core/src/lib/startup-report/renderer.ts`, `packages/core/src/lib/tools/status-tool.ts`
- **Gate**: type
- acceptance:
  - "On a tag the boot summary prints the tag; on a branch it prints <branch>@<sha12> with its level, ahead N or behind N against origin/<branch>, and dirty."
  - "The status tool returns the same fields, declared in its outputSchema."
  - "The resolver is the branch-runtime helper of f00810, extended; no second reader of git state exists."
- shipped-in: `ff8ddc1d16a7`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 6c4c43f6f39c, validate exit 0 and tests 31/31 claimed, no recorded run cited; acceptance 3/3: (1) runtimeState reads HEAD/tag, branch, rev-list counts and porcelain; describeRuntimeState renders tag or branch@sha12 level/ahead/behind/dirty. Focused runtime-… (2) status-tool adds runtime with raw fields and the same describeRuntimeState summary; runtimeSchema declares kind/tag/branch/sha12/ahead/behind/dirty/follow/summ… (3) branch-runtime.helper.ts owns runtimeState's git reads; startup renderer and status tool consume serialized runtime state rather than running git. Specs and ex… — Reviewed the resolver, startup renderer and status tool. The 31 focused host/status specs pass and all 80 workspaces typecheck. Tag/branch state is produced once from git, passed through the same env-backed formatter to boot and status, with ahead/behind/dirty and schema fields intact.

### S2 — A branch-pointed runtime fast-forwards before serving
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `tools/scripts/host/branch-follow.helper.ts`, `tools/scripts/host/branch-follow.helper.spec.ts`, `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "A runtime configured to follow a branch fetches and fast-forwards to origin/<branch> before it serves, every start."
  - "A checkout with local commits or that cannot fast-forward is never reset or rebased; the boot summary says so loudly with the ahead and behind counts."
  - "With no network the server serves what it has and says the fetch failed."
- shipped-in: `6ac0984beab6`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 6c4c43f6f39c, validate exit 0 and tests 31/31 claimed, no recorded run cited; acceptance 3/3: (1) branchHostRun/updatedHostScript fetch origin branch, resolves origin/<branch>, and calls followBranch before prepare/serve; branch runtime real-repo specs prov… (2) followBranch only issues merge --ff-only. Specs assert no merge/reset/rebase/checkout with ahead>0 and assert a refused ff reports ahead/behind counts plus NOT… (3) When fetch returns undefined, updatedHostScript falls back to the known origin/local sha and followBranch receives fetched=false; its offline spec asserts `fet… — Reviewed the branch follow path and its host wiring. All 31 focused specs pass and all workspaces typecheck. Each branch-host start fetches the requested branch, fast-forwards only a behind-only tree, and otherwise reports ahead/behind or the offline fetch failure without reset/rebase.

### S3 — The editor tooltip shows the same state
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `extensions/vscode/src/providers/status-bar.ts`, `extensions/vscode/src/test/status-bar.spec.ts`
- **Gate**: type
- acceptance:
  - "The status-bar tooltip of f00800 S7 shows the version or branch state read from the status tool, with no formatting of its own."
- shipped-in: `6ac0984beab6`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 6c4c43f6f39c, validate exit 0 and tests 31/31 claimed, no recorded run cited; acceptance 1/1: (1) runtimeSummary requests the status tool and returns status.runtime.summary verbatim; update only appends a newline plus that string to the base tooltip. The st… — Reviewed the VS Code status bar path. All 31 focused specs pass and all workspaces typecheck. The tooltip appends the exact `status.runtime.summary` string from the status tool; the bar performs no branch/tag rendering of its own and falls back to the base tooltip when status is unavailable.

## acceptance

- On a tag the boot summary prints the tag; on a branch it prints <branch>@<sha12> with its level, ahead N or behind N against origin/<branch>, and dirty.
- The status tool returns the same fields, declared in its outputSchema.
- The resolver is the branch-runtime helper of f00810, extended; no second reader of git state exists.
- A runtime configured to follow a branch fetches and fast-forwards to origin/<branch> before it serves, every start.
- A checkout with local commits or that cannot fast-forward is never reset or rebased; the boot summary says so loudly with the ahead and behind counts.
- With no network the server serves what it has and says the fetch failed.
- The status-bar tooltip of f00800 S7 shows the version or branch state read from the status tool, with no formatting of its own.

## notes

- Related: f00810 (pins a release with `--version`). This proposal reuses `tools/scripts/host/branch-runtime.helper.ts` and its tag prefix and nearest-tags logic; it adds no second git reader.
- The follow step is fetch then fast-forward only. A checkout with local commits is a loud report, never a reset or rebase.
- Generic: nothing names this repository; any project that points its MCP entry at a delendai branch gets it.
