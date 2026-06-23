---
name: mcp-vertex-rules-solid-architecture
description: How the `@mcp-vertex/rules` plugin applies SOLID — the contracts (ISP), the registries (DIP), the adapters (OCP), the data (S), the validators (OCP), the renderers (DIP), and the priority resolver (S). Use when adding a new language preset, refactoring a tool, or auditing a slice.
---

# SOLID architecture of `@mcp-vertex/rules`

This skill is the *ground truth* of the SOLID seams in the `rules`
plugin. The proposal [f00051](../proposals/ready/f00051-multilanguage-rules-presets.md)
describes the *what* and *why*; this skill describes the *how* — the
seams a contributor must respect to keep the plugin extensible.

## 1. Contracts layer (`src/lib/frameworks/contracts/`)

The contracts layer is the **only** layer other modules may import
`@mcp-vertex/rules/lib/frameworks/contracts` from. It exposes:

| Type | Principle | Consumer |
|---|---|---|
| `IPresetIdentity` | ISP (S) | registry lookup, online-preset |
| `IPresetConfigs` | ISP (S) | manifest writer (materialise file contents) |
| `IPresetConventions` | ISP (S) | `get_rules` |
| `IPresetCommands` | ISP (S) | future containerised linter support |
| `IPresetToolchain` | ISP (S) | `check_rules` (missing linter deps) |
| `ICommandSet` | ISP (S) | every tool that runs a command |
| `ICommandSetProvider` | DIP (D) | every language adapter (and the default) |
| `ILanguageAdapter` | OCP (O) | `PresetDetector` |
| `IDogmaAdapter` | ISP + OCP (I + O) | `DogmaRegistry` |
| `IDogmaRenderer` / `IDogmaRendererRegistry` | DIP (D) | every tool that surfaces a dogma to the LLM |
| `IRulePreset` | LSP (L) | composed by intersection of the 5 narrow segments |
| `IRulesMode` | S | `applying-rules` knowledge + tools |

**Rule of thumb:** a new module that needs a *subset* of these
contracts should depend on the narrowest one. The barrel
`contracts/index.ts` re-exports all of them so consumers can
`import type { ... } from '@mcp-vertex/rules/lib/frameworks/contracts'`.

## 2. Registry layer (`src/lib/frameworks/registry/`)

Three classes + one factory + one validator. The layer is
**closed for modification** (the classes never change) and
**open for extension** (the factory + validator accept new
inputs).

| Class / module | Principle | Construction |
|---|---|---|
| `PresetRegistry` | DIP (D) | `new PresetRegistry({ presets, adapters, defaultCommandSetProvider })` |
| `DogmaRegistry` | S | `new DogmaRegistry([RUST_DOGMA, …])` |
| `PresetDetector` | OCP + DIP (O + D) | `new PresetDetector(registry)` |
| `buildDefaultComposition` | DIP (D) | single composition root; consumers call it once |
| `defaultPresetValidator` + `composeValidators` | OCP (O) | appending to the array adds a check |

### Adding a new language — the OCP hinge

1. Create `src/lib/frameworks/languages/<lang>/<lang>.adapter.ts`
   that exports an `ILanguageAdapter` (priority + detection +
   optional `commands`).
2. Create `src/lib/frameworks/languages/<lang>/<lang>-command.provider.ts`
   if the linter has a non-ESLint shape.
3. Create `src/lib/frameworks/presets/data/<family>.ts` with the
   preset DATA (file contents as text).
4. Create `src/lib/frameworks/dogmas/<lang>.dogma.ts` with the
   `IDogmaAdapter` (ownership/error/null/naming/async/visibility/
   immutability/testing + bullets).
5. Add the new symbols to the three barrels
   (`languages/index.ts`, `presets/data/index.ts`,
   `dogmas/index.ts`).

**No other file changes.** The detectors, registries, manifest
writer, and tools stay untouched. This is the OCP hinge: the
plugin is open for extension (a 5-file PR) and closed for
modification (zero existing files change).

## 3. Legacy shape layer (`src/lib/frameworks/legacy-shape/`)

The only place that knows the historical wide shape
(`{ eslint: string[]; typecheck: string[] }`). The
`toAreaRulesLite` function maps it to the narrow
`IAreaRulesLite` the registry consumes. **When the legacy
shape is retired (f00051 S1), this directory disappears
entirely**; the registry and tools stay.

## 4. Tools layer (`src/lib/tools/`)

| Module | Principle | Notes |
|---|---|---|
| `command-resolver.ts` | S (SRP) | Only the fallback `ICommandSetProvider`. |
| `policy-resolver.ts` | S + DIP | Only the `IPolicyResolver` interface + the default `PROJECT_OVER_DOGMA_OVER_DEFAULT` implementation. The priority order (`project > dogma > default`) is **encoded once**, here. |
| `rules-tools.ts` (legacy) | — | The historical `if (preset.linter === 'pint')` lives here. It will be replaced by a call to `IPolicyResolver.resolveCommand` when f00051 S1/S11 land. Until then, it is the only place that branches by linter. |

## 5. Smoke test (`tests/src/__typecheck_solid.spec.ts`)

The smoke test is the **acceptance for the SOLID refactor**. It
proves the composition works end-to-end:

- The factory produces a `PresetRegistry`, `DogmaRegistry`,
  and `PresetDetector` that link correctly.
- The priority order is respected (lower number wins).
- The Liskov composition of `IRulePreset` is valid (the 5
  narrow segments are all satisfied).
- The default provider is substitutable (DIP).
- The validator returns stable codes; composing validators
  accumulates findings (OCP).
- The renderer registry looks up by id and falls back to the
  default (DIP).
- The factory accepts a fully custom preset + adapter (DIP
  override).

**A slice that breaks the smoke test is not mergeable.**

## 6. Workflow for a contributor

1. **Read the table in §1** to find the narrowest contract for
   your concern.
2. **Read §2** to understand which registry you plug into.
3. **Add the new language in 5 files** (per §2). Do not edit
   any file outside `contracts/`, `registry/`, `languages/`,
   `dogmas/`, `presets/data/`, or `legacy-shape/`.
4. **Run `bun run test`** inside `plugins/rules/`. The smoke
   test must stay green; add a new spec if your language has
   a non-trivial detection rule.
5. **Run `bun run validate`** at the repo root.

## Anti-patterns (forbidden)

- ❌ A new `if (preset.linter === '<new-linter>')` branch in
  `tools/rules-tools.ts`. Use an `ICommandSetProvider` instead.
- ❌ A new clause in `detect-framework.ts` (the legacy
  detector). Use a new `ILanguageAdapter` in
  `languages/<lang>/`.
- ❌ A new `Map<string, IRulePreset>` at module level. Use
  the `PresetRegistry` constructor.
- ❌ A new `as` cast on the registry's `commandsFor` return
  value. The `ICommandSet` shape is the contract; respect it.
- ❌ Editing `manifest.ts` to add a language. The manifest
  writer consumes the registry; it does not know specific
  languages.
