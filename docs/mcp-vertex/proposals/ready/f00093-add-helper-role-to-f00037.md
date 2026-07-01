---
id: f00093
status: ready
type: proposal
track: repo-layout+contracts
date: 2026-07-01
kind: feat
title: Add `helper` role to the f00037 file-convention contract
shipped-in: []
recan: []
related:
    - f00037 # original file-convention proposal
    - f00057 # skill unification + plugin coverage
ownership:
    - { agent: implementation_runner, task: 'S1: extend Role union + add HelperRule to file-conventions.contract.ts' }
    - { agent: implementation_runner, task: 'S2: migrate the two CLI helpers that today use .service.ts but should be .helper.ts' }
    - { agent: implementation_runner, task: 'S3: extend the contract spec + the parity spec to lock the new role' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun tools/scripts/lint/file-conventions.script.ts, expect: "4 unmatched (unchanged baseline, all outside packages/cli/)" }
    - { command: bunx vitest run --config packages/cli/vitest.config.ts, expect: "26 files / 214 tests / 100% green" }
---

# f00093 — Add `helper` role to the f00037 file-convention contract

## Goal

Extend the canonical f00037 file-convention table with a new role:

| Role    | Folder     | Suffix         | Example                    |
|---------|------------|----------------|----------------------------|
| helper  | `helpers/` | `*.helper.ts`  | `cli-command.helper.ts`    |

The new role classifies pure-function modules that assist a specific consumer
contract — **distinct from `service`**, which f00037 documents as "stateful
business logic". Helpers have no state, no IO, and no domain logic; they are
reference-style wrappers and parsers.

## Why

The refactor that aligned `packages/cli/` with f00037 (c9a531ba + da311611 +
fcd63b50) produced two files that satisfy the contract letter but misrepresent
their role:

- `lib/cli-helpers.service.ts` — the module exports five pure functions
  (`data`, `scalarArg`, `hasFlag`, `request`, `isRecord`) and a thin text
  formatter. No state, no IO, no business logic. Inflating them to
  `.service.ts` makes them lie about what they are.
- `lib/color.service.ts` — the ANSI palette + seven formatting helpers
  (`heading`, `brand`, `success`, …). Same shape: pure functions, no state.

Forcing helpers into the `.service.ts` shape has three concrete costs:

1. **Misleading role classification.** A reviewer who opens a
   `*.service.ts` file expects stateful logic and finds pure parsers.
2. **Broken search.** `classifyPath` returns `'service'` for the file, so
   `rg` over `service` matches noise that is not a service.
3. **Conceptual drift.** The repo already uses "helper" as its primary
   domain noun — see the historic `group-helpers.ts`, the
   "Local helper, not exported." comments in
   `packages/core/src/lib/contracts/file-conventions.contract.ts`, the
   `rules-solid-architecture` skill, and the plugin help text. Formalising
   the vocabulary instead of forcing every helper into the `.service.ts`
   shape aligns the contract with how the codebase already talks.

## Why this design

- **Role name `helper`** (not `util`) — three reasons:
    1. The repo's own contracts file uses "helper" 4 times and "util" 0
       times when describing this exact pattern.
    2. "Helper" denotes "assists a specific consumer contract" — exactly
       what `data`/`scalarArg` do for `ICliCommand`. "Util" denotes
       "generic toolbox" — a broader, looser category.
    3. The pre-S2 file was named `group-helpers.ts`. Renaming the
       concept to `util` would erase that muscle memory for no benefit.
- **Folder `helpers/`** — plural, per the f00037 rule "the folder is
  plural; it groups many contracts". Sits at the same level as
  `services/`, `factories/`, `builders/`.
- **Suffix `*.helper.ts`** — singular, per the f00037 rule "the suffix is
  singular; it describes the file role".
- **HelperRule placed BEFORE ServiceRule** in `DEFAULT_TS_RULES` so a
  `*.helper.ts` file never falls through to the service classifier.

## Why not split `color.service.ts` into `contracts/constants/` + a service

Considered. Rejected because:

- The palette (`c`, `paint`) and the formatters (`heading`, `brand`,
  `success`, …) are one feature: "colourful CLI output". Splitting them
  would force every consumer to import from two paths for a single concern.
- The palette can stay encapsulated as a `private const` of the helper
  module — SOLID single responsibility, no public surface for the
  palette alone.

## Non-goals

- No migration of every helper-shaped file in the monorepo in this slice.
  The CLI migration demonstrates the pattern; downstream plugins and
  packages can opt in slice-by-slice.
- No new role for `util` or `mixin` — keep the surface minimal.
- No change to the `Role` discriminator for tools (`tool`, `provider`,
  `view`, `component`, `page`, `i18n`, `data`, `dev`, `webview`) — those
  are already specialised.

## Migration (in this commit)

The two CLI files that the previous refactor placed under
`*.service.ts` are renamed and moved:

| Before                                            | After                                                           |
|---------------------------------------------------|-----------------------------------------------------------------|
| `lib/cli-helpers.service.ts`                      | `lib/helpers/cli-command.helper.ts`                             |
| `lib/color.service.ts`                            | `lib/helpers/cli-color.helper.ts`                               |

The `commands/groups/group-helpers.ts` shim (re-exports `data`,
`hasFlag`, `isRecord`, `request`, `scalarArg`) is updated to point at
the new location.

## Verification

- `bunx tsc --noEmit -p tsconfig.json` → 0 errors
- `bunx vitest run --config packages/cli/vitest.config.ts` →
  26 files / 214 tests / 100% green
- `classifyPath` →
  - `lib/helpers/cli-command.helper.ts` → `helper` ✓
  - `lib/helpers/cli-color.helper.ts` → `helper` ✓
  - `lib/help.service.ts` → `service` (unchanged) ✓
  - `commands/init/init.command.ts` → `command` (unchanged) ✓
- `bun tools/scripts/lint/file-conventions.script.ts` →
  4 unmatched files, all outside `packages/cli/` (baseline unchanged).

## Contract spec

The spec companion at
`packages/core/tests/src/lib/contracts/file-conventions.contract.spec.ts`
gets a new `describe('helper role (f00093)')` block that locks the
five assertions:

1. `lib/helpers/*.helper.ts` → `helper`.
2. `helpers/*/foo.helper.ts` → `helper` (folder rule).
3. `lib/foo.service.ts` → `service` (no rule bleed).
4. `lib/foo.helper.ts` (no folder) → `helper` (suffix rule).
5. The default rule chain orders `HelperRule` BEFORE `ServiceRule` so
   the suffix wins on basename collisions.

The plugin-side parity spec (`plugins/conventions/src/lib/services/typescript-profile.service.ts`
→ `classifyPath`) gets the same five assertions re-imported so both
consumers stay byte-identical on the new role.