# @mcp-vertex/conventions

File-convention tools for `@mcp-vertex/core`. A consumer-facing surface
over the repo's canonical file-convention profile (see
[`docs/mcp-vertex/FILE-CONVENTIONS.md`](../../docs/mcp-vertex/FILE-CONVENTIONS.md), f00037):
two read-only MCP tools that classify paths into roles and report
convention drift.

Load it explicitly:

```bash
mcp-vertex --plugins=conventions
```

## Tools

| Tool | What it does |
|---|---|
| `conventions_classify` | **Pure.** Given `{ paths: string[] }`, returns each path's role plus the `unmatched` list. Nothing is read from disk. Optional `profile` picks the language rule table. |
| `conventions_check` | Scans the workspace (`packages`, `plugins`, `extensions`, `apps`, `tools` by default, or `{ roots }`) and reports `{ total, counts, unmatched, unmatchedCount }`. The inlined `unmatched` list is capped at 100; `unmatchedCount` is exact. Optional `profile` picks the language rule table. |

## Language profiles (f00113)

Both tools accept `profile: "typescript" | "python" | "rust" | "go"`
(default `typescript` — omitting it is byte-identical to the pre-f00113
behaviour). `typescript` wraps the core's canonical `DEFAULT_TS_RULES`
unchanged; the other profiles are plugin-local rule tables with
language-native roles:

- **python** — `module`, `package-marker` (`__init__.py`), `entry`
  (`__main__.py`), `test` (`test_*.py`, `*_test.py`, `conftest.py`,
  `tests/`), `script`, `migration`, `generated` (`*_pb2.py`); skips
  `__pycache__`, `.venv`, `venv`, `.tox`, `.mypy_cache`.
- **rust** — `crate-entry` (`main.rs`/`lib.rs`), `module-root`
  (`mod.rs`), `module`, `build-script` (`build.rs`), `test`, `bench`,
  `example`, `generated` (`*.pb.rs`, `*_generated.rs`); skips `target`.
- **go** — `module`, `entry` (`main.go`, `cmd/`), `internal`, `test`
  (`*_test.go`), `generated` (`*.pb.go`, `*_gen.go`, `zz_generated*`);
  skips `vendor`.

## The TypeScript profile

| Role | Folder | Suffix |
|---|---|---|
| interfaces/types | `contracts/interfaces/` | `*.interface.ts` |
| constants | `contracts/constants/` | `*.constant.ts` |
| services | `services/` | `*.service.ts` |
| MCP tools | `tools/` | `*.tool.ts` |
| registries | `registries/` / `registry/` | `*.registry.ts` |
| registration glue | `register/` / `registers/` | `*.register.ts` |
| factories | `factories/` | `*.factory.ts` |
| builders | `builders/` | `*.builder.ts` |
| generated outputs | `generated/` | `*.generated.*` |
| public barrels | `src/index.ts`, `src/public/index.ts` | — |

The profile is a small, ordered rule chain (`classifyPath`,
`TYPESCRIPT_RULES`, exported from `@mcp-vertex/conventions/public`). It
is the plugin's own copy of the rules so the package depends on nothing
outside `@mcp-vertex/core`; a parity spec keeps it in lock-step with the
lint-side engine (`tools/scripts/lint/file-conventions.ts`) so the two
can never silently drift.

## Architecture (SOLID)

- **Single responsibility** — the profile classifies, the scan walks,
  each tool is one file.
- **Dependency inversion** — `conventions_check` depends on a narrow
  `IDirReader` port; production wires a `node:fs` reader, tests pass an
  in-memory tree.
- **Open/closed** — adding a role appends one rule; no edit to
  `classifyPath`.

This plugin is read-only: it never renames or moves files. The
repo-wide migration that burns down the drift backlog is tracked by
f00037 S4–S6; `conventions plan`/`apply` (rename suggestions) are a
later, separate surface.
