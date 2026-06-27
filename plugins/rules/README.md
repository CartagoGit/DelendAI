# @mcp-vertex/rules

Lint/type **rules** plugin for
[`@mcp-vertex/core`](../../docs/mcp-vertex/README-MCP-VERTEX.md). Ships per-framework default
ESLint + TypeScript presets, detects each project area's framework, materialises
the defaults to cache, and lets any agent apply them with a configurable
enforcement mode — **the project's own config always wins**.

## Enable

```jsonc
// .vscode/mcp.json
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=rules", "--rules-mode=mixed"]
		}
	}
}
```

## How it knows which rules to apply

Rules are resolved **per project area** (a Vue app and a Laravel API in the same
repo get different rules). On first run the plugin writes
`.cache/mcp-vertex/rules/rules-map.json`:

```jsonc
{
	"mode": "mixed",
	"projects": {
		"demo": {
			"apps/web":  { "framework": "vue",     "eslint": ["apps/web/eslint.config.mjs", ".cache/mcp-vertex/rules/vue.eslint.config.mjs"], "typecheck": ["apps/web/tsconfig.json", ".cache/mcp-vertex/rules/vue.tsconfig.json"] },
			"apps/admin":{ "framework": "angular", "eslint": [".cache/mcp-vertex/rules/angular.eslint.config.mjs"], "typecheck": ["apps/admin/tsconfig.json", ".cache/mcp-vertex/rules/angular.tsconfig.json"] }
		}
	}
}
```

Each array is **priority order: the project's own config first, our default
behind it.** Detection uses each area's deps + TS presence; override per area in
the config.

## Supported Languages

The plugin is language-aware, supporting 70+ languages organized by family:

### JS/TS Family
- **TypeScript**: Typed JavaScript dialect. Linter: `eslint`.
- **JavaScript**: Dynamic scripting language. Linter: `eslint`.
- **JSX/TSX**: React templates. Linter: `eslint`.

### JVM Family
- **Java**: Object-oriented language. Linter: `checkstyle`.
- **Kotlin**: JetBrains modern JVM language. Linter: `ktlint`.
- **Scala**: Functional/OOP language. Formatter: `scalafmt`.
- **Groovy**: JVM scripting. Linter: `codenarc`.
- **Clojure/ClojureScript**: Lisp dialect on JVM. Linter: `clj-kondo`.

### .NET Family
- **C#**: Microsoft OOP language. Formatter: `dotnet format`.
- **Visual Basic**: Legacy .NET language. Formatter: `dotnet format`.
- **F#**: Functional .NET language. Formatter: `dotnet format`.

### C-family
- **C / C++**: Low-level systems languages. Linter: `clang-tidy`.
- **Objective-C / Objective-C++**: Apple legacy languages. Linter: `clang-tidy`.

### Systems & Native
- **Rust**: Memory-safe systems language. Linter: `clippy`.
- **Zig**: Modern C replacement. Formatter: `zig fmt`.
- **Nim**: Expressive systems language. Formatter: `nimpretty`.
- **Crystal**: Ruby-like compiled language. Formatter: `crystal tool format`.
- **V**: Simple compiled language. Formatter: `vfmt`.

### Go Family
- **Go**: Google concurrent language. Linter: `golangci-lint`.

### Functional
- **Haskell**: Pure functional language. Linter: `hlint`.
- **OCaml**: Pragmatic functional language. Formatter: `ocamlformat`.
- **PureScript**: Strongly-typed JS target. Formatter: `purs-tidy`.
- **Elm**: Safe frontend functional language. Formatter: `elm-format`.
- **Gleam**: Type-safe BEAM language. Formatter: `gleam format`.
- **Coq / Agda / Idris**: Theorem provers / dependent types.

### BEAM Family
- **Elixir**: Dynamic functional language on Erlang VM. Linter: `credo`.
- **Erlang**: Concurrent telecom platform. Linter: `elvis`.
- **LFE**: Lisp Flavoured Erlang.

### Lisp Family
- **Racket**: Multi-paradigm Lisp. Formatter: `raco-fmt`.
- **Scheme / Common Lisp**: Classic Lisp dialects.

### Scripting Family
- **Python**: Universal scripting. Linter: `ruff`.
- **Ruby**: Elegant OOP scripting. Linter: `rubocop`.
- **PHP**: Web backend scripting. Linter: `pint`.
- **Lua**: Lightweight scripting. Linter: `luacheck`.
- **Perl**: Classic text-processing script.
- **Tcl**: Tool command language.

### Mobile
- **Dart**: Flutter client language. Formatter/Linter: `dart format` / `dart analyze`.
- **Swift**: Apple client language. Linter: `swiftlint`.

### Shell Family
- **Bash / Sh**: POSIX shells. Linter: `shellcheck`.
- **Fish**: Friendly interactive shell. Formatter: `fish_indent`.
- **Nu**: Structured shell. Formatter: `nu-fmt`.
- **PowerShell**: Microsoft administrative shell. Linter: `PSScriptAnalyzer`.

### Data & Statistics
- **R**: Statistical computing. Linter: `lintr`.
- **Julia**: High-performance scientific math. Formatter: `JuliaFormatter`.
- **SQL**: Database queries. Linter: `sqlfluff`.

### Documentation
- **Markdown**: Lightweight markup. Linter: `markdownlint`.
- **reStructuredText**: Sphinx docs. Linter: `rstcheck`.
- **AsciiDoc**: Technical publishing. Linter: `asciidoctor-lint`.
- **LaTeX**: Academic typesetting. Linter: `chktex`.
- **Typst**: Modern markup compiler. Formatter: `typst-fmt`.

### Config & Serialization
- **JSON / JSON5**: Web data. Linter: `jsonlint`.
- **YAML**: Human-friendly config. Linter: `yamllint`.
- **TOML**: Minimal config. Linter: `taplo`.
- **HCL**: HashiCorp configuration. Linter: `tflint`.
- **KDL**: Document layout language. Formatter: `kdlfmt`.
- **XML / INI**: Classic formats.

### Web DSL
- **CSS / SCSS / Sass / Less**: Web styling. Linter: `stylelint`.
- **HTML / SVG**: Web markup.

### Schema
- **Protocol Buffers**: Google serialization. Linter: `buf`.
- **GraphQL**: API query language. Linter: `graphql-eslint`.
- **Thrift**: Apache RPC. Linter: `thriftcheck`.
- **OpenAPI**: REST documentation. Linter: `spectral`.

### Smart Contracts
- **Solidity**: Ethereum contracts. Linter: `solhint`.
- **Vyper**: Pythonic EVM language. Linter: `vyper-lint`.
- **Move**: Secure asset programming. Linter: `move-lint`.

### Notebooks
- **Jupyter Notebook**: Interactive science. Linter: `ruff`.

### Build Systems
- **CMake**: Cross-platform build. Formatter: `cmake-format`.
- **Make / Bazel / Bzl / Just / Ninja / Maven / Gradle**: Project builders.

---

## Dogmas

The tool `get_rules` returns a `dogmas` object mapping each area to its language dogma parameters. This lets an agent learn the core design guidelines and formatting idioms of a language *before* writing code.

Each dogma contains:
- `ownership`: How memory/objects are managed (e.g. `borrow-checker`, `garbage-collected`).
- `errorModel`: How errors are handled (e.g. `Result`, `exceptions`, `explicit-error`).
- `nullSafety`: Null safeness contract (e.g. `option`, `null-safety`, `nullable`).
- `naming`: Preferred casing style (e.g. `snake_case`, `camelCase`, `PascalCase`).
- `async`: Asynchronous programming model (e.g. `async-await`, `coroutines`, `promises`).
- `visibility`: Access modifier style (e.g. `explicit`, `implicit`).
- `immutability`: Immutability stance (e.g. `let-mut`, `readonly`, `final`, `val`, `immutable`).
- `testing`: Standard testing framework (e.g. `cargo-test`, `vitest`, `unittest`, `go-test`).
- `packageManager`: Canonical package/dependency manager (e.g. `npm`, `cargo`, `pip`, `maven`).
- `bullets`: List of critical rules and coding guidelines.

### Worked Example Dogmas for Priority Families:
1. **Rust (`rust-clippy`)**:
   - `ownership`: borrow-checker
   - `errorModel`: Result
   - `nullSafety`: option
   - `naming`: snake_case
   - `immutability`: let-mut
   - `testing`: cargo-test
   - `bullets`: Use pattern matching over unwrap, keep borrow scopes small, enforce Clippy rules.
2. **Python (`python-ruff`)**:
   - `ownership`: garbage-collected
   - `errorModel`: exceptions
   - `nullSafety`: nullable
   - `naming`: snake_case
   - `immutability`: dynamic
   - `testing`: unittest
   - `bullets`: Follow PEP 8 guidelines, use type hints, write concise list comprehensions.
3. **Go (`go-golangci`)**:
   - `ownership`: garbage-collected
   - `errorModel`: explicit-error
   - `nullSafety`: nil
   - `naming`: mixedCaps
   - `immutability`: mutable
   - `testing`: go-test
   - `bullets`: Always check returned errors, use defer for resource cleanup, keep functions focused.
4. **TypeScript (`vanilla-ts`)**:
   - `ownership`: garbage-collected
   - `errorModel`: exceptions
   - `nullSafety`: null-undefined
   - `naming`: camelCase
   - `immutability`: readonly
   - `testing`: vitest
   - `bullets`: Enable strict null checks, prefer interfaces over types for objects, avoid using `any`.
5. **Java (`java-checkstyle`)**:
   - `ownership`: garbage-collected
   - `errorModel`: exceptions
   - `nullSafety`: nullable
   - `naming`: camelCase
   - `immutability`: final
   - `testing`: junit
   - `bullets`: Program to interfaces, use standard exception hierarchy, write descriptive docstrings.
6. **Kotlin (`kotlin-ktlint`)**:
   - `ownership`: garbage-collected
   - `errorModel`: exceptions
   - `nullSafety`: null-safety
   - `naming`: camelCase
   - `immutability`: val
   - `testing`: junit/kotest
   - `bullets`: Use expression bodies, prefer val over var, leverage null-safe operators.
7. **Swift (`swift-swiftlint`)**:
   - `ownership`: garbage-collected
   - `errorModel`: throws
   - `nullSafety`: optional
   - `naming`: camelCase
   - `immutability`: let
   - `testing`: xctest
   - `bullets`: Use guard statements for early exits, favor let constants, handle optionals safely.
8. **C# (`csharp-dotnet`)**:
   - `ownership`: garbage-collected
   - `errorModel`: exceptions
   - `nullSafety`: nullable
   - `naming`: PascalCase
   - `immutability`: readonly
   - `testing`: xunit
   - `bullets`: Follow LINQ best practices, use nullable reference types, use properties over fields.
9. **Elixir (`elixir-credo`)**:
   - `ownership`: garbage-collected
   - `errorModel`: pattern-matching
   - `nullSafety`: nil
   - `naming`: snake_case
   - `immutability`: immutable
   - `testing`: exunit
   - `bullets`: Pattern match assertions, pipeline functions using |>, leverage supervisor trees.
10. **Ruby (`ruby-rubocop`)**:
    - `ownership`: garbage-collected
    - `errorModel`: exceptions
    - `nullSafety`: nullable
    - `naming`: snake_case
    - `immutability`: dynamic
    - `testing`: rspec
    - `bullets`: Follow community style guide, write block initializers, prefer duck typing.
11. **PHP (`laravel`)**:
    - `ownership`: garbage-collected
    - `errorModel`: exceptions
    - `nullSafety`: nullable
    - `naming`: camelCase
    - `immutability`: dynamic
    - `testing`: pest
    - `bullets`: Use strict types declaration, follow PSR standards, use dependency injection.
12. **JavaScript (`vanilla-js`)**:
    - `ownership`: garbage-collected
    - `errorModel`: exceptions
    - `nullSafety`: nullable
    - `naming`: camelCase
    - `immutability`: dynamic
    - `testing`: jest
    - `bullets`: Avoid global variables, use const/let, check equality using strict operator `===`.

---

## Polyglot Workspaces

In repositories containing multiple languages or frameworks (e.g., a Rust backend alongside a TypeScript frontend), the plugin prioritizes language detection using exclusive files to ensure the correct preset is mapped to each directory:

| Priority | Signal File / Dir | Resolved Preset | Reason / Context |
|---|---|---|---|
| **1 (Highest)** | `pyproject.toml` | `python-ruff` | Python backend / tool |
| **2** | `go.mod` | `go-golangci` | Go package / service |
| **3** | `Cargo.toml` | `rust-clippy` | Rust service / tool |
| **4** | `Gemfile` | `ruby-rubocop` | Ruby application |
| **5** | `mix.exs` | `elixir-credo` | Elixir application |
| **6** | `build.gradle.kts` | `kotlin-ktlint` | Kotlin application |
| **7** | `pom.xml` | `java-checkstyle` | Java application |
| **8** | `Package.swift` | `swift-swiftlint` | Swift library / CLI |
| **9** | `artisan` / `composer.json` | `laravel` (PHP) | PHP / Laravel API |
| **10** | `tsconfig.json` | `vanilla-ts` | TypeScript area |
| **11 (Lowest)** | `package.json` | `vanilla-js` | JavaScript / Node area |

---

## Tools

| Tool | Purpose |
|---|---|
| `get_rules` | The rules map (per area: framework, configs, conventions) + the mode. |
| `check_rules` | The resolved configs + the exact per-language lint/typecheck command to validate (you run it). |
| `apply_rules` | A mode-aware plan to make code comply (you execute the steps). |

## Enforcement mode (`--rules-mode` or `options.mode`, default `mixed`)

- **strict** — bring everything into compliance.
- **mixed** — only fix files you create/touch.
- **none** — report only; never auto-change.
- **proposal** — create proposals (proposals plugin) for the changes.

## Configure

```jsonc
{
	"plugins": {
		"rules": {
			"options": {
				"mode": "mixed",
				"framework": "react",   // force root area
				"language": "ts",
				"overrides": { "apps/api": "vanilla-ts" }
			}
		}
	}
}
```

BSD-3-Clause © Cartago
