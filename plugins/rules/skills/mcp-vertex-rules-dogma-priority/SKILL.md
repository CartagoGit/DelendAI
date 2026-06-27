---
name: mcp-vertex-rules-dogma-priority
appliesTo: ['@mcp-vertex/rules']
description: How the `@mcp-vertex/rules` plugin resolves conflicts between the project's linter config, the language dogma, and the plugin's vendored default — the priority order is `project > dogma > default`. Use when an agent must decide which lint/typecheck command to run, or when a user asks "why did the plugin pick X over Y?".
---

# Priority resolution in `@mcp-vertex/rules` (f00051 / S11)

The rules plugin resolves a single decision for every area of the
workspace: *which linter command should I run, and why?* The
priority order is **codified in one place** — `policy-resolver.ts`,
the default implementation of the `IPolicyResolver` interface
declared in `policy-resolution.contract.ts`. Every tool
(`get_rules`, `check_rules`, `apply_rules`) depends on the
interface, not on the implementation; a host can swap in a
different policy (e.g. "treat dogma as advisory") via
`IRulesToolOptions.policyResolver` without touching the tools.

## The priority order

For every area, the resolver inspects three layers, in this
order (highest → lowest):

| # | Layer | Wins when | Source |
|---|---|---|---|
| 1 | **project** | The area ships its own linter config (e.g. `apps/web/eslint.config.mjs`, `pyproject.toml [tool.ruff]`, `Cargo.toml [lints]`, `go.mod`'s `gofmt` directive, `build.zig` settings, `.editorconfig`, etc.). | `IAreaRules.configs[0]` (project's config is always first). |
| 2 | **dogma** | No project config. The language's `IDogmaAdapter` is registered in the `DogmaRegistry` and resolves to a non-empty command set. | `dogmas/<lang>.dogma.ts`. |
| 3 | **default** | Neither project nor dogma applies. | The preset's vendored config under `.cache/mcp-vertex/rules/`. |

The resolver returns an `IResolvedCommand` with five fields:
`{ effective, command, rationale, fromProject?, fromDogma?, fromDefault }`.
The `rationale` is a one-sentence, agent-facing explanation of
*why* the winning layer was chosen and *why* the lower layers
were ignored. Every tool surfaces the full tuple:

- `get_rules` does not directly resolve, but lists the dogma's
  `renderedDogmas[area]` (the agent-facing sentence rendered by
  the `IDogmaPolicyProvider`) so the agent has the dogma in
  working memory.
- `check_rules` adds an `evidence` field per check
  (`{ effective, command, rationale, fromProject?, fromDogma?, fromDefault }`).
- `apply_rules` echoes `rationale` directly into the per-step
  text so the user sees *why* the chosen command was emitted.

## Worked examples (top-12 languages)

The table below shows the resolver's decision for each priority
family. Each entry is what `check_rules.evidence` looks like for
a typical project.

### 1. Rust — `borrow-checker / Result / Option / snake_case / cargo`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `clippy.toml` + `rustfmt.toml` | `project` | `cargo clippy --workspace --all-targets` |
| No project linter config, Rust dogma resolves | `dogma` | `cargo clippy --workspace --all-targets -- -D warnings` |
| No project config, no Rust dogma match | `default` | `cargo clippy --workspace` |

`rationale` for the project win:
> "Project ships its own linter config for `services/rs-thing`; project wins (priority: project > dogma > default). The dogma is your guide for NEW code, not for running the existing toolchain."

### 2. Python — `gc / exceptions / None / snake_case / pip`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `pyproject.toml [tool.ruff]` | `project` | `ruff check .` (the project's resolved command) |
| No project ruff config, Python dogma resolves | `dogma` | `ruff check .` |
| No project config, no Python dogma | `default` | `ruff check .` (the vendored default) |

### 3. Go — `gc / multi-return / nil / mixed / go mod`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `.golangci.yml` | `project` | `golangci-lint run ./...` (project-resolved) |
| No `.golangci.yml`, Go dogma resolves | `dogma` | `golangci-lint run ./...` |
| No config, no dogma | `default` | `golangci-lint run ./...` (vendored) |

### 4. TypeScript / JavaScript — `gc / exceptions / null-undefined / camelCase / npm`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `apps/web/eslint.config.mjs` | `project` | `pnpm exec eslint apps/web` |
| No project config, TS dogma resolves | `dogma` | `eslint apps/web --config .cache/mcp-vertex/rules/react-ts.eslint.config.mjs` |
| No config, no dogma | `default` | `eslint apps/web --config .cache/mcp-vertex/rules/vanilla-ts.eslint.config.mjs` |

### 5. Java — `gc / checked exceptions / null / PascalCase / maven`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `checkstyle.xml` | `project` | `mvn checkstyle:check` |
| No project config, Java dogma resolves | `dogma` | `mvn checkstyle:check` |
| No config, no dogma | `default` | `mvn checkstyle:check` (vendored) |

### 6. Kotlin — `gc / exceptions / null / PascalCase / gradle`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `.editorconfig` + custom ktlint config | `project` | `./gradlew ktlintCheck` |
| No project config, Kotlin dogma resolves | `dogma` | `./gradlew ktlintCheck` |
| No config, no dogma | `default` | `./gradlew ktlintCheck` (vendored) |

### 7. Swift — `arc / throws / Optional / lowerCamelCase / spm`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `.swiftlint.yml` | `project` | `swiftlint lint --config .swiftlint.yml` |
| No project config, Swift dogma resolves | `dogma` | `swiftlint lint` |
| No config, no dogma | `default` | `swiftlint lint` (vendored) |

### 8. C# / .NET — `gc / exceptions / Nullable<T> / PascalCase / dotnet`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `stylecop.json` or `.editorconfig` with rule entries | `project` | `dotnet format --verify-no-changes --include src/MyApp` |
| No project config, C# dogma resolves | `dogma` | `dotnet format --verify-no-changes --include src/MyApp` |
| No config, no dogma | `default` | `dotnet format --verify-no-changes` (vendored) |

### 9. Elixir — `gc / sum-types / nil / snake_case / mix`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `.credo.exs` | `project` | `mix credo --strict` |
| No project config, Elixir dogma resolves | `dogma` | `mix credo --strict` |
| No config, no dogma | `default` | `mix credo` (vendored) |

### 10. Ruby — `gc / exceptions / nil / snake_case / bundler`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `.rubocop.yml` | `project` | `bundle exec rubocop` (project-resolved) |
| No project config, Ruby dogma resolves | `dogma` | `bundle exec rubocop` |
| No config, no dogma | `default` | `bundle exec rubocop` (vendored) |

### 11. PHP / Laravel — `gc / exceptions / null / camelCase / composer`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `pint.json` | `project` | `./vendor/bin/pint --test` (project-resolved) |
| No project config, PHP dogma resolves | `dogma` | `./vendor/bin/pint --test` |
| No config, no dogma | `default` | `./vendor/bin/pint --test` (vendored) |

### 12. Haskell — `gc / sum-types / Maybe / camelCase / cabal`

| Scenario | `effective` | `command` |
|---|---|---|
| Area has `.hlint.yaml` | `project` | `hlint .` (project-resolved) |
| No project config, Haskell dogma resolves | `dogma` | `hlint .` |
| No config, no dogma | `default` | `hlint .` (vendored) |

## Why this matters for the agent

The agent's job is not to *decide* — the resolver decides — but
to **explain the decision to the user**. Every `rationale`
string is written so the agent can quote it verbatim:

- "Project wins" tells the user that the project's own linter
  config is the source of truth for the existing toolchain.
- "Dogma wins" tells the user that the plugin's vendored
  language default is the best choice when the project has no
  opinion.
- "Default wins" tells the user that the plugin shipped a
  baseline for this area; the user should ship a project
  config to override it.

When writing **new code**, follow the language dogma in
`get_rules.dogmas[area]` regardless of which layer won for the
existing toolchain — the dogma is *advice for new code*, not
*enforcement for existing code*.

## What to do when the resolver's decision is wrong

The 12-language matrix above is curated; the long-tail
(~70 languages) ships a baseline. If the resolver picks
something you disagree with:

1. **Ship a project config** to make the project layer win.
   This is the supported way to override the priority.
2. **Open a proposal** to flag the issue; the proposal
   workflow will route it to a language expert.
3. **Do not edit the vendored default** under
   `.cache/mcp-vertex/rules/`. The cache is overwritten on
   every boot via `writeFileAtomic`.

## Code seams (for contributors)

| File | Role |
|---|---|
| `src/lib/tools/policy-resolution.contract.ts` | Pure types: `PolicyLayer`, `IResolvedCommand`, `IPolicyResolutionInput`, `IPolicyResolver`. The single place the contract is declared. |
| `src/lib/tools/policy-resolver.ts` | The default implementation: `PROJECT_OVER_DOGMA_OVER_DEFAULT`. Encodes the priority order in one branchy function. |
| `src/lib/tools/dogma-policy.provider.ts` | The `IDogmaPolicyProvider` seam; renders a dogma into an agent-facing string (or future structured hint). |
| `src/lib/tools/rules-tools.ts` | The 3 tools read `IRulesToolOptions.policyResolver ?? PROJECT_OVER_DOGMA_OVER_DEFAULT` and compute `evidence` per check. |
| `src/lib/frameworks/registry/composition-root.ts` | The composition root exposes `policyResolver` + `dogmaPolicyProvider` as injection seams. |
| `src/lib/frameworks/registry/factory.ts` | `buildDefaultComposition({ policyResolver?, dogmaPolicyProvider? })` — the host override path. |
| `tests/src/lib/tools/policy-resolver.spec.ts` | 17 specs covering the priority matrix + the provider contract. |

The Open/Closed hinge: adding a new language = adding one
adapter + one dogma. The resolver and tools never change.