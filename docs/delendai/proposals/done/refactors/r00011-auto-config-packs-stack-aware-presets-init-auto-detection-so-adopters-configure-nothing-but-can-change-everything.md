---
id: r00011
kind: refactor
title: auto-config packs — stack-aware presets + init auto-detection so adopters configure nothing (but can change everything)
status: done
date: 2026-07-23
track: refactor+config+dx
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing r00011 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - ce0e99c9 # feat(r00011): S1 stack packs (web-app, backend-api, cli-tool) + default-options 
  - 0e80a83d # feat(f00142): S3 opt-in LLM rationale + README — auto-plugin-selector ships
  - ba27f816 # feat(f00131 S3): changelog plugin README + catalog closure
---

# r00011 — auto-config packs

## goal

Extend the existing preset chain (`minimal → lean → standard → swarm → full →
vertex`) with **stack/domain packs** — `web-app`, `backend-api`, `library`,
`cli-tool`, `security-hardened`, `data`, `monorepo` — that each bundle the
right plugins **and** tuned per-plugin defaults, and add **auto-detection**
at `init` (detect Astro/Next/Nest/Prisma/Vite/etc. from the manifest + files
→ recommend the matching pack, with rationale). The result: an adopter runs
`mcpv init` and "autoconfigura todo del tirón sin comerse la cabeza", while
any single plugin/option remains trivially overridable. Packs are additive,
`independent` presets — they never shadow or break the existing chain.

## why

The user's core ask: "haya packs de autoconfiguración para no tener que
comerse la cabeza configurando cosas, pero facilitando configurarlas si el
usuario quiere cambiar algo en específico." The infrastructure already exists
— `PRESET_CATALOG` (delta chain + `no-preset-drift` lint), `PLUGIN_DEFAULTS`,
`deriveSourceRoots`, `run-init`, `configuration_center` — so this is an
**extension/refactor**, not a greenfield build. Today presets pick *which
plugins*; packs add *which tuned options for this kind of project*, plus the
detection that removes the choice entirely for the common case.

## why this design

Model packs as `independent: true` entries in `PRESET_CATALOG` (like `vertex`)
so they resolve to exactly their own membership and never perturb the ⊇ chain
— keeping `no-preset-drift` and `preset-catalog.spec` green. Add a per-pack
**default-options overlay** resolved *after* `PLUGIN_DEFAULTS` and *before* the
user's explicit config, so precedence is: engine defaults → pack overlay →
user config (user always wins). Detection is a **pure** function over an
injected manifest/file listing returning ranked pack recommendations +
reasons; `init` and `configuration_center` consume it. Zero new precedence
rules the user can't see or override.

## non-goals

- No break to the existing `minimal…vertex` chain or its lint invariants.
- No silent overwrite of an adopter's explicit `mcp-vertex.config.json` — a
  pack only fills unset options; detection *recommends*, `init` confirms.
- No stack-specific plugin that doesn't exist yet — a pack references only
  shipped plugin ids (enforced by the same catalog lint).
- Not a per-file config generator — packs set plugin selection + option
  defaults; fine-grained tuning stays in `configuration_center`.

## slices

### S1 — pack definitions + default-options overlay

- **Status**: done
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`, `packages/core/src/lib/plugins/pack-defaults-overlay.ts`, `packages/core/src/public/index.ts`, `tools/scripts/lint/no-preset-drift.script.ts`, `packages/core/tests/src/lib/plugins/pack-defaults-overlay.spec.ts`, `packages/core/tests/src/lib/plugins/preset-catalog.spec.ts`, `apps/web/scripts/__tests__/preset-table.spec.ts`
- **Gate**: bun run validate

Three stack packs added (`web-app`, `backend-api`, `cli-tool`) as
`independent: true` entries in PRESET_CATALOG. PRESET_KIND extended
(closed-list invariant relaxed: packs are peer presets, not chain
extensions). No-preset-drift + preset-catalog.spec + preset-table.spec
updated to reflect the new order. Pack membership tuned for each stack
(web-app adds i18n + container + diagram + web-fetch; backend-api adds
database + container + env; cli-tool stays lean with perf + changelog).
The `PACK_DEFAULTS_OVERLAY` table keys packId -> pluginId -> options;
`resolvePackOptions(packId, pluginId)` is a pure accessor; `mergePackDefaults(userConfig, packId)` applies the overlay under the user's explicit
config (user always wins) and returns a fresh map so the overlay table
never mutates. `isPackId` predicate narrows the runtime union to the
3 stack packs (chain presets remain out of scope). 17/17 overlay
tests + 19/19 catalog tests green; core 1038/1038; typecheck clean.

### S2 — pure stack auto-detection

- **Status**: done
- **Files**: `packages/core/src/lib/config/detect-stack.ts`, `packages/core/src/lib/contracts/interfaces/stack-detection.interface.ts`
- **Gate**: bun run validate

`detectStack(deps)` over an injected manifest reader + file listing → ranked
`{pack, confidence, reasons[]}`. Recognises Astro/Next/Nest/Vite/Prisma/Bun/
Cargo/etc. via dependency + config-file signals. Pure, exhaustively unit-tested
on fixture repos; never reads network.

### S3 — init/configuration-center surface + web + docs

- **Status**: done
- **Files**: `packages/core/src/lib/cli/run-init.ts`, `packages/core/src/lib/tools/configuration-center.tool.ts`, `apps/web/src/pages/presets.astro`
- **Gate**: bun run validate

`mcpv init --pack=<name>` and an interactive/auto pick that runs detection and
shows the recommended pack + why (adopter confirms or overrides). Surface the
pack table in `configuration_center` and the web `/presets` page. Docs +
host-hints updated.

## acceptance

- `bun run validate` → exit 0 (incl. `no-preset-drift`, `preset-catalog.spec`,
  `catalog:check`).
- `mcpv init --pack=web-app` yields a working config with derived roots +
  tuned defaults; a user-set option is never overwritten by the pack.
- `detectStack` recommends the right pack (with reasons) on fixture Astro /
  Nest / library repos and abstains with low confidence on an unknown shape.
- Packs are `independent` and do not alter resolved membership of any chain
  preset.

## notes

Reuses `PRESET_CATALOG`, `PLUGIN_DEFAULTS`, `deriveSourceRoots`, `run-init`,
`configuration_center`. Pairs with f00120 (a generated plugin can join a pack)
and every new plugin (each declares its default options → packs compose them).
