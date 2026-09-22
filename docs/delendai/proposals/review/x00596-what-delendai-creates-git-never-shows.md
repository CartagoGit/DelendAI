---
id: x00596
title: "What delendai creates, git never shows"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-22
tags:
    - adoption
    - safety
---

# x00596 — What delendai creates, git never shows

## goal

Opening a project leaves `git status` saying exactly what it said before.

## why

The last part of the report. x00591 stopped the server rewriting
somebody's hooks; x00592 stopped six migrators reporting work they had
not done and writing a journal to record it. What remains is the case
where there genuinely **is** something to record:

```
?? .delendai/
```

A hidden directory with the tool's name on it, appearing the moment a
server starts, containing files nobody asked for. From the outside that
is indistinguishable from something malicious, and *"parece hasta un
virus"* is the correct reading.

The code says why it was thought to be fine:

> `.delendai/` is already gitignored and reserved for delendai-internal
> artefacts that should never end up in version control.

It is gitignored — **in this repository**, which added the line. In every
other project it is a new directory nobody has ever heard of. The
reasoning was written from inside the only workspace where it was true.

## non-goals

- Removing the state. A record of which migrations ran is what stops them
  running twice; the applied-config snapshot is how a configuration
  change is noticed at all. They have to exist.
- Editing the project's `.gitignore`. That is a tracked file with the
  project's history in it, and the entire point here is that starting a
  tool does not edit what somebody else owns.

## architecture

A directory can hide itself:

```
.delendai/.gitignore   →   *
```

`*` ignores everything inside, the `.gitignore` included, so the subtree
disappears from `git status` **and** from `git add -A` — which is how
this would actually have reached somebody's colleagues. It is git's own
per-directory mechanism, contained entirely within the directory being
created, and it survives a clone.

`ensureSelfIgnoringDir(dir)` replaces the bare `mkdir` at every point
that creates one of these: the migration journal, the applied-config
snapshot, and the project profile. It writes the `.gitignore` with the
`wx` flag — the check and the write in one syscall — so a project that
deliberately wrote its own keeps it.

The file explains itself to whoever opens it, because they are entitled
to an answer from the file rather than from a search.

## slices

### S1 — the directory hides itself as it appears

- **Status**: review
- **Files**: [`packages/core/src/lib/shared/self-ignoring-dir.ts`, `packages/core/src/lib/shared/self-ignoring-dir.constant.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`, `packages/core/src/lib/workspace-migration/config-transitions.service.ts`, `packages/core/src/lib/adopt/project-profile.service.ts`, `packages/core/tests/src/lib/shared/self-ignoring-dir.spec.ts`, `packages/core/tests/src/lib/workspace-migration/legacy-migration.service.spec.ts`]
- **Gate**: `npx vitest run --project core`

## acceptance

Measured against a real git repository, because the claim is about what
a person sees and not about which file was written:

- After creating the directory and writing into it, `git status
  --porcelain` is empty.
- `git add -A` stages the project's own file and nothing of delendai's.
- The project's `.gitignore` is byte-identical.
- A `.gitignore` the project wrote inside the directory is kept.
- Calling it repeatedly changes nothing.
- End to end: migrating a real `mcp-vertex` workspace leaves `git status`
  naming the renames — the migration they asked for — and never
  `.delendai`.

## risks and mitigations

- **A project that wants this state in version control.** It removes the
  `.gitignore`; the helper never rewrites one that exists.
- **A directory that will not take the file.** The write is best-effort
  and the caller's own write still happens: a visible file is bad, a lost
  migration record is worse.

## notes

The user's standing instruction is that this state belongs in a cache
directory rather than `.delendai/`, and that it be configurable. That
move is real and separate: the journal must sit outside the cache
directory precisely because a migration renames the cache directory, so
relocating it means reordering the migrations that do the renaming. This
slice makes the current location invisible, which is the part the person
opening the folder actually experiences.
