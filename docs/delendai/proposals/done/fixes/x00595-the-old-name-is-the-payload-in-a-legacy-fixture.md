---
id: x00595
title: "The old name is the payload in a legacy fixture"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-22
tags:
    - migration
    - ci
shipped-in:
  - "f02242329"
last-transition-id: 48f71094-a080-4143-a0e1-0a71f1f6e359
last-correlation-id: 48f71094-a080-4143-a0e1-0a71f1f6e359
last-transition-from: review
---

# x00595 — The old name is the payload in a legacy fixture

## goal

The brand sweep stops refusing the one place the old brand belongs.

## why

`tests: tools 1/3` went red on **three** unrelated pull requests at once:

```
FAIL tools scripts/migrate/rebrand-propagate.spec.ts
  expected 'Rebrand propagation: "mcp-vertex" → …' to contain
           'Rebrand propagation clean'
  - "mcp-vertex" still appears in 1 live file(s)
      · packages/cli/src/index.spec.ts
```

That file is x00591's test that `delendai guard` does **not** migrate: a
hook runs while git holds its locks, so a migration there writes to the
workspace mid-commit. Proving it needs a genuine legacy workspace, and a
genuine legacy workspace is spelled `mcp-vertex.config.json`.

The sweep reads every occurrence of the old name as a leftover. In this
file — as in the migrator's own tables — it is the **payload**.

This is not a hypothetical distinction. x00592 found that the very same
sweep had already rewritten the migrator's rename table to

```ts
{ from: 'delendai.config.json', to: 'delendai.config.json' }
```

source identical to destination, from the commit that introduced it. The
migrator therefore detected the NEW name, planned a rename of a path onto
itself, and reported `migrated:` on every boot of every adopted project
while a real `mcp-vertex` workspace went untouched — and the specs did
not catch it because the sweep had rewritten their fixtures too.

So the gate has already cost more than it caught, once.

## non-goals

- Weakening the sweep. It is right that `mcp-vertex` anywhere else is a
  leak, and every other path stays in scope.
- A blanket exemption for specs.

## architecture

`INTENTIONAL_LEGACY_PATHS` already exists for exactly this: "paths that
intentionally model or preserve the PRE-rebrand identity". The file joins
it, with the reason written down.

The list also gains the paragraph that would have prevented the original
damage — that this list is the difference between a stale reference and a
payload, that rewriting a payload destroys the migration, and the account
of the time it did.

## slices

### S1 — the legacy fixture is named as one

- **Status**: done
- **Files**: [`tools/scripts/migrate/rebrand-propagate.script.ts`]
- **Gate**: `npx vitest run tools/scripts/migrate/rebrand-propagate.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5, reviewer minimax-3. Verifiqué f02242329 (Merge PR #330 — x00595: the old name is the payload in a legacy fixture). El candidato dado (f86ec7b57b) es un commit de refresh; el delivering real es f02242329. global_gate: none. Slice: la migración de rebrand añade 'mcp-vertex' como valor válido en legacy (config fixtures), no como leftover. Aceptación cumplida: tests: tools 1/3 queda verde para fixtures con el nombre legacy. Sin cambios out-of-scope. NOTA: hay aprobaciones concurrentes de Cartago en otras ramas (c23f28e14 approve + 496e6cb8c request_changes) — esta es la mía concurrente confirmando el veredicto.
- review-attribution: claude-opus-5 from commit f02242329d72 names refs/heads/delendai/wip/claude-opus-5/x00595-S1-g1/the-old-name-is-the-payload-in-a-legacy-fixture (f02242329d7224e3f0c8e5e1e9b084bb6cb6ee4d), opened by minimax-3
## acceptance

- `bun tools/scripts/migrate/rebrand-propagate.script.ts --check` reports
  `0 repo-owned LIVE hit(s)` and `Rebrand propagation clean`.
- The spec's eleven tests pass, including the live-repo one.
- Every path that is not in the list is still swept.

## risks and mitigations

- **A real brand leak later added to `index.spec.ts` would be missed.**
  The exemption is one file rather than a directory, and the reason names
  which test needs it; a leak elsewhere in that file is a review matter.
  The alternative — importing the legacy spelling from the migrator's
  table — would widen `@delendai/core`'s public surface, which has its
  own budget, to satisfy a lint.
