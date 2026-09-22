---
id: x00594
title: "A hook finds delendai on the machine it runs on"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-22
tags:
    - adoption
    - privacy
    - host
---

# x00594 — A hook finds delendai on the machine it runs on

## goal

The guard block is the same bytes for everyone who clones the project.

## why

The second half of the report that produced x00591. Having established
that starting a server must not rewrite somebody's hooks, there is the
question of what those hooks said when they were written:

```sh
if command -v '/home/cartago/.bun/bin/bun' >/dev/null 2>&1 && \
   [ -f '/home/cartago/_projects/delendai/packages/cli/src/index.ts' ]; then
	'/home/cartago/.bun/bin/bun' '/home/…/index.ts' guard pre-commit "$@" || exit 1
```

Those are the installing machine's absolute paths, written into
`.husky/*` — files the project **tracks in git**. Three things are wrong
at once:

- they are false on every other computer, so the hook silently does
  nothing for every colleague who clones the repository (the block is
  careful to fail open, which here means the policy is simply not
  enforced and nobody is told);
- they stop being true on the installing machine too, the moment that
  person moves their toolchain;
- and `/home/cartago/` is a **username**, committed and pushed to
  whoever can read the project.

`process.execPath` is a fact about the process that happened to run
`guard install`. It is not a fact about the repository, and the hook file
is a fact about the repository.

## non-goals

- Guessing. If delendai genuinely cannot be found the hook still fails
  open and says so — a guard that aborts every commit because it cannot
  find itself is worse than one that is absent.
- Removing absolute paths from existence. They are real and something
  has to hold them; the question is *where*.

## architecture

The block resolves delendai where it runs, cheapest and most specific
first:

1. `DELENDAI_GUARD_CMD` — an operator's explicit override, and the escape
   hatch for a layout none of the rest anticipates.
2. `delendai.guard.runner` / `.entry` in **git config**. This is where the
   absolute paths went. `git config` is per-clone and git deliberately
   never takes it *from* a repository, so a value recorded there is true
   for the machine that recorded it and reaches nobody else — exactly the
   property the tracked hook file could never have. `guard install`
   writes it; a clone that never ran install falls through.
3. `node_modules/.bin/delendai` under the repository root: the version
   *that project* pinned, rather than whatever is on PATH.
4. `delendai` on PATH, for a global install.
5. The runner and entry recorded at install time — but only when the
   entry lives inside the repository, in which case it is stored relative
   to the root and the runner as a bare command name. This is what makes
   delendai's own checkout work, where the CLI is a source file rather
   than a bin.

`portableInvocation()` is what strips the machine out: the runner keeps
only its command name, and an entry outside the repository is dropped
rather than written down.

The entry is single-quoted and concatenated onto `"$delendai_guard_root"`
rather than interpolated into a double-quoted word: a `$` or a backtick
in a filename expands inside `"…"`, and a filename is whatever somebody
named it.

## slices

### S1 — nothing machine-specific reaches a tracked file

- **Status**: review
- **Files**: [`packages/core/src/lib/guard-hooks/guard-hook-block.helper.ts`, `packages/cli/src/lib/guard-hooks.service.ts`, `packages/core/tests/src/lib/guard-hooks/guard-hook-block.helper.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/guard-hooks/ packages/cli/src/lib/guard-hooks.service.spec.ts`

## acceptance

- For every guarded hook, the rendered block contains no `/home/`, no
  `/Users/`, and no absolute `/usr`, `/opt` or `/bin` path.
- It resolves the repository root with `git rev-parse --show-toplevel`,
  and reaches for `node_modules/.bin/delendai` and `delendai` on PATH.
- It reads `delendai.guard.runner` and `delendai.guard.entry` from git
  config, and `guard install` writes them.
- The installed guard still refuses a hand-made branch and a direct
  commit — the existing end-to-end test, unchanged in what it asserts.
- A path containing a single quote cannot break out of its shell word.

## risks and mitigations

- **A clone that never ran `guard install` and has delendai nowhere.**
  It falls through to the fail-open branch and says on stderr that the
  policy is not enforced, naming all three places it looked. That is the
  same outcome as before for such a clone, minus the false confidence of
  a path that looked configured.
- **An existing hook file carrying the old absolute paths.** The next
  `guard install` rewrites the managed block in place; the markers are
  unchanged, so it is recognised and replaced rather than duplicated.

## notes

x00586 adds `lint:no-home-directory-in-tracked-files`, which is the gate
that would have caught this in the repository's own files. This is the
generator that was producing them in everybody else's.
