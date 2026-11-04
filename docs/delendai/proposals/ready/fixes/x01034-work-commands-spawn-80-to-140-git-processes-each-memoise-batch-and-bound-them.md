---
id: x01034
title: "Work commands spawn 80 to 140 git processes each: memoise, batch and bound them"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-04
---

# x01034 — Work commands spawn 80 to 140 git processes each: memoise, batch and bound them

## goal

Every `work` subcommand spawns a small, stated number of git processes on a small fixture, and a spec that counts spawns through the git seam fails when the number grows. Behaviour does not change.

## why

Measured 2026-11-04 on a fixture (one commit, bare origin, `shared-checkout-merge` on main), strace -f -e execve, counting /usr/bin/git: status 91, enter 116, checkpoint (refused: loose edit) 101, swarm 128, prove 106, publish (blocked: no certification) 127, retire 139. A `work checkpoint` with no arguments spawns 82 git processes before it prints its usage line. Every command runs one `fetch` and one to three `ls-remote` (publish runs two fetches), and three to five `status --porcelain`. Top call sites over the 8 runs (897 spawns): `rev-parse --path-format=absolute --git-common-dir` 116 (14 sites in 13 files), `rev-parse -q --verify <ref>` 105 (13 files), `remote` 78, `worktree list --porcelain` 60 (15 files), `config --get branch.main.remote` 46, `merge-base --is-ancestor` 44 (34 of them the same two object ids), `remote get-url origin` 32, `for-each-ref` 44, `rev-parse --show-toplevel` 18, `rev-parse --git-dir` 18, `status --porcelain=v1` 8, `stash list` 8. Each is invariant within one invocation or keyed by immutable object ids. Time: untraced wall per command 1.5 to 2.6 s (4.8 s for checkpoint under load 14); one `execFileSync('git')` from bun costs about 3 ms, so the spawns are about 0.3 to 0.4 s of each command; under strace the git children sum to 1.9 s of 6.6 s (29 %). `delendai work` with no subcommand takes 1.53 s against 0.55 s for `--version`, so about 1 s per command is boot and module load, not git. Reproduce: `strace -f -qq -e trace=execve -o <file> delendai work <subcommand>` in the fixture, then count the lines that exec git.

## non-goals

- Of the 91 git processes of `work status`, 52 run in the `__serve` MCP server child that every CLI `work` command starts and 39 in the command itself (strace -ff, by parent process); the child's boot is the about 1 s below. This proposal bounds the command's own spawns; the child belongs to the CLI startup proposal.
- The about 1 s of boot and module load before any work subcommand runs (`delendai work` 1.53 s against `--version` 0.55 s): it is a separate proposal, measured with a CPU profile.
- Changing any output, refusal, ref name or exit code of a work command.
- Caching anything across command invocations: every memo lives for one invocation only.

## slices

- global_gate: type

### S1 — Count every git spawn through the seam
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/git-read.helper.ts`, `packages/core/src/lib/shared/git-command.helper.ts`, `packages/core/src/lib/shared/git-write.ts`, `packages/core/src/lib/wip-engine/git-command.ts`, `packages/core/src/lib/contracts/interfaces/git-read.interface.ts`, `packages/core/src/lib/work-units/unit-ref-rename.service.ts`, `packages/core/tests/src/lib/shared/git-read.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "`readGit`, `gitVerbatim`, `runGitCommand` and the two asynchronous runners (`createGitRunner`, `createScopedGitRunner`) report each spawn (cwd, args) through `noteGitSpawn` to the observers of `observeGitSpawns`; `readGit` and `gitVerbatim` consult the optional per-invocation `IGitReadCache` installed with `useGitReadCache`, and every spawn is reported to its `ran`. With neither installed they behave exactly as today."
  - "unit-ref-rename.service.ts reports its spawns through `noteGitSpawn`."
  - "git-read.helper.spec.ts proves the observer sees every spawn and that an absent observer changes nothing."

### S2 — Memoise what does not change within one invocation
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/shared/git-invocation-memo.helper.ts`, `packages/core/tests/src/lib/shared/git-invocation-memo.helper.spec.ts`, `packages/core/src/lib/tools/work-unit.tool.ts`, `packages/core/src/lib/shared/shared-checkout.ts`, `packages/core/src/lib/tools/work-unit-roots.helper.ts`
- **Gate**: type
- acceptance:
  - "One work invocation answers each of these at most once per cwd: `--git-common-dir`, `--git-dir`, `--show-toplevel`, `--git-path hooks`, `remote`, `remote get-url`, `config --get`, `worktree list --porcelain`."
  - "`merge-base --is-ancestor` and `rev-list` over two full object ids are memoised for the invocation (object ids are immutable)."
  - "Any write through `runGitCommand` (update-ref, worktree add/remove, commit, push, fetch, config set) clears the memo entries it can change; the memo spec proves a read after a write spawns again."
  - "The memo lives in one invocation scope opened and closed by the work tool; nothing persists across invocations."

### S3 — One ref snapshot instead of a rev-parse per ref
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/work-units/ref-snapshot.service.ts`, `packages/core/tests/src/lib/work-units/ref-snapshot.service.spec.ts`, `packages/core/src/lib/work-units/unit-lease.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/work-units/work-unit-land.service.ts`, `packages/core/src/lib/work-units/work-publish.service.ts`, `packages/core/src/lib/work-units/unit-edits-kept.service.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`, `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/shared-checkout-rescue.service.ts`, `packages/core/src/lib/work-units/finished-units-end.service.ts`, `packages/core/src/lib/work-units/units-on-forge.service.ts`
- **Gate**: type
- acceptance:
  - "`rev-parse -q --verify <ref>` call sites read one `for-each-ref --format=%(refname)%09%(objectname)` snapshot per invocation, refreshed after a ref write; lookups of several objects use one `cat-file --batch-check`."
  - "stranded-edits.service.ts spawns git only through the seam."
  - "ref-snapshot.service.spec.ts proves a snapshot answers like rev-parse for present, absent and just-written refs."

### S4 — One status and one fetch per invocation
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/shared/commit-call-writes.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `packages/core/src/lib/work-units/unit-worktree-state.service.ts`, `packages/core/src/lib/work-units/work-dirty-paths.service.ts`, `packages/core/src/lib/development-policy/loose-edits-advisory.ts`, `packages/core/src/lib/work-units/kept-unit-hydration.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/work-units/shared-checkout-clean.service.ts`, `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
- **Gate**: type
- acceptance:
  - "The dirty-state readers share one `status --porcelain=v2 --branch` per worktree per invocation, refreshed after a write."
  - "No work invocation runs `fetch` of the same remote and refspec twice, nor `ls-remote` of the same remote twice."

### S5 — Validate arguments first, and pin the spawn budget
- **Status**: pending
- **DependsOn**: [S2, S3, S4]
- **Files**: `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/src/lib/work-units/work-unit-checkpoint.service.ts`, `packages/core/tests/src/lib/work-units/work-git-spawn-budget.spec.ts`
- **Gate**: type
- acceptance:
  - "A work subcommand missing its required arguments prints its usage having spawned at most 2 git processes (today 82)."
  - "work-git-spawn-budget.spec.ts builds the fixture (one commit, bare origin), runs each subcommand in process, counts spawns through the S1 observer and fails above: status 25, enter 40, checkpoint 30, swarm 35, prove 30, publish 40, retire 40, argument refusal 2, fetch 1 per invocation."
  - "The delivery records before and after spawn counts and untraced wall times per subcommand, as the budget spec reports them and as strace on the fixture counts them."

## acceptance

- `readGit`, `gitVerbatim` and `runGitCommand` report each spawn (cwd, args) to one injectable observer declared in git-read.interface.ts, and consult an optional per-invocation reader cache through the same contract; with neither installed they behave exactly as today.
- unit-ref-rename.service.ts spawns git only through the seam.
- git-read.helper.spec.ts proves the observer sees every spawn and that an absent observer changes nothing.
- One work invocation answers each of these at most once per cwd: `--git-common-dir`, `--git-dir`, `--show-toplevel`, `--git-path hooks`, `remote`, `remote get-url`, `config --get`, `worktree list --porcelain`.
- `merge-base --is-ancestor` and `rev-list` over two full object ids are memoised for the invocation (object ids are immutable).
- Any write through `runGitCommand` (update-ref, worktree add/remove, commit, push, fetch, config set) clears the memo entries it can change; the memo spec proves a read after a write spawns again.
- The memo lives in one invocation scope opened and closed by the work tool; nothing persists across invocations.
- `rev-parse -q --verify <ref>` call sites read one `for-each-ref --format=%(refname)%09%(objectname)` snapshot per invocation, refreshed after a ref write; lookups of several objects use one `cat-file --batch-check`.
- stranded-edits.service.ts spawns git only through the seam.
- ref-snapshot.service.spec.ts proves a snapshot answers like rev-parse for present, absent and just-written refs.
- The dirty-state readers share one `status --porcelain=v2 --branch` per worktree per invocation, refreshed after a write.
- No work invocation runs `fetch` of the same remote and refspec twice, nor `ls-remote` of the same remote twice.
- A work subcommand missing its required arguments prints its usage having spawned at most 2 git processes (today 82).
- work-git-spawn-budget.spec.ts builds the fixture (one commit, bare origin), runs each subcommand in process, counts spawns through the S1 observer and fails above: status 25, enter 40, checkpoint 30, swarm 35, prove 30, publish 40, retire 40, argument refusal 2, fetch 1 per invocation.
- The delivery records before and after spawn counts and untraced wall times per subcommand, as the budget spec reports them and as strace on the fixture counts them.
