---
id: f00034
status: done
type: proposal
track: apps/web+docs+core+cli
date: 2026-06-21
kind: feat
title: Presets page — full catalog with per-plugin membership and links
shipped-in: []
related:
    - f00042 # the GitHub issues plugin — defines the "issues rides on proposals" rule this page makes visible
    - f00022 # dashboard v2 + multi-IDE shell — same apps/web page-authoring pattern
ownership:
    - {
          agent: implementation_runner,
          task: 'S1: New `--preset=full` (host-only, additive) wired into parseCliArgs + PLUGIN_PRESETS + a full integration test',
      }
    - {
          agent: implementation_runner,
          task: 'S2: Single source of truth for preset membership at packages/core/src/lib/plugins/preset-catalog.ts (typed, exported, Zod-validated) — pages render from this, no hardcoded lists in apps/web',
      }
    - {
          agent: implementation_runner,
          task: 'S3: apps/web/src/pages/presets.astro — table of presets × plugins with each cell linking to /es/plugins/<id> (and /es/plugins/proposals when a plugin declares dependsOn)',
      }
    - {
          agent: implementation_runner,
          task: 'S4: i18n keys (preset names, descriptions, "requires" chip, table headers) × 12 languages + plugins.astro card "requires" chip + docs/PLUGINS-MCP-VERTEX.md presets section',
      }
    - {
          agent: implementation_runner,
          task: 'S5: bun run validate green + site:strict + check:i18n:plugins + lint:proposals + lint:tools',
      }
globalGate: lint
acceptance:
    - { command: bun run type, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run site:strict, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run check:i18n:plugins, expect: exit0 }
---

# f00043 — Presets page

## goal

Make the **plugin membership of every preset** a first-class,
machine-checked, human-readable artefact:

- A new **web page** at `apps/web/src/pages/presets.astro` that
  shows a 2D table: rows = presets (`minimal`, `standard`, `swarm`,
  `full`), columns = plugin ids, cells = `✓` / `requires: …` /
  `–`. Every `✓` cell links to `/es/plugins/<id>`.
- A **single source of truth** for the membership
  (`packages/core/src/lib/plugins/preset-catalog.ts`) so the web
  page, the CLI flag parser, the docs, and any future tool surface
  never drift. Anything that lists a preset's plugins reads from
  this catalog.
- A **new preset `full`** that includes everything in `swarm`
  plus the host-only plugins (`issues`, `logs`, `web-fetch`,
  `memory` and any future ones marked
  `personal/host-only`).
- **Every cell is verifiable**: the web page links to the plugin
  page, the plugin page (added in S4 of f00042) shows the
  `requires:` chip, and the CLI refuses to boot a preset whose
  transitive dependency set is incomplete.

## why

f00042 makes the `issues` plugin real and useful, but the user
immediately ran into a discoverability problem: **"if `issues`
depends on `proposals`, why does `swarm` already give me
`proposals` but not `issues`?"** Today the only answer is "read
the README". That doesn't scale to 12 plugins.

The current `--preset` resolution is hidden inside
`packages/core/src/lib/plugins/parse-cli-args.ts`. The presets are
typed (`PLUGIN_PRESETS`) but:

1. They're not exported from the core's public barrel — only the
   CLI uses them.
2. There's no web page showing "what's in each preset" — the
   install docs (`docs/README-MCP-VERTEX.md`) mention the presets
   in a one-line table but don't list membership.
3. There's no preset that includes `issues`. The user has to
   manually write `mcp-vertex --plugins=proposals,issues`, which
   works but is undocumented outside the f00042 README.
4. There's no cross-reference from a plugin's page back to "which
   presets ship me". So if you land on `/plugins/issues` first,
   you can't tell whether `swarm` would give it to you.

f00043 closes all 4.

## why this design

### One catalog, four consumers

`packages/core/src/lib/plugins/preset-catalog.ts` is exported from
`packages/core/src/public/index.ts` and re-exported by the
`apps/web` side. The four consumers that must read from it (no
hardcoded arrays anywhere else):

1. **`parseCliArgs`** — to expand `--preset=NAME` into the plugin
   list (already in `PLUGIN_PRESETS`; f00043 S1 moves it to the
   new catalog and refactors the parser to read from there).
2. **`apps/web/src/pages/presets.astro`** — renders the table.
3. **`docs/README-MCP-VERTEX.md`** — its "presets" section becomes
   a generated block (or at least a hand-kept mirror with a
   `bun run lint:presets` test that fails if it drifts from the
   catalog).
4. **`docs/proposals/done/feats/f00043-*.md`**'s `closure` section
   — references the catalog to keep the audit honest.

### Why a `full` preset and not just "extend `swarm`"

`--preset=swarm --plugins=issues` works today. But the user's
mental model is "I want everything", not "I want swarm plus a
delta". A named `full` preset:

- Is discoverable in tab-completion and `--help` output.
- Lets the web page show one row per preset instead of two
  (`swarm`, `swarm+issues`).
- Makes the catalog self-documenting: `full ⊇ swarm ⊇ standard
  ⊇ minimal` is a property the lint can enforce.

### Preset catalog shape (S2)

```ts
// packages/core/src/lib/plugins/preset-catalog.ts
export const PRESET_KIND = ['minimal', 'standard', 'swarm', 'full'] as const;
export type IPresetKind = (typeof PRESET_KIND)[number];

export interface IPresetMember {
  /** Plugin id (e.g. "proposals", "issues"). */
  readonly plugin: string;
  /** When true, this plugin only ships under `full`, never under swarm. */
  readonly hostOnly?: boolean;
}

export interface IPresetDefinition {
  readonly id: IPresetKind;
  readonly title: string;
  readonly summary: string;
  readonly members: readonly IPresetMember[];
}

/**
 * Canonical preset catalog. Order is significant: presets are
 * listed from smallest to largest. `members` is interpreted as
 * additive; the lint verifies the ⊇ chain (full ⊇ swarm ⊇
 * standard ⊇ minimal).
 */
export const PRESET_CATALOG: readonly IPresetDefinition[] = [
  { id: 'minimal', title: '...', summary: '...', members: [
      { plugin: 'git' }, { plugin: 'search' } ] },
  { id: 'standard', title: '...', summary: '...', members: [
      { plugin: 'memory' }, { plugin: 'docs' }, { plugin: 'rules' },
      { plugin: 'quality' }, { plugin: 'deps' } ] }, // inherits minimal
  { id: 'swarm', title: '...', summary: '...', members: [
      { plugin: 'proposals' }, { plugin: 'notification' } ] }, // inherits standard
  { id: 'full', title: '...', summary: '...', members: [
      { plugin: 'issues', hostOnly: true },
      { plugin: 'logs', hostOnly: true },
      { plugin: 'web-fetch', hostOnly: true } ] }, // inherits swarm
];
```

> **Note**: the catalog stores deltas, not full lists. The
> effective membership of `swarm` is
> `minimal ∪ standard ∪ swarm`. The web page renders the union;
> the catalog stores the deltas. This keeps the catalog small and
> the inheritance visible.

### Dependency-aware cells

For each `(preset, plugin)` cell, the page shows:

- `✓` if the plugin is in the preset's effective membership.
- `requires: proposals` (linked to `/es/plugins/proposals`) if the
  plugin declares `dependsOn`. The cell stays `✓` if the required
  plugin is also in the preset, otherwise it shows a yellow chip
  with the link to the missing dependency.
- `–` otherwise.

This way the user sees, at a glance, that `full` gives them
`issues` and that `issues` rides on `proposals` (which is also in
`full`, so the chip is green).

## non-goals

- **No preset composition DSL.** Users still pick one
  `--preset=NAME`. Layered presets (`--preset=swarm+issues`) are
  out of scope; the existing `--plugins=X,Y,Z` and
  `--exclude-plugins=A` already cover the composition case.
- **No per-project preset overrides.** Presets are global, not
  per-repo.
- **No new plugin-tagging system beyond `hostOnly`.** A plugin's
  "host-only" status today is implicit (it lives in the codebase
  but isn't loaded by `swarm`). f00043 S2 makes it explicit
  (`kind: 'core' | 'host-only'`) in the catalog, but doesn't add
  the tag to every plugin yet — that's a follow-up scan.
- **No visual redesign of `apps/web`.** New page only.

## architecture

### 4.1 File layout

```
packages/core/src/lib/plugins/
├─ preset-catalog.ts          (new — single source of truth)
├─ preset-catalog.spec.ts     (new — ⊇ invariant + Zod)
└─ parse-cli-args.ts          (refactored to read from the catalog)

apps/web/src/pages/
├─ presets.astro              (new)
└─ plugins.astro              (S4: add `requires:` chip from f00042 S4)

apps/web/src/i18n/
└─ ui.ts                      (S4: 12-language keys for the page)

docs/
├─ README-MCP-VERTEX.md       (S4: presets section points at the page)
└─ PLUGINS-MCP-VERTEX.md      (S4: presets subsection updated)
```

### 4.2 Hard rules preserved

- `packages/core` stays agnostic — the catalog is data, no
  plugin-name vocabulary beyond ids.
- i18n parity — every visible string on `presets.astro` has 12
  language entries.
- Every tool/script that reads preset membership goes through the
  catalog. `bun run lint:presets` (added in S2) fails the build
  if any other file hardcodes a preset's plugin list.

## slices

### S1 — Wire `--preset=full` through `parseCliArgs` + `PLUGIN_PRESETS` _(excl. `apps/`, `docs/`)_

- **Status**: done
- **Files**:
  - `packages/core/src/lib/plugins/parse-cli-args.ts` (refactor)
  - `packages/core/src/lib/plugins/parse-cli-args.spec.ts`
    (add `full` cases)
- Read from the new catalog (S2). Add `full` cases to the spec:
  parses `--preset=full` → full plugin set; `--preset=swarm
  --exclude-plugins=issues` → `issues` excluded; unknown preset
  → empty (existing behaviour).
- **Gate**: `bun run test packages/core` exit 0.

### S2 — Preset catalog + lint _(excl. `apps/`, `docs/`)_

- **Status**: done
- **Files**:
  - `packages/core/src/lib/plugins/preset-catalog.ts` (new)
  - `packages/core/src/lib/plugins/preset-catalog.spec.ts` (new)
  - `packages/core/src/public/index.ts` (export `PRESET_CATALOG`,
    `IPresetDefinition`, `IPresetMember`)
  - `packages/core/src/lib/plugins/preset-catalog.lint.ts` (new)
  - `tools/scripts/lint/no-preset-drift.script.ts` (new — walks
    the repo, fails if a file outside the catalog declares a
    preset's plugin list verbatim).
  - `bunfig.toml` / `package.json` (wire `lint:presets`)
- Catalog stores deltas (see §"Preset catalog shape" above). The
  test asserts:
  - All presets sorted by ⊇ chain.
  - Every catalog `plugin` id corresponds to a real
    `@mcp-vertex/<id>` package (checked by listing
    `plugins/*/package.json` and `packages/*/package.json`).
  - The ⊇ invariant holds: `full ⊇ swarm ⊇ standard ⊇ minimal`.
  - Every plugin in `full.members` has `hostOnly: true`.
- **Gate**: `bun run test packages/core`, `bun run lint:presets`
  exit 0.

### S3 — `apps/web/src/pages/presets.astro` _(incl. `apps/web/`, excl. `docs/`)_

- **Status**: done
- **Files**:
  - `apps/web/src/pages/presets.astro` (new)
  - `apps/web/src/lib/preset-table.ts` (new — pure render helper,
    unit-tested under `bun:test`)
  - `apps/web/tests/lib/preset-table.spec.ts` (new)
  - `apps/web/src/data/install.ts` (add `full` to the
    `--preset=NAME` dropdown)
- The page reads the catalog at build time (Astro frontmatter →
  `PRESET_CATALOG`), renders a `<table>` with one row per preset
  and one column per plugin id ever mentioned in any preset. Cell
  logic from §"Dependency-aware cells" above.
- The page also renders 4 short install snippets (one per preset)
  so the user can copy the command without thinking.
- **Gate**: `bun run test apps/web`, `bun run site:strict` exit 0.

### S4 — Docs + i18n + cross-references _(incl. `apps/web/`, incl. `docs/`)_

- **Status**: done
- **Files**:
  - `apps/web/src/i18n/ui.ts` (12 new keys: `preset.minimal.title`,
    `preset.standard.title`, `preset.swarm.title`,
    `preset.full.title`, `preset.<id>.summary`,
    `preset.requiresChip`, `preset.table.header.preset`,
    `preset.table.header.plugin`, `preset.table.empty`)
  - `apps/web/src/pages/plugins.astro` (add `requires:` chip to
    every plugin card whose catalog entry has a non-empty
    `dependsOn`; link chip to the dependency's plugin page)
  - `docs/README-MCP-VERTEX.md` (replace the one-line preset
    table with a paragraph linking to `/es/presets`)
  - `docs/PLUGINS-MCP-VERTEX.md` (add a "Presets" subsection
    listing the 4 presets and which plugins are host-only)
- **Gate**: `bun run check:i18n:plugins`, `bun run site:strict`,
  `bun run lint:proposals` exit 0.

### S5 — Validation pass _(incl. everything)_

- **Status**: done
- **Files**:
  - `docs/proposals/done/feats/f00043-presets-page-and-plugin-membership.md`
    (move the proposal to `done/` after `bun run validate` is
    green)
- Runs the full `bun run validate` and adds the catalog link to
  the closure.
- **Gate**: `bun run validate` exit 0.

## acceptance

(Mirrors the `acceptance:` block in the frontmatter. The linter
requires a `## acceptance` body section as the canonical mirror of
the frontmatter block.)

- [x] `bun run type` exit 0.
- [x] `bun run test` exit 0.
- [x] `bun run lint` exit 0.
- [x] `bun run site:strict` exit 0.
- [x] `bun run lint:proposals` exit 0.
- [x] `bun run lint:tools` exit 0.
- [x] `bun run check:i18n:plugins` exit 0.
- [x] `apps/web` shows `/es/presets` with a 4-row × 12-column table
  where every `✓` cell links to the plugin page and every
  `requires:` chip links to the dependency.
- [x] `mcp-vertex --preset=full` boots cleanly with the expected 9+
  plugins.
- [x] The catalog/lint guard rejects any documentation or config that treats
  `issues` as a standalone preset; `issues` is only exposed through
  `--preset=full` or an explicit `--plugins=issues` opt-in.

## notes

Closed on 2026-06-21 after confirming the preset catalog is the single
source of truth for CLI expansion, docs, drift linting, and the web
presets page. The docs now expose the four canonical presets
(`minimal`, `standard`, `swarm`, `full`) and avoid advertising `issues`
as a standalone preset; `issues` remains available through
`--preset=full` or explicit `--plugins=issues`.

Verification:

- `bun run test packages/core/src/lib/plugins/preset-catalog.spec.ts tools/scripts/lint/no-preset-drift.script.spec.ts`
- `bun tools/scripts/lint/no-preset-drift.script.ts`
- `bun run site:strict`
- `bun run validate`
