---
id: f00120
kind: feat
title: project→plugin generator + wiring-doctor — turn a project (or part of it) into a fully-wired mcp-vertex plugin, automatically
status: in-progress
date: 2026-07-23
track: plugin+scaffold+dx
---

# f00120 — project→plugin generator + wiring-doctor

## goal

A `create_plugin` tool (and `mcpv plugin new` command) that turns any project
— or a chosen folder/glob within one — into a **fully-wired** mcp-vertex
plugin with **zero manual monorepo edits**, plus a `verify:plugin-wiring`
gate that fails a half-wired plugin. Today, adding an internal plugin needs
the same six hand-edits every time (documented, error-prone): `tsconfig.base`
paths, `vitest.shared` aliases, `PLUGIN_DEFAULTS`, `release-plan`
`PUBLISH_ORDER`, `preset-catalog` membership, and a catalog regen. This
automates all six and scaffolds the plugin package (contract, a sample tool,
tests, README, LICENSE) so authoring a plugin — including one extracted from
an existing project — is one command.

## why

This is the user's "que sea automatizado que se pueda crear plugin del
proyecto que lo use o de partes del proyecto" — and the single highest
dogfooding win: the mcp-vertex monorepo adds internal plugins constantly and
every one costs the same six cross-cutting edits, which is exactly where
mistakes and half-wired plugins come from. Automating it makes **every**
future plugin on this roadmap cheaper and correct-by-construction, and gives
adopters a first-class way to package their own project's reusable logic as an
mcp-vertex plugin.

## why this design

Compose the existing `scaffold` seam (`scaffold-host.ts`,
`scaffold-extension-host.ts`) rather than a parallel generator. The
monorepo-wiring writer is a set of **pure, idempotent editors** over an
injected fs (read file → compute new content → write), each re-runnable and
each unit-tested, so a re-run never double-inserts. Extraction (project→plugin)
is deliberately conservative: it identifies exported **pure functions** in the
target folder and emits tool **stubs** that wrap them (with input/output Zod
schemas inferred where possible), leaving the human to confirm — it never
guesses business logic. The wiring-doctor is the inverse: a checker that
asserts all six wiring points exist and agree, reused by both the generator
(post-write self-check) and CI.

## non-goals

- No npm publishing and no AI-authored tool logic — it scaffolds + wires;
  the human writes/*confirms* the tool bodies.
- Does not remove human review — generated stubs are marked TODO and fail no
  gate until implemented.
- No change to the plugin contract or to how plugins load — it only writes the
  files/edits an author would write by hand.
- Not a replacement for `create_project` (whole-repo scaffolding) — this
  targets **plugin** creation/extraction specifically.

## architecture

Reused: `scaffold-host.ts`, `scaffold-extension-host.ts`, the file-conventions
contract, `PLUGIN_DEFAULTS`, `preset-catalog.ts`, `release-plan.ts`
`PUBLISH_ORDER`, the catalog generator. Added: a blueprint renderer, six
idempotent wiring editors behind one `wirePluginIntoMonorepo(deps)` façade,
a pure extraction analyzer, and the `verify:plugin-wiring` checker.

## slices

### S1 — plugin blueprint scaffolder

- **Status**: done (2026-07-24)
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts` (scaffoldPluginFiles), `packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts`, `packages/core/src/public/index.ts` (scaffoldPluginFiles export)
- **Gate**: bun run validate

From `{name, description, sampleToolId}`, render a complete plugin package:
`src/index.ts` (`definePlugin`), a sample tool + its contract types, `public`
barrel, `package.json`, `tsconfig.json`, `vitest.config.ts`, README, LICENSE,
and a passing sample spec — mirroring the shape of an existing internal plugin.

S1 deliverable (this commit): extended `scaffoldPluginFiles` in
`scaffold-host.ts` to emit the four files the scaffolder was missing
(vitest config + LICENSE + public barrel + a passing sample spec).
Spec added with 4 positive cases (vitest config shape, sample spec
id assertions, LICENSE current-year, scaffold report round-trip). The
spec suite passes 20/20 from `bun test packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts`.

Close evidence: pure `plugin-blueprint` renderers now emit the 9-file plugin
package under `plugins/<name>/`, expose the public scaffold surface from core,
and the scaffold spec asserts package metadata, config inheritance, LICENSE
fidelity, README branding, and sample-tool wiring for `demo.echo`.

### S2 — idempotent monorepo wiring writer

- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/wire-plugin.ts`, `packages/core/src/lib/contracts/interfaces/plugin-wiring.interface.ts`
- **Gate**: bun run validate

Six pure, idempotent editors over injected fs: `tsconfig.base` paths,
`vitest.shared` aliases, `PLUGIN_DEFAULTS` entry, `release-plan`
`PUBLISH_ORDER`, `preset-catalog` membership (optional pack), and a catalog
regen hook. Re-running is a no-op. Each editor unit-tested on fixture files.

### S3 — project→plugin extraction analyzer

- **Status**: done (2026-07-24)
- **Files**: `packages/core/src/lib/scaffold/extract-plugin.ts`, `packages/core/tests/src/lib/scaffold/extract-plugin.spec.ts`, `packages/core/src/public/index.ts`
- **Gate**: bun run validate

Given a folder/glob, find exported pure functions and emit tool stubs wrapping
them (Zod in/out inferred from signatures where possible), each marked TODO
for human confirmation. Pure over an injected file reader + a lightweight AST
pass; never emits business logic it didn't find.

S3 deliverable (this commit): `extractPlugin()` in
`packages/core/src/lib/scaffold/extract-plugin.ts` — TypeScript Compiler API
pass that finds exported function declarations and arrow/function expressions,
infers Zod schemas conservatively from parameter / return types, emits
TODO-marked tool stubs + per-tool spec stubs + a generated `src/index.ts`.
The injected `readFile` is the test seam; the default is a real read at
`extractPlugin` call time. Spec covers 4 cases (file discovery, fn
extraction, side-effect skip, schema stub round-trip). 26 targeted tests
pass.

### S4 — wiring-doctor gate + create_plugin tool + CLI command

- **Status**: done (2026-07-24)
- **Files**: `packages/core/src/lib/scaffold/create-plugin.tool.ts`, `packages/core/src/lib/scaffold/scaffold-tool.ts`, `packages/core/src/lib/scaffold/diagnose-plugin-wiring.ts`, `packages/core/tests/src/lib/scaffold/create-plugin.tool.spec.ts`, `packages/core/src/public/index.ts`, `packages/core/src/generated/tool-outputs.ts`, `tools/scripts/verify/plugin-wiring.script.ts`, `tools/scripts/verify/plugin-wiring.script.ts` (doctor rewrite to use `diagnosePluginWiring`), `packages/cli/src/commands/groups/core.ts` (plugin new command), `packages/cli/src/contracts/constants/help-translation.constant.ts`, `packages/cli/src/commands/groups/core.spec.ts`, `packages/cli/src/commands/registry.spec.ts`, `packages/cli/src/commands/groups/plugin-new.spec.ts`, `package.json` (`verify:plugin-wiring` script + `validate` chain)
- **Gate**: bun run validate

`verify:plugin-wiring` fails when any of the six points is missing or
inconsistent for a plugin dir. `create_plugin` tool + `mcpv plugin new`
compose S1→S3 then self-check with the doctor. An `external-install`-style
smoke proves a generated plugin passes `validate` with zero manual edits.

S4 deliverable (this commit): `runCreatePlugin` in
`packages/core/src/lib/scaffold/create-plugin.tool.ts` composes the S1
plugin-blueprint scaffold + S3 extraction + S2 wirePluginIntoMonorepo, then
runs `diagnosePluginWiring` as a self-check. CLI wired through
`packages/cli/src/commands/groups/core.ts` (`mcpv plugin new <name> --description=... [--dry-run]`)
with help text + i18n summary + spec. The doctor at
`tools/scripts/verify/plugin-wiring.script.ts` is rewritten to delegate to
`diagnosePluginWiring` from core (instead of inlining the wiring logic),
and is now invoked via `bun run verify:plugin-wiring` for any plugin id.
`package.json` wires `verify:plugin-wiring` into the `validate` chain.

**Doctor fix (same commit):** `diagnosePluginWiring`'s `vitest-shared`
needle was too strict — it required `@mcp-vertex/demo` (no preceding
backslash) while the real `vitest.shared.ts` carries JS RegExp literals
with escaped slashes (`@mcp-vertex\/demo`). The regex now accepts both
forms; the `plugin-defaults` check now accepts single-quoted keys
(`'auto-agent-selector': {},`) — the canonical form in the live
`plugin-defaults.ts`. Two new unit tests in
`packages/core/tests/src/lib/scaffold/wire-plugin-doctor.spec.ts` lock
down both forms. After the fix, `verify:plugin-wiring auto-agent-selector`
is fully wired (it was 2-of-6 before the fix).

Smoke results: `verify:plugin-wiring auto-agent-selector` reports
**fully wired** (was 2-of-6 before the fix). Spec covers 4 cases
(scaffold + wire + self-check, surface doctor failures, reject
kebab-incompatible names, dry-run no-op). 4 targeted tests pass.

Acceptance gate: `bun run validate` is green; `bun run lint:proposals`
reports 0 fatals; `bun run catalog:check` is up to date; `bun run test
packages/core/tests/src/lib/scaffold/` reports 45 pass / 0 fail across
7 files.

## acceptance

- `bun run validate` → exit 0 (incl. `catalog:check`, `verify:tools`,
  `types-in-contracts`, `release-plan.spec`).
- `mcpv plugin new demo` (or `create_plugin`) produces a plugin that
  `overview` lists and `validate` accepts with **zero** manual monorepo edits.
- Extraction over a sample folder emits compiling tool stubs wrapping its
  exported pure functions.
- `verify:plugin-wiring` fails a deliberately half-wired plugin (e.g. missing
  `PUBLISH_ORDER` entry) and passes a fully-wired one.

## notes

Highest-dogfooding item on s00001; unblocks cheap creation of every later
plugin. Pairs with r00011 (a generated plugin can be added to a pack) and
r00012 (generated scanner plugins consume the shared core).
