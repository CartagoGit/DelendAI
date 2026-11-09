---
id: f00813
title: "The boot summary shows the branch a server runs, and a branch-pointed server follows its origin"
kind: feat
status: ready
type: proposal
track: general
date: 2026-11-09
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
- **Status**: pending
- **Files**: `tools/scripts/host/branch-runtime.helper.ts`, `tools/scripts/host/branch-runtime.helper.spec.ts`, `packages/core/src/lib/startup-report/renderer.ts`, `packages/core/src/lib/tools/status-tool.ts`
- **Gate**: type
- acceptance:
  - "On a tag the boot summary prints the tag; on a branch it prints <branch>@<sha12> with its level, ahead N or behind N against origin/<branch>, and dirty."
  - "The status tool returns the same fields, declared in its outputSchema."
  - "The resolver is the branch-runtime helper of f00810, extended; no second reader of git state exists."

### S2 — A branch-pointed runtime fast-forwards before serving
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/host/branch-follow.helper.ts`, `tools/scripts/host/branch-follow.helper.spec.ts`, `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "A runtime configured to follow a branch fetches and fast-forwards to origin/<branch> before it serves, every start."
  - "A checkout with local commits or that cannot fast-forward is never reset or rebased; the boot summary says so loudly with the ahead and behind counts."
  - "With no network the server serves what it has and says the fetch failed."

### S3 — The editor tooltip shows the same state
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `extensions/vscode/src/providers/status-bar.ts`, `extensions/vscode/src/test/status-bar.spec.ts`
- **Gate**: type
- acceptance:
  - "The status-bar tooltip of f00800 S7 shows the version or branch state read from the status tool, with no formatting of its own."

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
