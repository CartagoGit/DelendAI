# Languages & LSPs — the mcp-language-server master pattern

> The single most useful pattern in this entire dossier: **don't wire 30
> language-specific MCPs. Wire ONE** — `mcp-language-server` (isaacphi) —
> and let it speak to any LSP that's installed on the developer's machine.

## The master pattern: `mcp-language-server`

**Repo**: <https://github.com/isaacphi/mcp-language-server>
**Why it's the best**: it's a generic MCP wrapper around the Language Server
Protocol (LSP). Most editors (VS Code, Zed, Neovim) ship LSP clients;
`mcp-language-server` does the same, exposing LSP features as MCP tools:

- `get_definition`
- `find_references`
- `rename_symbol` (with workspace edit support)
- `get_diagnostics`
- `get_hover`
- `get_completions`
- `get_symbols` (workspace outline)
- `get_code_actions`

**Languages it supports out of the box**: any language with an LSP server
on the local machine. That includes:

- **TypeScript / JavaScript**: `typescript-language-server` (built into VS Code).
- **Python**: `pyright-langserver` (Microsoft).
- **Go**: `gopls` (the official one).
- **Rust**: `rust-analyzer`.
- **C / C++**: `clangd`.
- **C#**: `csharp-ls` or Roslyn-based LSPs.
- **Java**: `jdtls` (Eclipse).
- **Kotlin**: `kotlin-language-server`.
- **Swift**: `sourcekit-lsp`.
- **Ruby**: `solargraph`.
- **PHP**: `phpactor` or `intelephense`.
- **Rust**: `rust-analyzer`.
- **Zig**: `zls`.
- **Elixir**: `elixir-ls`.
- **Erlang**: `erlang_ls`.
- **OCaml**: `ocaml-lsp`.
- **Haskell**: `hls`.
- **Clojure**: `clojure-lsp`.
- **Scala**: `Metals`.
- **Angular (HTML templates)**: `angular-language-server`.
- **Vue**: `vue-language-server`.
- **Svelte**: `svelte-language-server`.
- **Lua**: `lua-language-server`.
- **Elm**: `elm-language-server`.
- **Dart / Flutter**: `dart_language_server`.

**Install**: typically `npx -y mcp-language-server` or `uvx mcp-language-server`
depending on the language.

**Recommendation**: **always wire this in the ⭐ curated tier**. The
maintenance cost is one-time (install the LSP for each language once per
workspace); the agent gets full code navigation in any language.

## Alternative LSP servers worth considering

| Server | Why it's interesting |
|---|---|
| `agent-lsp` ([blackwell-systems](https://github.com/blackwell-systems/agent-lsp)) | "50 tools, 30 CI-verified languages, 20 agent workflows. Persistent sessions keep the index warm across files and projects. Speculative execution simulates edits in memory before writing to disk." Sounds ambitious; check it before adopting. |
| `serena` ([oraios](https://github.com/oraios/serena)) | "A fully-featured coding agent that relies on symbolic code operations by using language servers." Different philosophy: Serena *replaces* an MCP-style agent, not just adds LSP to one. |
| `gopls-mcp` ([hloiseaufcms](https://github.com/hloiseaufcms/mcp-gopls)) | If you only need Go, this is a thinner wrapper. mcp-language-server covers it. |

## Language-specific MCPs (for when mcp-language-server isn't enough)

These are useful **only if** you need language-specific runtime capabilities
(RUN code, format code, lint code) rather than just LSP features.

| Server | What it adds beyond LSP | Recommendation |
|---|---|---|
| `python-mcp` (pyright + ruff combined) | Lint + format Python | OK if you want a single MCP that covers Python needs. |
| `pyright-mcp` | Type-check Python specifically | Niche. |
| `ruff-mcp` | Lint Python specifically | Niche. |
| `golang-mcp` (gopls wrapper) | Nothing beyond LSP | Skip; use mcp-language-server. |
| `rust-mcp` (rust-analyzer wrapper) | Nothing beyond LSP | Skip. |
| `ruby-mcp` (rubocop + sorbet) | Lint + typecheck Ruby | OK if you maintain Ruby code. |
| `mcp-java` (jdtls wrapper) | Nothing beyond LSP | Skip. |
| `kotlin-mcp` | Nothing beyond LSP | Skip. |
| `swift-mcp` | Nothing beyond LSP | Skip. |
| `csharp-mcp` | Nothing beyond LSP | Skip. |
| `zig-mcp` (zls) | Nothing beyond LSP | Skip. |
| `php-mcp` (phpactor) | Nothing beyond LSP | Skip. |
| `dart-mcp` / `flutter-mcp` | Nothing beyond LSP | Skip. |
| `scala-mcp` (Metals) | Nothing beyond LSP | Skip. |
| `elixir-mcp` (elixir-ls) | Nothing beyond LSP | Skip. |
| `clojure-mcp` (clj-kondo + clojure-lsp) | Lint + LSP combined | OK if you maintain Clojure. |
| `haskell-mcp` (hls) | Nothing beyond LSP | Skip. |
| `lua-mcp` (lua-language-server) | Nothing beyond LSP | Skip. |
| `r-mcp` | R-specific (DataScience MCPs cover this better) | Skip. |
| `julia-mcp` | Same | Skip. |

## Coding-agent-specific MCPs (multi-language, but oriented to code edits)

These go beyond LSP — they can run code, manage processes, plan edits:

| Server | What it does | Recommendation |
|---|---|---|
| `desktop-commander` | "Swiss-army-knife" file/process/exec tool. ~100k+ weekly visitors. | **Skip if you already have native Bash + file tools**. It duplicates them. |
| `code-mcp` ([ezyang](https://github.com/ezyang/codemcp)) | Coding agent with read/write/exec | Skip; mcp-vertex already has this primitive. |
| `wcgw` / `gabrielmaialva33/winx-code-agent` | Rust coding agent | Skip. |
| `claude-code` (community CLI wrappers) | Wraps Claude Code CLI | Skip; you're already in mcp-vertex. |

## What f00068 needs to update

The original curated tier listed `mcp-language-server` as a single entry —
that's still correct. The 🟡 discoverable tier has ~37 language-specific
servers, all of which are **redundant** with `mcp-language-server`. Move
them to 🟡 but with a clear `// consider mcp-language-server instead`
warning.

The only language-specific MCPs worth wiring up independently of
mcp-language-server are those that **bundle a runtime capability** (lint,
format, type-check) **with** LSP — i.e. `python-mcp` (pyright + ruff) and
`ruby-mcp` (rubocop + sorbet). For everything else: **one MCP, 30 languages**.