---
id: x00076
status: done
type: proposal
track: repo-hygiene+ci+lint+docs+plugins/rules
date: 2026-06-28
kind: fix
title: Quick wins from the 2026-06-28 audit — sync tool-outputs SDK, move finished f00058, clean proposal warnings, and expand online-preset registry parsers
runner: unknown
model: unknown
scope: quick-wins
shipped-in: []
related:
    - f00057 # skill unification — owns the tool-outputs.ts generation context
    - f00058 # canonical ephemeral exec paths — the proposal being moved
    - f00070 # status-marker bilingual rendering — one of the warned proposals
    - x00074 # loop detector cooldown — the other warned proposal
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }

archived-on: 2026-08-31
---

# x00076 — Quick wins from the 2026-06-28 audit

## goal

Package the 4 quick wins and bug fixes identified by the 2026-06-28 repository audit (`a00043`) into shippable slices, ensuring that the monorepo is fully clean and compliant with its own lint and test gates.

## why

The audit `a00043` identified that:
1. `bun run test` is failing due to a stale generated `tool-outputs.ts` file (H1).
2. The linter of proposals is issuing warnings because proposal `f00058` was flipped to `status: done` but was never moved to the `done/` folder (H2).
3. Proposals `f00070` and `x00074` contain formatting and folder mismatches, generating warnings (H3).
4. Freshness checks in `online-preset.ts` fallback to a stub `'1.0.0'` value for Hex, Composer, Luarocks, CPAN, Clojars, and R registries, hiding it behind a unit test that asserts the stub behavior (H4).

## non-goals

- No new plugins or major features.
- No changes to core engine contracts.

## slices

### S1 — Sync generated tool-outputs SDK

Run type/schema generation to resolve the test failure in `tool-types-sdk.spec.ts`.

- **Status**: done
- **Files**:
    - `packages/core/src/generated/tool-outputs.ts`
- **Gate**: bun run validate
### S2 — Relocate shipped proposal f00058

Move the completed proposal `f00058` to its canonical location under `done/feats/`.

- **Status**: done
- **Note (x00155 S3, 2026-07-27)**: moot as originally scoped — `f00058` (canonical-ephemeral-exec-paths) was renumbered to `done/feats/f00080-canonical-ephemeral-exec-paths-in-plugin-cache.md` rather than moved under its original id. The `f00058` id slot itself is unused (no file currently occupies it). Closing this slice on the renumbered outcome rather than the literal file move described below.
- **Files**:
    - `docs/delendai/proposals/done/feats/f00080-canonical-ephemeral-exec-paths-in-plugin-cache.md` [renumbered from f00058, not a literal path match]
- **Gate**: bun run lint:proposals
### S3 — Correct styling and folder alignment of warned proposals f00070 and x00074

Reorder sections, add missing fields to slices, and move `x00074` to `paused/fixes/` folder to resolve all warnings from `lint:proposals`.

- **Status**: done
- **Note (x00155 S3, 2026-07-27)**: both proposals shipped to full completion rather than being merely re-styled/paused — `f00070` lives at `done/feats/f00070-status-marker-bilingual-rendering.md` and `x00074` lives at `done/fixes/x00074-loop-detector-distinguish-backoff-from-stuck.md`. `bun tools/scripts/lint/proposals.script.ts` reports 0 fatal errors on both, so the original "resolve lint warnings" goal is met by their completion.
- **Files**:
    - `docs/delendai/proposals/done/feats/f00070-status-marker-bilingual-rendering.md`
    - `docs/delendai/proposals/done/fixes/x00074-loop-detector-distinguish-backoff-from-stuck.md`
- **Gate**: bun run lint:proposals
### S4 — Support Hex, Composer, and Luarocks registry parsing in online-preset

Expand the JSON parsing logic in `fetchOnlinePresetInfo` to correctly extract the latest package version for Hex (Elixir Credo), Composer (PHP phpstan), and Luarocks (Lua luacheck), and update their specs to assert the actual returned version instead of the fallback '1.0.0'.

- **Status**: done
- **Verified (x00155 S3, 2026-07-27)**: `plugins/rules/src/lib/frameworks/online-preset.ts` resolves real `hex.pm`/`repo.packagist.org`/`luarocks.org` endpoints; `plugins/rules/tests/src/lib/online-preset.spec.ts` asserts the real URLs (not the `'1.0.0'` stub) for all three.
- **Files**:
    - `plugins/rules/src/lib/frameworks/online-preset.ts`
    - `plugins/rules/tests/src/lib/online-preset.spec.ts`
- **Gate**: bun run test
## acceptance

- `bun run validate` passes successfully with no errors or warnings.
- `bun run lint:proposals` returns 0 fatal errors.

