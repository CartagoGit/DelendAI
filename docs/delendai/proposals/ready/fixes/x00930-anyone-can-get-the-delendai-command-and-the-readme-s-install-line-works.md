---
id: x00930
title: "Anyone can get the delendai command, and the README's install line works"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-21
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
- **Status**: pending
- **Files**: `packages/cli/src/commands/alias.command.ts`, `packages/cli/src/lib/alias/alias-manager.ts`
- **Gate**: type
- acceptance:
  - "`bun run cli:link` from a checkout writes a `delendai` launcher (a shell script on POSIX, a `.cmd` on Windows) into the user's bun or npm global bin. It runs the checkout's source with bun, so it is never stale, and it reports where it wrote and how to remove it."
  - "Rerunning it is idempotent. A launcher it did not write is never overwritten."

### S2 — The README tells the truth about installing
- **Status**: pending
- **Files**: `README.md`, `docs/delendai/README-DELENDAI.md`
- **Gate**: none
- acceptance:
  - "While `@delendai/cli` is not on the registry, the quickstart gives the checkout path (S1) and the MCP snippet launches the checkout's source. A docs lint fails when the README names a package the registry does not serve."
  - "The installer script refuses with an explanation, instead of downloading an asset no workflow publishes, until a release publishes it (G108)."

## acceptance

- `bun run cli:link` from a checkout writes a `delendai` launcher (a shell script on POSIX, a `.cmd` on Windows) into the user's bun or npm global bin. It runs the checkout's source with bun, so it is never stale, and it reports where it wrote and how to remove it.
- Rerunning it is idempotent. A launcher it did not write is never overwritten.
- While `@delendai/cli` is not on the registry, the quickstart gives the checkout path (S1) and the MCP snippet launches the checkout's source. A docs lint fails when the README names a package the registry does not serve.
- The installer script refuses with an explanation, instead of downloading an asset no workflow publishes, until a release publishes it (G108).
