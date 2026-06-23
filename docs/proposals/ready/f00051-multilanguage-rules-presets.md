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

Generalise the `rules` plugin so **any language ecosystem** (not just JS/TS/PHP) gets
the same per-area "project's own config wins, our vendored default behind it" treatment,
materialised into the cache, with mode-aware `get_rules` / `check_rules` / `apply_rules`
tools. The plugin stops being a JS/TS-only convenience and becomes the
**project-agnostic, language-agnostic linter/typecheck orchestrator** that AGENTS.md
already implies it should be.

Scope of the "language families" in this slice: **Python, Go, Rust, Ruby, Java, Kotlin,
Swift, C#/.NET, Elixir** — i.e. everything the mcp-vertex team has explicitly asked
about, plus the ecosystems we can verify with a hand-curated upstream package today.
Haskell/Scala/Zig/Flutter-Dart are deferred to a follow-up (see "non-goals").

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
- **No Haskell, Scala, Zig, Dart/Flutter, Lua, R, Julia in this slice.** Each
  needs its own detection heuristic + at least one canonical linter and one
  typechecker; we cannot ship them in a single proposal without inflating the
  spec. They get follow-up proposals (`f00052+`).
- **No CI changes.** `bun run validate` already gates everything; no new
  GitHub Actions, no dependabot bumps.

## Slices

- global_gate: validate

### S1 — Project-agnostic core: Linter×Language model

- **Status**: pending
- **Files**: plugins/rules/src/lib/frameworks/types.ts
- **Files**: plugins/rules/src/lib/frameworks/presets.ts
- **Files**: plugins/rules/src/lib/frameworks/manifest.ts
- **Files**: plugins/rules/src/index.ts
- **Gate**: typecheck
- depends_on: []
- acceptance:
    - "`IRulePreset.language` union widens to include `'py' | 'go' | 'rs' | 'rb' | 'java' | 'kt' | 'swift' | 'cs' | 'ex'`; `IRulePreset.linter` widens to include the corresponding linter ids; the pre-existing `'ts' | 'js' | 'php'` / `'eslint' | 'pint'` entries are preserved"
    - "An `ILinterCommandSet` interface (or equivalent) carries `{ checkCommand, fixCommand?, typecheckCommand? }` per preset, *replacing* the hardcoded `eslintCommand` / `lintCheckCommand` / `lintFixCommand` branches in `rules-tools.ts`"
    - "`IRulePreset` gains an optional `linter: 'eslint' | 'pint' | …` discriminator that already exists plus a `requiredToolchain?: readonly string[]` field naming the binaries a project must install (e.g. `['ruff', 'pyright']` for the python preset, `['cargo']` for the rust preset) — distinct from the existing `requiredEslintDeps`, which is renamed to `requiredLinterDeps`"
    - "`IAreaRules` field `eslint` is renamed to `configs` (internal only; the public `get_rules` outputSchema renames in S7); `typecheck` stays as-is; the manifest fingerprint is recomputed against the new field name"
    - "`buildRulesManifest` still returns the same `IRulesManifest` shape (with `projects` / `mode` / `fingerprint` / `generatedAt`); only the per-area shape widens"
    - "`PRESET_BY_ID` / `SUPPORTED_PRESET_IDS` keep their lookup behaviour; new presets are added in S3, not S1"
    - "`bun run typecheck` exits 0"

### S2 — Language-aware area detection

- **Status**: pending
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

### S3 — Add the language presets

- **Status**: pending
- **Files**: plugins/rules/src/lib/frameworks/presets.ts
- **Files**: plugins/rules/tests/src/lib/rules.spec.ts
- **Gate**: test
- depends_on: [S1, S2]
- acceptance:
    - "9 new `IRulePreset` entries are added: `python-ruff` (linter `ruff`, typechecker `basedpyright`), `go-golangci` (linter `golangci-lint`, typechecker `go vet`), `rust-clippy` (linter `clippy`, typechecker `cargo check`), `ruby-rubocop` (linter `rubocop`, typechecker `sorbet` or `rbs`), `java-checkstyle` (linter `checkstyle` + `spotless`, typechecker `javac`), `kotlin-ktlint` (linter `ktlint` + `detekt`, typechecker `kotlinc`), `swift-swiftlint` (linter `swiftlint` + `swift-format`, typechecker `swiftc`), `csharp-dotnet` (linter `dotnet format` + `Roslyn analyzers`, typechecker `dotnet build`), `elixir-credo` (linter `credo` + `mix format`, typechecker `dialyzer`)"
    - "Each preset ships DATA only (the linter config + formatter config + typecheck config as text), with the same `eslintConfigContent` / `tsconfigContent` field shape renamed to `linterConfigContent` / `typecheckConfigContent` and the cache filenames matching the language (`python-ruff.ruff.toml`, `go-golangci..golangci.yml`, …)"
    - "Each preset has a `conventions` array of agent-facing bullets (≤ 5 each) modelled on the JS/TS presets: e.g. Python → \"Use `from __future__ import annotations`\", Go → \"Errors as values; wrap with `%w`\", Rust → \"Prefer `?` over `unwrap()` in library code\", etc."
    - "Each preset has a `requiredLinterDeps` list naming the binaries the project must install; the existing `REQUIRED_ESLINT_DEPS` is renamed `REQUIRED_LINTER_DEPS` and gains the new entries"
    - "`SUPPORTED_PRESET_IDS` now contains ≥ 22 entries (the original 13 + 9 new)"

### S4 — Per-preset check/fix/typecheck commands

- **Status**: pending
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts
- **Files**: plugins/rules/src/lib/frameworks/types.ts
- **Gate**: test
- depends_on: [S1, S3]
- acceptance:
    - "The hardcoded `eslintCommand` / `lintCheckCommand` / `lintFixCommand` branches in `rules-tools.ts:108-127` are replaced by reading each preset's `ILinterCommandSet` (S1)"
    - "For each new language, `check_rules` returns the correct command (e.g. `ruff check .` for Python, `golangci-lint run ./...` for Go, `cargo clippy --workspace --all-targets -- -D warnings` for Rust, `rubocop` for Ruby, etc.) and `apply_rules` returns the correct fix command (`ruff check --fix .`, `cargo clippy --fix`, `rubocop -a`, …)"
    - "`missingEslintFinding` is renamed to `missingLinterDeps` and the `code` literal in the finding becomes `'missing-linter-deps'`; the old `missing-eslint-deps` code remains as a backward-compat alias in the outputSchema for one release (Conventional Commits, no semver bump)"
    - "Typecheck commands are emitted only for languages whose typecheck field is set: `pyright` / `mypy --strict` (Python), `go vet ./...` (Go), `cargo check --workspace` (Rust), `sorbet tc` (Ruby), `javac -d /tmp/check <sources>` (Java), `kotlinc -d /tmp/check <sources>` (Kotlin), `swiftc -typecheck` (Swift), `dotnet build -p:TreatWarningsAsErrors=true` (C#), `mix dialyzer` (Elixir)"

### S5 — Online-preset registry: PyPI / crates.io / proxy.golang.org / RubyGems / Maven / NuGet / Hex

- **Status**: pending
- **Files**: plugins/rules/src/lib/frameworks/online-preset.ts
- **Files**: plugins/rules/tests/src/lib/online-preset.spec.ts
- **Gate**: test
- depends_on: [S3]
- acceptance:
    - "`ONLINE_PACKAGE_BY_PRESET` widens with one entry per new preset: e.g. `python-ruff: 'ruff'`, `rust-clippy: 'clippy'` (or the actual upstream linter package), …"
    - "A `REGISTRY_URL` map (or equivalent) names the upstream registry per package: `npm → https://registry.npmjs.org/{pkg}/latest`, `pypi → https://pypi.org/pypi/{pkg}/json`, `crates → https://crates.io/api/v1/crates/{pkg}`, `goproxy → https://proxy.golang.org/{pkg}/@latest`, `rubygems → https://rubygems.org/api/v1/gems/{pkg}.json`, `maven → https://search.maven.org/solrsearch/select?q=g:%22{group}%22+AND+a:%22{artifact}%22&rows=1&wt=json`, `nuget → https://api.nuget.org/v3-flatcontainer/{pkg}/index.json`, `hex → https://repo.hex.pm/tarballs/{pkg}-{version}.tar` (HEAD)"
    - "`fetchOnlinePresetInfo` dispatches by registry, normalises the version field, and preserves the same `{ ok: true, package, version, homepage? } | { ok: false, package, reason }` contract — never throws, never blocks, 5s timeout per request"
    - "Tests stub each registry with the existing `IOnlineFetcher` mock pattern; 9 new fixtures (one per language) prove the contract end-to-end"

### S6 — Rebalance linter vs typecheck in `rules-tools`

- **Status**: pending
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts
- **Files**: plugins/rules/tests/src/lib/tools/rules-tools.spec.ts
- **Gate**: test
- depends_on: [S3, S4]
- acceptance:
    - "`get_rules` and `check_rules` no longer assume the typecheck target is a `tsconfig.json`; the `typecheck` field on `IAreaRules` is a list of `*.{toml,mod,cabal,csproj,swift}` style config paths (Rust's `Cargo.toml` *is* its typecheck config) — the path is whatever the linter ecosystem uses, surfaced verbatim"
    - "`check_rules` returns `typecheckCommand: undefined` for languages where the typecheck is implicit (e.g. pure-Python with no `basedpyright` / `mypy` config; Go with only `go vet`; Swift with `swiftc -typecheck` folded into `swift build`)"
    - "Existing JS/TS/PHP tests stay green (no regression); new tests assert the per-language command strings"

### S7 — Language-aware `get_rules` outputSchema

- **Status**: pending
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts
- **Files**: plugins/rules/tests/src/lib/tools/rules-tools.spec.ts
- **Files**: plugins/rules/src/generated/tool-outputs.ts
- **Gate**: test
- depends_on: [S6]
- acceptance:
    - "`get_rules` outputSchema renames `eslintConfigs` → `linterConfigs` and `typecheckConfigs` stays; the structured payload matches"
    - "`check_rules` outputSchema gains a per-check `linter: 'eslint' | 'pint' | 'ruff' | …` discriminator so a downstream model can render the right help text per language"
    - "The regenerated `plugins/rules/src/generated/tool-outputs.ts` matches the new shape (`bun run types:generate` exits 0)"
    - "Existing l00008 s4 `get_rules` golden-shape spec still passes (the field rename is internal; the *shape* is unchanged)"
    - "New specs: one golden outputSchema test per new language family (9 in total), each verifying the structured payload's `linter` discriminator + `linterConfigs` + `typecheckCommand` triple"

### S8 — Docs and skills

- **Status**: pending
- **Files**: plugins/rules/README.md
- **Files**: skills/mcp-vertex-plugin-authoring/SKILL.md
- **Files**: skills/audit-playbook/SKILL.md
- **Files**: skills/token-budget-playbook/SKILL.md
- **Files**: plugins/rules/src/lib/knowledge/applying-rules.ts
- **Gate**: lint
- depends_on: [S3]
- acceptance:
    - "`plugins/rules/README.md` updates the "Supported presets" list to enumerate the 9 new language families with one-line descriptions each; adds a "Polyglot workspaces" subsection with the detection-priority table (pyproject > package.json, go.mod > package.json, …)"
    - "`mcp-vertex-plugin-authoring` skill adds a "Adding a new language preset" subsection: required files to touch (types.ts, presets.ts, detect-framework.ts, online-preset.ts, the per-language cache filename), the `IRulePreset` shape, the DATA-only constraint (no plugin imports the linter package), and a worked example for a notional `zig-ziglint` preset"
    - "`audit-playbook` skill adds a "Multi-language rules audit" dimension: does the manifest correctly detect each area's language? does each preset ship a `conventions` array? is each preset's `requiredLinterDeps` non-empty (except for the no-deps case like Laravel's `[]`)?"
    - "`applying-rules` knowledge body mentions the linter by family (`ruff` / `clippy` / `swiftlint` / …) and the mode guidance, not by ESLint specifically"
    - "`bun run lint:proposals` and `bun run lint:tools` exit 0"

### S9 — Tests: per-language detect/manifest/tool coverage

- **Status**: pending
- **Files**: plugins/rules/tests/src/lib/rules.spec.ts
- **Files**: plugins/rules/tests/src/lib/frameworks/manifest.spec.ts
- **Files**: plugins/rules/tests/src/lib/tools/rules-tools.spec.ts
- **Files**: plugins/rules/tests/src/lib/online-preset.spec.ts
- **Gate**: test
- depends_on: [S1, S2, S3, S4, S5, S6, S7]
- acceptance:
    - "9 new detection tests (one per language)"
    - "9 new manifest golden tests (one per language, pinning the per-area shape with the new `linterConfigs` field name and the `linter` discriminator)"
    - "9 new `get_rules` / `check_rules` outputSchema tests"
    - "9 new `online-preset` tests with stubbed fetchers (one per language registry)"
    - "All pre-existing rules-plugin tests still pass (no regression on l00008 s2/s4 specs)"

### S10 — E2E: synthetic polyglot workspace

- **Status**: pending
- **Files**: plugins/rules/tests/fixtures/polyglot/
- **Files**: plugins/rules/tests/src/lib/e2e-polyglot.spec.ts
- **Gate**: test
- depends_on: [S9]
- acceptance:
    - "A fixture workspace at `plugins/rules/tests/fixtures/polyglot/` contains one area per language family (a `py-thing/pyproject.toml`, a `go-thing/go.mod`, a `rs-thing/Cargo.toml`, a `rb-thing/Gemfile`, a `java-thing/pom.xml`, a `kt-thing/build.gradle.kts`, a `swift-thing/Package.swift`, a `cs-thing/Foo.csproj`, an `ex-thing/mix.exs`, **plus** a `web/` area with a `package.json` for the Next.js case)"
    - "An e2e spec builds the manifest, calls `get_rules` and `check_rules` against the polyglot fixture via the real MCP harness (the same pattern `tools/scripts/verify/plugin-tool-verify.script.ts` uses), and asserts each area resolves to its expected preset, the per-area `linter` discriminator is correct, the per-area `linterConfigs` non-empty, and the per-area `typecheckCommand` is defined where applicable"
    - "Spec exits 0; no real network calls; no real linter binaries are required (the spec validates the *commands* the tool would emit, not the lint results)"

## acceptance

`bun run validate` is the global gate. The pre-existing l00008 specs (rules-plugin
durable writes, outputSchema hardening) must remain green across every slice; the
new S9 + S10 specs grow the rules-plugin test count by ~36. No `package.json`
field is renamed (the per-language additions are additive). The pre-existing
`get_rules` / `check_rules` / `apply_rules` tool IDs are unchanged; only the
field *names* inside the structured payload change, and only in S7.

After S10 lands, the plugin is ready for a follow-up slice set that:
- adds a per-language `docs/` page in `apps/web` (one per family) — owner
  depends on the docs team
- adds a `plugins/rules/<lang>` split if/when the JS/TS surface and any
  non-JS/TS surface diverge enough to warrant separate packages
- adds Haskell / Scala / Zig / Dart-Flutter / Lua / R / Julia presets
  (f00052+ proposals)

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
