---
id: a00061
title: "17-07-2026e audit — init/init:default silently ignored --workspace and wrote into the invoking cwd instead (real data-loss risk, caught live)"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-16
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 2 commits referencing a00061 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 2-commit batch
shipped-in:
  - 7b249ed1 # fix(search,docs): a00062 — search/docs returned zero results for every mcp-verte
  - 7aaa10fd # fix(cli): a00061 — mcpv init/init:default silently ignored --workspace and wrote
---

# a00061 — 17-07-2026e claude-round-2 audit — init/init:default silently ignored --workspace and wrote into the invoking cwd instead (real data-loss risk, caught live)

## Goal

Continuing the "actually run it" theme (a00058-a00060), tried to smoke-test `mcpv init:default --workspace=/tmp/mcpv-scratch-test` from inside this repo's own working directory to verify it stays isolated. It did NOT: the run wrote/overwrote 9 tracked files (CLAUDE.md, AGENTS.md, .vscode/mcp.json, 4 agent .md files, copilot-instructions.md, mcp-vertex.config.json) and created 3 new untracked files DIRECTLY IN THIS REPO, ignoring `--workspace` entirely — a live near-miss that could have destroyed uncommitted work if anything had been dirty. Restored via `git restore`/`rm` immediately (everything was tracked and uncommitted, so fully recoverable) before investigating.

Root cause: `packages/cli/src/index.ts`'s `runHumanCli` routes `init`/`init:default` through `createNoopContext(cwd, parsed.globals)` where `cwd` is the CLI process's raw `process.cwd()` — NOT `parsed.globals.workspace` (the resolved, `--workspace`-aware value). `createNoopContext` binds that raw `cwd` to `ctx.cwd`, and both `init.command.ts` and `init-default.command.ts` read exclusively `ctx.cwd` (never `ctx.globals.workspace`) to resolve where to detect/write. Meanwhile the "online" path (`createStdioContext`) correctly threads `globals.workspace` into the spawned MCP server's argv (`server-args.service.ts`), so read-only commands like `doctor`/`overview`/`status` DO honor `--workspace` — only the two offline bootstrap commands silently didn't. `--workspace` is documented as a global flag with no exception noted for these two commands, so any user who assumes it redirects `init`/`init:default` to a target project (the single most plausible reason to pass it to a BOOTSTRAP command) gets silent data loss in whatever directory they happen to be sitting in instead.

Fixed with a one-line change: pass `parsed.globals.workspace` (not the raw `cwd`) into `createNoopContext`. Since `globals.workspace` already resolves to `cwd` when `--workspace` is absent, this is a no-op for the common case and a real fix for the override case. Added an end-to-end regression spec (two real temp dirs: a fake invocation cwd and a target workspace) asserting the config lands in the target and NOT in the invocation directory. Verified live against the real built dist in a safe scratch environment (not this repo).

## why

User directive: keep pushing every dimension to 11/10. This is the most serious finding in the a00057-a00061 audit run — a real, silent, uncontained-write safety bug in the CLI's most-used onboarding command, caught only because I happened to smoke-test it from inside a repo with a clean tree. A user with uncommitted work who ran the same command from the wrong directory would have had no recovery path.

## non-goals

- No broader audit of every other command for the same ctx.cwd-vs-ctx.globals.workspace confusion — fixed the shared root cause (the runHumanCli call site), which covers both init and init:default identically since they share the same isOffline branch; no other command in the registry uses createNoopContext.
- No change to createStdioContext's already-correct globals.workspace threading.

## Slices

- global_gate: e2e

### S1 — Fix init/init:default's --workspace blind spot + regression test
- **Status**: done
- **Files**: `packages/cli/src/index.ts`, `packages/cli/src/index.spec.ts`
- **Gate**: e2e
- acceptance:
  - "runHumanCli's isOffline branch now passes parsed.globals.workspace (not the raw cwd param) into createNoopContext."
  - "New spec: two real temp dirs (fakeCwd, targetWorkspace); runHumanCli(['init:default', '--workspace=<targetWorkspace>'], fakeCwd) writes mcp-vertex.config.json into targetWorkspace and NOT into fakeCwd. Confirmed red against the pre-fix code, green after."
  - "Verified live against the real built packages/cli/dist in an isolated scratch environment (two real temp dirs, not this repo): config/docs/agents landed only in the target workspace; the invocation directory stayed empty."
  - "bun run --cwd packages/cli typecheck clean; full bun run test: 548/548 files, 4585/4585 tests green."

## acceptance

- runHumanCli's isOffline branch now passes parsed.globals.workspace (not the raw cwd param) into createNoopContext.
- New spec: two real temp dirs (fakeCwd, targetWorkspace); runHumanCli(['init:default', '--workspace=<targetWorkspace>'], fakeCwd) writes mcp-vertex.config.json into targetWorkspace and NOT into fakeCwd. Confirmed red against the pre-fix code, green after.
- Verified live against the real built packages/cli/dist in an isolated scratch environment (two real temp dirs, not this repo): config/docs/agents landed only in the target workspace; the invocation directory stayed empty.
- bun run --cwd packages/cli typecheck clean; full bun run test: 548/548 files, 4585/4585 tests green.

## Verified State

| Verification | Value |
|---|---|
| Live incident (before fix) | Ran `node packages/cli/dist/index.js init:default --workspace=/tmp/mcpv-scratch-test` from `/home/cartago/_projects/mcp-vertex` (this repo). `git status --short` immediately after showed 9 modified tracked files + 3 new untracked files, ALL inside this repo — `--workspace` had zero effect. |
| Recovery | `git restore` on the 9 tracked files + `rm` on the 3 untracked ones; `git status`/`git diff --stat` confirmed a clean tree (only the harness's own `.claude/settings.local.json` permission bookkeeping remained, unrelated). No data was lost — everything was uncommitted and tracked. |
| Root cause trace | `packages/cli/src/index.ts` (`runHumanCli`) → `createNoopContext(cwd, parsed.globals)` uses the raw `cwd` param; `noop-context.factory.ts` binds it to `ctx.cwd`; `init.command.ts` (4 call sites) and `init-default.command.ts` (1 call site) read only `ctx.cwd`, never `ctx.globals.workspace`. Contrast: `stdio-context.factory.ts`'s online path calls `buildServerArgs(globals, ...)` which DOES emit `['__serve', '--workspace', globals.workspace]` — the read-only commands (`doctor`, `overview`, `status`, ...) were never affected. |
| Fix verified (unit) | New spec in `index.spec.ts`: real temp dirs, `runHumanCli(['init:default', '--workspace=<target>'], fakeCwd)` → `mcp-vertex.config.json` exists under `<target>`, does NOT exist under `fakeCwd`. Red before the fix (assertion failed on the target path), green after. |
| Fix verified (live, safe) | Rebuilt `packages/cli/dist`; ran the real dist from `/tmp/fake-cwd-2` with `--workspace=/tmp/target-ws-2` → `docs/`, `AGENTS.md`, `CLAUDE.md`, `mcp-vertex.config.json` all landed under `/tmp/target-ws-2`; `/tmp/fake-cwd-2` stayed empty. |
| `bun run --cwd packages/cli typecheck` | clean (0 errors) |
| `bun run test` (full suite) | 548/548 files, 4585/4585 tests green (one `host-entry-resolver.service.spec.ts` timeout under full-suite load, re-verified isolated-pass — the known flaky-under-load class, not a regression) |

## Findings

### 1. `init`/`init:default` silently ignored `--workspace`, writing into the CLI's own cwd instead (P0 · real data-loss risk)
**File**: [`packages/cli/src/index.ts#L85-L91`](../../../../../packages/cli/src/index.ts) (pre-fix: `createNoopContext(cwd, parsed.globals)`), [`packages/cli/src/lib/noop-context.factory.ts`](../../../../../packages/cli/src/lib/noop-context.factory.ts), [`packages/cli/src/commands/init/init.command.ts`](../../../../../packages/cli/src/commands/init/init.command.ts) (4 `ctx.cwd` reads), [`packages/cli/src/commands/init/init-default.command.ts#L93`](../../../../../packages/cli/src/commands/init/init-default.command.ts).
**Impact**: `--workspace` is documented as a global flag with no stated exception. A user passing it to `init`/`init:default` — the single most plausible reason being "bootstrap THAT project, not wherever my shell happens to be" — got silent data loss in the invocation directory instead: 9 real tracked files in this very repo were overwritten (CLAUDE.md's custom pointer content replaced, `.vscode/mcp.json`'s `filesystem` MCP server entry silently dropped, agent `.md` files rewritten) plus 3 new untracked files created, live-reproduced during this audit.
**Resolution**: [RESUELTO] — one-line fix threading `parsed.globals.workspace` instead of the raw `cwd`; regression spec + live scratch-environment verification.

## Scoreboard

| Dimension | Before | After |
|---|---|---|
| `init`/`init:default` respect `--workspace` | no (silently wrote to CLI process cwd) | yes (verified live in an isolated scratch dir) |
| Regression coverage for this class | none | dedicated e2e spec in `index.spec.ts` |
| Overall (delta on top of a00057-a00060) | — | the most severe finding of the run; real near-miss caught and closed |
