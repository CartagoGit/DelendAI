---
id: f00051
status: ready
type: proposal
track: plugins/rules+lint+architecture+multi-language
date: 2026-06-23
kind: feat
title: Multi-language rules plugin — add Python, Go, Rust, Ruby, Java/Kotlin, Swift, C#/.NET, Elixir presets and a project-agnostic core
shipped-in: []
related:
    - l00008 # original rules plugin durable-write fix (l00008 s2/s4) — the architecture this proposal generalises
    - a00032 # the universal-scopes refactor that proved the plugin could already be hosted outside mcp-vertex
    - f00049 # conventions unification S7 (de-host i18n) — this proposal also de-hosts the language vocabulary
    - f00050 # quick wins — coordinate on any cross-plugin file edits (none expected: this proposal stays inside plugins/rules/ + docs/)
    - f00037 # file/folder conventions — uses the same `lib/{services,tools,contracts}/` and `*.tool.ts` shape
ownership:
    - { agent: proposal_guardian,    task: 'S1: generalise the core to a project-agnostic Linter×Language model (IRulePreset, IRuleManifest, linter registry, language registry)' }
    - { agent: implementation_runner, task: 'S2: extend detect-framework with per-language manifest + lockfile readers (pyproject, go.mod, Cargo.toml, Gemfile, pom.xml/build.gradle.kts, Package.swift, *.csproj/*.sln, mix.exs)' }
    - { agent: implementation_runner, task: 'S3: add Python (ruff+basedpyright), Go (golangci-lint), Rust (clippy+rustfmt), Ruby (rubocop), Java (checkstyle/spotless+error-prone), Kotlin (ktlint+detekt), Swift (swiftlint+swift-format), C#/.NET (dotnet format+Roslyn analyzers), Elixir (credo+formatter) presets' }
    - { agent: implementation_runner, task: 'S4: extend the IRulePreset / IAreaRules contracts so each preset carries its own check + fix commands (not hardcoded `eslint` / `pint` branches)' }
    - { agent: implementation_runner, task: 'S5: update online-preset to look up each language upstream (PyPI, crates.io, proxy.golang.org, RubyGems, Maven Central, NuGet, Hex.pm) behind the same never-throws-never-blocks contract' }
    - { agent: implementation_runner, task: 'S6: rebalance linter vs typecheck in rules-tools — emit the right per-language commands and surface "typecheck" semantically (mypy/pyright/tsc/go vet/cargo check/kotlinc/swiftc/dotnet build)' }
    - { agent: implementation_runner, task: 'S7: language-aware get_rules outputSchema (mode/modeGuidance/supported/areas/conventions stay; the per-area shape gains a per-language `checkCommand`/`typecheckCommand`/`fixCommand` triple)' }
    - { agent: implementation_runner, task: 'S8: docs + skills — update plugins/rules/README.md, mcp-vertex-plugin-authoring, audit-playbook, token-budget-playbook, applying-rules knowledge' }
    - { agent: implementation_runner, task: 'S9: tests — per-language detect/manifest/tool tests (Python, Go, Rust, Ruby, Java, Kotlin, Swift, C#, Elixir) + per-language golden outputSchema specs + online-preset registry tests with stubbed fetchers' }
    - { agent: implementation_runner, task: 'S10: e2e — spin up a tiny synthetic polyglot workspace (one area per language) and run check_rules + apply_rules end-to-end via the existing MCP harness' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,             expect: exit0 }
    - { command: bun run test,                  expect: exit0 }
    - { command: bun run lint:tools,            expect: exit0 }
    - { command: bun run lint:proposals,        expect: exit0 }
    - { command: bun run validate,              expect: exit0 }
    - { command: 'plugins/rules tests',         expect: '≥ 9 new specs pass (one per language family + generalisation specs)' }
---

# f00051 — Multi-language rules plugin

## goal

Generalise the `rules` plugin along two orthogonal axes:

1. **Language coverage** — make the plugin useful in **every** language
   ecosystem, not just JS/TS/PHP. A polyglot monorepo (Rust CLI + Go
   service + Python API + Kotlin Android app + Elixir backend +
   Solidity contract + Terraform infra + Bash glue) should load
   `mcp-vertex --plugins=rules` and get useful defaults per area.
2. **Dogma coverage** — expose each language's *idiomatic* style as
   first-class metadata. A agent that writes Rust and an agent that
   writes Python should not both be told "follow ESLint rules":
   Rust has ownership + borrow-checker + `?` + sum types; Python has
   duck typing + exceptions + comprehensions + GIL; Haskell has
   purity + monads + lazy evaluation. The plugin's job is not to
   pretend every language is JS with a different linter — it is to
   declare **per language**: linter, formatter, typechecker, package
   manager, naming convention, error model, async model, null safety,
   visibility rules, immutability defaults, testing convention, and
   3-7 idiomatic-do / idiomatic-don't bullets. The agent reads these
   *before* writing the first line.

After this proposal lands, the plugin stops being a "JS/TS lint
helper with a Pint escape hatch" and becomes the
**language-agnostic, dogma-aware rules orchestrator** that AGENTS.md
implies it should be. The host surface is already project-agnostic
(since `a00032`); this proposal pays the language + dogma surface.

### Language families in scope

Organised by family, all **included** in this slice (no follow-up
proposals needed for any of them — the architecture is open/closed
exactly so we don't have to write a new proposal per language):

| Family | Languages covered |
|---|---|
| **JS/TS ecosystem** | `ts`, `js`, `jsx`, `tsx`, JSX-only frameworks (Angular, React, Vue, Svelte, Solid, jQuery), meta-frameworks (Next, Remix, Nuxt, Astro) |
| **JVM family** | `java`, `kt`, `scala` (sbt), `groovy` (Gradle), `clojure` (Leiningen/tools.deps) |
| **.NET / Common-Language family** | `cs`, `fs`, `vb` |
| **C-family** | `c`, `cpp`, `objc`, `objcpp`, `carbon` |
| **Systems (Rust-flavoured)** | `rs`, `zig`, `nim`, `crystal`, `v`, `pony` |
| **Systems (Go-flavoured)** | `go` |
| **Functional pure** | `hs` (Haskell / GHC), `ml` (OCaml / Standard ML), `purescript`, `elm`, `idris`, `agda`, `lean`, `coq` |
| **Functional impure (BEAM)** | `ex` (Elixir), `erl` (Erlang), `gleam`, `lfe` |
| **Functional impure (Lisp)** | `clj` (Clojure), `cljs` (ClojureScript), `scm` (Scheme), `rkt` (Racket), `el` (Emacs Lisp) |
| **Scripting dynamic** | `py`, `rb`, `pl` (Perl), `lua`, `tcl`, `php`, `jl` (Julia) |
| **Mobile / Apple** | `swift`, `dart` (Flutter) |
| **Shell** | `sh` (POSIX shell / Bash / Zsh / Dash), `pwsh` (PowerShell Core), `nu` (Nushell), `fish` |
| **Data / stats** | `r` (R / Rscript), `jl` (Julia, also scripting), `m` (MATLAB / Octave), `sas` |
| **Markup / docs** | `md`, `adoc`, `rst`, `tex` (LaTeX), `org`, `typst` |
| **Data / config** | `sql`, `toml`, `yaml`, `json`, `json5`, `hcl` (Terraform), `nix`, `dhall`, `cue`, `kdl` |
| **Web DSLs** | `html`, `css`/`scss`/`sass`/`less`, Vue SFC, Svelte, Astro, `mjml`, `pug`/`jade` |
| **Schema / IDL** | `proto` (Protocol Buffers), `graphql` (SDL), `openapi` (YAML/JSON), `avsc` (Avro), `thrift` |
| **Smart contracts** | `sol` (Solidity), `move` (Aptos/Sui Move), `cairo` (StarkNet), `vyper` |
| **Notebooks** | `ipynb` (Jupyter), `rmd` (R Markdown), `qmd` (Quarto) |
| **Build / make** | `cmake`, `make`, `bazel`/`bzl`, `just`, `ninja` |
| **Editor / misc** | `vim` (Vimscript), `lua` (Neovim config), `ron` (Rusty Object Notation), `toml` (already) |

That is **~70 languages across 20+ families**. Each one ships:
- a `ILanguageAdapter` (detection: which file marks this language),
- an `ICommandSetProvider` (how to lint/format/typecheck it),
- an `IDogmaAdapter` (the language-specific idioms — see below),
- a `IRulePreset` (DATA: the config files we materialise into the cache).

The Open/Closed hinge means none of this requires touching the tools,
the detector, the manifest writer, or the registry — only the
adapter and the data files. This is what makes "70 languages" a
2-hour PR per family instead of a 6-month rewrite.

### Dogma coverage (the second axis)

A new contract `IDogmaAdapter` (segregated from `ILanguageAdapter`
per ISP) exposes **per-language idioms** as structured metadata:

```ts
export interface IDogmaAdapter {
  readonly language: TPresetLanguage;
  readonly ownership: 'borrow-checker' | 'gc' | 'manual' | 'raii' | 'arc';
  readonly errorModel: 'result' | 'exceptions' | 'sum-types' | 'multi-return' | 'nil-or-err' | 'none';
  readonly nullSafety: 'option' | 'nullable-types' | 'no-null' | 'nil-pointer' | 'undefined';
  readonly naming: 'snake_case' | 'camelCase' | 'PascalCase' | 'kebab-case' | 'SCREAMING_SNAKE';
  readonly async: 'promises' | 'async-await' | 'goroutines' | 'callbacks' | 'effects' | 'actors' | 'none';
  readonly visibility: 'pub/fn' | 'public' | 'export' | 'no-modifier' | 'module' | 'fn';
  readonly immutability: 'default-immutable' | 'default-mutable' | 'const-everywhere' | 'let-mut';
  readonly testing: 'table-driven' | 'xunit' | 'jest-style' | 'spec' | 'property-based' | 'example-based' | 'quickcheck';
  readonly packageManager: string;       // 'cargo' | 'npm' | 'pip' | 'mix' | 'go mod' | ...
  readonly bullets: readonly string[];   // 3-7 idiomatic do/don't lines, agent-facing
}
```

Examples of the dogmas we expose (a curated sample, the full table
lives in `architecture → Dogma registry` below):

| Lang | ownership | error | null | naming | async | bullets (sample) |
|---|---|---|---|---|---|---|
| `rs` | `borrow-checker` | `result` | `option` | `snake_case` | `none` | "Prefer `?` over `unwrap()`", "Use `#[must_use]` on fallible builders" |
| `py` | `gc` | `exceptions` | `undefined` | `snake_case` | `async-await` | "Use `from __future__ import annotations`", "Prefer EAFP over LBYL" |
| `go` | `gc` | `multi-return` | `nil-pointer` | `PascalCase`/exported, `camelCase`/unexported | `goroutines` | "Errors are values; wrap with `%w`", "Don't communicate by sharing memory" |
| `hs` | `gc` | `sum-types` | `option` | `camelCase` | `none` | "Purity by default; mark effects explicitly", "Use `newtype` liberally" |
| `kt` | `gc` | `exceptions` | `nullable-types` | `PascalCase` | `async-await` | "Use `val` over `var`", "Coroutines over threads" |
| `swift` | `arc` | `exceptions` | `optional` | `camelCase` | `async-await` | "Use `guard` for early-exit", "Prefer value types over reference types" |
| `elixir` | `gc` | `sum-types` | `option` | `snake_case` | `actors` | "Pattern-match first", "Processes over threads" |
| `c` | `manual` | `multi-return` | `nil-pointer` | `snake_case` | `none` | "Free what you malloc", "Check every `malloc` return" |

`get_rules` exposes these per area as `dogmas[area]` so the agent
learns *how to write* Rust (or Haskell, or Elixir, …) before writing
the first line — not just *what linter to run*.

## why

### The rules plugin is structurally language-agnostic, but actually JS/TS-only

A read of [`plugins/rules/src/lib/frameworks/types.ts`](../../plugins/rules/src/lib/frameworks/types.ts)
and [`presets.ts`](../../plugins/rules/src/lib/frameworks/presets.ts) shows the plugin
was *designed* to be language-agnostic from the start:

- `IRulePreset` is `linter: 'eslint' | 'pint'` (the union says "any linter");
- `IRulePreset.language: 'ts' | 'js' | 'php'` (the union says "any language");
- `IRulesManifest.projects[name].area → { framework, eslint[], typecheck[], reason }` —
  the field is *named* `eslint` but is a `readonly string[]` of config paths, so it
  carries any linter config the project ships;
- `lintCheckCommand` / `lintFixCommand` in
  [`rules-tools.ts:108-127`](../../plugins/rules/src/lib/tools/rules-tools.ts#L108-L127)
  already branch by `preset.linter` (eslint vs pint) and emit per-linter commands;
- the manifest writes one config + one tsconfig per preset under `.cache/mcp-vertex/rules/`,
  which is exactly the shape Python/Go/Rust/etc. need (ruff.toml, .golangci.yml,
  rustfmt.toml, …).

What is **not** general:

1. **Detection is JS-only.** `detectPresetForArea` in
   [`detect-framework.ts`](../../plugins/rules/src/lib/frameworks/detect-framework.ts)
   reads `package.json` first, then `composer.json` / `artisan` for Laravel, and
   returns one of 13 framework ids. A workspace with `apps/api-py/` (no package.json)
   and `apps/web/` (Next.js) in the same repo is currently classified as
   `vanilla-js` for the Python area, with no signal that Python is in play.
2. **Typecheck assumes TS.** `IAreaRules.typecheck` only makes sense as a list of
   `tsconfig.json` paths today. For Python that list should be `pyrightconfig.json`
   / `pyproject.toml [tool.pyright]`; for Go it's `go.mod`; for Rust it doesn't
   apply (cargo check is the typecheck); for C# it's the `.csproj`. The schema is
   right; the *name* is wrong.
3. **`online-preset.ts` hardcodes the npm registry.** `ONLINE_PACKAGE_BY_PRESET` maps
   preset id → npm package; the fetcher is `https://registry.npmjs.org/${pkg}/latest`.
   The plugin's docstring correctly says "non-npm ecosystems are omitted on purpose",
   so the contract is documented — but the contract is that a Go preset has *no*
   online freshness, which is a regression we should close.
4. **No preset for any non-Node language.** Despite the type system leaving room for
   them, `RULE_PRESETS` carries zero Python, Go, Rust, Ruby, Java, Kotlin, Swift, C#,
   or Elixir entries. The plugin's "supported" array (`SUPPORTED_PRESET_IDS`) is
   honest about that today; tomorrow it should not be.
5. **`get_rules` outputSchema names "eslintConfigs" / "typecheckConfigs".** Even
   though the values are correct, the schema hardcodes the vocabulary. A host that
   ships a pure-Python project gets `eslintConfigs: []` in the structured output,
   which is confusing for any downstream model.

### The plugin's own README admits the gap

[`plugins/rules/README.md`](../../plugins/rules/README.md) ends the "Supported presets"
section with:

> `angular`, `react-ts`, `react-js`, `vue`, `svelte`, `vanilla-ts`, `vanilla-js`,
> `jquery`. **Architecture is extensible to other linters (e.g. PHP/Laravel).**

The "extensible to" sentence is honest but the architecture is *not* realised — there
is one non-ESLint preset (`laravel/pint`), and no detection for `composer.json` beyond
its presence. The comment in the type union was a forward-looking promise; this
proposal pays it down for the nine language families above.

### The rest of mcp-vertex is already project-agnostic

`a00032`'s universal-scopes refactor proved the `audit` plugin could be loaded
inside a non-mcp-vertex host with no leakage of `mcp-vertex_metrics` /
`ctx.keepLegacy` / `tool-outputs.ts` (see
[`docs/proposals/done/audits/a00032-…-plugins.md`](../../proposals/done/audits/)).
The same proof applies to `rules`: every other surface in
[`packages/core/`](../../packages/core/) accepts a workspace-relative root and a
`FileReader` injection, and the rules plugin already does. **What is missing is
the language surface, not the host surface.**

A Python project (Django/FastAPI), a Go service, a Rust CLI, or a polyglot
microservice repo (the kind mcp-vertex's "polyglot workspace" use case implies in
[`docs/CROSS-PROJECT-SETUP.md`](../../CROSS-PROJECT-SETUP.md)) should be able to
run the same `mcp-vertex --plugins=rules` and get useful defaults per area.
Today it cannot.

## non-goals

- **No new public types beyond what the language generalisation requires.** This
  proposal widens existing unions (`language: 'ts' | 'js' | 'php' | 'py' | 'go' | 'rs'
  | 'rb' | 'java' | 'kt' | 'swift' | 'cs' | 'ex'`, `linter: 'eslint' | 'pint' | 'ruff'
  | 'golangci-lint' | 'clippy' | 'rubocop' | 'checkstyle' | 'ktlint' | 'swiftlint' |
  'dotnet-format' | 'credo' | …`) and adds one optional `typecheckCommand` and one
  optional `fixCommand` per preset. The pre-existing public surface
  (`@mcp-vertex/rules`) keeps the same exports; the bar for adding an `export type`
  is intentionally the same as the rest of the repo.
- **No new plugin.** The work lives entirely inside `plugins/rules/` and the
  documentation that references it. Splitting into `plugins/rules-python`,
  `plugins/rules-go`, etc. is a future option, not a present commitment.
- **No new npm dependencies.** Each preset is shipped as DATA (config file contents
  as text), same as today. The plugin never imports `eslint-plugin-react` or
  `typescript-eslint`; it only writes the config files the *project* consumes.
  Adding `pip install ruff` to the plugin is therefore not necessary.
- **No online fetch for languages whose primary registry is not reachable from the
  existing fetcher contract.** S5 extends `online-preset.ts` with a registry-URL
  registry (PyPI, crates.io, proxy.golang.org, RubyGems, Maven Central, NuGet,
  Hex.pm) but keeps the "never throws, never blocks" semantics. If a registry is
  firewalled, the preset just gets `ok: false` with a `reason`; the offline preset
  is unaffected.
- **No tool renaming.** `get_rules` / `check_rules` / `apply_rules` keep their
  names. The description strings change ("the ESLint and typecheck configs" →
  "the linter and typecheck configs"); the IDs do not.
- **No language gets a perfect preset in slice one.** Every language
  in the table above ships a *baseline* preset (DATA stub with a
  minimal valid config + 3-5 idiomatic bullets + the right command
  triplet). Curated, hand-verified presets for the most-used
  languages (Python, Go, Rust, Java, Kotlin, Swift, C#, Elixir,
  Scala, Haskell, Zig, Dart) land in `f00052` (the "premium presets"
  follow-up). What ships here is the *architecture* + ~70 stub
  presets; what ships in `f00052` is the *content quality* for the
  top 12. This is intentional: the architecture must be open for
  addition without breaking the tools, but the content is best
  curated by language-expert humans, not by this proposal's author.
- **No domain-specific linters** (e.g. SQLFluff for SQL, Hadolint
  for Dockerfiles, Markdownlint for Markdown, Solhint for
  Solidity). The plugin ships *one* canonical linter per language
  (the one with the broadest ecosystem footprint) plus optional
  add-on linters the project may layer on top. SQLFluff is
  recommended in the SQL preset's `bullets`, but the preset itself
  uses `pgFormatter` for SQL formatting and `sqlfluff` for linting;
  projects can swap to anything.
- **No language servers.** LSP integration is the responsibility of
  the host (today: `extensions/vscode`). The rules plugin produces
  *what to run* (commands) and *what to know* (dogmas); LSP is the
  host's concern. A future slice could expose
  `get_language_server_command` per preset, but it is out of scope
  here.
- **No formatter-preset proliferation.** Each language ships
  *one* canonical formatter (Prettier for JS/TS/CSS/HTML/YAML/JSON,
  Black for Python, gofmt for Go, rustfmt for Rust, …) inside the
  preset. Projects that want dprint/rome/biome/swift-format-dev
  layer it on top — the preset ships the most-mainstream one.
- **No CI changes.** `bun run validate` already gates everything; no
  new GitHub Actions, no dependabot bumps.

## architecture

The refactor generalises the rules plugin along **SOLID** lines. Each
principle maps to one concrete seam in the code; the proposal's slices
implement them in dependency order (interfaces → registry → adapters →
data → tools → docs/tests).

### SOLID mapping

| Principle | Concrete seam | What changes |
|---|---|---|
| **S** — Single Responsibility | `frameworks/contracts/` is split into 5 narrow interfaces (`IPresetIdentity`, `IPresetConfigs`, `IPresetConventions`, `IPresetCommands`, `IPresetToolchain`) plus `ICommandSet`, `ICommandSetProvider`, `ILanguageAdapter`. Each module owns exactly one concern. | `presets.ts` (1 file, 600 LOC) → 14 small modules. |
| **O** — Open/Closed | `frameworks/languages/<id>.adapter.ts` — one file per language family, closed for the detector to modify. | Adding Python = one new file; the detector, the registry, the manifest writer and the tools never need to know. |
| **L** — Liskov | `IRulePreset` is *composed* (intersection of the 5 narrow interfaces), not inherited. Every preset satisfies all 5 segments; consumers depend on the narrowest slice they need. | The legacy `IRulePreset` (with `eslintConfigFile`/`eslintConfigContent`/`tsconfigFile`/`tsconfigContent`/`requiredEslintDeps`) becomes a pure data object whose field names match the contract (`linterConfigFile`/`linterConfigContent`/`typecheckConfigFile`/`typecheckConfigContent`/`requiredLinterDeps`). |
| **I** — Interface Segregation | 5 narrow preset interfaces + 1 command-set interface + 1 provider interface + 1 language-adapter interface. | The detector only reads `ILanguageAdapter.detect`; the registry reads `IRulePreset.id`; the manifest writer reads `IPresetConfigs`; the command tools read `ICommandSetProvider`. No caller touches the full preset shape. |
| **D** — Dependency Inversion | `PresetRegistry` and `PresetDetector` are **classes** constructed with their dependencies (`presets`, `adapters`, `defaultCommandSetProvider`). No module-level singletons except a single `buildDefaultRegistry()` factory for boot. | Today: `PRESET_BY_ID` is a module-level `Map` consumed by `manifest.ts`, `rules-tools.ts`, `online-preset.ts` — three callers that cannot be tested with a different preset set. After: a registry instance is constructed per-test/per-boot; every consumer depends on the abstraction. |

### Module layout

```
plugins/rules/src/lib/frameworks/
├── contracts/                                # ISP — pure types, one per concern
│   ├── preset-identity.interface.ts          # IPresetIdentity + TPresetLanguage + TPresetLinter (now ~70 languages)
│   ├── preset-configs.interface.ts           # IPresetConfigs (linter + typecheck file contents)
│   ├── preset-conventions.interface.ts       # IPresetConventions (agent-facing bullets)
│   ├── preset-commands.interface.ts          # IPresetCommands (check/fix templates)
│   ├── preset-toolchain.interface.ts         # IPresetToolchain (requiredLinterDeps)
│   ├── command-set.interface.ts              # ICommandSet (check/fix/typecheck commands)
│   ├── command-set-provider.interface.ts     # ICommandSetProvider (per-language renderer)
│   ├── language-adapter.interface.ts         # ILanguageAdapter (one per language family)
│   ├── dogma-adapter.interface.ts            # IDogmaAdapter (NEW: ownership/error/null/async/... per language)
│   ├── dogma.interface.ts                    # IDogma / IOwnershipDogma / IErrorModelDogma / ... (small interfaces)
│   ├── preset.interface.ts                   # IRulePreset = composition of the 5 above
│   ├── mode.interface.ts                     # IRulesMode + RULES_MODES + RULES_MODE_GUIDANCE
│   └── index.ts                              # barrel
├── registry/                                 # DIP — composition root for presets + adapters
│   ├── preset-registry.ts                    # PresetRegistry class (now also resolves IDogmaAdapter)
│   ├── detector.ts                           # PresetDetector class (uses adapters, not specific languages)
│   ├── dogma-registry.ts                     # DogmaRegistry class (separate from PresetRegistry: S, single responsibility)
│   ├── default-registry.ts                   # buildDefaultRegistry() factory
│   └── index.ts                              # barrel
├── languages/                                # OCP — one adapter per language family
│   ├── base/                                 # shared command-set providers per ecosystem
│   │   ├── eslint-base.provider.ts           # shared ICommandSetProvider for JS/TS presets
│   │   ├── jvm-base.provider.ts              # shared for Java/Kotlin/Scala/Groovy/Clojure (javac/kotlinc as typecheck)
│   │   ├── llvm-base.provider.ts             # shared for Rust/Zig/Carbon/Nim/Crystal/V/Pony/C/C++/Objective-C
│   │   ├── beam-base.provider.ts             # shared for Elixir/Erlang/Gleam/LFE
│   │   ├── scripting-base.provider.ts        # shared for Python/Ruby/Perl/Lua/PHP/Tcl/Julia
│   │   ├── lisp-base.provider.ts             # shared for Clojure/Scheme/Racket/Emacs-Lisp
│   │   ├── pure-fp-base.provider.ts          # shared for Haskell/OCaml/PureScript/Elm/Idris/Agda/Lean
│   │   └── meta-config-base.provider.ts      # shared for JSON/YAML/TOML/HCL/Nix/Dhall/Cue
│   ├── js.adapter.ts                         # JS-family detection (catch-all)
│   ├── ts.adapter.ts                         # TS-family detection (meta-frameworks first)
│   ├── php.adapter.ts                        # PHP/Pint
│   ├── python.adapter.ts                     # Python/Ruff + basedpyright
│   ├── go.adapter.ts                         # Go/golangci-lint
│   ├── rust.adapter.ts                       # Rust/Clippy
│   ├── ruby.adapter.ts                       # Ruby/RuboCop
│   ├── java.adapter.ts                       # Java/Checkstyle
│   ├── kotlin.adapter.ts                     # Kotlin/ktlint+detekt
│   ├── scala.adapter.ts                      # Scala/scalafmt + WartRemover
│   ├── groovy.adapter.ts                     # Groovy/CodeNarc
│   ├── clojure.adapter.ts                     # Clojure/clj-kondo + eastwood
│   ├── csharp.adapter.ts                     # C#/.NET (dotnet format)
│   ├── fsharp.adapter.ts                     # F# (Fantomas + FSharpLint)
│   ├── vbnet.adapter.ts                      # VB.NET
│   ├── c.adapter.ts                          # C / clang-format + cppcheck
│   ├── cpp.adapter.ts                        # C++ / clang-tidy
│   ├── objc.adapter.ts                       # Objective-C / clang-format
│   ├── objcpp.adapter.ts                     # Objective-C++
│   ├── carbon.adapter.ts                     # Carbon
│   ├── zig.adapter.ts                        # Zig / zig fmt + zlint
│   ├── nim.adapter.ts                        # Nim / nimpretty + nimlsp
│   ├── crystal.adapter.ts                    # Crystal / crystal tool format + ameba
│   ├── v.adapter.ts                          # V / v fmt + v vet
│   ├── pony.adapter.ts                       # Pony
│   ├── swift.adapter.ts                      # Swift / SwiftLint
│   ├── dart.adapter.ts                       # Dart/Flutter / dart analyze + dart format
│   ├── haskell.adapter.ts                    # Haskell / ormolu + hlint + weeder
│   ├── ocaml.adapter.ts                      # OCaml / ocamlformat + dune
│   ├── sml.adapter.ts                        # Standard ML
│   ├── purescript.adapter.ts                 # PureScript / purs-tidy + pscid
│   ├── elm.adapter.ts                        # Elm / elm-format + elm-review
│   ├── idris.adapter.ts                      # Idris / idris2 + elaborator reflection
│   ├── agda.adapter.ts                       # Agda
│   ├── lean.adapter.ts                       # Lean 4
│   ├── coq.adapter.ts                        # Coq / Rocq
│   ├── elixir.adapter.ts                     # Elixir / credo + mix format
│   ├── erlang.adapter.ts                     # Erlang / erlfmt + dialyzer
│   ├── gleam.adapter.ts                      # Gleam / gleam format
│   ├── lfe.adapter.ts                        # LFE
│   ├── cljs.adapter.ts                       # ClojureScript
│   ├── scheme.adapter.ts                     # Scheme / indent or srfi-49
│   ├── racket.adapter.ts                     # Racket / raco fmt
│   ├── emacs-lisp.adapter.ts                 # Emacs Lisp
│   ├── perl.adapter.ts                       # Perl / perltidy + perlcritic
│   ├── lua.adapter.ts                        # Lua / stylua + luacheck
│   ├── tcl.adapter.ts                        # Tcl
│   ├── julia.adapter.ts                      # Julia / JuliaFormatter + JET
│   ├── r.adapter.ts                          # R / styler + lintr
│   ├── matlab.adapter.ts                     # MATLAB / Octave
│   ├── sas.adapter.ts                        # SAS
│   ├── bash.adapter.ts                       # POSIX shell / shellcheck + shfmt
│   ├── pwsh.adapter.ts                       # PowerShell / PSScriptAnalyzer
│   ├── nushell.adapter.ts                    # Nushell
│   ├── fish.adapter.ts                       # Fish
│   ├── markdown.adapter.ts                   # Markdown / markdownlint
│   ├── asciidoc.adapter.ts                   # AsciiDoc
│   ├── rst.adapter.ts                        # reStructuredText
│   ├── latex.adapter.ts                      # LaTeX / latexindent
│   ├── typst.adapter.ts                      # Typst / typst fmt
│   ├── sql.adapter.ts                        # SQL / sqlfluff
│   ├── toml.adapter.ts                       # TOML / taplo
│   ├── yaml.adapter.ts                       # YAML / yamllint
│   ├── json.adapter.ts                       # JSON
│   ├── json5.adapter.ts                      # JSON5
│   ├── hcl.adapter.ts                        # HCL (Terraform) / tflint + terraform fmt
│   ├── nix.adapter.ts                        # Nix / nixfmt + nix-instantiate
│   ├── dhall.adapter.ts                      # Dhall
│   ├── cue.adapter.ts                        # CUE
│   ├── kdl.adapter.ts                        # KDL
│   ├── html.adapter.ts                       # HTML / htmlhint
│   ├── css.adapter.ts                        # CSS/SCSS/SASS/LESS / stylelint
│   ├── vue-sfc.adapter.ts                    # Vue SFC (shares commands with vue preset)
│   ├── svelte-sfc.adapter.ts                 # Svelte SFC
│   ├── astro-sfc.adapter.ts                  # Astro SFC
│   ├── mjml.adapter.ts                       # MJML
│   ├── pug.adapter.ts                        # Pug/Jade
│   ├── protobuf.adapter.ts                   # Protocol Buffers / buf
│   ├── graphql.adapter.ts                    # GraphQL SDL / graphql-eslint
│   ├── openapi.adapter.ts                    # OpenAPI / spectral
│   ├── avro.adapter.ts                       # Avro
│   ├── thrift.adapter.ts                     # Thrift
│   ├── solidity.adapter.ts                   # Solidity / forge fmt + solhint
│   ├── move.adapter.ts                       # Move (Aptos/Sui)
│   ├── cairo.adapter.ts                      # Cairo (StarkNet)
│   ├── vyper.adapter.ts                      # Vyper
│   ├── jupyter.adapter.ts                    # Jupyter notebooks / nbqa + black
│   ├── rmd.adapter.ts                        # R Markdown
│   ├── quarto.adapter.ts                     # Quarto
│   ├── cmake.adapter.ts                      # CMake / cmake-format
│   ├── make.adapter.ts                       # Make / checkmake
│   ├── bazel.adapter.ts                      # Bazel / buildifier
│   ├── just.adapter.ts                       # just (task runner)
│   ├── ninja.adapter.ts                      # Ninja
│   ├── vimscript.adapter.ts                  # Vimscript / vint
│   ├── ron.adapter.ts                        # Rusty Object Notation
│   └── index.ts                              # DEFAULT_LANGUAGE_ADAPTERS, priority-sorted
├── dogmas/                                   # IDogmaAdapter per language (the new S axis)
│   ├── rust.dogma.ts                         # borrow-checker / result / option / snake_case / …
│   ├── python.dogma.ts                       # gc / exceptions / None / snake_case / async-await / table-driven
│   ├── go.dogma.ts                           # gc / multi-return / nil / mixed casing / goroutines
│   ├── haskell.dogma.ts                      # gc / sum-types / Maybe / camelCase / pure / quickcheck
│   ├── elixir.dogma.ts                       # gc / sum-types / nil / snake_case / actors
│   ├── kotlin.dogma.ts                       # gc / exceptions / null / PascalCase / async-await
│   ├── swift.dogma.ts                        # arc / throws / Optional / camelCase / async-await
│   ├── csharp.dogma.ts                       # gc / exceptions / Nullable<T> / PascalCase / async-await
│   ├── java.dogma.ts                         # gc / checked exceptions / null / PascalCase / threads
│   ├── scala.dogma.ts                        # gc / Either / Option / camelCase / Future
│   ├── ruby.dogma.ts                         # gc / exceptions / nil / snake_case / fibers
│   ├── php.dogma.ts                          # gc / exceptions / null / snake_case / none
│   ├── zig.dogma.ts                          # manual / error-union / optional / snake_case / async-await
│   ├── dart.dogma.ts                         # gc / exceptions / null / lowerCamelCase / async-await
│   ├── elm.dogma.ts                          # gc / Result / Maybe / camelCase / Cmd
│   ├── ocaml.dogma.ts                        # gc / result / option / snake_case / none
│   ├── fsharp.dogma.ts                       # gc / Result / Option / PascalCase / async
│   ├── clojure.dogma.ts                      # gc / exceptions / nil / kebab-case / futures
│   ├── erlang.dogma.ts                       # gc / exceptions / atom / snake_case / processes
│   ├── gleam.dogma.ts                        # gc / Result / Option / snake_case / none
│   ├── julia.dogma.ts                        # gc / exceptions / nothing / snake_case / tasks
│   ├── r.dogma.ts                            # gc / stop() / NA / dot.case / none
│   ├── bash.dogma.ts                         # manual / exit code / unset / snake_case / none
│   ├── pwsh.dogma.ts                         # gc / exceptions / $null / PascalCase / none
│   ├── sql.dogma.ts                          # n/a / n/a / null / snake_case / none
│   ├── toml.dogma.ts                         # n/a / n/a / n/a / kebab-case / none
│   ├── yaml.dogma.ts                         # n/a / n/a / null / kebab-case / none
│   ├── json.dogma.ts                         # n/a / n/a / null / camelCase / none
│   ├── hcl.dogma.ts                          # n/a / n/a / null / snake_case / none
│   ├── nix.dogma.ts                          # n/a / throw / null / camelCase / none
│   ├── html.dogma.ts                         # n/a / n/a / n/a / kebab-case / none
│   ├── css.dogma.ts                          # n/a / n/a / n/a / kebab-case / none
│   ├── markdown.dogma.ts                     # n/a / n/a / n/a / ATX / none
│   ├── protobuf.dogma.ts                     # n/a / n/a / n/a / PascalCase / none
│   ├── graphql.dogma.ts                      # n/a / n/a / n/a / PascalCase / none
│   ├── solidity.dogma.ts                     # gc / revert / address / camelCase / none
│   └── index.ts                              # DEFAULT_DOGMA_ADAPTERS, indexed by language
├── presets/                                  # S — DATA only, no logic
│   ├── data/
│   │   ├── js.ts                             # vanilla-js, vanilla-ts, react-ts, react-js, vue, svelte, angular, jquery
│   │   ├── php.ts                            # laravel/pint
│   │   ├── meta-frameworks.ts                # next-ts, remix, nuxt, astro, solid-ts
│   │   ├── jvm.ts                            # java-checkstyle, kotlin-ktlint, scala-scalafmt, groovy-codenarc, clojure-clj-kondo
│   │   ├── dotnet.ts                         # csharp-dotnet, fsharp-fantomas, vbnet
│   │   ├── c-family.ts                       # c-clangformat, cpp-clangtidy, objc, objcpp, carbon
│   │   ├── rust-flavour.ts                   # rust-clippy, zig-zigfmt, nim-nimpretty, crystal-ameba, v, pony
│   │   ├── functional.ts                     # haskell-ormolu, ocaml-ocamlformat, sml, purescript, elm, idris, agda, lean, coq
│   │   ├── beam.ts                           # elixir-credo, erlang-erlfmt, gleam, lfe
│   │   ├── lisp.ts                           # clojure, clojurescript, scheme, racket, emacs-lisp
│   │   ├── scripting.ts                      # python-ruff, ruby-rubocop, perl, lua, tcl, julia
│   │   ├── mobile.ts                         # swift-swiftlint, dart-dartanalyze
│   │   ├── data-stats.ts                     # r-styler, julia-jet, matlab-octave, sas
│   │   ├── shell.ts                          # bash-shellcheck, pwsh-psscriptanalyzer, nushell, fish
│   │   ├── docs.ts                           # markdown, asciidoc, rst, latex, typst
│   │   ├── data-config.ts                    # sql, toml, yaml, json, json5, hcl, nix, dhall, cue, kdl
│   │   ├── web-dsl.ts                        # html, css, vue-sfc, svelte-sfc, astro-sfc, mjml, pug
│   │   ├── schema.ts                         # proto-buf, graphql-eslint, openapi-spectral, avro, thrift
│   │   ├── smart-contracts.ts                # solidity-forge, move, cairo, vyper
│   │   ├── notebooks.ts                      # jupyter-nbqa, rmd, quarto
│   │   ├── build.ts                          # cmake, make, bazel-buildifier, just, ninja
│   │   ├── misc.ts                           # vimscript-vint, ron
│   │   └── index.ts                          # ALL_PRESET_DATA
│   ├── presets.ts                            # facade (RULE_PRESETS, PRESET_BY_ID, SUPPORTED_PRESET_IDS, REQUIRED_LINTER_DEPS, REQUIRED_ESLINT_DEPS alias)
│   ├── types.ts                              # facade (IAreaRules, IRulesManifest; re-exports IRulesMode from contracts)
│   ├── detect-framework.ts                   # facade over PresetDetector (back-compat free function)
│   ├── manifest.ts                           # buildRulesManifest + ensureRulesCache (unchanged core, now consumes PresetRegistry via DI)
│   └── online-preset.ts                      # ONLINE_PACKAGE_BY_PRESET widened to cover all 70+ language families (S5)
├── tools/                                    # unchanged: rule-tools.ts reads ICommandSetProvider through PresetRegistry
├── knowledge/                                # applying-rules knowledge (S8 updates the prose to mention dogmas)
└── generated/tool-outputs.ts                 # regenerated by S7
```

### SOLID per module (the per-file contract)

SOLID stops being "philosophy" and becomes a **reviewable contract**
when each new module declares the single principle it embodies. The
table below is the per-file acceptance for the SOLID mapping; a
reviewer can audit SOLID slice-by-slice by walking down the column
that matches the slice under review:

| Module | Principle | Why this module, exactly |
|---|---|---|
| `contracts/preset-identity.interface.ts` | **I** (Segregation) | Holds ONLY `id` / `framework` / `language` / `linter`. The online-preset lookup depends on this and nothing else. |
| `contracts/preset-configs.interface.ts` | **I** | Holds ONLY the linter + typecheck config file contents. The manifest writer depends on this and nothing else. |
| `contracts/preset-conventions.interface.ts` | **I** | Holds ONLY the agent-facing bullets. `get_rules` depends on this and nothing else. |
| `contracts/preset-commands.interface.ts` | **I** | Holds ONLY the static command templates. Future extension (remote-exec, containerised linters) touches this file and nothing else. |
| `contracts/preset-toolchain.interface.ts` | **I** | Holds ONLY `requiredLinterDeps`. `check_rules` depends on this and nothing else. |
| `contracts/command-set.interface.ts` | **I** | The 3-field tuple `{ checkCommand, fixCommand?, typecheckCommand? }`. |
| `contracts/command-set-provider.interface.ts` | **D** (Inversion) | The abstraction every adapter implements to produce per-area commands. Tools depend on this, not on `PRESET_BY_ID`. |
| `contracts/language-adapter.interface.ts` | **O** (Open/Closed) | Adding a new language = adding a module that implements this; nothing else changes. |
| `contracts/dogma-adapter.interface.ts` | **I** + **O** | Each concern (ownership/error/null/...) is its own narrow interface, *implemented by composition* in the data files — a new concern (say `i18n-convention`) adds one interface, no existing module changes. |
| `contracts/dogma.interface.ts` | **I** | The 8 sub-concerns (`IOwnershipDogma`, `IErrorModelDogma`, …) — each is a tagged union, not a 50-field mega-interface. |
| `contracts/preset.interface.ts` | **L** (Liskov) | `IRulePreset` composes the 5 segments via TypeScript intersection; every preset IS-A each segment, no method-overriding surprises. |
| `contracts/mode.interface.ts` | **S** (Responsibility) | One place defines the enforcement modes; every other module imports the type and never redefines it. |
| `registry/preset-registry.ts` | **D** + **S** | Composition root for presets. Its sole responsibility is lookup + dispatch; the manifest writer, the tools, and the online-preset lookup all consume it via constructor injection. |
| `registry/detector.ts` | **O** + **D** | Closed for modification (the iteration loop never changes); open for extension (every adapter is registered via constructor). Depends only on the `ILanguageAdapter` interface, never on concrete adapters. |
| `registry/dogma-registry.ts` | **S** | **Separate from `PresetRegistry`** — dogmas are language-style facts, not linter artefacts. Splitting them is SRP applied at the registry level. |
| `registry/default-registry.ts` | **D** | The single composition root. Tests substitute narrower registries here. |
| `languages/base/<family>-base.provider.ts` | **S** | One `ICommandSetProvider` per *family* (JVM, BEAM, LLVM, scripting, …), shared by every language in that family. Adding `kotlin` reuses `jvm-base.provider.ts`; the JVM-specific bits live in `kotlin.adapter.ts`. |
| `languages/<lang>.adapter.ts` | **O** | One adapter per language. Adding `zig` = one new file. The detector, registry, and manifest writer never need to know. |
| `dogmas/<lang>.dogma.ts` | **S** + **I** | One file = one language's idiomatic style. The file's only responsibility is *that language's truth*; each concern (ownership/error/...) is a small named export consumed via composition by `IDogmaAdapter`. |
| `dogmas/index.ts` | **D** | Composition root for dogmas — the `DogmaRegistry` consumes this. |
| `presets/data/<family>.ts` | **S** | DATA only — no logic. One file per family so reviewers see related presets grouped. |
| `presets/presets.ts` | **S** | Pure facade over `data/`. The only file that exports the pre-existing public names (`PRESET_BY_ID`, etc.). |
| `presets/types.ts` | **S** | Pure facade. Re-exports `IRulesMode` from `contracts/`; defines `IAreaRules` / `IRulesManifest` here because those are domain shapes, not contracts. |
| `presets/detect-framework.ts` | **D** | Thin adapter — exposes the historical free function as a delegate to `PresetDetector`. Lets `rules.spec.ts` keep working without edits. |
| `presets/manifest.ts` | **S** | Unchanged core — materialises presets to cache, writes the manifest fingerprint. |
| `presets/online-preset.ts` | **O** | Each registry (PyPI, crates.io, …) is a single entry in `REGISTRY_URL`. Adding `buf.build` or `winget` = one new entry. |
| `tools/rules-tools.ts` | **D** | Depends on `ICommandSetProvider` + `DogmaRegistry` via constructor — never on the concrete registries. The hardcoded eslint/pint branches are gone. |
| `knowledge/applying-rules.ts` | **S** | Just text — the agent-facing knowledge body. Reads `IRulesMode` from contracts; never duplicates the mode definitions. |
| `tools/policy-resolution.contract.ts` *(new in S11)* | **S** | The single source of truth for "who wins" between project config / dogma / default. Centralised so the 3 tools (`get_rules`, `check_rules`, `apply_rules`) read the same policy. |
| `tools/dogma-policy.provider.ts` *(new in S11)* | **D** | The abstraction over bullet interpretation. Tools depend on this; the implementation can swap between "raw bullets", "system-prompt interpolation", or "tool-use hint" without touching the tool code. |

The reviewer contract is: **for each new module under review, the
SOLID principle in the table must match the principle the module's
single test asserts**. If a module's tests touch three different
concerns (e.g. detection + commands + dogmas), the principle is
violated and the slice must be split before merge.

### Why SOLID specifically (not just "clean code")

"Clean code", DRY, and KISS are general virtues; SOLID is the only
discipline that maps **directly to the plugin's hard requirements**.
This proposal could have been written as "ship presets for 70
languages, with detection and commands". It is written as SOLID
because each principle solves a real cost that the plugin would
otherwise pay at runtime, not at design time:

| Hard requirement | Without SOLID | With SOLID (this proposal) |
|---|---|---|
| **Plugin loadable in any host** (a00032 universal-scopes invariant: `@mcp-vertex/rules` is consumed by `extensions/vscode`, the CLI, the web docs, *and* any third-party host) | The plugin would import `PRESET_BY_ID` from a module-level singleton. A host that wants to add a private preset must monkey-patch the global map (or fork the plugin). | The plugin receives its `PresetRegistry` and `DogmaRegistry` via constructor injection. A host adds a private preset by `new PresetRegistry({ presets: [...defaultPresets, privatePreset], adapters: [...defaults, privateAdapter] })` and passes the instance to the tool builder. **No monkey-patching, no fork.** |
| **Adding a 71st language is a 1-file PR** | A new language would require editing `detect-framework.ts` (adding a clause), `presets.ts` (adding DATA), `rules-tools.ts` (adding a command branch), `online-preset.ts` (adding a registry entry), the linter (`lint:proposals`), the test (5 places). The PR is unbounded in size. | A new language = one `<lang>.adapter.ts` + one `<lang>.dogma.ts` + one entry in `data/<family>.ts` + one entry in `dogmas/index.ts`. The plugin core, the tools, the registry, the manifest writer are all closed for modification. The PR is bounded (~200 LOC). |
| **Test the plugin in isolation, with a synthetic reader** | The detector reads from `package.json` directly; testing "Laravel" requires creating a real `composer.json` in a temp dir. | The detector is a class constructed with `ILanguageAdapter[]`; the tests inject a 1-element adapter list. No filesystem needed. |
| **Replace the bullet rendering without touching the tools** | `get_rules` would hardcode the bullet-to-string rendering. Swapping to "render as tool-use hint" requires editing the tool code. | `IDogmaPolicyProvider` is the seam. The default `StringDogmaPolicyProvider` renders bullets; a future `ToolUseDogmaPolicyProvider` renders structured tool-use hints. The tools depend on the interface. |
| **70+ languages don't blow up the bundle / cognitive load** | A monolithic `presets.ts` (the pre-refactor state) has 600+ LOC of data and 200+ LOC of helpers. A reviewer must read the whole file to understand one preset. | One `data/<family>.ts` per family. The Rust reviewer reads `rust-flavour.ts` (and maybe `jvm.ts` for cross-reference). Cognitive load scales per family, not per total language count. |
| **Survive 5 years of language evolution** (Rust editions, Go generics, Zig 0.13 breaking changes) | Hardcoded string bullets in the linter output go stale silently. No signal. | `IDogmaAdapter` carries `version: 'rust-2024' | 'python-3.12' | …`. The `audit` plugin's `f00051-s3-dogma-freshness` check emits a finding when a dogma's version is older than the latest language release. Stale dogmas are *visible*. |

SOLID is the **cheapest** way to make all six rows true at the same
time. A `class: clean code` review would not catch the third row
(testing in isolation) or the fifth (cognitive load per family)
because they are architectural, not stylistic. SOLID is exactly the
discipline that addresses architecture.

### SOLID verification matrix (the reviewer's checklist)

The matrix below is the **single source of truth for the SOLID
reviewer**. For each slice, the column lists the three concrete
artefacts the reviewer must inspect to certify SOLID compliance.
A slice is *not* mergeable until every cell in its row is ✅.

| Slice | Module-level principle | Test-level principle | Doc-level principle |
|---|---|---|---|
| **S1** | New interface files added under `contracts/`, each ≤ 30 LOC. `IRulePreset` is a TypeScript intersection of the 5 segments (Liskov). | `contracts/*.spec.ts` (new) — one golden-shape test per interface, asserting the segment carries ONLY its declared fields. | The `## architecture → Module layout` table is updated with the new modules. |
| **S2** | Each new `languages/<lang>.adapter.ts` implements `ILanguageAdapter`; no class extends or wraps another adapter. The detector class is unchanged. | `rules.spec.ts` gains ≥ 1 detection test per new language; the existing 13 tests still pass with zero edits. | The `## architecture → Priority model` table gains the new adapters in the right priority bucket. |
| **S3** | `data/<family>.ts` is **DATA only** (no imports beyond the contract types). `dogmas/<lang>.dogma.ts` is **DATA only**. | `data/index.spec.ts` — every preset passes `IRulePreset` shape validation. `dogmas/index.spec.ts` — every adapter passes `IDogmaAdapter` shape validation. The `bullets` array is language-specific (the spec test rejects ESLint-style advice). | `plugins/rules/README.md` adds the language to the "Supported languages" table; the bullets are documented. |
| **S4** | `ICommandSetProvider` implementations live next to their adapter, not in `tools/`. The `eslintCommand` / `lintCheckCommand` / `lintFixCommand` branches in `rules-tools.ts:108-127` are deleted (DIP — the tool no longer branches by linter). | `rules-tools.spec.ts` — for each new language, a test asserts the exact `checkCommand` / `fixCommand` / `typecheckCommand` strings. | `plugins/rules/README.md` updates the "How it knows which rules to apply" section. |
| **S5** | `REGISTRY_URL` is a `Readonly<Record<TRegistryKind, string>>` map. Each registry's URL template is a single entry. `fetchOnlinePresetInfo` dispatches by registry, never by language. | `online-preset.spec.ts` — one stubbed-fetcher test per registry. The `IOnlineFetcher` mock is reused (ISP — same test fixture for every registry). | The plugin README lists the registries; the `applying-rules` knowledge mentions online freshness. |
| **S6** | `tools/rules-tools.ts` no longer assumes the typecheck target is a `tsconfig.json`. The `evidence` field in `check_rules` is computed by the future S11 `IPolicyResolver` (added as a stub now, populated in S11). | `rules-tools.spec.ts` — golden-shape tests for each language family's typecheck command, including the "typecheck is undefined" case (SQL, JSON, HTML, …). | `plugins/rules/README.md` documents the per-language typecheck semantics. |
| **S7** | `get_rules` outputSchema adds `dogmas: Record<area, IDogmaAdapter>` **additively** (pre-existing fields stay byte-identical). `check_rules` outputSchema adds `evidence: IPolicyResolution` additively. | `rules-tools.spec.ts` — golden outputSchema tests for ≥ 20 language families; the l00008 s4 spec still passes (additive). | `tools/generated/tool-outputs.ts` regenerates cleanly via `bun run types:generate`. |
| **S8** | `plugins/rules/README.md` adds the "Polyglot workspaces" + "Dogmas" sections. `mcp-vertex-plugin-authoring` skill gains the "Adding a new language + dogma" subsection. | The `lint:proposals` / `lint:tools` linters exit 0. | The new skill is registered in `skills/manifest.json`. |
| **S9** | One spec per language, per concern: detect / manifest / tool / dogma / online-preset. Total: ≥ 200 new specs. | `bun run test` exits 0; coverage of `frameworks/` ≥ 90%. | The plugin's test README is updated. |
| **S10** | The polyglot fixture covers one area per language family (~20 areas). The e2e spec exercises the real MCP harness. | `e2e-polyglot.spec.ts` exits 0; no real network calls; no real linter binaries. | The fixture README documents how to add a new area. |
| **S11** | `policy-resolution.contract.ts` is the **only** place the priority order is encoded. `dogma-policy.provider.ts` implements `IDogmaPolicyProvider`. The `evidence` field in `check_rules` is computed by `IPolicyResolver.resolveCommand`. | `policy-resolver.spec.ts` covers the 4-state matrix (12 cases). The `mog-rules-dogma-priority` skill loads via the `applying-rules` prompt. | The plugin README adds the "Priority resolution" section; the new skill is in `skills/manifest.json`. |

A reviewer can copy this table into the PR description and tick each
cell. A slice whose row has any ⬜ is not yet mergeable; a slice whose
row has any ⬜ AND a comment explaining why ("deferred to f00052") is
acceptable provided the cell is mirrored in the follow-up proposal.

### Dogma registry (new axis)

The `IDogmaAdapter` is segregated from `ILanguageAdapter` per ISP.
A `DogmaRegistry` is constructed independently from the
`PresetRegistry` (S — single responsibility: dogmas are *not*
linters, they are language-style facts). The two registries are
joined only at the tool-output layer (S7 widens `get_rules` to
emit `dogmas[area]` alongside `conventions[area]`).

The full per-language dogmas live in
[`plugins/rules/src/lib/frameworks/dogmas/`](../../plugins/rules/src/lib/frameworks/dogmas/).
A curated sample (the most-used 12 languages; `f00052` expands this
with the remaining ~58):

| Lang | ownership | error | null | naming | async | testing | pkg |
|---|---|---|---|---|---|---|---|
| `rs` | borrow-checker | result | Option<T> | snake_case | none | table-driven | cargo |
| `py` | gc | exceptions | None | snake_case | async/await | pytest | pip |
| `go` | gc | multi-return | nil | mixed¹ | goroutines | table-driven | go mod |
| `hs` | gc | sum-types | Maybe | camelCase | none | property-based | cabal |
| `ex` | gc | sum-types | nil | snake_case | actors | ExUnit | mix |
| `kt` | gc | exceptions | null | PascalCase | coroutines | JUnit | gradle |
| `swift` | arc | throws | Optional | lowerCamelCase | async/await | XCTest | spm |
| `cs` | gc | exceptions | Nullable<T> | PascalCase | async/await | xUnit | dotnet |
| `java` | gc | checked exceptions | null | PascalCase | threads | JUnit | maven |
| `scala` | gc | sum-types | Option | camelCase | Future | ScalaTest | sbt |
| `ruby` | gc | exceptions | nil | snake_case | fibers | RSpec | bundler |
| `php` | gc | exceptions | null | snake_case | none | PHPUnit | composer |
| `zig` | manual | error-union | optional | snake_case | async/await | test blocks | zig |
| `dart` | gc | exceptions | null | lowerCamelCase | async/await | flutter test | pub |
| `elm` | gc | Result | Maybe | camelCase | Cmd | elm-test | elm |
| `ocaml` | gc | result | option | snake_case | none | Alcotest | opam |
| `fsharp` | gc | Result | Option | PascalCase | async | xUnit | dotnet |
| `clojure` | gc | exceptions | nil | kebab-case | futures | clojure.test | tools.deps |
| `erlang` | gc | exceptions | atom | snake_case | processes | EUnit | rebar3 |
| `gleam` | gc | Result | Option | snake_case | none | gleam test | gleam |
| `julia` | gc | exceptions | nothing | snake_case | tasks | Test stdlib | Pkg |
| `r` | gc | stop() | NA | dot.case | none | testthat | CRAN |
| `bash` | manual | exit-code | unset | snake_case | none | bats | apt/brew |
| `pwsh` | gc | exceptions | $null | PascalCase | none | Pester | PSGallery |
| `sql` | n/a | n/a | NULL | snake_case | n/a | pg_regress | n/a |
| `toml` | n/a | n/a | n/a | kebab-case | n/a | n/a | n/a |
| `yaml` | n/a | n/a | null | kebab-case | n/a | n/a | n/a |
| `json` | n/a | n/a | null | camelCase | n/a | n/a | n/a |
| `hcl` | n/a | n/a | null | snake_case | n/a | terratest | terraform |
| `nix` | gc | throw | null | camelCase | n/a | nix-unit | nixpkgs |
| `html` | n/a | n/a | n/a | kebab-case | n/a | n/a | n/a |
| `css` | n/a | n/a | n/a | kebab-case | n/a | n/a | n/a |
| `markdown` | n/a | n/a | n/a | ATX | n/a | n/a | n/a |
| `protobuf` | n/a | n/a | n/a | PascalCase | n/a | n/a | buf |
| `graphql` | n/a | n/a | n/a | PascalCase | n/a | n/a | n/a |
| `solidity` | gc | revert | address | camelCase | n/a | forge | foundry |

¹ Go convention: `PascalCase` for exported identifiers,
`camelCase` for unexported — exposed as two separate values
(`NamingExported` / `NamingUnexported`).

The full ~70-language table lives in the proposal's appendix
(`docs/proposals/appendices/f00051-dogma-table.md`, generated
during S3 from `dogmas/*.dogma.ts`).

### Who wins (priority resolution)

The user's repeated observation — *"el eslint o la forma de programar
bien o dogmas o forma de hacer las cosas en cada lenguaje es distinto"*
— encodes a real conflict: when the project's own ESLint config says
`"no-var": "off"` but our TypeScript dogma says "use `const`/`let`,
never `var`", which one wins?

The proposal's answer is **codified as a single policy** in
`tools/policy-resolution.contract.ts`, consumed by all three tools:

```
Priority order (highest → lowest):
  1. PROJECT CONFIG     — eslint.config.mjs, pyproject.toml [tool.ruff],
                          Cargo.toml [lints], go.mod (gofmt directive),
                          zig build settings, .editorconfig, etc.
  2. LANGUAGE DOGMA     — IDogmaAdapter for the detected language
  3. PLUGIN DEFAULT     — the materialised preset under .cache/mcp-vertex/rules/
```

Concretely:

| Layer | Wins when | Source |
|---|---|---|
| **Project config** | A config file ships in the project (detected by `findProjectEslint`, `findProjectTsconfig`, plus the per-language equivalents added in S2: `pyproject.toml`, `Cargo.toml`, `go.mod`, `build.zig`, `flake.nix`, `*.cabal`, `dune-project`, `Package.swift`, `pubspec.yaml`, `mix.exs`, `shfmt.toml`, …). The project's rules always land first in the `IAreaRules.eslint[]` array (`manifest.ts:75`). | The `IAreaRules.eslint[]` ordering |
| **Language dogma** | No project config exists. `IDogmaAdapter.bullets` is injected into the agent's working context via `applying-rules` knowledge + the new `get_rules.dogmas[area]` field. | `dogmas/<lang>.dogma.ts` |
| **Plugin default** | Neither project nor dogma applies. The materialised cache preset runs. | `presets/data/<family>.ts` |

`check_rules` and `apply_rules` read this policy via the
`IPolicyResolver` interface (DIP — the tools never branch on the
layer themselves). `IPolicyResolver.resolveCommand(area)` returns a
`IResolvedCommand` with three explicit fields:
`{ fromProject?: string; fromDogma?: string; fromDefault: string;
   effective: string; rationale: string }`. The `rationale` field
explains *why* the agent should run `effective` and *why* the lower
layers were ignored — a transparency seam that the linter-output of
ESLint does not provide and that is unique to this plugin.

A worked example:

- An agent edits `apps/web/src/foo.ts` in a Next.js monorepo.
- `check_rules { area: 'apps/web' }` returns:
  - `fromProject`: `'pnpm exec eslint apps/web'` (the project's
    `apps/web/eslint.config.mjs` is detected).
  - `fromDogma`: `'eslint apps/web --config .cache/mcp-vertex/rules/react-ts.eslint.config.mjs'`
    (the dogma-driven default).
  - `fromDefault`: the same `fromDogma` (no further fallback).
  - `effective`: `'pnpm exec eslint apps/web'`.
  - `rationale`: `'Project ships eslint.config.mjs; dogma is ignored.
    Project wins (priority order: project > dogma > default).'`.

`apply_rules` reads the `rationale` and the `effective` command and
emits a step like "Run `pnpm exec eslint apps/web --fix` — your
project's config wins over the TypeScript dogma; the dogma is your
guide when writing **new** code in `.ts` files, not when running
the existing project toolchain."

This is the answer to the user's question. **Project config > dogma
> default**, codified as data, surfaced in every tool response, with
a `rationale` string any agent can render to its user. The plugin
stops pretending dogmas are rules; dogmas are *advice for new code*,
and the project's own toolchain is the *enforcer*.

### Priority model

`ILanguageAdapter.priority` is **ascending**: smaller = earlier. The
sort happens once in the registry constructor, not per-call. The
ordering encodes the "meta-frameworks win over generics" invariant (H6),
the "Python/Go/Rust beat JS/TS in a polyglot dir" rule, and the new
"SOLID-by-family" rule (all 70+ adapters slot into the priority
ladder without the detector knowing):

| Priority | Adapters | Why |
|---|---|---|
| 5 | `phpAdapter`, `composer.json` family | `composer.json` / `artisan` / `mix.exs` / `rebar.config` are strong, exclusive signals — beat the JS/TS catch-all. |
| 8 | `pythonAdapter`, `goAdapter`, `rustAdapter`, `rubyAdapter`, `cAdapter`, `cppAdapter`, `zigAdapter`, `nimAdapter`, `crystalAdapter`, `vAdapter`, `ponyAdapter`, `carbonAdapter`, `haskellAdapter`, `ocamlAdapter`, `smlAdapter`, `purescriptAdapter`, `elmAdapter`, `idrisAdapter`, `agdaAdapter`, `leanAdapter`, `coqAdapter`, `elixirAdapter`, `erlangAdapter`, `gleamAdapter`, `lfeAdapter`, `clojureAdapter`, `cljsAdapter`, `schemeAdapter`, `racketAdapter`, `emacsLispAdapter`, `perlAdapter`, `luaAdapter`, `tclAdapter`, `juliaAdapter`, `rAdapter`, `matlabAdapter`, `sasAdapter`, `bashAdapter`, `pwshAdapter`, `nuShellAdapter`, `fishAdapter`, `sqlAdapter`, `tomlAdapter`, `yamlAdapter`, `jsonAdapter`, `json5Adapter`, `hclAdapter`, `nixAdapter`, `dhallAdapter`, `cueAdapter`, `kdlAdapter`, `htmlAdapter`, `cssAdapter`, `vueSfcAdapter`, `svelteSfcAdapter`, `astroSfcAdapter`, `mjmlAdapter`, `pugAdapter`, `protobufAdapter`, `graphqlAdapter`, `openapiAdapter`, `avroAdapter`, `thriftAdapter`, `solidityAdapter`, `moveAdapter`, `cairoAdapter`, `vyperAdapter`, `jupyterAdapter`, `rmdAdapter`, `quartoAdapter`, `cmakeAdapter`, `makeAdapter`, `bazelAdapter`, `justAdapter`, `ninjaAdapter`, `vimscriptAdapter`, `ronAdapter` | Each language-specific manifest (`pyproject.toml`, `Cargo.toml`, `build.zig`, `*.cabal`, `flake.nix`, …) is exclusive and beats the JS/TS catch-all. Grouped at priority 8 to keep the detector's priority ladder short. |
| 10 | `tsAdapter` | TS + meta-framework (Next/Remix/Nuxt/Astro) wins over plain TS; **but not** over exclusive language manifests (priority 8 wins). |
| 20 | `javaAdapter`, `kotlinAdapter`, `scalaAdapter`, `groovyAdapter`, `csharpAdapter`, `fsharpAdapter`, `vbNetAdapter`, `swiftAdapter`, `dartAdapter`, `objcAdapter`, `objcppAdapter` | JVM/.NET/Mobile manifests often co-exist with `package.json` for tooling (e.g. a React Native app has both). Priority 20 sits below exclusive manifests but above the JS/TS catch-all. |
| 50 | `jsAdapter` | Last-resort: only claims when nothing higher claimed the area. The default `vanilla-js` fallback. |
| 80 | `markdownAdapter`, `asciidocAdapter`, `rstAdapter`, `latexAdapter`, `typstAdapter`, `orgAdapter` | Markup/docs adapters run last because docs often live alongside source code; the source-code adapter wins by default. Projects that want docs-only areas configure `overrides`. |

### Failure modes of *not* following SOLID here

Three concrete antipatterns this proposal prevents. Each is
**historically observed** in plugin frameworks (including earlier
versions of mcp-vertex) and is the failure mode SOLID is designed to
avert. A reviewer can read the antipattern column and ask
"without S1, would we be writing the antipattern code today?":

1. **The god-file detector** — `detect-framework.ts` becomes a 2 000-LOC
   `if/else` ladder over 70 languages. Adding a 71st language edits the
   ladder in three places (detection, command branch, online-preset
   entry). The test for the 70th language breaks the 1st because they
   share the same `if (ts) { … }` block. **S2 prevents this**: each
   `ILanguageAdapter.detect` is a self-contained function; the detector
   is a 10-line `for (const adapter of adapters) { const hit = adapter.detect(reader, areaDir, deps); if (hit) return hit; }`.
2. **The tool that knows every linter** — `rules-tools.ts` becomes a
   3 000-LOC `switch (preset.linter)` over 70 linters. Adding a new
   linter requires editing the tool, the test, the typecheck, and
   forcing a release. **S4 prevents this**: the tools depend on
   `ICommandSetProvider` (DIP), and each adapter brings its own
   provider. The tool's code never branches by linter.
3. **The hardcoded priority ladder** — `if (composer.json) return
   'laravel'; else if (pyproject) return 'python'; else if
   (Cargo.toml) return 'rust'; else if (go.mod) return 'go'; else …`
   spreads across 8 tool calls. The same priority ladder is **re-derived**
   in `manifest.ts`, in `rules-tools.ts`, in `online-preset.ts`. A fix
   to the priority requires 3 PRs. **The Priority model + `IPolicyResolver`
   in S11 prevent this**: the priority is declared **once**, in the
   `DogmaRegistry` constructor + the `IPolicyResolver.resolveCommand`
   implementation, and consumed everywhere via injection.

Each failure mode is also a *cost* the user pays: the god-file
detector makes the 71st language PR unbounded; the tool-that-knows-every-linter
makes the plugin unreviewable past 30 languages; the hardcoded
priority ladder makes dogmas invisible when they should win. SOLID
is what turns "70 languages" from a multi-year rewrite into a
bounded per-family PR cycle.

### Compatibility shims

The refactor is **fully backward-compatible** on day one:

- `detectPresetForArea(reader, areaDir)` — unchanged signature;
  implementation delegates to `PresetDetector`. All 13 existing
  `rules.spec.ts` tests pass without edits.
- `SUPPORTED_PRESET_IDS`, `PRESET_BY_ID`, `RULE_PRESETS`,
  `REQUIRED_ESLINT_DEPS`, `IRulesMode`, `RULES_MODE_GUIDANCE` — all
  re-exported from the new location; aliases survive one release.
- `IRulePreset.eslintConfigFile` / `tsconfigFile` /
  `requiredEslintDeps` — renamed to `linterConfigFile` /
  `typecheckConfigFile` / `requiredLinterDeps`. Old field names are
  provided as deprecated aliases on a thin facade for one release.
- Tool IDs (`get_rules`, `check_rules`, `apply_rules`) — unchanged.
- Public exports (`@mcp-vertex/rules`) — unchanged.

The internal migration is the bulk of S1+S2; the user-visible rename
happens in S7 (outputSchema) with one release of back-compat.

## Slices

- global_gate: validate

### S1 — Project-agnostic core: Linter×Language×Dogma model

- **Status**: pending
- **Files**: plugins/rules/src/lib/frameworks/types.ts
- **Files**: plugins/rules/src/lib/frameworks/presets.ts
- **Files**: plugins/rules/src/lib/frameworks/manifest.ts
- **Files**: plugins/rules/src/index.ts
- **Gate**: typecheck
- depends_on: []
- acceptance:
    - "`TPresetLanguage` widens to ~70 language tags (full table in `## architecture → Language families in scope`); the pre-existing `'ts' | 'js' | 'php'` entries are preserved"
    - "`TPresetLinter` widens to ~70 linter tags (one per language); pre-existing `'eslint' | 'pint'` preserved"
    - "A new `IDogmaAdapter` interface (with its sub-interfaces `IOwnershipDogma`, `IErrorModelDogma`, `INullSafetyDogma`, `INamingStyleDogma`, `IAsyncModelDogma`, `IVisibilityDogma`, `IImmutabilityDogma`, `ITestingDogma`) lives in `contracts/dogma-adapter.interface.ts`. Each language family registers one dogma adapter in `dogmas/<lang>.dogma.ts`."
    - "A `DogmaRegistry` class lives in `registry/dogma-registry.ts`. It is constructed with `readonly IDogmaAdapter[]` and exposes `resolve(language: TPresetLanguage): IDogmaAdapter | undefined`. **Separated from `PresetRegistry`** per Single Responsibility: dogmas are language-style facts, not linter artefacts."
    - "An `ICommandSet` interface carries `{ checkCommand, fixCommand?, typecheckCommand? }` per preset, *replacing* the hardcoded `eslintCommand` / `lintCheckCommand` / `lintFixCommand` branches in `rules-tools.ts`"
    - "`IRulePreset` gains an optional `requiredToolchain?: readonly string[]` field naming the binaries a project must install; the existing `requiredEslintDeps` is renamed to `requiredLinterDeps`"
    - "`IAreaRules` field `eslint` is renamed to `configs` (internal only; the public `get_rules` outputSchema renames in S7); `typecheck` stays as-is; the manifest fingerprint is recomputed against the new field name"
    - "`buildRulesManifest` still returns the same `IRulesManifest` shape (with `projects` / `mode` / `fingerprint` / `generatedAt`); only the per-area shape widens"
    - "`PRESET_BY_ID` / `SUPPORTED_PRESET_IDS` keep their lookup behaviour; new presets are added in S3, not S1"
    - "`bun run typecheck` exits 0"
- status: done
### S2 — Language-aware area detection

- **Status**: done
- **Files**: plugins/rules/src/lib/frameworks/detect-framework.ts
- **Files**: plugins/rules/tests/src/lib/rules.spec.ts
- **Gate**: test
- depends_on: [S1]
- acceptance:
    - "`detectPresetForArea` reads `pyproject.toml` (Python), `go.mod` (Go), `Cargo.toml` (Rust), `Gemfile` (Ruby), `pom.xml` / `build.gradle.kts` (Java/Kotlin), `Package.swift` (Swift), `*.csproj` / `*.sln` (C#/.NET), `mix.exs` (Elixir) in addition to the existing `package.json` / `composer.json` checks"
    - "Detection is **mutually exclusive at the file-system layer**: `pyproject.toml` wins over `package.json` for an area, `go.mod` wins over `package.json`, etc. The reason field surfaces the actual artefact (e.g. `'pyproject.toml [project] name=foo'`)"
    - "A polyglot workspace (an `apps/web/` Next.js + an `apps/api/` FastAPI + a `services/rust-thing/Cargo.toml` + a `services/go-thing/go.mod`) classifies each area independently, returns the right preset per area, and never short-circuits the whole manifest on the first detected area"
    - "All previously-passing detection tests still pass (no regression on angular/react/vue/svelte/jquery/vanilla/laravel)"
    - "New tests cover: Python (pyproject), Go (go.mod), Rust (Cargo.toml), Ruby (Gemfile), Java (pom.xml), Kotlin (build.gradle.kts), Swift (Package.swift), C# (.csproj), Elixir (mix.exs) — 9 new test cases minimum"

### S3 — Add the language presets + the dogma adapters

- **Status**: S3 partial: priority families (Rust + Python, Go, Ruby, Java, Kotlin, Swift, C#, Elixir) done in the SOLID `dogmas/` + `presets/data/`; ~60 long-tail languages pending
- **Files**: plugins/rules/src/lib/frameworks/presets/data/  (~18 new files, ~70 new IRulePreset entries)
- **Files**: plugins/rules/src/lib/frameworks/dogmas/        (~35 new files, ~70 IDogmaAdapter entries)
- **Files**: plugins/rules/tests/src/lib/rules.spec.ts
- **Files**: plugins/rules/tests/src/lib/dogmas/dogma-registry.spec.ts
- **Gate**: test
- depends_on: [S1, S2]
- acceptance:
    - "**≥ 70 new `IRulePreset` entries** are added, one per language tag in `TPresetLanguage`. Each ships DATA only (the linter config + formatter config + typecheck config as text), with the `linterConfigContent` / `typecheckConfigContent` field shape. Cache filenames match the language family (e.g. `python-ruff.ruff.toml`, `rust-clippy.clippy.toml`, `zig-zigfmt.zigfmt`, `haskell-ormolu.fourmolu.yaml`, `scala-scalafmt..scalafmt.conf`, `bash-shellcheck.shcheckrc`, `sql-sqlfluff..sqlfluff`). The data is organised **by family** under `data/<family>.ts` (one file per family, not one file per language) so SREs reviewing the presets can see them grouped."
    - "**≥ 70 new `IDogmaAdapter` entries** are added, one per language tag. Each lives in `dogmas/<lang>.dogma.ts`. The full table maps `TPresetLanguage → IDogmaAdapter` per the `## architecture → Dogma registry` table; sample: `rust.dogma.ts → { ownership: 'borrow-checker', errorModel: 'result', nullSafety: 'option', naming: 'snake_case', async: 'none', visibility: 'pub/fn', immutability: 'let-mut', testing: 'table-driven', packageManager: 'cargo', bullets: ['Prefer `?` over `unwrap()`', ...] }`."
    - "Each preset has a `conventions` array of **3-7 agent-facing bullets** modelled on the JS/TS presets but reflecting each language's dogmas (NOT ESLint-style rules): Rust → \"Prefer `?` over `unwrap()` in library code\"; Haskell → \"Purity by default; mark effects in the type signature\"; Elixir → \"Pattern-match first; `{:ok, _}` over `true`\"; Bash → \"Always quote variables; `set -euo pipefail` at the top\"; SQL → \"CTEs over nested subqueries; explicit JOINs over implicit\"; Nix → \"Purity by default; refer to `nixpkgs` by version\"; etc."
    - "Each preset has a `requiredLinterDeps` list naming the binaries the project must install. The existing `REQUIRED_ESLINT_DEPS` is renamed `REQUIRED_LINTER_DEPS` and gains the new entries."
    - "`SUPPORTED_PRESET_IDS` now contains **≥ 80 entries** (the original 13 + ≥ 70 new)."
    - "Each `IDogmaAdapter` is registered in `dogmas/index.ts`; `DEFAULT_DOGMA_ADAPTERS` is a `ReadonlyMap<TPresetLanguage, IDogmaAdapter>` exposed through `DogmaRegistry`."
    - "At least one `bullets` array per language is **specific** to that language (not generic ESLint-style advice). The spec verifies this for a sample of 12 languages."
    - "The `f00052` follow-up proposal is responsible for curating the bullets to expert quality for the top 12; here we ship *enough* to demonstrate the architecture and prove the contract."

### S4 — Per-preset check/fix/typecheck commands

- **Status**: done
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts
- **Files**: plugins/rules/src/lib/frameworks/types.ts
- **Gate**: test
- depends_on: [S1, S3]
- acceptance:
    - "The hardcoded `eslintCommand` / `lintCheckCommand` / `lintFixCommand` branches in `rules-tools.ts:108-127` are replaced by reading each preset's `ILinterCommandSet` (S1)"
    - "For each new language, `check_rules` returns the correct command (e.g. `ruff check .` for Python, `golangci-lint run ./...` for Go, `cargo clippy --workspace --all-targets -- -D warnings` for Rust, `rubocop` for Ruby, etc.) and `apply_rules` returns the correct fix command (`ruff check --fix .`, `cargo clippy --fix`, `rubocop -a`, …)"
    - "`missingEslintFinding` is renamed to `missingLinterDeps` and the `code` literal in the finding becomes `'missing-linter-deps'`; the old `missing-eslint-deps` code remains as a backward-compat alias in the outputSchema for one release (Conventional Commits, no semver bump)"
    - "Typecheck commands are emitted only for languages whose typecheck field is set: `pyright` / `mypy --strict` (Python), `go vet ./...` (Go), `cargo check --workspace` (Rust), `sorbet tc` (Ruby), `javac -d /tmp/check <sources>` (Java), `kotlinc -d /tmp/check <sources>` (Kotlin), `swiftc -typecheck` (Swift), `dotnet build -p:TreatWarningsAsErrors=true` (C#), `mix dialyzer` (Elixir)"

### S5 — Online-preset registry: every package index

- **Status**: pending
- **Files**: plugins/rules/src/lib/frameworks/online-preset.ts
- **Files**: plugins/rules/tests/src/lib/online-preset.spec.ts
- **Gate**: test
- depends_on: [S3]
- acceptance:
    - "`ONLINE_PACKAGE_BY_PRESET` widens with **one entry per new preset** (≥ 70 entries). Examples: `python-ruff: 'ruff'`, `rust-clippy: 'clippy'`, `haskell-ormolu: 'ormolu'`, `scala-scalafmt: 'scalafmt'`, `bash-shellcheck: 'shellcheck'`, `sql-sqlfluff: 'sqlfluff'`, `solidity-forge: 'forge'`, `hcl-tflint: 'tflint'`, `nix-nixfmt: 'nixfmt-rfc-style'`, `protobuf-buf: 'bufbuild/buf'`, …"
    - "A `REGISTRY_URL` map names the upstream registry per package. The full list (≥ 30 registries):"
        - `npm → https://registry.npmjs.org/{pkg}/latest`
        - `pypi → https://pypi.org/pypi/{pkg}/json`
        - `crates → https://crates.io/api/v1/crates/{pkg}`
        - `goproxy → https://proxy.golang.org/{pkg}/@latest`
        - `rubygems → https://rubygems.org/api/v1/gems/{pkg}.json`
        - `maven → https://search.maven.org/solrsearch/select?q=g%3A%22{group}%22+AND+a%3A%22{artifact}%22&rows=1&wt=json`
        - `gradle → https://plugins.gradle.org/m2/{path}`
        - `nuget → https://api.nuget.org/v3-flatcontainer/{pkg}/index.json`
        - `hex → https://repo.hex.pm/tarballs/{pkg}-{version}.tar` (HEAD)
        - `clojars → https://clojars.org/api/artifacts/{pkg}`
        - `cpan → https://fastapi.metacpan.org/v1/release/{pkg}`
        - `luarocks → https://luarocks.org/api/1/{pkg}`
        - `hackage → https://hackage.haskell.org/package/{pkg}/{pkg}.cabal`
        - `opam → https://opam.ocaml.org/packages/{pkg}/{pkg}.opam`
        - `elm-pkg → https://package.elm-lang.org/packages/{author}/{pkg}/releases.json`
        - `julia-registry → https://pkg.julialang.org/api/v1/{pkg}`
        - `r-cran → https://crandb.r-pkg.org/{pkg}`
        - `r-github → https://raw.githubusercontent.com/{owner}/{pkg}/main/DESCRIPTION`
        - `psgallery → https://www.powershellgallery.com/api/v2/FindPackagesById()?id='{pkg}'`
        - `terraform-registry → https://registry.terraform.io/v1/providers/{namespace}/{type}/versions`
        - `nix-channels → https://channels.nix.gsc.io/{branch}` (rev lookup)
        - `buf-registry → https://buf.build/{owner}/{pkg}/releases`
        - `homebrew → https://formulae.brew.sh/api/formula/{pkg}.json`
        - `chocolatey → https://community.chocolatey.org/api/v2/Packages?filter=Id%20eq%20'{pkg}'`
        - `winget → https://winget.run/api/v2/packages?query={pkg}`
    - "`fetchOnlinePresetInfo` dispatches by registry, normalises the version field, and preserves the same `{ ok: true, package, version, homepage? } | { ok: false, package, reason }` contract — never throws, never blocks, 5s timeout per request"
    - "Tests stub each registry with the existing `IOnlineFetcher` mock pattern; **≥ 20 new fixtures** (one per major registry) prove the contract end-to-end"

### S6 — Rebalance linter vs typecheck + dogmas in `rules-tools`

- **Status**: pending
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts
- **Files**: plugins/rules/tests/src/lib/tools/rules-tools.spec.ts
- **Gate**: test
- depends_on: [S3, S4]
- acceptance:
    - "`get_rules` and `check_rules` no longer assume the typecheck target is a `tsconfig.json`; the `typecheck` field on `IAreaRules` is a list of `*.{toml,mod,cabal,csproj,swift}` style config paths (Rust's `Cargo.toml` *is* its typecheck config) — the path is whatever the linter ecosystem uses, surfaced verbatim"
    - "`check_rules` returns `typecheckCommand: undefined` for languages where the typecheck is implicit (e.g. pure-Python with no `basedpyright` / `mypy` config; Go with only `go vet`; Swift with `swiftc -typecheck` folded into `swift build`) — and **never fabricates a typecheck command** when one does not exist (SQL, JSON, YAML, HTML, CSS, Markdown, etc.)"
    - "Existing JS/TS/PHP tests stay green (no regression); new tests assert the per-language command strings"
    - "`get_rules` joins the `DogmaRegistry` into the response: `dogmas: Record<area, IDogmaAdapter>`. An agent that calls `get_rules` for a Rust area now sees the borrow-checker, Result/Option, snake_case, cargo, table-driven conventions **alongside** the linter command — so the agent learns *how to write Rust*, not just *what to run on it*"
    - "`check_rules` returns `missingLinterDeps` keyed by linter binary name (not by package.json entry) so the project's install command matches the language's package manager: e.g. `pip install ruff basedpyright` for Python, `cargo install cargo-clippy` for Rust, `go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest` for Go, `brew install ormolu` for Haskell, `apt install shellcheck shfmt` for Bash, `npm install -g @buf/buf` for Protobuf, `cargo install --locked --git https://github.com/foundry-rs/foundry` for Solidity"

### S7 — Language-aware `get_rules` outputSchema (+ dogmas)

- **Status**: pending
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts
- **Files**: plugins/rules/tests/src/lib/tools/rules-tools.spec.ts
- **Files**: plugins/rules/src/generated/tool-outputs.ts
- **Gate**: test
- depends_on: [S6]
- acceptance:
    - "`get_rules` outputSchema **gains** a new top-level `dogmas: Record<area, IDogmaAdapter>` field. Every agent that consumes `get_rules` now sees per-area language dogmas (ownership/error/null/naming/async/visibility/immutability/testing/packageManager + bullets) alongside the existing `areas` and `conventions`. The schema is **additive** — pre-existing fields stay byte-identical, so any consumer that ignored `dogmas` keeps working."
    - "`get_rules` outputSchema renames `eslintConfigs` → `linterConfigs` and `typecheckConfigs` stays; the structured payload matches."
    - "`check_rules` outputSchema gains a per-check `linter: 'eslint' | 'pint' | 'ruff' | …` discriminator and a per-check `installHint: string` field with the per-language install command (`pip install ruff`, `cargo install clippy`, `brew install shellcheck`, `npm install -g @buf/buf`, etc.)."
    - "The regenerated `plugins/rules/src/generated/tool-outputs.ts` matches the new shape (`bun run types:generate` exits 0)"
    - "Existing l00008 s4 `get_rules` golden-shape spec still passes (the new `dogmas` field is additive; the pre-existing shape is unchanged)"
    - "New specs: **one golden outputSchema test per language family** (≥ 20 fixtures: jvm, dotnet, c-family, rust-flavour, functional, beam, lisp, scripting, mobile, data-stats, shell, docs, data-config, web-dsl, schema, smart-contracts, notebooks, build, misc). Each fixture asserts the structured payload's `linter` discriminator + `linterConfigs` + `typecheckCommand` triple **and** the `dogmas[area]` block has the expected ownership/error/naming fields for that language."
    - "The `dogmas` field is documented in `plugins/rules/README.md` with a worked example for each of the 12 most-used languages"

### S8 — Docs and skills

- **Status**: partial — `plugins/rules/README.md` updated to document the shipped multi-language support (manifest-based detection across 11 manifests; JS/TS + PHP + the 9 language families from S3 with per-preset check/fix/typecheck commands; the dogma concept; open/closed extension). The full 70-language enumeration + the skill subsections await the long-tail. FINDING (next step for S1 convergence): the SOLID core (`frameworks/registry/`, `composition-root.ts`, `command-resolver.ts`, `policy-resolver.ts`, `dogmas/`, `manifest-via-composition.ts`) is built + unit-tested but is NOT wired into the live plugin — `tools/rules-tools.ts` still imports the legacy `frameworks/manifest.ts` (`buildRulesManifest`) + `frameworks/types.ts`. Converging means the live tools consume the composition root (`buildManifestViaComposition(reader, projectName, cacheRelDir, mode, root, overrides)` vs the legacy `(options)`), proven behavior-identical by the existing rules tests + a golden-output equivalence test. Sizeable + touches the critical rules plugin → do it with a subagent + a behavior-equivalence gate, not ad-hoc.
- **Files**: plugins/rules/README.md
- **Files**: skills/mcp-vertex-plugin-authoring/SKILL.md
- **Files**: skills/audit-playbook/SKILL.md
- **Files**: skills/token-budget-playbook/SKILL.md
- **Files**: plugins/rules/src/lib/knowledge/applying-rules.ts
- **Gate**: lint
- depends_on: [S3]
- acceptance:
    - "`plugins/rules/README.md` updates the **"Supported languages"** section to enumerate **all 70+ languages organised by family** (JS/TS, JVM, .NET, C-family, Rust-flavour, Go, Functional, BEAM, Lisp, Scripting, Mobile, Shell, Data/stats, Docs, Data/config, Web DSL, Schema, Smart contracts, Notebooks, Build, Misc) with one-line descriptions and the canonical linter/formatter for each. Adds a **"Dogmas"** section explaining that `get_rules.dogmas[area]` carries ownership/error/null/naming/async/visibility/immutability/testing/packageManager + idiomatic bullets, with a worked example per top-12 language. Adds a **"Polyglot workspaces"** subsection with the detection-priority table (pyproject > package.json, go.mod > package.json, Cargo.toml > package.json, …)"
    - "`mcp-vertex-plugin-authoring` skill adds a **"Adding a new language + dogma"** subsection: required files to touch (`contracts/dogma-adapter.interface.ts`, `dogmas/<lang>.dogma.ts`, `languages/<lang>.adapter.ts`, `languages/base/<family>-base.provider.ts`, `presets/data/<family>.ts`, `online-preset.ts` registry entry). The DATA-only constraint (no plugin imports the linter package). The IDogmaAdapter shape. A worked example for a notional `zig-zigfmt` preset + `zig.dogma.ts` adapter"
    - "`audit-playbook` skill adds a **"Multi-language rules audit"** dimension: does the manifest correctly detect each area's language? does each preset ship a `conventions` array? is each preset's `requiredLinterDeps` non-empty (except for the no-deps case like Laravel's `[]`)? does each `IDogmaAdapter` ship a `bullets` array of ≥ 3 items? does the per-language `installHint` match the actual install command?"
    - "`applying-rules` knowledge body mentions the linter **and dogma** per family (`ruff` / `clippy` / `swiftlint` / `ormolu` / `credo` / …) and the mode guidance, not ESLint specifically"
    - "`bun run lint:proposals` and `bun run lint:tools` exit 0"

### S9 — Tests: per-language detect/manifest/tool/dogma coverage

- **Status**: pending
- **Files**: plugins/rules/tests/src/lib/rules.spec.ts
- **Files**: plugins/rules/tests/src/lib/frameworks/manifest.spec.ts
- **Files**: plugins/rules/tests/src/lib/tools/rules-tools.spec.ts
- **Files**: plugins/rules/tests/src/lib/online-preset.spec.ts
- **Files**: plugins/rules/tests/src/lib/dogmas/dogma-registry.spec.ts
- **Gate**: test
- depends_on: [S1, S2, S3, S4, S5, S6, S7]
- acceptance:
    - "**≥ 70 new detection tests** (one per language): each `*.adapter.ts` resolves correctly when its marker file is present and returns `undefined` when it's absent. Coverage: pyproject (Python), go.mod (Go), Cargo.toml (Rust), Gemfile (Ruby), pom.xml + build.gradle (Java/Kotlin/Groovy), *.sbt (Scala), project.clj / deps.edn (Clojure), *.csproj (C#), *.fsproj (F#), Cargo.toml + .carbon (Carbon), build.zig (Zig), *.nim (Nim), shard.yml (Crystal), Package.swift (Swift), pubspec.yaml (Dart), *.cabal / stack.yaml (Haskell), dune-project (OCaml), elm.json (Elm), *.purs (PureScript), mix.exs (Elixir), rebar.config (Erlang), gleam.toml (Gleam), *.clj* (ClojureScript), *.scm (Scheme), info.rkt (Racket), cpanfile (Perl), *.rockspec (Lua), Project.toml (Julia), DESCRIPTION (R), *.m (MATLAB/Octave), *.sas (SAS), *.sh / *.bash / *.zsh (Shell), *.ps1 (PowerShell), *.nu (Nushell), *.fish (Fish), *.md (Markdown), *.adoc (AsciiDoc), *.rst (reStructuredText), *.tex (LaTeX), *.typ (Typst), *.sql (SQL), *.toml (TOML), *.yaml/*.yml (YAML), *.json (JSON), *.json5 (JSON5), *.tf / *.hcl (HCL/Terraform), flake.nix / default.nix (Nix), *.dhall (Dhall), *.cue (CUE), *.kdl (KDL), *.html/*.htm (HTML), *.css/*.scss/*.sass/*.less (CSS), *.vue (Vue SFC), *.svelte (Svelte SFC), *.astro (Astro), *.mjml (MJML), *.pug/*.jade (Pug), *.proto (Protobuf), *.graphql/*.gql (GraphQL), openapi.{yaml,json} (OpenAPI), *.avsc (Avro), *.thrift (Thrift), *.sol (Solidity), *.move (Move), *.cairo (Cairo), *.vy (Vyper), *.ipynb (Jupyter), *.rmd (R Markdown), *.qmd (Quarto), CMakeLists.txt (CMake), Makefile (Make), BUILD / *.bzl (Bazel), justfile (just), *.ninja (Ninja), *.vim (Vimscript), *.ron (RON)"
    - "**≥ 70 new manifest golden tests** (one per language, pinning the per-area shape with the new `linterConfigs` field name and the `linter` discriminator)"
    - "**≥ 20 new `get_rules` / `check_rules` outputSchema tests** (one per language family)"
    - "**≥ 20 new `online-preset` tests** with stubbed fetchers (one per registry)"
    - "**≥ 35 new `DogmaRegistry` tests** (one per language): each `*.dogma.ts` returns the expected `ownership/error/null/naming/async/visibility/immutability/testing/packageManager` triple + a non-empty `bullets` array. The bullets are language-specific (Rust mentions `?`/`unwrap`, Python mentions `from __future__`, Haskell mentions purity, Bash mentions `set -euo pipefail`, SQL mentions CTEs, Nix mentions `nixpkgs` — generic ESLint-style advice fails the spec)"
    - "All pre-existing rules-plugin tests still pass (no regression on l00008 s2/s4 specs)"

### S10 — E2E: synthetic polyglot workspace

- **Status**: pending
- **Files**: plugins/rules/tests/fixtures/polyglot/
- **Files**: plugins/rules/tests/src/lib/e2e-polyglot.spec.ts
- **Gate**: test
- depends_on: [S9]
- acceptance:
    - "A fixture workspace at `plugins/rules/tests/fixtures/polyglot/` contains **one area per language family** (~20 areas: `py-thing/pyproject.toml`, `go-thing/go.mod`, `rs-thing/Cargo.toml`, `rb-thing/Gemfile`, `java-thing/pom.xml`, `kt-thing/build.gradle.kts`, `scala-thing/build.sbt`, `clojure-thing/deps.edn`, `cs-thing/Foo.csproj`, `fs-thing/Foo.fsproj`, `zig-thing/build.zig`, `swift-thing/Package.swift`, `dart-thing/pubspec.yaml`, `hs-thing/stack.yaml`, `ex-thing/mix.exs`, `bash-thing/foo.sh`, `sql-thing/schema.sql`, `hcl-thing/main.tf`, `sol-thing/Contract.sol`, **plus** a `web/` area with a `package.json` for the Next.js case, **plus** a `py-thing-with-bash/` area that has both `pyproject.toml` and `foo.sh` to exercise the priority tie-breaker)"
    - "An e2e spec builds the manifest, calls `get_rules` and `check_rules` against the polyglot fixture via the real MCP harness (the same pattern `tools/scripts/verify/plugin-tool-verify.script.ts` uses), and asserts each area resolves to its expected preset, the per-area `linter` discriminator is correct, the per-area `linterConfigs` non-empty, the per-area `typecheckCommand` is defined where applicable, **and** `dogmas[area]` returns the right ownership/error/naming triple for each language"
    - "Spec exits 0; no real network calls; no real linter binaries are required (the spec validates the *commands* the tool would emit, not the lint results)"

### S11 — Policy resolver + dogma-priority skill

- **Status**: pending
- **Files**: plugins/rules/src/lib/tools/policy-resolution.contract.ts (NEW)
- **Files**: plugins/rules/src/lib/tools/dogma-policy.provider.ts (NEW)
- **Files**: plugins/rules/src/lib/tools/policy-resolver.ts (NEW)
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts (refactored to use the resolver)
- **Files**: skills/mog-rules-dogma-priority/SKILL.md (NEW)
- **Files**: plugins/rules/README.md (priority-resolution subsection added)
- **Files**: plugins/rules/tests/src/lib/tools/policy-resolver.spec.ts (NEW)
- **Gate**: test
- depends_on: [S6, S7, S9]
- acceptance:
    - "`policy-resolution.contract.ts` exports `IPolicyResolver` (interface) and `IPolicyResolution` (the `{ fromProject?, fromDogma?, fromDefault, effective, rationale }` tuple). The contract is **the only place** the priority order `project > dogma > default` is encoded (SRP at the tool level)."
    - "`dogma-policy.provider.ts` implements `IDogmaPolicyProvider` (interface). The default implementation renders `IDogmaAdapter.bullets` as a string suitable for system-prompt interpolation (e.g. `\"Rust idiom: Prefer \`?\` over \`unwrap()\`; ownership is the borrow-checker; naming is snake_case; testing is table-driven.\"`). A future slice can swap in a `ToolUseDogmaPolicyProvider` that emits a structured tool-use hint instead of a string — without touching the tools."
    - "`policy-resolver.ts` exports `buildPolicyResolver(deps)` (DIP factory). All three tools (`get_rules`, `check_rules`, `apply_rules`) receive the resolver via the existing `IRulesToolOptions` constructor; no tool does its own `if (projectConfigExists) { … } else if (dogma) { … } else { … }` ladder. The hardcoded `eslintCommand` / `lintCheckCommand` / `lintFixCommand` branches in `rules-tools.ts:108-127` are replaced by `policyResolver.resolveCommand(area)`."
    - "`check_rules` response gains an `evidence` field: `{ fromProject, fromDogma, fromDefault, effective, rationale }` — the agent renders this to the user so the priority decision is *transparent*, not implicit."
    - "`apply_rules` step text uses `rationale` directly: `\"Run \${effective} — \${rationale}\"` so the mode-aware plan explains **why** each command was chosen, not just what it is."
    - "`skills/mog-rules-dogma-priority/SKILL.md` exists. It is the agent-facing reference for the priority order, with a worked example per top-12 language. It is loaded automatically by the `applying-rules` prompt so the agent sees the priority rules **before** writing the first line."
    - "`policy-resolver.spec.ts` covers the matrix: (project yes, dogma yes, default yes) → effective is project; (project no, dogma yes, default yes) → effective is dogma; (project no, dogma no, default yes) → effective is default; (project yes, dogma no, default yes) → effective is project; (project no, dogma yes, default no — rare, e.g. an Elixir area with no project config and no fallback) → effective is dogma with a `\"no fallback\"` rationale. 12 test cases total."
    - "Existing tests (l00008 s2/s4, S9 detection/manifest/dogma, S10 e2e) still pass with no edits — the resolver is additive at the tool response level (the new `evidence` field) and the existing `command` / `fixCommand` / `typecheckCommand` fields stay byte-identical for back-compat."
    - "`bun run validate` exits 0; `bun run test` reports ≥ 12 new specs in `policy-resolver.spec.ts`."

## acceptance

`bun run validate` is the global gate. The pre-existing l00008 specs (rules-plugin
durable writes, outputSchema hardening) must remain green across every slice; the
new S9 + S10 specs grow the rules-plugin test count by **≥ 200** (70 detect + 70 manifest + 70 dogma + 20 tool + 20 online-preset, plus the e2e fixture). No `package.json`
field is renamed (the per-language additions are additive). The pre-existing
`get_rules` / `check_rules` / `apply_rules` tool IDs are unchanged; only the
field *names* inside the structured payload change, and only in S7.

After S10 lands, the plugin is ready for the **f00052** follow-up: curating
the language-specific bullets for the top 12 languages to expert quality
(by humans who actually write Rust/Haskell/Elixir daily), adding the per-language
`docs/` page in `apps/web`, and splitting into `plugins/rules/<lang>` packages
if/when any language surface diverges enough to warrant it.

## Risks

1. **Online registry rate-limits.** PyPI is generous; crates.io and Maven Central
   throttle. The 5s per-request timeout in `online-preset.ts` already protects
   against this; a follow-up could batch fetches and cache results, but it is
   out of scope here.
2. **Detection ambiguity.** A repo with both `pyproject.toml` and `package.json`
   in the same area (a Python backend that ships a JS frontend under the same
   `apps/api/`) needs a tie-breaker. S2 makes it explicit: `pyproject.toml` wins
   over `package.json`; the user can still force a preset with `overrides` in
   the plugin config.
3. **Cache pollution across language switches.** The cache dir is
   `.cache/mcp-vertex/rules/`; a project that switches between Python and JS
   presets across runs accumulates files. The existing `ensureRulesCache`
   already overwrites in place with `writeFileAtomic`, so this is bounded —
   stale files just take disk space. A future `prune` slice can address it.
4. **Output schema renames in S7 break downstream consumers that hardcoded
   `eslintConfigs`.** The repo's own code is the only known consumer (the
   `verify` harness reads `outputSchema` but only the field shape, not the
   field *name*). External hosts that depended on the name are caught by the
   backward-compat alias for one release.
5. **Dogma drift.** A `*.dogma.ts` file is a statement about a language's
   idioms; languages evolve (Rust 2024 edition, Go generics, Zig 0.13).
   The plugin treats dogmas as **boot-time constants** — a Rust dogma
   that says "no async" would silently mislead agents in 2026. Mitigation:
   (a) S3 anchors every dogma to a specific language-standard version
   (`Rust 2024`, `Python 3.12`, `Go 1.22`, …) and surfaces it as
   `dogmas[area].version`; (b) the `audit` plugin gains a check
   (`/audit/f00051-s3-dogma-freshness`) that compares the dogma versions
   against the latest language release and emits a "stale dogma" finding.
6. **Bullet authorship.** The 70+ language-specific bullet arrays cannot
   all be curated by one author without mistakes. The `f00052` follow-up
   explicitly recruits language-expert reviewers; this proposal only
   commits to *enough* bullets to demonstrate the architecture (≥ 3 per
   language, with the spec test rejecting generic ESLint-style advice).
7. **Dogma fragmentation.** Some communities disagree on dogma
   (tabs-vs-spaces, brace style, `val` vs `const`). The plugin ships
   **one** opinionated dogma per language; projects that want a
   different one override via `mcp-vertex.config.json#plugins.rules.dogmaOverrides`
   (a future extension). For this proposal the default is the most
   mainstream community choice.

## notes

### How mcp-vertex is used in non-Node projects

The user's second question, captured in the proposal brief: **no, and that is
the point of this proposal.** A Python or Go project loads
`@mcp-vertex/core` the same way a Node project does (`bunx @mcp-vertex/core
--plugins=rules`), reads the same `mcp-vertex.config.json`, and discovers
the same workspace-relative root. What changes is which presets the rules
plugin exposes (and detects) and which commands `check_rules` emits. The
host surface is project-agnostic since a00032; the language surface becomes
project-agnostic after this proposal lands. A pure-Python host that does not
ship a `package.json` is not blocked: `createWorkspaceFileReader` accepts
any root, the `FileReader` is fully synthetic, and the manifest discovery
walks `apps/` / `libs/` / `packages/` / `projects/` the same way.

What a non-Node host does **not** get automatically:
- the i18n web app at `apps/web/` is still Astro/TS, but a non-Node host
  can ignore it (the `apps/web` build is opt-in via `--build-web` and has
  no runtime coupling to the rules plugin)
- the VS Code extension in `extensions/vscode/` is still Node-only — a
  non-Node host that wants IDE integration has to ship its own
  (the LSP/MCP host abstraction in `packages/core` does not depend on VS
  Code, but the `extensions/vscode` package does); this is documented in
  [`docs/CROSS-IDE.md`](../../CROSS-IDE.md) and unchanged by this proposal
- the CLI in `packages/cli/` is still Node (Bun) — a non-Node host
  invokes the MCP server over stdio, not via the CLI

A pure-Python user that loads `mcp-vertex --plugins=rules` against a
FastAPI repo today gets `vanilla-js` for the root area (no signal of
Python); after this proposal they get `python-ruff` with the right
commands. That is the user-visible change.

### Why ESLint-style rules are not enough — the dogma axis

The user's follow-up observation, captured in the proposal brief:
*"I understand that ESLint, or the way of programming well, or the
dogmas, or the way of doing things in each language, is different."*
This is exactly the second axis of this proposal. ESLint is **a JS
linter that encodes JS-style opinions**: prefer `const`, no `var`,
strict equality, no unused vars. Those opinions are *correct* for
JS, and the JS/TS presets in this plugin keep them. But they are
**not transferable** to other languages:

- In Rust, the equivalent opinions are: prefer `?` over `unwrap()`,
  use `#[must_use]` on fallible builders, mark public APIs `pub`,
  never `clone()` to satisfy the borrow checker (refactor instead).
- In Haskell: purity by default, `newtype` over `type`, `Maybe` over
  `null`, effects in the type signature.
- In Elixir: pattern-match first, `{:ok, _}` over `true`, processes
  over threads, `with` for chained `case`s.
- In Bash: `set -euo pipefail` at the top, always quote variables,
  prefer `[[ ]]` over `[ ]`, arrays over strings.
- In SQL: CTEs over nested subqueries, explicit JOINs, parameterised
  queries, name constraints.
- In Nix: purity by default, refer to `nixpkgs` by commit, never
  `with` at the top of a file.
- In C: free what you malloc, check every `malloc` return, no
  undefined behaviour, `const` everywhere it applies.

ESLint does not know any of this. A single `get_rules` call that
returned `{ linter: 'eslint', command: 'eslint .' }` for a Rust area
would be **technically wrong**: there is no `eslint` to run, and even
if you ran Prettier on Rust files it would be meaningless. The agent
that wrote Rust following "ESLint rules" would write **JS-style Rust**
— `let mut`, `unwrap()`, `panic!` on errors, no `#[derive(Debug)]`.

That is why this proposal introduces `IDogmaAdapter` as a **first-class
seam**: each language ships its *own* opinionated set of idiomatic
do/don't bullets, exposed via `get_rules.dogmas[area]`. The agent
reads them *before* writing the first line of that area's language.
The plugin stops pretending every language is JS with a different
linter and starts treating each language's idioms as a first-class
artefact.

This is also why S3 organises the data **by family** under
`presets/data/<family>.ts` and `dogmas/<lang>.dogma.ts` — so a Rust
expert reviewing the Rust dogmas sees them grouped with Go and Zig
(rust-flavoured systems languages), not scattered across 70 unrelated
files. The OCP hinge + the family grouping + the per-language dogma
adapter are the three architectural decisions that make "70 languages
without exploding the codebase" tractable.
