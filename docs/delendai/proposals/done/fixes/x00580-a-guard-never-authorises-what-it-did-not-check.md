---
id: x00580
title: "A guard never authorises what it did not check"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - guards
    - fail-closed
shipped-in:
  - "c0fc10564f06f466d27ca827d24b9bb50d14d446"
last-transition-id: 90ccaa7c-2325-4b7d-b4ac-ad3cb0940644
last-correlation-id: 90ccaa7c-2325-4b7d-b4ac-ad3cb0940644
last-transition-from: review
---

# x00580 — A guard never authorises what it did not check

## goal

A declared policy that cannot be read stops the operation it governs,
instead of waving it through.

## why

`delendai guard <hook>` answered `EXIT_CODE.OK` for two situations it
treated as one:

- the project declares **no** development policy, and
- the project declares one and it **cannot be read**.

The first is an answer. The second is the absence of one, and the
operations this hook guards are exactly the ones the rules exist for:
committing to the integration branch, pushing an unproven publication,
creating a ref outside the namespace. Passing them because the rulebook
is unparseable is the same fail-open shape this cycle has now found three
times — the lefthook resolver that echoed and exited 0, the merge driver
configured with a runtime that cannot start it, and this.

The old reasoning is written in the code: *"say so rather than blocking
every git operation in the repository."* That trades the wrong way round.
A broken `delendai.config.json` is one edit from fixed and the message
names it; an unguarded commit is discovered later, by someone else, from
its consequences.

A test asserted the old behaviour explicitly, which is why no gate ever
objected.

## non-goals

- Refusing when a project declares no policy. That stays a pass.
- Blocking a repository with no escape. `LEFTHOOK=0` still bypasses the
  hook for a genuine emergency, exactly as it did.

## architecture

The `catch` around reading the policy answers `VALIDATION` and says three
things: what could not be read, that nothing was therefore authorised,
and the two ways out — fix the file, or remove the `development` block if
the project genuinely has no policy.

`policy === undefined` keeps its `OK`.

## slices

### S1 — an unreadable policy refuses, a missing one passes

- **Status**: done
- **Files**: [`packages/cli/src/commands/guard.command.ts`, `packages/cli/src/commands/guard.command.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé c0fc10564 completo (guard.command.ts + spec + bootstrap). Separa dos casos que antes devolvían el mismo OK: proyecto sin política declarada (OK legítimo) vs política declarada e ilegible (ahora VALIDATION, fail-closed, con mensaje accionable que nombra el fix). Elimina la forma fail-open que el ciclo ya había encontrado tres veces. LEFTHOOK=0 sigue siendo el escape de emergencia. El test antiguo que afirmaba el comportamiento fail-open se dividió en sus dos casos reales. Acceptance cubierta: la lectura que lanza rechaza, la ausencia de política pasa, y los 22 tests del spec pasan con vitest en el worktree del batch (el fallo previo con `bun test` era del runner, vi.unstubAllEnvs no existe ahí — ambiental, no del slice). changedSince: sin commits posteriores que toquen estos ficheros. Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from Merge pull request #315 from CartagoGit/delendai/pr/claude-opus-5/x00580-S1-g1/a-guard-never-authorises-what-it-did-not-check (refs/heads/delendai/wip/claude-opus-5/x00580-S1-g1/a-guard-never-authorises-what-it-did-not-check) (c0fc10564f06f466d27ca827d24b9bb50d14d446), opened by glm-5.3-max
## acceptance

- A policy read that throws refuses the hook.
- A project that declares no policy still passes.
- The existing guard behaviour is otherwise unchanged: 13 prior tests
  still pass.

## risks and mitigations

- **A malformed config blocks work.** It blocks *guarded* operations, and
  names the file and the fix in the refusal. The alternative is that the
  same malformed config silently disables every rule the project has.
