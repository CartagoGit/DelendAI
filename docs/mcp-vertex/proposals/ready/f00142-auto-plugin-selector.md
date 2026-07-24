---
id: f00142
kind: feat
title: auto-plugin-selector — recommend the best plugin set for THIS project from its signals (evidence-based, optionally LLM-reasoned)
status: ready
date: 2026-07-23
track: plugin+config+auto-selection
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

- **Status**: pending
- **Files**: `plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts`, `plugins/auto-plugin-selector/src/lib/contracts/interfaces/plugin-fit.interface.ts`
- **Gate**: bun run validate

`recommendPlugins(signals, catalog)` → ranked `{plugin, fitScore, reasons[]}`
over plugin tags/`describe` × detected signals (reuses r00011 `detectStack`).
Deterministic, exhaustively unit-tested on fixture project shapes.

### S2 — recommend tool + config diff

- **Status**: pending
- **Files**: `plugins/auto-plugin-selector/src/lib/tools/plugins-recommend.tool.ts`, `plugins/auto-plugin-selector/src/lib/apply/config-diff.ts`
- **Gate**: bun run validate

`plugins_recommend { task? }` returns the tailored set + a config diff vs
current (adds high-fit, flags low-signal). Applying is consent-gated and reuses
`configuration_center`. Pure diff builder.

### S3 — optional LLM refinement + surface + catalog

- **Status**: pending
- **Files**: `plugins/auto-plugin-selector/src/lib/refine/llm-rationale.ts`, `plugins/auto-plugin-selector/README.md`
- **Gate**: bun run validate

Opt-in LLM rationale via `auto-agent-selector` (cheapest capable model);
degrades to the pure scorer when no provider. Surface in `init` +
`configuration_center`; catalog/wiki.

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
