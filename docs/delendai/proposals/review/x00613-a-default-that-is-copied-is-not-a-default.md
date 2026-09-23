---
id: x00613
title: "A default that is copied is not a default"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["794629862"]
---

# x00613 — A default that is copied is not a default

## goal

`delendai init` wrote ~100 lines of *our* defaults into every adopter's
`delendai.config.json` — including 68 agent names and three directory
paths built from this repository's docs layout. A default that is written
out stops being a default: it becomes the adopter's own declaration,
frozen at the version they ran `init`, and it can no longer track the
source it was copied from.

## why

Measured against a throwaway consumer project with `docsDir:
"documentation"`, profile `worktree-pr`, on branch `trunk`:

- `init` grew their config from 5 lines to **314**.
- 73 of those were `plugins.proposals.options.namePool` — the proposals
  plugin's own `DEFAULT_AGENT_NAME_POOL`, copied.
- `audit.auditDir` was stamped as a literal, while the audit plugin's own
  schema documents that default as **`<docsDir>/proposals/done/audits`,
  computed from the host's resolved docsDir**. For that project the
  stamped path points at a tree that will never exist.

This is not a new class of mistake here. `plugin-defaults` already carries
this comment:

> *a00063: search ships NO materialised defaults. The old block stamped
> delendai's own monorepo roots … into every adopter's config — an Angular
> app got roots that don't exist and lost html/scss, so every search
> scanned 0 files.*

That was fixed for `search` alone. The same shape remained for
`proposals`, `docs`, `audit` and `issues`.

### And the map had already forked

There were **two** `PLUGIN_DEFAULTS`, each documented as canonical:
`packages/core/src/lib/plugins/plugin-defaults.ts` and
`packages/core/src/lib/plugins/plugin-defaults.ts` (this work shipped in
  the CLI copy of the defaults map; x00613 deleted that copy — it had no
  consumers and had drifted from core's, which is the one `init` reads). They
disagreed, and not subtly:

| key | core | cli |
| --- | --- | --- |
| `audit.auditDir` | `docs/delendai/proposals/done/audits` | `docs/proposals/done/audits` |
| `issues.scaffoldDir` | `docs/proposals/retired/issues` | `docs/delendai/proposals/retired/issues` |
| `docs.roots` | `['docs', …]` | `['docs/delendai', …]` |

Two directory pairs pointing at **opposite trees**, and each map
internally inconsistent about which of the two conventions it follows.
core listed 29 plugins, the CLI 13.

The CLI's map — with its own `resolvePluginOptions` — had **no consumers
at all**. `init` imports core's. So the fork was pure drift: a copy nobody
read, diverging quietly from the one that reaches adopters.

## why this design

**Delete the copy, do not reconcile it.** Reconciling two canonical maps
leaves two canonical maps. The unused one is gone; there is one.

**Stop materialising what a plugin owns.** The proposals plugin falls back
to `DEFAULT_AGENT_NAME_POOL` whenever the option is absent
(`agent-names.tool.ts`: `options.pool ?? DEFAULT_AGENT_NAME_POOL`), and
the audit plugin derives its directory from the resolved `docsDir`. The
copies bought nothing and cost the adopter the ability to receive a later
change.

**Keep what a default is actually for.** `memory.bm25K1: 1.5`,
`audit.topActions: 5`, `logs.retentionCount: 10` mean the same thing in
every project. Those stay. The rule is not "write nothing", it is "write
nothing whose right value depends on whose project this is".

**A side effect worth naming:** removing the two stamped paths deleted two
of the couplings `r00043` (core stops knowing the proposals domain) exists
to remove. The committed boundary inventory is regenerated, and the
scanner's expectation list no longer expects them.

## non-goals

- Emptying every entry. Project-neutral defaults are the point of a
  defaults map.
- The remaining core↔plugin mirrors (`memory`, `deps`, `notification`,
  `logs`). Each needs its own check that the plugin has a fallback, and a
  wrong guess there changes behaviour silently. Measured, not assumed, is
  the rule that found this one.

## Slices

### S1 — One defaults map, and it stamps nothing project-specific

- **Status**: done — verified against a consumer project with
  `docsDir: "documentation"`: the config `init` writes went from 314 lines
  to 230, with no `namePool` and no `docs/delendai…` path, and their own
  `docsDir` untouched. core + cli: 4105 passed. Two assertions had to
  change; both required the stamping (`auditDir` literal), and they now
  require its absence while still requiring `topActions`, which is what a
  default is for.
- **Gate**: `npx vitest run packages/core/tests/src/lib/plugins/plugin-defaults.spec.ts`
- **Files**: `packages/core/src/lib/plugins/plugin-defaults.ts`,
  `packages/core/tests/src/lib/plugins/plugin-defaults.spec.ts`,
  `packages/core/src/lib/plugins/plugin-defaults.ts` (this work shipped in
  the CLI copy of the defaults map; x00613 deleted that copy — it had no
  consumers and had drifted from core's, which is the one `init` reads),
  `packages/cli/src/contracts/interfaces/plugin-defaults.interface.ts`,
  `packages/cli/src/lib/init/init-render.service.spec.ts`,
  `packages/cli/src/lib/init/init-integration.spec.ts`,
  `tools/scripts/inspect/core-proposals-boundary.script.ts`,
  `docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md`
- The unused CLI map is deleted; core's stamps no agent-name pool and no
  path built from our docs layout; the boundary inventory records two
  fewer couplings.

## acceptance

With a consumer project declaring `docsDir: "documentation"`:

- `init` writes no `namePool` and no `docs/delendai…` path into their
  config, and their `docsDir` is untouched;
- the config it produces is 230 lines instead of 314;
- `audit.topActions` is still written, because a number means the same
  thing everywhere;
- an agent still gets a name, because the plugin owns the pool.
