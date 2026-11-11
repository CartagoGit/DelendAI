---
id: f00142
kind: feat
title: auto-plugin-selector — recommend the best plugin set for THIS project from its signals (evidence-based, optionally LLM-reasoned)
status: done
date: 2026-07-23
track: plugin+config+auto-selection
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 5 commits referencing f00142 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 5-commit batch
shipped-in:
  - 0e80a83d # feat(f00142): S3 opt-in LLM rationale + README — auto-plugin-selector ships
  - 84373b93 # feat(f00142): S2 plugins_recommend tool + pure config-diff builder
  - cfa4ae81 # fix(f00142): wire auto-plugin-selector + fix web style + i18n help + registry te
  - 8da5db9e # feat(auto-plugin-selector): f00142 S1 — pure plugin-fit scorer (deterministic, n
  - 676008f8 # feat(config,proposals): activate router in this repo + 4 self-improvement propos
---

# f00142 — auto-plugin-selector

## goal

A plugin that answers "**which plugins should this project actually use?**" by
analysing the project's signals (manifest, files, git history, and the task at
hand) and recommending a tailored plugin set — with a per-plugin rationale for
why it fits (or doesn't) — plus a diff against the current config the user can
apply on consent. Finer-grained than a static pack: it tailors and can also
*de-recommend* plugins that only add noise for this project.

## why

The user's insight: "según el proyecto querremos usar unos plugins u otros."
Packs (r00011) give a good coarse default by stack; this adds the smart,
evidence-based per-project layer — an Astro docs site and a Rust CLI and a
data-heavy backend each want a different, minimal, high-signal set. Choosing
the right plugins keeps the tool surface lean (fewer tokens, less noise) and
more effective — exactly the efficiency + reliability the project optimises for.

## why this design

The core is a **pure scorer**: `recommendPlugins(projectSignals, catalog)` maps
each plugin's capability tags + `describe` against detected signals (reusing
r00011's `detectStack` + the plugin catalog) → a ranked fit score with reasons.
This stays deterministic and unit-testable. An **optional** LLM refinement pass
(via `auto-agent-selector`, so it uses the cheapest capable model, never
hardcoded) can add nuanced rationale — but the recommendation is fully
functional without it, so the plugin never *requires* a model or a key. Applying
the recommendation reuses `configuration_center`/f00120 wiring; the user always
confirms.

## non-goals

- No auto-enabling without consent — it recommends + shows a config diff.
- No hard dependency on an LLM or API key — the pure scorer is the default;
  LLM refinement is opt-in.
- No overlap with r00011's packs — it composes `detectStack` and produces a
  finer, tailored set (and can start from a pack, then trim/extend).

## slices

### S1 — pure plugin-fit scorer

- **Status**: done
- **Files**: `plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts`, `plugins/auto-plugin-selector/src/lib/contracts/interfaces/plugin-fit.interface.ts`
- **Gate**: bun run validate
- **Commit**: `8da5db9e`

`recommendPlugins(signals, candidates, opts?)` → ranked `IPluginFit[]` over
plugin tags × detected signals (`pack`, `languages`, `hasDocsSite`/`isCliTool`/
`hasBackend`/`hasTests`). Pure deterministic scorer with pack+language+shape
bonuses, mild unmatched penalty, top-1 normalization, tie-break by id, and
optional `limit`/`minScore`. Reuses the `IProjectSignals` shape that the
existing `plugins_recommend` tool (S2 stub) already imports. 11/11 tests
green; typecheck clean.

### S2 — recommend tool + config diff

- **Status**: done
- **Files**: `plugins/auto-plugin-selector/src/lib/tools/plugins-recommend.tool.ts`, `plugins/auto-plugin-selector/src/lib/apply/config-diff.ts`, `plugins/auto-plugin-selector/src/lib/contracts/interfaces/config-diff.interface.ts`, `plugins/auto-plugin-selector/src/lib/apply/config-diff.spec.ts`, `plugins/auto-plugin-selector/src/public/index.ts`
- **Gate**: bun run validate
- **Commit**: (this session)

`plugins_recommend { signals, limit?, minScore?, refine?, currentPlugins? }`
returns the ranked `IPluginFit[]` + a structured `IConfigDiff` against the
caller-supplied `currentPlugins` list. The diff is grouped into
`adds` / `removes` / `keeps` (each step carries `kind`, `pluginId`,
`rationale`, optional `fit`) and reuses no I/O — applying remains
consent-gated and reuses `configuration_center`/`f00120`. Pure diff
builder. 21/21 plugin tests green (10 scorer + 10 diff + 1 sanity);
core 1038/1038; typecheck clean.

### S3 — optional LLM refinement + surface + catalog

- **Status**: done
- **Files**: `plugins/auto-plugin-selector/src/lib/refine/llm-rationale.ts`, `plugins/auto-plugin-selector/src/lib/refine/llm-rationale.spec.ts`, `plugins/auto-plugin-selector/README.md`
- **Gate**: bun run validate
- **Commit**: (this session)

Opt-in LLM rationale via `auto-agent-selector`. `buildLlmRationale(signals, fits, available, opts?)` is pure over the injected roster — `rankProviders` selects the cheapest-capable provider (dial 0-10; default 7 = "leaning cheaper"); pinned id wins when reachable. The composed `prompt` is a deterministic serialisation of `signals` + top-5 fits, so the same input always yields the same prompt. When the caller injects no roster, `llmRationale.reachable === false` and the tool degrades gracefully — the pure scorer + diff are unaffected. README documents the layered design (scorer / diff / rationale / tool) and the three optional knobs (`currentPlugins`, `refine`, `providerCandidates`). 28/28 plugin tests green; core 1038/1038; typecheck clean. Catalog/wiki links added via README.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- On fixture Astro / CLI / backend projects, `plugins_recommend` returns
  distinct, sensible tailored sets with per-plugin reasons.
- Works with **no** API key (pure scorer); LLM refinement activates only when a
  provider exists + consent; applying is consent-gated and reuses existing
  wiring.

## notes

Reuses r00011 `detectStack`, the plugin catalog + tags/`describe`,
`auto-agent-selector` (optional refinement), and `configuration_center`.
Complements r00011 (coarse packs) with fine, evidence-based per-project
tailoring. Pairs with f00141 (adopt what it recommends).
