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
| `conventions_classify` | **Pure.** Given `{ paths: string[] }`, returns each path's role (`interface`/`constant`/`service`/`tool`/`registry`/`register`/`factory`/`builder`/`generated`/`barrel`/`other`) plus the `unmatched` list. Nothing is read from disk. |
| `conventions_check` | Scans the workspace (`packages`, `plugins`, `extensions`, `apps`, `tools` by default, or `{ roots }`) and reports `{ total, counts, unmatched, unmatchedCount }`. The inlined `unmatched` list is capped at 100; `unmatchedCount` is exact. |

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
