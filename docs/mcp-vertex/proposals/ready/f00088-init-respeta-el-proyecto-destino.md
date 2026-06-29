---
id: f00088
status: ready
type: proposal
track: cli+bootstrap+onboarding+conventions
date: 2026-06-29
kind: feat
title: init respects the target project's conventions and language
shipped-in: []
recan: []
related:
    - f00084 # init command that this proposal amends
    - f00087 # local plugin loading (uses namespace awareness too)
    - f00037 # file conventions (suffix/folder) that init must respect
    - f00081 # namespace-aware client services (init produces the namespace the client reads)
    - f00056 # agent discovery (init reads the same catalog)
ownership:
    - { agent: implementation_runner, task: 'S1: detect the target project (language, framework, package manager, monorepo tool, MCP evidence) by re-using the core `analyzeProject` analyzer; expose the result on `IInitAnswers.detected` and gate "copy core skills" + "migration offer" on it' }
    - { agent: implementation_runner, task: 'S2: replace the hardcoded `/home/cartago/_proyectos/propios/mcp-vertex/tools/scripts/...` path in `renderVscodeMcpJson` with a resolver that picks the canonical install path for the consumer (npm-installed `@mcp-vertex/core`, sibling checkout, or explicit `--mcp-vertex-root` flag)' }
    - { agent: implementation_runner, task: 'S3: localize the agent descriptor fallback (init-catalog.ts) using the operator locale; honour the resolved namespace prefix (not the hardcoded `mcp-vertex_*`) so generated `.github/agents/*.md` tools match what `init` actually produces in `mcp-vertex.config.json`' }
    - { agent: implementation_runner, task: 'S4: respect the consumer convention for generated code paths — when the project uses `libs/` (Angular/monorepo) or `src/` (NestJS) or `packages/` (yarn workspaces), write under the matching root instead of always `plugins/<name>/`; document the discovered root in `mcp-vertex.config.json#pluginPathsRoot`' }
    - { agent: delivery_verifier, task: 'V1: bun run validate green; new unit specs cover analyze-detection routing, mcp.json path resolution, locale-aware agent fallback, and convention-aware plugin root selection; e2e spec spawns the CLI against a fixture project that simulates a real Angular workspace' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run lint:cli:i18n, expect: exit0 }
    - { command: bun run lint:cli-coverage, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run cli -- init --help, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00088 — init respects the target project's conventions and language

## goal

Make `mcpv init` (f00084) **integrate with the target project** instead of
overwriting it with mcp-vertex's own defaults. Today, the command:

- **Hardcodes a path** to `/home/cartago/_proyectos/propios/mcp-vertex/tools/scripts/host/host-server.script.ts` in every generated `.vscode/mcp.json` ([init-render.ts:103-119](packages/cli/src/commands/init/init-render.ts#L103-L119)). The path only resolves in the operator's own checkout — every other consumer gets a broken `.vscode/mcp.json` until they hand-edit it.
- **Hardcodes Spanish descriptions and tool names** for the agent fallback ([init-catalog.ts:36-90](packages/cli/src/commands/init/init-catalog.ts#L36-L90)). A project whose operator speaks English, French, or German gets agents whose `description` and `body` are Spanish regardless.
- **Hardcodes `mcp-vertex_*` tool names** in those same agents — but the resolved namespace prefix may be `acme_*`, `lx_*`, etc. when the user follows f00081 (namespace-aware client services). The generated agents reference tools the project does not actually expose.
- **Writes under hardcoded paths** (`plugins/<name>/`, `docs/mcp-vertex/`, `.github/agents/`) without inspecting what the project already uses. A NestJS project that lives under `src/`, an Angular workspace under `libs/`, or a yarn-workspaces monorepo under `packages/<scope>/<pkg>/` all get `mcp-vertex`-shaped folders that fight their own conventions.
- **Doesn't read `analyzeProject`** (f00056) before prompting, even though the analyzer already detects language, framework, package manager, monorepo tool, MCP evidence, and CI. The init command re-implements a subset of that detection by hand.

The fix is one proposal because the same root cause (init never looks at the
project before writing) hits all four symptoms. After this slice lands:

```text
$ cd ~/code/my-angular-app
$ bunx @mcp-vertex/core init
✓ detected: typescript + Angular 18 + bun + yarn-workspaces + nestjs-style src/
✓ namespace prefix: 'mcp-vertex' (default; press Enter to keep, type to override)
?  How to centralize host-instructions? (1-3) [1]: 1
?  Copy core skills into libs/mcp-vertex/skills/? (y/n) [y]: y
?  Generate .github/agents/mcp-vertex-*.agent.md from the live catalog? (y/n) [y]: y
?  Scaffold the first migration proposal? (y/n) [y]: y
   ✓ wrote mcp-vertex.config.json (pluginPathsRoot: libs/)
   ✓ wrote .vscode/mcp.json (host path: @mcp-vertex/core — npm install)
   ✓ wrote libs/mcp-vertex/skills/manifest.json
   ✓ wrote .github/agents/mcp-vertex-orchestrator.agent.md (English, namespace=mcp-vertex)
   ✓ wrote docs/mcp-vertex/proposals/ready/f00001-migrate-legacy-my-angular-app.md
```

The four output files now match the project's conventions (folder layout,
language, namespace) and respect what is already there.

## why

Operators integrating mcp-vertex into an existing project (Angular, NestJS,
Express, Fastify, Rust, Python, Go) report two recurring pains:

1. **Generated files look foreign.** `init` produces `.vscode/mcp.json`,
   `mcp-vertex.config.json`, `.github/agents/*.md` etc. with mcp-vertex's
   own conventions — not the project's. The operator then has to
   hand-edit or move the files, defeating the purpose of an `init`.
2. **Re-running `init` overwrites context.** Today, `mcp-vertex.config.json`
   is rewritten from scratch (refuses without `--force`), and the agent
   files are written from scratch (no merge mode). Operators who try
   `init` once on a half-configured project lose work.

This proposal treats `init` as **additive integration**, not **greenfield
bootstrap**: detect first, then add the missing pieces, never replace what
the project already has.

## why this design

**Reuse `analyzeProject`, don't reinvent detection.** The core analyzer
already produces the exact signals this slice needs (language, framework,
package manager, monorepo tool, MCP evidence, CI). `init` should call it
once and consume the result, the same way `bootstrap-tool` and
`plan_mcp_project` already do. Adding a second detection path would drift
from the catalog the bootstrap ships with.

**Namespace resolution is read-only, the prefix is the operator's choice.**
The default `mcp-vertex` namespace comes from the CLI's `--prefix` flag
(see f00081 S1); the operator may override it per-project. Init should
honour the override and propagate it into the generated agent files so
the tools they reference (`mcp-vertex_proposals_auto_work` etc.) match
what the running server actually exposes.

**Locale is the operator's, not the catalog's.** Agent descriptions should
follow the operator's `--locale` (or the LANG env var when the CLI runs
non-interactively). Today the catalog is Spanish-only — we extract every
human-facing string into the same i18n module every other CLI string
lives in (`packages/cli/src/i18n/`).

**Convention root is data, not a literal.** The plugin path root
(`plugins/` today) should be derivable from the project shape:

| Detected shape | Default `pluginPathsRoot` |
|---|---|
| Angular workspace (`angular.json` present) | `libs/` |
| Nx monorepo | `libs/` |
| Yarn / pnpm workspaces with `packages/*` | `packages/` |
| Bun workspaces with `packages/*` | `packages/` |
| Single-package TypeScript (no monorepo) | `plugins/` |
| Python (`pyproject.toml` + no JS) | `plugins/` |
| Go / Rust | `plugins/` |

The operator can always override with `--plugin-paths-root=<path>`; the
detected value is the default.

## non-goals

- No rewrite of `analyzeProject` itself — the analyzer is already correct;
  this slice consumes its output.
- No new locale translations beyond English — the slice ships English as
  the canonical locale and adds the i18n hook so future locales plug in
  the same way every other CLI string does.
- No change to the canonical `mcp-vertex.config.json` schema.
- No change to the f00084 acceptance criteria for the greenfield case —
  an empty workspace still produces the same bundle as today (the
  detection layer falls back to defaults when no project shape is
  detected).

## architecture

### S1 — detect the target project

**New module** `packages/cli/src/commands/init/init-detection.ts`:

```ts
/**
 * Run the core `analyzeProject` against the target workspace and
 * project the result onto a small, init-relevant subset the rest of
 * `init` consumes. Pure: takes an `IFileReader` (default: real disk,
 * tests inject in-memory) and returns `IInitDetection`.
 */
export interface IInitDetection {
  readonly language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'unknown';
  readonly framework: string | undefined;
  readonly packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | 'unknown';
  readonly monorepoTool: string | undefined;
  readonly hasMcpProject: boolean;
  readonly pluginPathsRoot: string; // derived from the table above
  readonly hostEntryPath: string; // resolved in S2
  readonly sourceRoot: 'libs' | 'packages' | 'plugins' | 'src';
}

export const detectTargetProject = async (
  workspace: string,
  options?: {
    reader?: IFileReader;
    explicitPluginPathsRoot?: string;
  },
): Promise<IInitDetection>;
```

**Schema change** ([init-answers.schema.ts](packages/cli/src/commands/init/init-answers.schema.ts)):

```ts
export const InitAnswers = z.object({
  // ... existing keys ...
  /** Populated by S1 before any prompt renders; never asked of the user. */
  detected: z.object({
    language: z.string(),
    framework: z.string().optional(),
    packageManager: z.string(),
    monorepoTool: z.string().optional(),
    hasMcpProject: z.boolean(),
    pluginPathsRoot: z.string(),
    hostEntryPath: z.string(),
    sourceRoot: z.enum(['libs', 'packages', 'plugins', 'src']),
  }),
});
```

**Prompt flow** ([init-prompts.ts](packages/cli/src/commands/init/init-prompts.ts)):

After `detectTargetProject` runs, render a one-line summary so the operator
sees what was detected (`✓ detected: typescript + Angular 18 + bun + yarn-workspaces`). The "copy core skills" and "migration offer" prompts are gated on the detection: when `hasMcpProject === true`, the migration offer is skipped (a migration is unnecessary on a greenfield); when `language === 'python' | 'go' | 'rust'`, the "copy core skills" prompt is skipped with a hint that the convention docs don't apply yet.

### S2 — resolve the host entry path

**New module** `packages/cli/src/commands/init/host-entry-resolver.ts`:

```ts
/**
 * Resolve the absolute path to mcp-vertex's host-server script in the
 * order documented in PLUGINS-MCP-VERTEX.md:
 *   1. `--mcp-vertex-root=<abs>` flag (explicit override)
 *   2. `<workspace>/node_modules/@mcp-vertex/core/tools/scripts/host/host-server.script.ts`
 *   3. `<workspace>/../mcp-vertex/tools/scripts/host/host-server.script.ts`
 *      (sibling checkout — common dev workflow)
 *   4. `<workspace>/node_modules/@mcp-vertex/core/dist/host/host-server.js`
 *      (production npm install)
 *
 * Returns the first that exists; throws a typed error with the
 * attempted list otherwise so the operator gets a clear "did you
 * forget to install?" hint.
 */
export const resolveHostEntryPath = async (
  workspace: string,
  options?: { explicitRoot?: string; reader?: IFileReader },
): Promise<{ path: string; source: 'flag' | 'node_modules' | 'sibling' | 'npm_dist' }>;
```

**Renderer change** ([init-render.ts:103-119](packages/cli/src/commands/init/init-render.ts#L103-L119)):

```ts
const renderVscodeMcpJson = (hostEntryPath: string): IRenderedFile => ({
  relPath: '.vscode/mcp.json',
  content: JSON.stringify({
    servers: {
      'mcp-vertex': {
        type: 'stdio',
        command: 'bun',
        args: [
          hostEntryPath,
          '--workspace=${workspaceFolder}',
          '--config=${workspaceFolder}/mcp-vertex.config.json',
        ],
      },
    },
  }, null, '\t') + '\n',
});
```

The hardcoded path goes away; `renderInitBundle` threads the resolved
`hostEntryPath` from `IInitAnswers.detected`.

### S3 — locale-aware agent fallback + namespace propagation

**Refactor** ([init-catalog.ts](packages/cli/src/commands/init/init-catalog.ts)):

Replace the hardcoded `FALLBACK_AGENTS` array with a locale-keyed map.
The English fallback becomes the canonical set; other locales plug in
later the same way every other CLI string does.

```ts
type IFallbackAgentsByLocale = Readonly<Record<string, readonly IAgentDescriptor[]>>;

const FALLBACK_AGENTS_BY_LOCALE: IFallbackAgentsByLocale = {
  en: [
    { role: 'orchestrator', description: '…', tools: […]'namepace-aware', body: '…' },
    // …
  ],
  es: [ /* the current hardcoded set */ ],
};
```

**Namespace propagation**:

```ts
export const loadAgentDescriptors = async (
  workspace: string,
  options: { namespacePrefix: string; locale: string },
): Promise<readonly IAgentDescriptor[]>;
```

Every `tools: ['mcp-vertex_proposals_auto_work']` in the fallback becomes
`` tools: [`${options.namespacePrefix}_proposals_auto_work`] ``. The catalog
already returns its own tool lists correctly namespaced; the fix is on
the fallback path only.

### S4 — convention-aware plugin paths root

**Detection** (S1) produces `sourceRoot` from the table above.

**Renderers affected** (every one that today writes `plugins/...`):

- [`init-render.ts`](packages/cli/src/commands/init/init-render.ts) — no path change needed (only writes `mcp-vertex.config.json` + `.vscode/mcp.json` + agent files + host instructions + migration proposal, none under `plugins/`).
- The migration proposal in [`init-migrate-offer.ts`](packages/cli/src/commands/init/init-migrate-offer.ts) references the **migration target** (`libs/mcp-server/`) which the consumer fills in. No change.
- `tools/scripts/create-plugin.ts` (f00087 S2) — already takes `process.cwd()` as base; we add a `--root=<path>` flag that defaults to `pluginPathsRoot` from `IInitAnswers.detected` when the project supplies a config file. This is the only cross-slice impact: f00087's CLI helper respects the same convention root.

**Output**:

```jsonc
// mcp-vertex.config.json
{
  "$schema": "…",
  "cacheDir": ".cache/mcp-vertex",
  "docsDir": "docs/mcp-vertex",
  "plugins": { … },
  "convention": {
    "pluginPathsRoot": "libs",   // discovered
    "sourceRoot": "libs"
  }
}
```

The new `convention` block is **advisory only** — the loader ignores it;
only `init` and `plugin:create` consume it. Documented as a stable
consumer-facing surface.

## slices

### S1 — detect the target project

- **Status**: pending
- **Files**: packages/cli/src/commands/init/init-detection.ts, packages/cli/src/commands/init/init-answers.schema.ts, packages/cli/src/commands/init/init-prompts.ts, packages/cli/src/commands/init/init.command.ts, packages/cli/tests/commands/init/init-detection.spec.ts
- **Gate**: bun run validate
- **Acceptance**:
  - `detectTargetProject` returns `language: 'typescript'`, `framework: 'angular'`, `packageManager: 'bun'`, `monorepoTool: 'yarn-workspaces'`, `pluginPathsRoot: 'libs'`, `sourceRoot: 'libs'` against a fixture that ships `package.json` with `@angular/core` + `workspaces: ['packages/*']` + `bun.lockb`.
  - `IInitAnswers.detected` round-trips through `InitAnswers.parse`.
  - Prompt renders the one-line detection summary before the first question.
  - Unit spec with an in-memory `IFileReader` covers each row of the table above.

### S2 — resolve the host entry path

- **Status**: pending
- **Files**: packages/cli/src/commands/init/host-entry-resolver.ts, packages/cli/src/commands/init/init-render.ts, packages/cli/src/commands/init/init.command.ts, packages/cli/tests/commands/init/host-entry-resolver.spec.ts
- **Gate**: bun run validate
- **Acceptance**:
  - `resolveHostEntryPath` returns the explicit override when `--mcp-vertex-root` is set.
  - Returns `<workspace>/node_modules/@mcp-vertex/core/tools/scripts/host/host-server.script.ts` when present.
  - Falls back to the sibling-checkout path when both `node_modules` lookups fail.
  - Throws a typed error naming every attempted path when none exists; the CLI prints the hint.
  - `renderVscodeMcpJson` no longer contains the literal `/home/cartago/...` path.
  - Unit spec covers each branch with a fixture workspace.

### S3 — locale-aware agent fallback + namespace propagation

- **Status**: pending
- **Files**: packages/cli/src/commands/init/init-catalog.ts, packages/cli/src/commands/init/init-render.ts, packages/cli/src/commands/init/init-prompts.ts, packages/cli/tests/commands/init/init-catalog.spec.ts
- **Gate**: bun run validate
- **Acceptance**:
  - `FALLBACK_AGENTS_BY_LOCALE.en` ships an English set for every role (orchestrator, proposal-guardian, technical-investigator, implementation-runner, delivery-verifier).
  - `loadAgentDescriptors` accepts `{ namespacePrefix, locale }` and returns tools prefixed with `namespacePrefix`.
  - When the live catalog is present, its tools are already correctly namespaced (no change); when absent, the fallback uses the requested prefix.
  - `lint:cli:i18n` covers the new locale keys (so the project's i18n contract catches missing translations in the future).

### S4 — convention-aware plugin paths root

- **Status**: pending
- **Files**: packages/cli/src/commands/init/init-detection.ts, packages/cli/src/commands/init/init-render.ts, packages/cli/src/commands/init/init-answers.schema.ts, tools/scripts/create-plugin.ts, packages/cli/tests/commands/init/init-render.spec.ts
- **Gate**: bun run validate
- **Acceptance**:
  - `IInitDetection.pluginPathsRoot` is `'libs'` for Angular / Nx fixtures, `'packages'` for yarn / pnpm / bun workspaces, `'plugins'` for everything else.
  - `renderMcpVertexConfig` writes a `convention` block with the discovered root and source root.
  - `tools/scripts/create-plugin.ts` accepts `--root=<path>` and defaults to `pluginPathsRoot` when the current directory contains a `mcp-vertex.config.json` with a `convention` block.
  - Existing specs still green (the default for an empty workspace is still `plugins/`, preserving f00084 behaviour).

## risks and mitigations

1. **`analyzeProject` is async and IO-heavy.** S1 calls it once at boot,
   before the first prompt, so the operator sees the detection summary
   immediately. We cache the result for the lifetime of the `init`
   invocation so the rest of the prompts don't pay the cost again.

2. **`hostEntryPath` resolution might disagree with what the operator
   expects.** S2 throws a typed error when none of the four candidates
   exist; the error message lists every attempt and hints at
   `--mcp-vertex-root` as the override. We do NOT silently default to
   `/home/cartago/...` — the explicit error is the safer behaviour.

3. **Locale fallback drift.** S3 ships English + Spanish as the only two
   locales today; other locales get the English set until a translator
   fills them in. `lint:cli:i18n` flags missing keys, so the gap is
   visible during CI.

4. **The new `convention` block in `mcp-vertex.config.json` is ignored by
   the loader.** Documented as consumer-facing only; `init` and
   `plugin:create` read it, the loader doesn't. Future slices can
   promote it to a first-class contract if the loader ever needs it.

## notes

- The fix here is small (~600 LOC across the four slices) and
  behaviour-preserving for the greenfield case (f00084's acceptance
  criteria still pass). The CI signal that catches a regression is
  the existing `bun run validate` plus the new specs in
  `packages/cli/tests/commands/init/`.

- The four slices fit the "Behaviour-preserving refactor" budget; each
  one is independently shippable, but the migration offer + agent
  fallback only make sense when S1 detection lands first. S1 → S2 →
  S3 → S4 is the natural order.

- The proposal is additive: an empty workspace still produces the same
  bundle as today (detection falls back to defaults). No breaking
  change to `mcp-vertex.config.json` consumers — the new `convention`
  block is optional.

## acceptance

- The validation gate (`bun run validate`) is green for the four slices
  above.
- `bun run cli -- init --help` exits 0 and the new `--mcp-vertex-root`
  and `--plugin-paths-root` flags appear.
- A fixture project that simulates an Angular workspace gets the right
  `pluginPathsRoot: 'libs'` and the right `hostEntryPath` after S2.
- `lint:cli:i18n` flags the new locale keys as missing for every locale
  that does not yet ship a translation (English and Spanish pass, the
  rest are explicit TODOs in the i18n table — captured by the next
  translation pass).