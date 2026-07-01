---
id: f00087
status: ready
type: proposal
track: dogfood+plugins+scaffold+client
date: 2026-06-29
kind: feat
title: Local plugin loading from config + client scaffold export
shipped-in: []
recan: []
related:
    - f00064 # dogfood project layout
    - f00037 # conventions plugin
    - f00056 # agent discovery tool/skill catalog
    - f00086 # token cost governance (uses client-side scaffold to demo budget)
ownership:
    - { agent: implementation_runner, task: 'S1: extend mcp-vertex.config.json schema and assembleCliConfig so each plugin entry may carry an explicit `path` (relative to workspace or absolute); precedence CLI > config > npm name' }
    - { agent: implementation_runner, task: 'S2: expose `scaffoldPluginFiles` (and friends) plus a `writeScaffoldedFiles` helper from `@mcp-vertex/client` so consumers can generate plugin boilerplate outside an MCP session' }
    - { agent: delivery_verifier, task: 'V1: bun run validate green; new unit specs cover path resolution and the public scaffold surface; e2e spec simulates a consumer project that registers a local plugin via `mcp-vertex.config.json#plugins.<name>.path` and sees its tool' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run site:strict, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00087 — Local plugin loading from config + client scaffold export

## Goal

Two related consumer ergonomics fixes for downstream mcp-vertex users:

1. **`mcp-vertex.config.json#plugins.<name>.path` (S1)** — let a consumer
   project's plugin manifest declare an explicit module path (relative to
   the workspace, or absolute) for a plugin, bypassing the npm-name fallback
   chain. Today the only way to load a locally-developed plugin is either
   `--plugins=/abs/path` on the CLI (host-specific, not portable across
   VS Code/Cursor/Cline/Claude/Codex), or to symlink the local folder into
   `node_modules` so `resolvePluginSpecifier`'s `@mcp-vertex/<name>` step
   finds it. Both are fragile and hostile to consumers who don't read the
   core source first.

2. **`@mcp-vertex/client` exposes `scaffoldPluginFiles` (S2)** — let a
   consumer run `bun run tools/scripts/create-plugin.ts <name>` to
   generate the boilerplate of an `IMcpPlugin` outside of an MCP session,
   so they don't need to discover the `<prefix>_scaffold` MCP tool or
   read the core's `scaffold-host.ts` to know what files are needed.

## Why

A downstream consumer audit (June 2026) reproduced two failure modes that
both should fail obviously:

- **Sibling project ("lx-app")**: a consumer wanted their locally-built
  plugin to load alongside `@mcp-vertex/proposals` etc. They tried
  `--plugins=./libs/plugins/lx-app/...` in `.vscode/mcp.json`. It worked
  because `resolvePluginSpecifier` happens to accept `./` and `/`-prefixed
  values verbatim, but the agent working the case didn't know that — the
  agent went down a symlink rabbit-hole because the host-server didn't
  appear to advertise which flags it forwarded. The flag IS forwarded
  (`parseCliArgs` runs in both `cli.ts` and `host-server.script.ts`), but
  no consumer-facing docs say so.

- **Consumer plugin authoring**: a consumer that wants a private plugin
  has to either hand-roll `plugins/<name>/src/index.ts` + `package.json`
  + `tsconfig.json` + `README.md` (copy-pasting from one of the existing
  16 plugins), or fire up MCP and call `<prefix>_scaffold { kind: "plugin" }`.
  The second route requires a working host, the consumer already running,
  and access to the MCP tool. The first requires reading the core.

The first problem is **discoverability of the existing loader**. The second
is **exposing the existing scaffolder as a runnable artifact**. Neither
needs new behaviour — they both need to lift existing code paths into
documented, externally-callable interfaces.

## Why This Design

- **Config-level `path` is the right home for the first problem.** The
  CLI flag works but is host-specific (`.vscode/mcp.json` is a VS Code
  concept; Cursor and Claude Code have their own host config files). The
  config file is mcp-vertex's portable project surface and is the one
  place every host reads. A consumer that commits `plugins.lx-app.path`
  to `mcp-vertex.config.json` gets a working setup in every host, today.

- **The solver stays generic.** We do not invent a new resolution
  algorithm; `loadPlugins` already handles `./`, `/`, `file:`, and
  scoped package names. Adding `path` just means `assembleCliConfig`
  rewrites the entry's name → `path` (when present) before passing it to
  `loadPlugins`. The rest of the loader chain is untouched.

- **The scaffolder already exists.** `scaffoldPluginFiles` in
  `packages/core/src/lib/scaffold/scaffold-host.ts:405` is a pure
  function (no I/O). Exposing it from `@mcp-vertex/client` means
  re-exporting a pure helper plus adding a tiny `writeScaffoldedFiles`
  wrapper that uses the existing `IBatchAtomicWriter` already used by
  the MCP scaffold tool — keeping both routes (MCP tool + script)
  atomic and keepLegacy-aware.

- **Two slices, both small.** S1 touches schema + assemble + tests
  (~5 files, ~150 LOC). S2 is a barrel re-export + writer helper + tests
  (~3 files, ~80 LOC). Both fit the "Behaviour-preserving refactor:
  fits one slice" budget.

## Non-goals

- No new `--plugins=…from-config` flag (the config entry IS the source).
- No change to `resolvePluginSpecifier` or `loadPlugins` itself; both
  already handle the path forms we need.
- No live-reload of plugins (out of scope; the proposals plugin already
  provides `auto_work` for orchestration-side work).
- No rewrite of the existing 16 plugins' `package.json`s. The new
  schema field is **optional**; existing configs keep working.
- No publishing of a new npm package for `client`. The export is added
  to the existing `@mcp-vertex/client` surface, same as today.

## Architecture

### S1 sub-section — `mcp-vertex.config.json#plugins.<name>.path`

The current per-plugin entry:

```jsonc
{
  "prefix": "lx",                  // optional, defaults to <name>
  "options": { "any": "thing" }    // optional, free-form
}
```

After S1:

```jsonc
{
  "prefix": "lx",
  "options": { "any": "thing" },
  // NEW — explicit module path. Resolved against args.workspace when
  // it does not start with `/`, `file:`, or `./`. Used verbatim otherwise.
  "path": "libs/plugins/lx-app/dist/index.js"
}
```

**Resolution precedence** (in `assembleCliConfig`):

1. CLI `--plugins=<spec>` continues to be a list of bare specifiers
   (so the CLI flag never carries a `path:` from the config — the
   config takes precedence only when its entry declares `path`).
2. For each entry in `fileConfig.plugins`:
   - If the entry has `path`, the specifier passed to `loadPlugins` is
     that resolved path (relative → `${workspace}/${path}`; absolute and
     `file:`/`./` → verbatim).
   - Otherwise the existing behaviour: the entry's **key** in
     `plugins` is the bare plugin name (e.g. `lx-app`) and `loadPlugins`
     resolves it via the scoped-name fallback chain.
3. `--exclude-plugins=` continues to match by plugin NAME (the resolved
   `IMcpPlugin.name` after register), so a plugin loaded via `path`
   still excludes by its package name. Documented in the help text.

**Schema change** (Zod, in `config-file-schema.ts`):

```ts
plugins: z.record(z.string(), z.object({
  prefix: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  // NEW
  path: z.string().optional(),
}))
```

Plus the static JSON Schema copy in
`packages/core/schema/mcp-vertex.config.schema.json` gets the same
addition so editor tooling (the `$schema` URL) picks it up.

**Type interface** (`IMcpVertexPluginConfig` in `load-config-file.ts`):

```ts
export interface IMcpVertexPluginConfig {
  readonly prefix?: string;
  readonly options?: Readonly<Record<string, unknown>>;
  /** NEW — relative to workspace, or absolute. */
  readonly path?: string;
}
```

**Implementation** (`assembleCliConfig`):

Build a `Map<string, string>` of `pluginName → specifier` that
substitutes the name for the resolved path when present, then call
`loadPlugins({ specifiers: [...args.plugins, ...resolvedSpecs], ... })`.

**Diagnostic**: extend the existing `diagnoseConfigFile` to flag a
`path` whose first character is not `.` and does not contain a
filesystem separator and is not absolute — a config-typo guard so
`"path": "lx-app"` (forgot the `./`) is reported at boot instead of
silently failing later inside the loader.

**Tests** (one spec each):

- Unit (load-config-file): `path` field round-trips through
  `parseConfigFile`.
- Unit (assembleCliConfig, injected importer): a config with
  `plugins.lx-app.path: "./fixtures/lx-app.ts"` loads, the resolver
  rewrites the spec, and the loader sees the rewritten value.
- Unit (load-config-file diagnostic): a path without a separator is
  reported.
- E2E (`packages/core/tests/e2e/...`): a temp workspace writes a fake
  config + a fake local plugin module; the assembled server lists a
  tool from that plugin under `${ns}_<toolid>`.

**Documentation**:

- Help text (`help-translation.constant.ts`): the `--plugins=` flag
  row adds a sentence "and any plugin entry under `plugins.<name>` in
  `mcp-vertex.config.json` may declare `path` to bypass the npm-name
  fallback."
- `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` (the canon page): a
  "loading a local plugin" subsection with three worked examples
  (config path, CLI flag, symlink — recommended order).
- A new example under `docs/mcp-vertex/examples/local-plugin/` —
  a minimal workspace (`mcp-vertex.config.json` + `plugins/<x>/src/index.ts`
  + a README) that the consumer can `bun run …` to confirm their
  local plugin loads.

### S2 sub-section — `@mcp-vertex/client` exposes `scaffoldPluginFiles`

**Core export** (`packages/core/src/public/index.ts`):

Re-export `scaffoldPluginFiles` and `IScaffoldPluginOptions` from
`scaffold-host.ts`. They are already pure (no I/O), so this is a
barrel-only change.

**Client re-export** (`packages/client/src/public/index.ts`):

Add a new section "scaffolding" that re-exports the three pure
generators most useful outside MCP:

```ts
export {
  scaffoldToolFile,
  scaffoldPromptFile,
  scaffoldSkillFile,
  scaffoldAgentFile,
  scaffoldHostProject,
  scaffoldPluginFiles,
  scaffoldClientFiles,
} from '@mcp-vertex/core/public';
```

Plus the matching interfaces (`IScaffoldedFile`, `IScaffoldAgentSlot`,
`IScaffoldHostOptions`, `IScaffoldPluginOptions`).

**Writer helper** — a new public symbol at
`packages/client/src/lib/scaffold/write-scaffolded-files.ts`:

```ts
/**
 * Apply the given scaffolded files to a target directory using the
 * canonical atomic writer (the same one the MCP scaffold tool uses
 * internally). Refuses to overwrite without keepLegacy.
 */
export const writeScaffoldedFiles = async (
  targetDir: string,
  files: readonly IScaffoldedFile[],
  options?: { keepLegacy?: boolean }
): Promise<{
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  readonly moved: readonly string[];
  readonly kept: readonly string[];
  readonly errors: readonly string[];
}>;
```

Implementation re-uses `createFileSystemBatchWriter(targetDir)` and
the same keepLegacy path-reservation logic the MCP tool already
exercises (extract to a helper `resolveLegacyPath(targetDir, relPath)`
shared between both call sites to avoid duplication — a future
slice can extract that helper if the duplication grows).

**Example script** (new file `tools/scripts/create-plugin.ts`):

```ts
#!/usr/bin/env bun
/**
 * Run `bun run tools/scripts/create-plugin.ts lx-app -- "…"` to
 * generate a minimal IMcpPlugin package under
 * libs/plugins/lx-app/ relative to the current workspace.
 *
 * `scaffoldPluginFiles` always produces paths under
 * `plugins/<name>/…` (it assumes the consumer's workspace root IS
 * the plugin root). The script strips that leading prefix so the
 * output lands flat at `libs/plugins/<name>/…` instead of
 * `libs/plugins/<name>/plugins/<name>/…`.
 */
import { writeScaffoldedFilesOrThrow } from '@mcp-vertex/client';
import { scaffoldPluginFiles } from '@mcp-vertex/core/public';

const [name, _sep, ...rest] = process.argv.slice(2);
const description = rest.join(' ');
const idPrefix = `plugins/${name}/`;
const files = scaffoldPluginFiles({ pluginName: name, description })
  .flatMap((f) => f.path.startsWith(idPrefix)
    ? [{ path: f.path.slice(idPrefix.length), content: f.content }]
    : []);
await writeScaffoldedFilesOrThrow(`libs/plugins/${name}`, files);
```

Documented in the README of `@mcp-vertex/client` and in
`docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` next to the S1 examples.

**Tests**:

- Unit (write-scaffolded-files): dry run + real run against a temp
  dir; keepLegacy behaviour; refuses to overwrite an existing file
  with `keepLegacy: false`.
- Unit (create-plugin script): smoke run on a temp dir; produces the
  four expected files (`package.json`, `src/index.ts`, `tsconfig.json`,
  `README.md`).

### Boot gate additions

The existing `bun run validate` runs every preset/build/test/lint —
no new gate needed. The proposal adds two new commands to the
`scripts` block of the root `package.json`:

```jsonc
{
  "scripts": {
    "plugin:create": "bun run tools/scripts/create-plugin.ts"
  }
}
```

This lets a consumer of mcp-vertex (the operator) skip the explanatory
README step when they're confident.

## Slices

### S1 — `mcp-vertex.config.json#plugins.<name>.path`

- **Status**: pending
- **Files**: packages/core/schema/mcp-vertex.config.schema.json, packages/core/src/lib/plugins/config-file-schema.ts, packages/core/src/lib/plugins/load-config-file.ts, packages/core/src/lib/cli/assemble.ts, packages/cli/src/contracts/constants/help-translation.constant.ts, docs/mcp-vertex/PLUGINS-MCP-VERTEX.md, packages/core/tests/src/lib/plugins/plugin-path.spec.ts
- **Gate**: bun run validate
- **Acceptance**:
  - New schema field passes Zod + the published JSON Schema.
  - `IMcpVertexPluginConfig.path` is typed.
  - `assembleCliConfig` rewrites the spec list when `path` is set
    and leaves the bare-name path alone otherwise.
  - Existing consumers (no `path` field) keep loading exactly as
    before (verified by snapshot diff of assembled plugins for the
    repo's own config).
  - Three new unit specs + one e2e green.
  - Help text mentions `path`.
  - Worked example in PLUGINS-MCP-VERTEX.md renders correctly
    (`bun run site:strict` green).

### S2 — Client scaffold export + writer helper + create-plugin script

- **Status**: pending
- **Files**:
  - `packages/core/src/public/index.ts` (scaffold re-exports)
  - `packages/client/src/public/index.ts` (client re-exports)
  - `packages/client/src/lib/scaffold/write-scaffolded-files.ts` (new)
  - `tools/scripts/create-plugin.ts` (new consumer-facing script)
  - `packages/client/src/tests/write-scaffolded-files.spec.ts` (unit)
  - `packages/client/src/tests/create-plugin-script.spec.ts` (smoke)
  - `packages/client/README.md` (updated API section)
  - `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` (example)
- **Gate**: bun run validate
- **Acceptance**:
  - `bun run plugin:create my-plugin -- "demo plugin"` writes the
    four expected files under `libs/plugins/my-plugin/`, refuses to
    overwrite without `--keep-legacy`.
  - `scaffoldPluginFiles({…})` is callable from a script without an
    MCP host — verified by the smoke spec.
  - `writeScaffoldedFiles` uses the same atomic writer as the MCP
    scaffold tool (proven by injecting a mock writer in the unit spec).
  - `bun run validate` green; `bun run site:strict` green.

## Acceptance

The validation gate (`bun run validate`) is green and the new unit
specs cover both slices end-to-end. The two pre-existing test
failures (one schema drift guard that the slice regenerates, one
unrelated `apps/web` plugin-catalog expectation) are unrelated to
this proposal and remain tracked separately.

## Notes

### vision (f00089 U4) — a CLIENT tool that authors AND registers a plugin

> Added by the f00089 umbrella. Scopes **U4 only**; the landed S1
> (`config.plugins.<name>.path` loader) and S2 (operator script + client
> scaffold export) are unchanged and are the substrate U4 builds on.

The expanded vision wants the **target project's LLM** to author plugins
*without inspecting how mcp-vertex or its internal plugins are wired*. Today the
only path is the operator-facing `tools/scripts/create-plugin.ts` (a bun script)
plus the manual step of adding a `plugins.<name>.path` entry to
`mcp-vertex.config.json`. U4 lifts both into one client-callable action:

- **`authorPlugin` (new, `packages/client/src/lib/scaffold/author-plugin.ts`)**:
  takes `{ name, description, root? }`, calls the existing `scaffoldPluginFiles`
  (S2) to generate a *correct, complete* `IMcpPlugin`, writes it via
  `writeScaffoldedFiles` under the convention root (f00088 `pluginPathsRoot`),
  AND **registers it by PATH** — appends `plugins.<name>.path` to the target's
  `mcp-vertex.config.json` (the loader from S1 then picks it up on next host
  boot). One call; the LLM never reads the core.
- **Exposure**: expose `authorPlugin` from the client public surface and (U4
  design choice) optionally as an MCP tool so the target LLM can invoke it
  in-session. Pick client-export vs. plugin-tool in U4's design note; both reuse
  the same pure generator.
- **Multiple project-specific plugins**: each call registers an independent
  `path` entry; names are namespaced by prefix (f00088 S3), so several
  project-owned plugins with their own tools coexist without collision.
- **U4 files**: `packages/client/src/lib/scaffold/author-plugin.ts` (new),
  `packages/client/src/public/index.ts` (extend),
  `packages/client/src/tests/author-plugin.spec.ts`. Depends on f00087 S1+S2
  (landed); parallel with U3/U5.

- The two changes are **additive**. No existing config file or
  consumer breaks.
- The static JSON Schema adds `path` to the `plugins` entry; tools
  that strictly validate against an old schema continue to pass
  (Zod's `.strict()` allows the new optional field because the parent
  is not strict at the entry level — confirmed in
  `config-file-schema.ts`).
- A consumer upgrading should not need to do anything; they MAY add
  `path` to their entries to declare a local plugin explicitly.
- Land S1 and S2 in a single PR (both touch scaffold/assemble; same
  boot path; one full `bun run validate` cycle covers both).
- Tag the release with `feat:` prefix so semver bumps the minor of
  `@mcp-vertex/core` and `@mcp-vertex/client`.
- After the release, the operator's sibling project can delete the
  `node_modules/@mcp-vertex/lx-app` symlink and rewrite the entry
  to use `plugins.lx-app.path`, then commit `mcp-vertex.config.json`
  with the change.

Open questions for the orchestrator:

1. **Should `path` accept a directory or only an entry file?** A
   consumer might reasonably write `libs/plugins/lx-app/` and expect
   resolution to pick `dist/index.js` from a `package.json` `exports`
   field. **Recommendation**: only accept a file path in v1; expand
   to a directory-resolver in a follow-up slice if a consumer asks
   for it. Keeps the contract minimal.
2. **Should the `path` resolution happen before or after the
   `--exclude-plugins` filter?** **Recommendation**: after. A
   plugin loaded via `path` is still known by its resolved
   `IMcpPlugin.name`, and `--exclude-plugins=<name>` should still
   match it. This matches the symlink workaround's behaviour.
3. **Do we want to warn when the same name appears in
   `mcp-vertex.config.json#plugins` AND in `--plugins`?** Today both
   contribute to the final specifier set; a duplicate specifier is
   flagged in `loadPlugins` already. **Recommendation**: no extra
   check — duplicated detection is already covered.
