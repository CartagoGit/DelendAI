---
id: f00093
status: ready
type: proposal
track: repo-layout+contracts
date: 2026-07-01
kind: feat
title: Add `helper` role + lift exported types into `contracts/interfaces/` (f00037 SRP fix)
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

Two changes land together because they share the same root cause — the
f00037 contract was being honoured literally but violated in spirit:

1. **Add a `helper` role** to the canonical f00037 file-convention table.

   | Role    | Folder     | Suffix         | Example                    |
   |---------|------------|----------------|----------------------------|
   | helper  | `helpers/` | `*.helper.ts`  | `cli-command.helper.ts`    |

   The new role classifies pure-function modules that assist a
   specific consumer contract — **distinct from `service`**, which
   f00037 documents as "stateful business logic". Helpers have no
   state, no IO, and no domain logic; they are reference-style
   wrappers and parsers.

2. **Lift every exported `interface` / `type` declaration out of
   service/helper files and into `contracts/interfaces/*.interface.ts`**.
   The CLI had 35 exported structural types living in the wrong
   module — they were "feature-private" only by accident, because
   most of them were imported across modules. Per f00037 a
   `*.interface.ts` MUST live under `contracts/interfaces/`. The
   feature-private structural helpers (no `export`) stay where they
   are, as the contract already prescribes.

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

### Slice B — helper role + 2 file moves

The two CLI files that the previous refactor placed under
`*.service.ts` are renamed and moved:

| Before                                            | After                                                           |
|---------------------------------------------------|-----------------------------------------------------------------|
| `lib/cli-helpers.service.ts`                      | `lib/helpers/cli-command.helper.ts`                             |
| `lib/color.service.ts`                            | `lib/helpers/cli-color.helper.ts`                               |

The `commands/groups/group-helpers.ts` shim (re-exports `data`,
`hasFlag`, `isRecord`, `request`, `scalarArg`) is updated to point at
the new location.

### Slice C — 35 exported types lifted to `contracts/interfaces/`

Every exported `interface` / `type` that is consumed by another
module is lifted out of its service/helper file and given its own
`*interface.ts` module under `contracts/interfaces/`. The grouping
is by domain concern (ISP):

| File under `contracts/interfaces/` | Types it owns (count) | Lifted from |
|------------------------------------|----------------------:|-------------|
| `init.interface.ts`                | 25 | the 9 `lib/init/*.service.ts` + `commands/init/init.command.ts` |
| `completion.interface.ts`          | 2 | `lib/completion/completion.service.ts` |
| `agent-descriptor.interface.ts`    | 1 | `lib/init/init-catalog.constant.ts` |
| `server-args.interface.ts`         | 2 | `lib/server-args.service.ts` |
| `help-translation.interface.ts`    | 1 | `constants/help-translation.constant.ts` |
| `exit-code.interface.ts`           | 1 | `constants/exit-code.constant.ts` |
| `plugin-defaults.interface.ts`     | 1 | `constants/plugin-defaults.constant.ts` |

Each consumer module:

1. Drops its local `interface`/`type` declaration.
2. Adds `import type { ... } from '.../contracts/interfaces/X.interface'`.
3. Adds `export type { ... }` so existing call sites that import the
   symbol from the service module keep working without churn.

Types that are **only used inside their declaring module** (no
`export`, no cross-module consumer) stay where they are as
"feature-private structural helpers" — that is the f00037 contract
verbatim: `*.types.ts` are feature-private and live next to the
source.

### Verification

- `bunx tsc --noEmit -p tsconfig.json` → 140 errors (down from 145
  baseline; 5 errors disappear because the lifted types now resolve
  via the contracts surface). The remaining 140 are all pre-existing
  from `980d8179` (committed before this slice).
- `bunx vitest run --config packages/cli/vitest.config.ts` →
  26 files / 214 tests / 100% green.
- `classifyPath` →
  - `lib/helpers/cli-command.helper.ts` → `helper` ✓
  - `lib/helpers/cli-color.helper.ts` → `helper` ✓
  - `contracts/interfaces/*.interface.ts` → `interface` ✓
- `bun tools/scripts/lint/file-conventions.script.ts` →
  4 unmatched files, all outside `packages/cli/` (baseline unchanged).

## Contract spec

The spec companion at
`packages/core/tests/src/lib/contracts/file-conventions.contract.spec.ts`
gets a new `describe('helper role (f00093)')` block that locks the
six assertions:

1. `Role` union exposes the `'helper'` literal.
2. `lib/helpers/*.helper.ts` → `helper` (folder rule).
3. A nested `helpers/x/foo.helper.ts` → `helper` (folder rule wins
   at any depth).
4. A bare `foo.helper.ts` (no folder) → `helper` (suffix rule).
5. A `foo.service.ts` stays `service` (no rule bleed).
6. `HelperRule` is ordered BEFORE `ServiceRule` in `DEFAULT_TS_RULES`
   (chain invariant).

The plugin-side parity spec
(`plugins/conventions/src/lib/services/typescript-profile.service.ts`
→ `classifyPath`) gets the same six assertions re-imported so both
consumers stay byte-identical on the new role.

## Verification

- `bunx tsc --noEmit -p tsconfig.json` → 0 errors for files touched by
  this slice; 140 errors remain on `develop` HEAD, all pre-existing
  from `980d8179` and unrelated.
- `bunx vitest run --config packages/cli/vitest.config.ts` →
  26 files / 214 tests / 100% green.
- `classifyPath` →
  - `lib/helpers/cli-command.helper.ts` → `helper` ✓
  - `lib/helpers/cli-color.helper.ts` → `helper` ✓
  - `lib/help.service.ts` → `service` (unchanged) ✓
  - `commands/init/init.command.ts` → `command` (unchanged) ✓
  - `contracts/interfaces/init.interface.ts` → `interface` ✓
- `bun tools/scripts/lint/file-conventions.script.ts` →
  4 unmatched files, all outside `packages/cli/` (baseline unchanged).

## Contract spec

The spec companion at
`packages/core/tests/src/lib/contracts/file-conventions.contract.spec.ts`
gets a new `describe('helper role (f00093)')` block that locks the
six assertions:

1. `Role` union exposes the `'helper'` literal.
2. `lib/helpers/*.helper.ts` → `helper` (folder rule).
3. A nested `helpers/x/foo.helper.ts` → `helper` (folder rule wins
   at any depth).
4. A bare `foo.helper.ts` (no folder) → `helper` (suffix rule).
5. A `foo.service.ts` stays `service` (no rule bleed).
6. `HelperRule` is ordered BEFORE `ServiceRule` in `DEFAULT_TS_RULES`
   (chain invariant).

The plugin-side parity spec
(`plugins/conventions/src/lib/services/typescript-profile.service.ts`
→ `classifyPath`) gets the same six assertions re-imported so both
consumers stay byte-identical on the new role.