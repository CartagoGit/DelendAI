---
id: f00075
status: ready
type: proposal
track: swarm+coordination+governance
date: 2026-06-28
kind: feat
title: Swarm hygiene routine - auto-cleanup of orphan branches, rescued unmerged work, and bug fix in branch_gc
shipped-in: []
recan: []
related:
  - f00073 # branch_status + branch_gc (engines, S0 fixes a bug in f00073 S3)
  - x00051 # delegate atomically creates worktree + branch
  - f00052 # host-scoped agentWorktree gate
  - c00012 # agents should not panic on peer commits (governance companion)
ownership:
  - { agent: implementation_runner, task: 'S0: fix branch_gc engine so it resolves each worktree branch via `git -C <wt> rev-parse --abbrev-ref HEAD` (closes the false "not-found" trap surfaced in 2026-06-28 cleanup)' }
  - { agent: implementation_runner, task: 'S1: make auto_work call branch_gc dry-run when branchStatusWarnings is non-empty and surface the plan; cherry-pick policy S2 in the same hand-off' }
  - { agent: implementation_runner, task: 'S2: add proposals_swarm_hygiene tool that lists `ahead && !merged && ahead > 0` branches as "rescue candidates" with the diff stat vs develop, so the orchestrator can surface them to the human' }
  - { agent: implementation_runner, task: 'S3: skill + i18n + catalog refresh (multi-agent-coordination SKILL hygiene-loop section + 12-lang ui keys)' }
  - { agent: implementation_runner, task: 'S4: front-hook in auto_work - run swarm_hygiene at the start of every plan; block plan if rescue candidates > 0 OR stashes > 0; surface gc-eligible plan and wait for forceHygieneBypass; warn on out-of-cache worktrees' }
  - { agent: delivery_verifier, task: 'V1: confirm branch_gc dry-run reports the merged worktree as removable, auto_work front-hook blocks on rescue/stash and surfaces the right plan, swarm_hygiene surfaces the unmerged branch, bun run validate green' }
globalGate: validate
acceptance:
  - { command: bun run typecheck,           expect: exit0 }
  - { command: bun run lint:tools,          expect: exit0 }
  - { command: bun run lint:conventions,    expect: exit0 }
  - { command: bun run lint:proposals,      expect: exit0 }
  - { command: bun run site:strict,         expect: exit0 }
  - { command: bun run validate,            expect: exit0 }
---

# f00075 - Swarm hygiene routine

## Goal

Close the loop on `f00073`. After every `auto_work` round, the swarm
should be able to answer three questions cheaply, and act on the answers
without human babysitting:

1. **Is any agent branch orphaned?** (`mergedIntoBase: true` + clean
   worktree + older than `staleMinutes` → eligible for `branch_gc`).
2. **Is any agent branch carrying work that has not reached `develop`?**
   (`ahead > 0` + `mergedIntoBase: false` → **rescue candidate**: needs
   cherry-pick / merge before the agent session ends).
3. **Is any worktree violating AGENTS.md?** (`outOfCache: true` → flag
   to the orchestrator, never silently ignore).

Today `f00073` ships `branch_status` (visibility) and `branch_gc`
(cleanup) but the loop has three gaps:

- `branch_gc` reports the canonical merged worktree as
  `skipped: not-found "worktree branch is not a known agent branch"` —
  a bug in the engine that treats the worktree as missing. The agent
  sees the warnings and cannot act on them.
- `auto_work` surfaces `branchStatusWarnings` but never calls `branch_gc`
  to convert the warnings into a plan, so the orchestrator has to
  remember to call GC manually.
- Nothing surfaces **ahead-of-base branches that have not been merged**.
  The 2026-06-28 cleanup had to be done by hand: `agent/copilot-minimax-m3-s57`
  carried `f00057 S11` (2 commits, IToolDeprecationMarker + i18n) and
  was at risk of being lost when the worktree expired.

This proposal adds a **routine** so the swarm self-cleans after every
plan, surfaces rescue candidates before it is too late, and the engine
behind it stops lying about which worktrees are real.

## why

This proposal exists because the same three incidents surfaced in
close succession during the 2026-06-27 / 2026-06-28 sessions in
`agent/copilot-minimax-m3`, each one re-discovering the same gap:

- **f00073 ships with a latent bug.** The dry-run on
  `agent/copilot-minimax-m3-x00056` (already merged, 0 ahead, 7 dirty,
  out of cache) reported
  `skipped: not-found "worktree branch is not a known agent branch"`.
  The GC engine looks up the worktree's branch in a Map populated from
  `git branch --list agent/*`, which omits branches whose tip is only
  reachable through a worktree pointer. The branch is a perfectly good
  agent branch; the engine just never learned about it. Fix: resolve
  the branch from each worktree directly via
  `git -C <wt> rev-parse --abbrev-ref HEAD`.

- **Rescue candidates are invisible.** After the 2026-06-28 cleanup,
  `agent/copilot-minimax-m3-s57` was the only surviving agent branch
  and it had `ahead: 2` (f00057 S11: IToolDeprecationMarker +
  docs_search deprecation). The user had to ask "is there work I am
  about to lose?" to learn that. The swarm should ask itself that on
  every `auto_work` round and surface the answer.

- **Out-of-cache worktrees are warned, never escalated.** The branch
  status engine flags `/tmp/mcp-vertex-x00056` (a previous-session
  worktree) as `outOfCache: true` but does not tell the orchestrator
  what to do about it. The cleanup happened by hand because
  `branch_status` did not provide a "this should be removed" hint.

## Why this design

- **Routine is a tool the orchestrator invokes, not an event.** The
  engine stays pure; the orchestrator (or a human calling the tool)
  composes the three queries (`branch_status` → `branch_gc` →
  `swarm_hygiene`). The same routine can run as a `lefthook` pre-push
  guard, a `bun run hygiene` script, or inside `auto_work` step 4.

- **`branch_gc` learns from the worktree, not from the branch list.**
  The fix is local: change the plan computation so each worktree's
  branch is resolved via `git -C <wt> rev-parse --abbrev-ref HEAD`
  instead of looking it up in `branchByName`. The branch list still
  powers `branch_status`, which is correct — there it enumerates
  branches on purpose.

- **`swarm_hygiene` is read-only.** Surfacing rescue candidates is a
  human (or orchestrator) decision. The tool lists them with the diff
  stat and the cherry-pick commands so the operator does not have to
  re-discover `git log develop..agent/<name>` and `git diff --stat`.

- **`auto_work` front-hook is the enforcer.** Hygiene runs at the
  **start** of every plan, not as a follow-up after warnings. Without
  this, the warnings from f00073 S2 accumulate silently between
  sessions and the swarm decays back into the 2026-06-28 state. With
  the front-hook, `auto_work` cannot start a new slice while there is
  orphan work waiting to be rescued, and the orchestrator surfaces
  the exact blockers to the user instead of letting them rot.

- **Rescue and stash are blocking; GC is confirm-required;
  out-of-cache is warning only.** This is the four-state decision the
  orchestrator needs. Blocking GC would auto-delete work; blocking
  out-of-cache would interrupt live sessions. Blocking rescue
  candidates and stashes, on the other hand, prevents the actual loss
  the user complained about.

## Non-goals

- Automatic cherry-pick of rescue candidates into `develop`. The user
  asked for visibility; cherry-pick is a separate decision and risks
  silent merges with conflicting parallel work. `swarm_hygiene` lists
  the commands and the orchestrator (or human) executes them.
- Pushing rescued branches or rebasing them. Out of scope; covered by
  the existing `proposals_commit_proposal` flow when the work is on a
  proposal branch, or by `git push --force-with-lease` policy for ad-hoc
  branches.
- Auto-removing out-of-cache worktrees. They are flagged; the operator
  decides whether the work in them is recoverable.
- Networking. The routine is local-only, like every other coordination
  primitive in the repo.
- Auto-executing `branch_gc({ dryRun: false })`. The front-hook
  surfaces the plan and waits for `forceHygieneBypass: true` (or for
  the user to confirm). The hygiene loop is **observation first,
  mutation only on confirmation**.
- Auto-popping stashes. A stash is a deliberate checkpoint; `git stash
  pop` can fail and leave the tree mid-merge. The front-hook blocks
  new work and asks the user to `git stash pop && <commit>`, `git
  stash show -p | git apply`, or `git stash drop`.

## Architecture

```
plugins/proposals/src/lib/shared/
  branch-gc-engine.ts                      # MODIFY: resolve branch per
                                           # worktree via rev-parse, not
                                           # via branchByName lookup
                                           # (fixes S0)
  swarm-hygiene-engine.ts                  # NEW: read-only — surface
                                           # rescue candidates (ahead &&
                                           # !merged) + out-of-cache
                                           # worktrees + GC-eligible
                                           # orphans in one structured
                                           # payload
plugins/proposals/src/lib/tools/
  swarm-hygiene.tool.ts                    # NEW: MCP tool, outputSchema,
                                           # reads from
                                           # branch-status-engine +
                                           # branch-gc-engine (dry-run)
  auto-work.tool.ts                        # MODIFY: surface
                                           # `branchHygieneHints` to the
                                           # orchestrator (after
                                           # collectBranchStatusWarnings
                                           # already runs)
plugins/proposals/skills/
  multi-agent-coordination/SKILL.md        # UPDATE: "Hygiene routine"
                                           # section between branch_gc
                                           # and the c00012 unexpected
                                           # changes section
apps/web/src/i18n/
  ui.ts, tools/index.ts                    # UPDATE: keys for
                                           # swarm_hygiene (12 languages)
docs/PAGES-AUDIT.md                        # UPDATE: row for f00075
docs/mcp-vertex/proposals/
  ready/f00075-...md                       # this file
```

## Slices

### S0 — Fix `branch_gc` "not-found" trap

- **Status**: pending

`branch_gc`'s `planGc` builds `branchByName` from
`snapshot.branches`, which only contains branches reported by
`git branch --list agent/*`. Worktrees whose branch tip is reachable
through the worktree pointer but not in that branch list are skipped
with `reason: "not-found"`. Fix: when iterating worktrees, resolve
the branch from the worktree itself via
`git -C <wt> rev-parse --abbrev-ref HEAD`. If the worktree is on a
detached HEAD, keep the current `no-branch` skip. Otherwise use the
resolved branch as the lookup key, falling back to `branchByName` for
fields that need ahead/behind/merged.

- **Files**:
  `plugins/proposals/src/lib/shared/branch-gc-engine.ts`,
  `plugins/proposals/tests/src/lib/shared/branch-gc-engine.spec.ts`
- **Gate**: `bun run validate`
- **Acceptance**:
  - `branch_gc({ dryRun: true })` over a workspace with a merged,
    clean worktree whose branch is NOT in `git branch --list agent/*`
    reports the worktree in `removed` (or `dryRunRemoved` summary),
    not in `skipped: not-found`.
  - The detached HEAD case still reports `skipped: no-branch`.
  - The protected-branch case still reports
    `skipped: protected-branch`.
  - A regression test for the bug (worktree pointer, branch tip not
    in branch list) is added to
    `branch-gc-engine.spec.ts`.

### S1 — `auto_work` surface hygiene hints

- **Status**: pending

After `collectBranchStatusWarnings` (already wired in f00073 S2),
`auto-work.tool.ts` builds the orchestration plan. Add a follow-up
that, when `branchStatusWarnings.length > 0`, runs
`runBranchGcEngine({ dryRun: true })` and adds the resulting
`removedCount` + top 3 entries as a `branchHygieneHints: string[]`
field on the plan. Never blocks. The orchestrator can decide whether
to call `branch_gc({ dryRun: false })` for real.

- **Files**:
  `plugins/proposals/src/lib/tools/auto-work.tool.ts`,
  `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: `bun run validate`
- **Acceptance**:
  - The plan outputSchema adds
    `branchHygieneHints: z.array(z.string()).optional()`.
  - When `branchStatusWarnings` is empty, `branchHygieneHints` is
    `undefined` (no extra cost).
  - When `branchStatusWarnings` is non-empty, `branchHygieneHints`
    contains at most 3 lines:
    `"branch_gc dry-run: N worktrees eligible, e.g. <path> (<branch>)"`.
  - `auto-work.spec.ts` adds a regression test for the new field.

### S2 — `proposals_swarm_hygiene` tool

- **Status**: pending

New pure engine + tool that returns three lists in one structured
payload:

```text
{
  ok: true,
  rescueCandidates: [
    {
      branch: 'agent/copilot-minimax-m3-s57',
      ahead: 2,
      behind: 11,
      diffStat: ' apps/web/src/i18n/tools/index.ts               |  2 +
                  packages/core/src/interfaces/tool-registration
                  ...
                  6 files changed, 79 insertions(+)',
      cherryPickHint: 'git -C develop cherry-pick 649b9410 547650ee',
    }
  ],
  gcEligible: [
    { path, branch, ageLabel, dirtyFiles, untrackedFiles }
  ],
  outOfCache: [
    { path, branch, ageLabel }
  ],
  summary: { rescueCount, gcEligibleCount, outOfCacheCount }
}
```

The tool is **read-only** (`effects: ['read']`). It does NOT call
`branch_gc`. The orchestrator / human decides.

- **Files**:
  `plugins/proposals/src/lib/shared/swarm-hygiene-engine.ts`,
  `plugins/proposals/src/lib/tools/swarm-hygiene.tool.ts`,
  registration in `plugins/proposals/src/index.ts`,
  `plugins/proposals/tests/src/lib/shared/swarm-hygiene-engine.spec.ts`,
  `plugins/proposals/tests/src/lib/plugin.spec.ts` (add to expected
  tools list)
- **Gate**: `bun run validate`
- **Acceptance**:
  - `<prefix>_swarm_hygiene { }` returns the structured payload with
    full `outputSchema`.
  - `rescueCandidates` is empty when no `agent/*` branch has
    `ahead > 0 && mergedIntoBase === false`.
  - `gcEligible` mirrors what `branch_gc({ dryRun: true })` would
    remove, **after the S0 fix**.
  - `outOfCache` lists every worktree whose path is not under the
    canonical cache dir.
  - `cherryPickHint` is a copy-pasteable command using the branch's
    own HEAD..<tip> range.

### S3 — Skill + i18n + catalog refresh

- **Status**: pending
- **Files**:
  `plugins/proposals/skills/multi-agent-coordination/SKILL.md`
  (new "Hygiene routine" section),
  `apps/web/src/i18n/ui.ts` (12-lang `swarm_hygiene` summary),
  `apps/web/src/i18n/tools/index.ts` (12-lang entry),
  `docs/mcp-vertex/agent-catalog.generated.json` (regenerate via
  `bun run catalog:generate`),
  `docs/PAGES-AUDIT.md` (row for f00075),
  `docs/mcp-vertex/proposals/ready/f00075-swarm-hygiene-routine-cleanup.md`
- **Gate**: `bun run validate`, `bun run site:strict`,
  `bun run catalog:check`
- **Acceptance**:
  - The SKILL has a new section between `branch_gc` and the
    `c00012` unexpected-changes section, explaining the loop:
    `branch_status` → review → `swarm_hygiene` → decide →
    `branch_gc` (real). 10 lines max.
  - All 12 i18n locales expose the `swarm_hygiene` summary.
  - `site:strict` is green.
  - `catalog:check` is green after regeneration.

### S4 — Front-hook in `auto_work` (block on rescue + stash, surface GC, warn on out-of-cache)

- **Status**: pending

Without a front-hook, f00073 S2's `branchStatusWarnings` accumulate
between sessions and the swarm decays back into the 2026-06-28
state — the same orphan-branch / orphan-stash mess that motivated
this whole proposal. S4 makes the orchestrator run the hygiene
snapshot **at the start of every plan** and decide execution mode
based on a four-state policy:

| Snapshot state | Execution mode | Effect on `auto_work` |
|---|---|---|
| `rescueCandidates.length > 0` | **`blocked`** | `{ ok: false, reason: 'hygiene-blocked', blockers: ['<branch> is ahead by N; cherry-pick to develop or merge first', ...] }`. The orchestrator surfaces the blockers and the `cherryPickHint` for each. |
| `stashes.length > 0` (from `git stash list`) | **`blocked`** | Same envelope, `blockers: ['N stashes present; pop+commit, apply, or drop before starting new work']`. The orchestrator asks the user which. |
| `gcEligible.length > 0` (merged + clean + stale) | **`confirm-required`** | Plan proceeds; `plan.hygieneActions = ['branch_gc dry-run would remove N worktrees: <list>']`. The orchestrator / user passes `forceHygieneBypass: true` for `branch_gc` to execute, or false to skip. |
| `outOfCache.length > 0` | **`warning`** | Plan proceeds; `plan.hygieneWarnings = ['N worktrees outside <cacheDir>/mcp-vertex/.worktrees (AGENTS.md violation)']`. Out-of-cache is never blocking because live sessions in `/tmp` or anywhere else would otherwise self-block. |

The user (or host) can always pass `forceHygieneBypass: true` to skip
all four states. The default is **strict**: rescue candidates and
stashes are blocking because they represent **work at risk of loss**,
which is exactly the failure mode the user described.

The front-hook runs **after** the existing f00073 S2
`collectBranchStatusWarnings` and **before** the orchestrator selects
the next slice. It also runs **before** `proposals_pick_proposal`
returns the next proposal id — so a hygiene-blocked session never
claims a new slice, never opens an `agent_lock`, and never pushes.

- **Files**:
  `plugins/proposals/src/lib/tools/auto-work.tool.ts`,
  `plugins/proposals/src/lib/shared/swarm-hygiene-engine.ts`
  (extends engine with `stashes` field via `git stash list`),
  `plugins/proposals/src/lib/shared/stash-snapshot.ts` (NEW: pure
  engine for `git stash list` parsing),
  `plugins/proposals/tests/src/lib/auto-work.spec.ts`,
  `plugins/proposals/tests/src/lib/shared/stash-snapshot.spec.ts`
- **Gate**: `bun run validate`
- **Acceptance**:
  - `auto_work { }` with `rescueCandidates.length === 0 &&
    stashes.length === 0` returns the plan unchanged (no
    `hygieneBlockers`, no `hygieneActions`, no `hygieneWarnings`).
  - `auto_work { }` with `rescueCandidates.length > 0` returns
    `{ ok: false, reason: 'hygiene-blocked', blockers: [...],
    rescueCandidates: [...] }` — never executes the slice selection.
  - `auto_work { }` with `stashes.length > 0` returns
    `{ ok: false, reason: 'hygiene-blocked', blockers: [...],
    stashes: [...] }`.
  - `auto_work { }` with `gcEligible.length > 0 &&
    rescueCandidates.length === 0 && stashes.length === 0` returns
    the plan with `hygieneActions: ['branch_gc dry-run would remove
    N worktrees...']`. The orchestrator then decides whether to
    execute.
  - `auto_work { forceHygieneBypass: true }` ignores all four states
    and runs the slice selection as today.
  - The plan outputSchema adds `hygieneBlockers?: string[]`,
    `hygieneActions?: string[]`, `hygieneWarnings?: string[]`,
    `stashes?: IStashEntry[]`, `rescueCandidates?: IRescueEntry[]`
    (all optional). `executionMode` becomes `'normal' |
    'confirm-required' | 'blocked'`.
  - The front-hook is **idempotent and side-effect free**: it never
    runs `git stash pop`, `git stash drop`, `git cherry-pick`,
    `git merge`, or `git worktree remove`. Those remain explicit
    operator actions.
  - Two regression tests in `auto-work.spec.ts`:
    (a) hygiene-blocked plan returns `{ ok: false }` and never
    selects a slice,
    (b) forceHygieneBypass overrides the block.

### V1 — Delivery verification

- **Status**: pending
- **Acceptance**:
  - All S0..S4 acceptance criteria hold.

The acceptance section above is the running list; this slice
documents the verification chain (run on the final land).
  - `bun run validate` is green end-to-end.
  - Manual dry-run on a fixture workspace with two agent worktrees
    (one merged, one ahead) confirms:
    - `branch_gc({ dryRun: true })` lists the merged one.
    - `swarm_hygiene { }` lists the ahead one as a rescue candidate.
  - The 2026-06-28 cleanup scenario (`agent/copilot-minimax-m3-s57`
    ahead by 2) is reproduced in a regression test for
    `swarm_hygiene-engine`.

## Dependency graph

```
S0 ──> S1 (auto_work reads branch_gc result)
S0 ──> S2 (swarm_hygiene mirrors GC eligibility)
S2 ──> S3 (skill + i18n document the new tool)
S2 ──> S4 (auto_work front-hook consumes swarm_hygiene + stash snapshot)
S3 ──> V1 (verification)
S4 ──> V1 (verification)
```

S0 is independent of S1/S2/S4 (it fixes a bug) and can land first.
S1 and S2 are independent of each other. S4 depends on S2 (uses
`swarm_hygiene` payload) and on a new `stash-snapshot.ts` helper.
S3 unblocks V1.

## Acceptance

- The 2026-06-28 cleanup scenario runs in <30 seconds via
  `proposals_swarm_hygiene` + `proposals_branch_gc` instead of by
  hand.
- `branch_gc({ dryRun: true })` on a workspace with a merged,
  worktree-pointer-only branch reports the worktree as eligible, not
  as `not-found`.
- `auto_work`'s plan carries `branchHygieneHints` whenever
  `branchStatusWarnings` is non-empty.
- `auto_work`'s plan returns `{ ok: false, reason:
  'hygiene-blocked' }` whenever rescue candidates > 0 OR
  stashes > 0. With `forceHygieneBypass: true`, it proceeds.
- A stale-stash fixture test confirms the front-hook blocks a
  pretend session; with `forceHygieneBypass: true`, the same
  fixture returns a normal plan.
- `bun run validate`, `bun run site:strict`, `bun run catalog:check`
  all green.

## Risks and mitigations

- **Risk: S0 changes branch_gc behaviour for the wrong reasons.** The
  fix must keep all existing skip reasons (`dirty`, `untracked`,
  `unmerged`, `fresh`, `protected-branch`, `no-branch`) intact. The
  acceptance test list explicitly enumerates them. **Mitigation:**
  S0 keeps `branchByName` for ahead/behind/merged lookups; it only
  adds a per-worktree fallback that uses the worktree-resolved branch
  as the lookup key.

- **Risk: S2's `cherryPickHint` could encourage a destructive
  cherry-pick.** The hint is informational. The tool is read-only and
  the orchestrator / human reads the diff stat before deciding.
  **Mitigation:** the outputSchema requires `diffStat` so the
  operator sees the size and shape of the change before copying the
  command.

- **Risk: S1's plan field could blow the auto_work token budget.**
  `branchHygieneHints` is capped at 3 lines and only present when
  `branchStatusWarnings` is non-empty. **Mitigation:** measured in
  S1's acceptance test; the engine does not run if there are no
  warnings.

- **Risk: agents over-trust `swarm_hygiene` and auto-cherry-pick.**
  `swarm_hygiene` is read-only by contract (`effects: ['read']`).
  The orchestrator / human runs the cherry-pick. **Mitigation:**
  documented in the SKILL ("never auto-execute; review diff first").

## notes

- The 2026-06-28 cleanup that motivated this proposal dropped
  `stash@{0}` (obsolete, content already in `6a79349b`), removed the
  worktree `.cache/mcp-vertex/.worktrees/copilot-minimax-m3-x00056`
  (out of cache, merged), deleted the branch
  `agent/copilot-minimax-m3-x00056`, and confirmed
  `agent/copilot-minimax-m3` was already gone. Surviving:
  `agent/copilot-minimax-m3-s57` with 2 commits of `f00057 S11`
  still ahead of `develop`. This proposal makes that last surviving
  case **the routine**, not a manual rescue.

- `branch_status` (f00073 S2) and `branch_gc` (f00073 S3) are
  unchanged in shape. f00075 wraps them in a routine, fixes the
  bug in `branch_gc`'s lookup, and adds the rescue-candidate view.