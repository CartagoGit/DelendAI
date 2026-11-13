# f00395 release-pr-gate rollout (2026-08-31)

Slice-by-slice delivery on worktree `agent/copilot-f00395` for the release/* branch discipline.

## Final commit
- `de70eec9 feat(release): release/* branch discipline, pre-push gate and required CI gate`
- 14 files, +756/-41, atomic (squashed 8 commits).

## Pipeline lessons

1. **Resolver patterns serialize via `RegExp#toString()`** when written to
   declarative config. Document this so reviewers don't expect `release/*` literals.
2. **`lefthook commit-branch-discipline` prints a blocker but commits anyway**
   on `agent/*` branches because the hook command is wrapped with `|| true` outside
   the BLOCKING list. Worth a follow-up: tighten the guard.
3. **Refactor after green tests**: better to ship S2 with the duplicate normalizer
   and refactor in a polish step than to block S2 on cross-file export. That keeps
   each slice reviewable independently.
4. **`push-to-develop-discipline.script.ts` is the single source of truth** for
   the pre-push ref normalizer; export symbols there rather than reimplementing.
5. **Smoke testing a pre-push gate needs a temporary worktree with a deliberate
   broken commit**; the script takes stdin in the git pre-push protocol, so the
   minimal smoke is `printf 'refs/heads/X sha refs/heads/Y 000... \n' | bun script.ts`.

## Cross-agent noise observed

- `extensions/vscode/src/lib/proposals-snapshot.ts` is broken on the dirty `develop`
  worktree but unaffected on `agent/copilot-f00395` because we branched from
  `c85faa85`. Always typecheck from your worktree, not from `develop`'s dirty tree.

## Branch protection final state
- `main`: `protected: true`, required `ci-complete` + `release-pr-gate`
- `develop`: `protected: false`, no required checks
- `release/*`: protected locally + CI re-check; never an unprotected push
