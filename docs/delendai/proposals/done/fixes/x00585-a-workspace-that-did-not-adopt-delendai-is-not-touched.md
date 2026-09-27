---
id: x00585
title: "A workspace that did not adopt delendai is not touched"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-21
tags:
    - adoption
    - safety
    - host
---

# x00585 — A workspace that did not adopt delendai is not touched

## goal

Starting the server in a project that never adopted delendai reads
nothing, writes nothing, and says nothing.

## why

Observed directly: configuring the MCP host and opening an unrelated
project **created and modified a great many files**.

`ensureWorkspaceMigrated` runs on every host start, before anything reads
the workspace, and it was ungated. The migrations behind it are this
product's own rename — `@mcp-vertex` → `@delendai`, `mcp_vertex`,
`mcpvertex`, `mcp-vertex`, `mcpv` → `delendai` — applied by rewriting

- `.vscode/*.json`,
- `package.json`,
- host configuration files,
- agent instruction files,

and by moving directories. That is exactly right for a workspace carrying
this product's old name. In somebody else's repository it is a tool
editing files nobody asked it to touch, and the journal it writes
conjures `.delendai/` into a project that has nothing to do with us.

The other two things the host does at boot are already gated: hooks stop
at `guardHooksMode`, and hydration and candidate refresh both stop at
`policy === undefined`. This was the one door left open — and it was the
first one, running before any of them.

## non-goals

- Retiring the migrations. A workspace that really is on the old name
  still needs them; it simply has to be a workspace of ours first.
- Making adoption implicit. The opposite: adoption is a thing somebody
  did.

## architecture

`ensureWorkspaceMigrated` asks `hasAdopted` first and returns
`not-needed` without touching the filesystem when the answer is no.

Adoption is a short, explicit list: `delendai.config.json`, or
`.delendai/` from a previous adoption — never inferred from a repository
that merely looks similar. The cost of guessing wrong is writing into a
project that never asked for any of this.

The gate lives in the service, not in the host, so the CLI, the MCP and
any future entrypoint inherit it rather than each remembering.

## slices

### S1 — boot heals only what adopted it

- **Status**: review
- **Files**: [`packages/core/src/lib/workspace-migration/legacy-migration.service.ts`, `packages/core/src/lib/workspace-migration/legacy-migration.constant.ts`, `packages/core/tests/src/lib/workspace-migration/legacy-migration.service.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/workspace-migration/legacy-migration.service.spec.ts`

## acceptance

- In a directory with a `package.json` and a `.vscode/settings.json` and
  no adoption marker: no migration is detected or applied, nothing is
  recorded, `.delendai/` is not created, and a checksum of the whole tree
  is byte-identical before and after.
- A workspace with `delendai.config.json` is still healed.
- A workspace with `.delendai/` counts as adopted, so a momentarily
  missing config does not read as a stranger.
- The test **fails without the gate**.

## risks and mitigations

- **A workspace on the old name that lost its config.** `.delendai/` is
  accepted as a second marker, and adopting again is one file.
- **Someone expected boot to adopt for them.** They get silence instead
  of edits, which is the correct default for a tool operating in
  somebody else's repository.
