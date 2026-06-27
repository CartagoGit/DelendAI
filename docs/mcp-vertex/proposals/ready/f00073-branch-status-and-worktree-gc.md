---
id: f00073
status: ready
type: proposal
track: swarm+coordination
date: 2026-06-27
kind: feat
title: Branch status + worktree sync/GC to eliminate orphan agent branches
shipped-in: []
recan: []
related:
    - x00051 # delegate atomically creates worktree + branch
    - f00052 # host-scoped agentWorktree gate
    - a00032 # overview drift budget, surfaced "tool-outputs must follow the same compact path"
ownership:
    - { agent: implementation_runner, task: 'S1: shared engine (puro) branch-status-engine.ts + branch-gc-engine.ts' }
    - { agent: implementation_runner, task: 'S2: tool proposals_branch_status with outputSchema + integration in auto_work' }
    - { agent: implementation_runner, task: 'S3: tool proposals_branch_gc with outputSchema + idempotent dry-run default' }
    - { agent: implementation_runner, task: 'S4: skill update + docs/PAGES-AUDIT.md row + proposal workflow integration' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
---

# f00073 — Branch status + worktree sync/GC to eliminate orphan agent branches

## goal

Eliminate the "ramas sueltas sin mergear, trabajo tirado a la basura" failure mode surfaced in the 2026-06-27 session by giving the swarm **two new first-class tools** that the existing `agent_worktree` primitive is missing:

1. `<prefix>_branch_status` — read-only snapshot of every `agent/*` branch and every worktree: `ahead`/`behind` vs `develop`, last-commit age, dirty byte count, untracked file count. Lets any agent (or the orchestrator) answer "what is everyone else doing right now?" without grep.
2. `<prefix>_branch_gc` — read-write cleanup of worktrees whose branch is already merged into `develop` (or whose dirty/uncommitted file count exceeds `dirtyThreshold`) **and** that have been idle for more than `staleMinutes`. Idempotent; defaults to `dry-run: true`.

## why

The swarm has two coordination primitives (`agent_lock` for file ownership, `agent_worktree` for git isolation) and one notification channel (`lock-released`). It is **missing a third primitive**: branch-state discovery.

The 2026-06-27 session in `agent/copilot-minimax-m3` produced the canonical failure: an agent committed work, pushed to `origin/agent/copilot-minimax-m3`, the orchestrator merged the branch, the worktree stayed alive in `.cache/mcp-vertex/.worktrees/`, **no tool exposed the fact that the worktree still had 8 files modified + 3 untracked** until the next session hit `git worktree list`. In the meantime, another worktree (`implementation-runner`) was created **outside** `.cache/` in violation of the AGENTS.md invariant, and a third session started fresh work in `develop` that the worktree never saw.

The `grep` for `behindAhead|merge-base|ahead.*behind` returns zero matches in `plugins/proposals/src/lib/**/*.ts`. The plugin has no way to ask "is this branch still alive? ahead of base? has uncommitted work?" — and that is exactly the gap that lets work decay into silent loss.

## why this design

- **Read first, write second.** `branch_status` ships before `branch_gc`; once the state is visible, GC is a 30-line dry-run wrapper around `state_repair`'s existing lock-staleness discipline.
- **Engine is pure.** `branch-status-engine.ts` and `branch-gc-engine.ts` are pure functions over `(workspaceRoot, options)`; tests inject a fake `IGitRunner`. Mirrors `auto-work-persist.ts` and `agent-worktree-engine.ts`.
- **Idempotent and safe.** `branch_gc` defaults to `dry-run: true`; only `force: true` removes a worktree whose branch has unmerged commits. Mirrors `agent_worktree remove` which already refuses on uncommitted changes unless `force`.
- **Cache location invariant is enforced.** `branch_status` reports any worktree whose path does not start with `<cacheDir>/mcp-vertex/.worktrees/` as `outOfCache: true` so the orchestrator sees AGENTS.md violations immediately.

## non-goals

- Automatic rebasing of `agent/*` branches onto a fast-forwarded `develop`. The user explicitly asked for visibility + GC; rebasing is a separate decision and needs a `git push --force-with-lease` policy that is out of scope for this slice.
- Network-side discovery of remote-only branches (no `origin/agent/*` without a local tracking branch). `branch_status` only inspects local branches + worktrees; the cache root is the only source of truth.
- Cross-repo coordination. This proposal stays inside one `workspaceRoot`; multi-repo swarms are explicitly out of scope.

## architecture

```
plugins/proposals/src/lib/shared/
  branch-status-engine.ts       # NEW: pure engine, ahead/behind/dirty/age
  branch-gc-engine.ts           # NEW: pure engine, dry-run default, idempotent
plugins/proposals/src/lib/tools/
  branch-status.tool.ts         # NEW: MCP tool, outputSchema
  branch-gc.tool.ts             # NEW: MCP tool, outputSchema
plugins/proposals/src/lib/tools/
  auto-work.tool.ts             # MODIFY: call branch_status before returning plan (warning-only, non-blocking)
plugins/proposals/skills/
  multi-agent-coordination/SKILL.md  # UPDATE: document branch_status + branch_gc, where in the workflow to call them
apps/web/src/i18n/ui.ts          # UPDATE: add keys for both tools (12 languages)
docs/PAGES-AUDIT.md              # UPDATE: row for f00073
docs/mcp-vertex/proposals/       # this file
```

## slices

### S1 — Pure engines

- **Files**: `plugins/proposals/src/lib/shared/branch-status-engine.ts`, `plugins/proposals/src/lib/shared/branch-gc-engine.ts`
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - `branch_status` over a workspace with 2 `agent/*` branches, 1 ahead, 1 behind, returns the right per-branch snapshot (verified by `bun test plugins/proposals/tests/src/lib/shared/branch-status-engine.spec.ts`).
  - `branch_gc({ dryRun: true })` reports the worktrees it *would* remove without touching the filesystem.
  - `branch_gc({ dryRun: false, force: false })` refuses to remove a worktree whose branch has unmerged commits; returns `{ ok: false, reason: "branch has unmerged commits; pass force:true" }`.
  - Both engines use only `IGitRunner` — never call `git` directly.
  - All paths returned by `branch_status` resolve through `<cacheDir>/mcp-vertex/.worktrees/` (or report `outOfCache: true`).

### S2 — Tool `proposals_branch_status`

- **Files**: `plugins/proposals/src/lib/tools/branch-status.tool.ts`, registration in `plugins/proposals/src/index.ts`
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - `<prefix>_branch_status { }` returns `{ ok: true, branches: [...], worktrees: [...], summary: {...} }` with full `outputSchema`.
  - Tool is read-only (`effects: ['read']`).
  - Integration in `auto-work.tool.ts`: after the orchestration policy is built, the engine adds a `branchStatusWarnings: string[]` field when any worktree has `dirtyFiles > 0` or `behindCount > 0` (warning only, never blocks the plan).
  - `bun run test plugins/proposals/tests/src/lib/tools/branch-status.tool.spec.ts` passes.

### S3 — Tool `proposals_branch_gc`

- **Files**: `plugins/proposals/src/lib/tools/branch-gc.tool.ts`, registration in `plugins/proposals/src/index.ts`
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - `<prefix>_branch_gc { }` (default `dryRun: true`) returns the list of worktrees it would remove without touching the filesystem.
  - `<prefix>_branch_gc { dryRun: false }` removes only worktrees that pass all three guards: (a) branch is merged into `develop`, (b) `dirtyFiles == 0` AND `untrackedFiles == 0`, (c) `lastCommitAge > staleMinutes` (default 60).
  - `<prefix>_branch_gc { dryRun: false, force: true }` removes also worktrees that fail (b) but never (a) — unmerged branches are sacred.
  - Tool has `effects: ['write']` and never pushes.
  - `bun run test plugins/proposals/tests/src/lib/tools/branch-gc.tool.spec.ts` passes.

### S4 — Skill + docs sync

- **Files**: `plugins/proposals/skills/multi-agent-coordination/SKILL.md`, `docs/PAGES-AUDIT.md`, `apps/web/src/i18n/ui.ts`
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - `SKILL.md` documents `branch_status` and `branch_gc` in the workflow decision tree (between "agent_worktree create" and "delegate").
  - `docs/PAGES-AUDIT.md` adds a row for f00073 in the "Tools inventory" section.
  - `bun run check:i18n` (web) green: 12 languages × `+2` new keys (tool description + GC summary).
  - Catalog artifact regenerated: `bun run catalog:generate && bun run catalog:hints && bun run catalog:check && bun run catalog:hints:check` all green.

## acceptance

`bun run validate` exits 0 and the live host (`scripts/host-server.ts --preset=swarm`) exposes both new tools with full `outputSchema` and a description that an LLM can route to.

## risks and mitigations

| Symptom today | After this proposal |
|---|---|
| Agent commits + pushes to `agent/<name>`; orchestrator never sees the branch | `branch_status` reports every `agent/*` branch with `ahead`/`behind` and last-commit age |
| Worktree lingers after merge, holding dirty + untracked files | `branch_gc` (dry-run by default) lists it; `dryRun: false` removes it |
| Worktree created outside `.cache/mcp-vertex/.worktrees/` (AGENTS.md violation) | `branch_status` flags it as `outOfCache: true` |
| Another agent merges develop, agent/* falls behind silently | `auto_work` plan carries a `branchStatusWarnings` field when this happens |