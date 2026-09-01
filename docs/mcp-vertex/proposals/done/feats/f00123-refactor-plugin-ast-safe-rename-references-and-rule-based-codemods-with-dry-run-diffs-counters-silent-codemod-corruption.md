---
id: f00123
kind: feat
title: refactor plugin — AST-safe rename, references and rule-based codemods with dry-run diffs (counters silent codemod corruption)
status: done
date: 2026-07-23
track: plugin+refactor+reliability
shipped-in:
    - 12b7e5a1 # feat(f00123): S1 refactor plugin — navigation (references / definition / symbols)
    - b031e137 # chore(f00123): wire refactor plugin and revert S2/S3 status to pending
    - d553b16b # feat(f00123): S2 safe rename — scoped multi-file diff planner + apply
    - d10e3bdb # feat(f00123): S3 rule-based codemods + recipe library
    - e6e248a0 # docs(f00123): correct S3 status — codemod module never landed
    - 8199bd1d # docs(f00123): S3 done — moved proposal to done/feats
---

# f00123 — refactor plugin

## goal

A `refactor` plugin for **safe structural transforms**: rename-symbol, find
references / go-to-definition, extract, and rule-based **codemods** (ast-grep
patterns / ts-morph), all operating on the AST and always returning a
**dry-run unified diff** that must be explicitly applied — with the project's
gate re-run on apply. It directly counters the documented "merged codemods
silently corrupt files" hazard by making every transform previewable, scoped,
and validated instead of a blind text rewrite.

## why

AST-aware refactoring is the Cursor/Sourcegraph differentiator, and this repo
performs codemods constantly (rename campaigns like `mv-*`→`mcpv-*`). The
project's own memory records **real data loss** when merged codemods dropped
logic outside their intended scope. A refactor tool that is AST-based,
dry-run-first, and gate-checked has very high dogfooding value *and* raises
reliability — the project's top priority ("el sistema debe ser fiable").

## why this design

Transforms run over the **AST** (ts-morph for TS, ast-grep for
pattern/polyglot), never regex, so scope and boundaries are respected. Every
operation is a **pure planner** over an injected project/file reader that
returns a diff; applying is a **separate, consented step** that writes through
fs-containment and then runs the acceptance gate. ast-grep presence is probed
via r00012 with an install hint. `refactor` complements `conventions` (a
convention violation maps to a codemod recipe) and reuses the fs-containment
hardened for `fs_write`.

## non-goals

- No blind regex rewrites — every change is AST-derived.
- No apply without an explicit diff review + consent, and no apply that skips
  the gate.
- No cross-file logic inference beyond what the AST proves — it will not
  "guess" a transform.
- Not a formatter — Biome owns formatting; this owns structure.

## slices

### S1 — navigation (references / definition / symbols)

- **Status**: done
- **Files**: `plugins/refactor/src/lib/nav/`, `plugins/refactor/src/lib/tools/refactor-nav.tool.ts`
- **Gate**: bun run validate

`refactor_references`, `refactor_definition`, `refactor_symbols` via
ts-morph / ast-grep, pure over an injected project. Gives agents accurate
usage/definition data the text `search` can't (semantic, not lexical).

### S2 — safe rename (scoped multi-file diff)

- **Status**: done
- **Files**: `plugins/refactor/src/lib/rename/`, `plugins/refactor/src/lib/tools/refactor-rename.tool.ts`
- **Gate**: bun run validate

`refactor_rename` returns a scoped, multi-file unified diff (never edits out of
scope); `refactor_apply` is a separate consented step that writes via
containment and re-runs the gate. Planner is pure + exhaustively unit-tested,
including the "don't touch a same-named symbol in another scope" case.

### S3 — rule-based codemods + recipe library

- **Status**: done
- **Files**: `plugins/refactor/src/lib/codemod/`, `plugins/refactor/src/lib/tools/refactor-codemod.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `codemod-runner.ts` discovers files, applies boundary-safe regex rewrites, returns unified diffs.
  - `recipes.ts` ships 3 recipes: `ts/no-throw-literal`, `ts/strict-equal`, `ts/console-to-logger`.
  - `refactor-codemod.tool.ts` exposes `refactor_codemod` with `recipeId`/`cwd`/`dryRun` input and `{ files: [{ path, diff }], totalEdits, language }` output.
  - Wired into `plugins/refactor/src/index.ts`; the runner stays pure/injection-friendly, and the new recipe + runner + tool specs extend the plugin suite beyond the previous 33 tests.

`refactor_codemod` runs an ast-grep pattern (rewrite) → diff, boundary-safe;
ships a small library of repo-relevant recipes. Each recipe is data + a test
proving it leaves unrelated logic untouched.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`, `types-in-contracts`).
- `refactor_rename` across the repo yields a correct scoped diff and touches
  **no** out-of-scope symbol; apply re-runs and passes the gate.
- A codemod recipe transforms a fixture and a companion test proves adjacent
  logic is preserved (the corruption-hazard regression).
- Navigation returns accurate references/definitions on a fixture project.

## notes

Reuses r00012 (ast-grep probe) and fs-containment. Directly addresses the
"merged codemods silently corrupt files" data-loss hazard the project has hit
before. Prior art: ast-grep, ts-morph, jscodeshift, Sourcegraph batch changes.
