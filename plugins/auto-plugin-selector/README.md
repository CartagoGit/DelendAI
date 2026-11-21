# @delendai/auto-plugin-selector

> **Recommends the best plugin set for the project — evidence-based,
> optionally LLM-refined, always consent-gated.**

`auto-plugin-selector` answers "**which plugins should THIS project
actually use?**" by analysing project signals (manifest, files, git
history) and recommending a tailored plugin set, with a per-plugin
rationale for why it fits (or doesn't), plus a structured diff against
the current config the host can apply on consent.

This is the fine-grained companion to `r00011`'s coarse packs: packs
give a good default by stack; this gives a tailored, evidence-based
selection that can also *de-recommend* plugins that only add noise for
this project.

## when to use it

- An Astro docs site wants `docs-site`, `i18n`, `web-fetch`.
- A Rust CLI wants `cli`, `lint`, `git`, `test-convention`.
- A data-heavy backend wants `backend`, `database`, `deps`, `quality`.

…instead of always loading the full `standard` preset.

## tools

### `plugins_recommend`

Pure plugin-fit scorer. Same input → same output. No API key required.

```jsonc
{
  "signals": {
    "pack": "typescript",
    "languages": ["typescript", "bash"],
    "hasDocsSite": true,
    "isCliTool": false,
    "hasBackend": false,
    "hasTests": true
  },
  "currentPlugins": ["quality", "git", "old-legacy"],
  "limit": 10,
  "refine": true,
  "providerCandidates": [
    // optional: inject the discovered roster from
    // @delendai/auto-agent-selector's `discoverRoster`
  ],
  "costQualityTradeoff": 8
}
```

Returns:

```jsonc
{
  "recommendations": [
    { "plugin": { "id": "i18n", ... }, "fitScore": 1.0, "reasons": ["pack:typescript", "language:typescript"] },
    ...
  ],
  "diff": {
    "steps":  [{ "kind": "add", "pluginId": "i18n", "rationale": "..." }, ...],
    "adds":   [...],
    "removes":[{ "kind": "remove", "pluginId": "old-legacy", "rationale": "no positive fit ..." }],
    "keeps":  [{ "kind": "keep", "pluginId": "quality", "rationale": "..." }]
  },
  "refineRequested": true,
  "llmRationale": {
    "reachable": true,
    "providerId": "claude-cli",
    "vendor": "anthropic",
    "costTier": 2,
    "rationale": "best value for your cost↔quality setting (8/10, leaning cheaper): cost tier 2 via CLI",
    "prompt": "You are a plugin-fit assistant for a developer tool..."
  }
}
```

## design

| layer | module | contract |
|---|---|---|
| **pure scorer** | `lib/score/recommend-plugins.ts` | `recommendPlugins(signals, candidates, opts?) → readonly IPluginFit[]` |
| **pure diff builder** | `lib/apply/config-diff.ts` | `buildConfigDiff(current, fits) → IConfigDiff` |
| **pure LLM rationale** | `lib/refine/llm-rationale.ts` | `buildLlmRationale(signals, fits, available, opts?) → ILlmRationaleDecision` |
| **MCP tool** | `lib/tools/plugins-recommend.tool.ts` | `<prefix>_plugins_recommend` |

Every layer is pure — no `fs`, no `child_process`, no network — so
the package is unit-testable end-to-end and the host keeps I/O control.

## degradation

- **No `providerCandidates`?** `llmRationale.reachable === false`; the
  scorer + diff are unaffected.
- **No `currentPlugins`?** `diff` is computed against `[]`, so every
  recommendation shows up as an `add`.
- **`refine !== true`?** `llmRationale === null` and the prompt is not
  built.

The tool is **fully functional on the pure scorer alone** — the LLM
refinement is opt-in.

## pairs with

- **r00011** (auto-config-packs) — coarse packs give the default;
  `auto-plugin-selector` trims & extends.
- **f00141** (plugin registry + adopt) — the host renders the
  `IConfigDiff`, then runs `plugin_add` on every `add` after consent.

## local development

```sh
bun run --cwd plugins/auto-plugin-selector test    # 28/28
bun run typecheck                                   # green
```