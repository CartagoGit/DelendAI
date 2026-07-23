---
id: f00138
kind: feat
title: prompts pack — explain-code, write-tests-for, review-diff, generate-docstrings, security-audit-file, optimize-this (project-aware MCP prompts)
status: ready
date: 2026-07-23
track: plugin+prompts+dx
---

# f00138 — prompts pack

## goal

A pack of reusable, project-aware **MCP prompts**: `explain-this-code`,
`write-tests-for`, `review-this-diff`, `generate-docstrings`,
`security-audit-this-file`, and `optimize-this` — the daily-driver actions,
parameterized and wired to compose the project's existing tools and
conventions.

## why

Prompts are a first-class MCP primitive mcp-vertex currently under-uses, yet
they are the most-used everyday actions. Dogfooding: one-shot "write tests for
this" / "review this diff" that already knows the repo's test-convention and
quality gates, instead of re-explaining context each time.

## why this design

Use the existing prompt-registration surface (`IPromptRegistration` already
flows through `assemble-plugins`); each prompt is a **pure template** the host
fills, and they **compose existing tools** — `review-this-diff` pulls
`git_diff` + `quality`; `write-tests-for` uses `test-convention`;
`security-audit-this-file` points at f00122. No model calls of their own and no
hardcoded provider (routing is `auto-agent-selector`'s job).

## non-goals

- No new tools — prompts orchestrate existing ones.
- No embedded model calls or hardcoded provider.
- No project-specific paths baked into the templates (context-driven).

## slices

### S1 — comprehension prompts

- **Status**: pending
- **Files**: `plugins/prompts-pack/src/prompts/explain.ts`, `plugins/prompts-pack/src/prompts/docstrings.ts`
- **Gate**: bun run validate

`explain-this-code`, `generate-docstrings` — parameterized over a file/selection.

### S2 — quality prompts

- **Status**: pending
- **Files**: `plugins/prompts-pack/src/prompts/write-tests.ts`, `plugins/prompts-pack/src/prompts/review-diff.ts`
- **Gate**: bun run validate

`write-tests-for` (composes `test-convention`), `review-this-diff` (composes
`git_diff` + `quality`), following the project's conventions.

### S3 — security/perf prompts + wiring

- **Status**: pending
- **Files**: `plugins/prompts-pack/src/prompts/security-audit.ts`, `plugins/prompts-pack/src/index.ts`
- **Gate**: bun run validate

`security-audit-this-file` (→ f00122), `optimize-this` (→ f00126); register all
prompts + pack membership; catalog.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- The prompts appear in `overview`; `review-this-diff` composes `git_diff` +
  `quality`; `write-tests-for` honours `test-convention`.
- No prompt hardcodes a provider or an absolute path.

## notes

Reuses the prompt-registration surface + existing tools. Pairs with
`auto-agent-selector` (routing) and f00122/f00126. Prior art: Continue/Cursor
slash-prompts, but project-aware and tool-composing.
