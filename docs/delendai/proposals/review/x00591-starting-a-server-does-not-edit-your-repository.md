---
id: x00591
title: "Starting a server does not edit your repository"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-22
tags:
    - adoption
    - safety
    - host
---

# x00591 — Starting a server does not edit your repository

## goal

Opening a project changes nothing in it. Not by default, and not on
request either.

## why

Reported with a screenshot and then with the server's own log. Starting
the host in an unrelated project produced **eleven modified files**. Five
of them were the project's own git hooks:

```
[delendai] guard hooks installed in …/logistics-app--develop/.husky
[delendai]   pre-commit: updated
[delendai]   reference-transaction: updated
[delendai]   pre-push: created
[delendai]   post-checkout: created
[delendai]   post-merge: created
[delendai] generated merge driver: unchanged
[delendai] boot failed: …
```

Read that sequence in order. The server rewrote five tracked files in
somebody else's repository, wrote to their `.git/config`, **and then
failed to start**. The project got the edits without getting the server.

The cause was a default — `guardHooksMode` answered `install` when a
project declared a `development` block and said nothing about hooks — but
the default was not the whole of it. `development.guardHooks: "install"`
would have produced the same writes, on every boot, from the same trigger:
a person opening a folder in an editor.

Those are two different acts. Declaring that a project wants the guard is
not permission to modify its working tree at an arbitrary moment chosen
by whoever opens it, on whatever machine they happen to be on. The hooks
that get written bake that machine's absolute interpreter path into files
the project tracks in git.

x00585 closed this door for a project that had not adopted delendai.
x00591 closes it for the adopted ones, which is the rest of them.

A tool that writes to a repository because the repository was opened is
indistinguishable, from the outside, from something malicious — and the
reaction it earns, *"parece hasta un virus"*, is the correct one.

## non-goals

- Removing the guard hooks. They are the mechanism the work-ref model
  rests on. They have to be asked for by somebody typing a command.
- Silence. A project that wants the guard must be able to see that it is
  not installed, and be told what installs it.

## architecture

The install path is **deleted** from the boot module, not gated behind a
flag. It was reachable from exactly two callers — the CLI's `__serve`
branch and the host script — both of them boot. Nothing else called it.
A branch whose only reachable caller is the one that must never take it
is not a branch to guard; it is a branch to remove.

`ensureGuardHooks` becomes `reportGuardHooks`: it inspects, it reports,
and there is no code in it that writes. `off` and a project with no
policy stay silent, as before.

Installing remains where it always was and where it is consented to:
`delendai guard install`, which a person types, and which this
repository's own `prepare` runs on clone. That path is untouched and
still installs both the hooks and the generated merge driver — so
x00574's guarantee (every clone resolves generated files with the
driver instead of textually) survives, reached through `prepare` rather
than through boot.

## slices

### S1 — boot inspects, and cannot install

- **Status**: review
- **Files**: [`packages/cli/src/lib/guard-hooks-autoinstall.service.ts`, `packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`, `packages/cli/src/index.ts`, `tools/scripts/host/host-server.script.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`

## acceptance

- A project declaring a policy and nothing about hooks resolves to
  `report`.
- Booting into an adopted project leaves a sha256 of every file in the
  tree byte-identical, and an existing `.husky/pre-commit` exactly as its
  author wrote it.
- The same holds when the project declares `guardHooks: "install"`.
- Boot writes no `merge.delendai-generated.driver` into `.git/config`.
- Boot still reports what it found and names `delendai guard install`.
- `off` and an unconfigured project produce no output and no writes.

## risks and mitigations

- **A project that relied on the guard appearing by itself.** It is told
  on every boot that the hooks are absent and what installs them, and a
  project that wants it automatically puts `guard install` in its own
  `prepare`, where the act belongs to the project rather than to whoever
  opened it.

## notes

Two defects visible in the same log are **not** fixed here and are
recorded so they are not lost:

1. The injected hook block bakes the installing machine's absolute
   interpreter path (`/home/…/.bun/bin/bun`), which is wrong on every
   other computer and leaks a username into a tracked file.
2. The boot migrators ran in that project and reported six migrations,
   creating files that have nothing to do with migrating away from the
   previous server. Migration is for carrying a project's own data
   forward, not for materialising a scaffold.
