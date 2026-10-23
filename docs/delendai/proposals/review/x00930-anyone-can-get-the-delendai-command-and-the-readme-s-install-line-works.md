---
id: x00930
title: "Anyone can get the delendai command, and the README's install line works"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-21
last-transition-id: 507bbb0f-0ed5-4a11-852a-e4df7a14f034
last-correlation-id: 507bbb0f-0ed5-4a11-852a-e4df7a14f034
last-transition-from: in-progress
last-transition-at: 2026-10-21T19:59:14.730Z
shipped-in:
  - "2abe4a99ec81"
---

# x00930 — Anyone can get the delendai command, and the README's install line works

## goal

A person on any machine follows the README and gets a working `delendai` command: from a checkout with one script that puts the current source on the PATH (every platform), and from the registry once a release publishes the package. Until it is published, the README says so and does not print a command that fails.

## why

The owner, 2026-10-21, ran `delendai accounts offer` as told and got `delendai: command not found`.

On that day:
- `@delendai/cli` is not on npm (`npm view @delendai/cli` answers E404), so the README's quickstart (`bunx --package @delendai/cli delendai overview`, and the same in the MCP snippet) fails for anyone.
- `packages/cli/package.json` points `bin` at `dist/index.js`. That needs a build, and the build lags behind the source: `dist` predates the `accounts` command.
- The official installer downloads and runs a binary no workflow publishes (a00095 G108).
- `delendai alias install` provisions the `est` alias next to a `delendai` that has to exist already.

On the owner's machine the command was made to work by a wrapper in `~/.bun/bin/delendai` that runs the checkout's source with bun. This proposal makes that a supported path and removes the broken ones.

## non-goals

- Deciding when to publish to npm. That is a release (the owner's call); the slice only makes the README true either way.
- Changing how the MCP server is launched by hosts. `init` already writes host configuration.

## slices

- global_gate: type

### S1 — A checkout puts its CLI on the PATH
- **Status**: done
- **Files**: `packages/cli/src/commands/alias.command.ts`, `packages/cli/src/lib/alias/alias-manager.ts`, `packages/cli/src/lib/alias/alias-manager.spec.ts`, `packages/cli/src/lib/alias/alias-launcher.integration.spec.ts`, `packages/cli/src/contracts/constants/alias.constant.ts`, `packages/cli/src/contracts/interfaces/alias.interface.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`bun run cli:link` from a checkout writes a `delendai` launcher (a shell script on POSIX, a `.cmd` on Windows) into the user's bun or npm global bin. It runs the checkout's source with bun, so it is never stale, and it reports where it wrote and how to remove it."
  - "Rerunning it is idempotent. A launcher it did not write is never overwritten."
- shipped-in: `2abe4a99ec81`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 2abe4a99ec81, validate exit 0, tests 26/26; acceptance 2/2: (1) renderLauncher/installLauncher in packages/cli/src/lib/alias/alias-manager.ts: the POSIX launcher is a bash script that execs `bun "$dir/packages/cli/src/index… (2) installLauncher returns 'unchanged' when the file it wrote is byte-identical (idempotent rerun) and refuses with state 'foreign' when the existing file has no … — Gate `type` = `bun run typecheck` exit 0 in this worktree. Delivery commit 2abe4a99ec81 (merge of PR #1347, claude-sonnet-5-5) is the commit that touches the slice's declared files. Tests: alias-manager.spec.ts 22/22 + alias-launcher.integration.spec.ts 4/4 under vitest (26/26). Verified the delivered launcher source, the global-bin resolution and the idempotency/foreign-file guard by reading the diff and running the specs. Observation (not a defect of this slice, pre-existing from f00148): root scripts/install.spec.ts is outside every vitest project, so `bun run test` does not collect it.

### S2 — The README tells the truth about installing
- **Status**: review
- **Files**: `README.md`, `docs/delendai/README-DELENDAI.md`, `scripts/install.script.ts`, `scripts/install.spec.ts`, `tools/scripts/lint/readme-install-truth.script.ts`, `tools/scripts/lint/readme-install-truth.script.spec.ts`, `package.json`
- **Gate**: none
- acceptance:
  - "While no `vX.Y.Z` release tag exists, the quickstart gives the checkout path (S1) and the MCP snippet launches the checkout's source. A docs lint, chained into `lint:architecture`, reads the local release tags (`vX.Y.Z`, pushed by release.yml, no network) and fails when a README install command names an `@delendai` package."
  - "The installer script refuses with an explanation unless `--local` is passed, instead of downloading an asset no workflow publishes (G108)."
- shipped-in: `2abe4a99ec81`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- `bun run cli:link` from a checkout writes a `delendai` launcher (a shell script on POSIX, a `.cmd` on Windows) into the user's bun or npm global bin. It runs the checkout's source with bun, so it is never stale, and it reports where it wrote and how to remove it.
- Rerunning it is idempotent. A launcher it did not write is never overwritten.
- While no `vX.Y.Z` release tag exists, the quickstart gives the checkout path (S1) and the MCP snippet launches the checkout's source. A docs lint, chained into `lint:architecture`, reads the local release tags (`vX.Y.Z`, pushed by release.yml, no network) and fails when a README install command names an `@delendai` package.
- The installer script refuses with an explanation unless `--local` is passed, instead of downloading an asset no workflow publishes (G108).
