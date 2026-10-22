---
id: f00776
title: "Token ROI measured and model-agnostic: every tool's value is demonstrated with data that does not need to know the model"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-10-20
last-transition-id: d18d0129-58e5-4fcb-92ef-dfcd32d576f7
last-correlation-id: d18d0129-58e5-4fcb-92ef-dfcd32d576f7
last-transition-from: ready
last-transition-at: 2026-10-22T07:02:51.624Z
---

# f00776 — Token ROI measured and model-agnostic: every tool's value is demonstrated with data that does not need to know the model

## goal

The per-plugin token ROI (`c00136`) stops being an algebra with no data behind it. A report says which tools earn their place, and every number in it is reproducible from what the process already measured — bytes served, bytes answered, calls made, errors raised — with no statement in the contract about which model, provider, host or agent produced it. A number that could only be computed by knowing the model is reported as an explicitly labelled annotation beside the model-free one, never mixed into it. A number that was not measured is reported as not measured, never as zero.

## why

`c00136` shipped `computeROI`, `aggregateROI`, `IRoiMeasurement` and `IRoiReport` (`packages/core/src/lib/budgets/roi.ts`), and shipped the report generator that is supposed to fill them in. It never shipped the filling.

**The generator builds an empty array by hand.** `tools/scripts/report/token-roi.script.ts:65-70`:

```ts
// Measurements come from the process-local plugin metrics when they
// exist; in a standalone generator run they are empty, so the report
// is a zero-sample skeleton unless a host has populated the metrics.
const measurements: IRoiMeasurement[] = [];
const reports = aggregateROI(measurements, lookup);
```

The comment describes the empty array as the state of a standalone run, as though a host were expected to populate it. No host does. A repo-wide search for producers of `IRoiMeasurement` returns exactly six files: the pure definition, the CLI re-export (`packages/core/src/cli.ts:244-246`), the manifest lookup builder, this generator with its empty array, a spec that constructs fixtures by hand (`packages/core/tests/src/lib/budgets/roi.spec.ts:105`), and the original proposal. The readers of persisted metric snapshots are likewise absent: `<cacheDir>/metrics` has one writer (`packages/core/src/lib/cli/assemble-core-tools.ts:386`) and no reader.

**The hole is double, and the second half is invisible.** `aggregateROI` skips any plugin whose `value` the lookup does not resolve (`roi.ts:91`, `if (value === undefined) continue`). A search for `value:` across every plugin manifest returns nothing. So `buildValueLookup` produces an empty map, and `aggregateROI` would return `[]` even with a fully populated measurement array. Two independent cuts sit on the same output; fixing one exposes nothing.

**The machinery that would fill it already exists and is already honest.** `tools/scripts/metrics/collect-candidate.script.ts` boots a real server against a real preset (`--preset=swarm`, `--surface=native`, `REPEATS = 3` at `:33`), lists the tools, invokes the tracked read-only ones, and writes a candidate snapshot. That is precisely the session a ROI measurement needs, and nothing has ever pointed the ROI report at it.

**Everything `IRoiMeasurement` asks for is already measured, in bytes.** `schemaBytes` comes from `recordToolListServed` → `servedBytes` per tool (`metrics-registry.ts:283-286`); `responseTokens` from `totals.cost.estimatedTokens.estimatedTokens4B` (`metrics-registry.ts:113`, `ceil(wireEstimateBytes / 4)`); `successfulCalls` from `tools[tool].calls − tools[tool].errors` (`metrics-registry.ts:19-37`); and `pluginId` from the `owner` `classifyToolOwner` already computes. The instrumentation gap is not in the numbers — it is the join from tool name to plugin id, and the decision of which measurement counts as a sample.

**The cost layer that does know the model is correctly quarantined, and must stay so.** `plugins/usage-tracking/src/lib/pricing.ts` resolves a LiteLLM price table with a 24h TTL (`PRICING_TTL_MS`, `:34`), and returns `null` for subscription plans rather than fabricating a per-token figure (`:13-15`, 'we never fabricate'). `usage-rollup.service.ts` aggregates `costUsd` at `:37`, `:69`, `:239`, `:335`. None of it is imported by `packages/core/src/lib/budgets/` or by `metrics/`. That separation is the asset this proposal spends: the core can rank value without a single dollar, and a project that wants dollars can add them at the edge without changing what was ranked.

**The dishonesty pattern the repo has already solved twice.** `payload-percentile.ts:1-24` records the bug that motivated it: a producer emitted `p95PayloadBytes: null` while the consumer demanded a finite number, and coercing `null → 0` told the gate the payload had got cheaper without having observed anything. The fix was a discriminated union carrying `hasSamples: false` as a first-class state (`payload-percentile.ts:26-32`). The same discipline appears in `manifest.ts:14-17`, in `diff-snapshots.script.ts:114-128` (`bytesPerCall` returns `null`, never `0`) and in its `isComparableSurface` guard at `:145-152` (comparing against a capture where the plugins did not load 'describes the broken capture rather than any change in the code'). `IRoiReport` has none of this: it returns `roi: 0` with `confidence: 'low'`, which is the same shape of lie the percentile module removed. A report that says "plugin X returned 0 ROI" when nothing was ever measured for it is worse than no report, because it ranks.

**What an honest model-aware layer looks like already exists too.** `tokenizer-real.script.ts:63-92` holds three profiles, each carrying its own `ITokenizerConfidence` (`measured-real-bpe`, `measured-legacy-bpe`, `estimated-byte-ratio`) and a `note` that admits when a count is 'a genuine token count on a DIFFERENT vocabulary, not an exact count for this model'. That is the contract this proposal extends to the ROI report: measured-with-confidence beside model-free, never instead of it.

**Why this design.** The agnosticism is forced by what delendai can observe. delendai runs inside a host it did not choose, behind a provider that routes to a model it may never have heard of, serving an agent that may be one of many on the same machine. A ROI figure that depended on knowing the model would stop existing the moment a new maker ships — exactly the failure already visible in `tokenizer-real.script.ts`, where a model outside the three profiles is silently omitted, and in `tools/scripts/verify/post-slice-f00500-evidence.script.ts:152,164`, where the LLM-brand check is a hand-written allowlist of ten makers whose `gpt-?[3-9]` does not even match `gpt-10`. A gate that passes what it does not recognise is worse than a gate that is noisy. So bytes are what delendai can count for sure; anything a project wants to know about price, tier or context window belongs to `usage-tracking` and reaches the report only as an annotation carrying its own confidence. The measurement session reuses `collect-candidate.script.ts` rather than inventing a second boot path, for the same reason `preset-metadata.script.ts` reuses the dashboard's measurement ('no second, drift-prone measurement path', quoted at `token-budget-dashboard.script.ts:88-94`). And value declaration is made honest before it is made mandatory: a plugin that cannot state what it is worth should be absent with a reason, not present with a zero.

**Re-analysis before working any slice.** Written from a reading of the repository on 2026-10-20. Every claim is cheap to re-check and all of them drift. `tools/scripts/report/token-roi.script.ts:69` may no longer declare an empty array (if a producer appeared, S3 is done); `grep -rn '^\s*value:' plugins/*/manifest.ts` may no longer return nothing (then S1's visible-silence half is unnecessary); the three tokenizer profiles may have gained a fourth (S4 must not duplicate it); `budget-exception-pending` on `agentCatalogFull` (`token-budgets.constant.ts:194-195`) may have been resolved, which changes what "no ceiling change" means. Falsifiers: `grep -rn "IRoiMeasurement" --include=*.ts`; `grep -rn '^\s*value:' plugins/*/manifest.ts`; `grep -rn "from.*budgets" plugins/usage-tracking/src`; `grep -rniE "gpt|claude|gemini|opus|price|usd" packages/core/src/lib/{metrics,budgets}`; read `payload-percentile.ts:26-32`.

## non-goals

- Changing `computeROI`'s formula, `IRoiMeasurement`'s shape, or `confidenceFor`'s sample buckets. `c00136` chose them and this proposal keeps them; changing the algebra is a separate decision with its own before/after.
- Making `usage-tracking` mandatory, or moving `costUsd` into `packages/core/src/lib/budgets/`. The layering that keeps dollars out of the core is the point.
- Raising, lowering or re-baselining any ceiling in `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`. The `bumpPolicy` (`:331-340`) and the live `budget-exception-pending` on `agentCatalogFull` (`:194-195`, expired 2026-09-30) are untouched.
- Rendering the ROI report on any page. `TOKEN_ROI_OUTPUT_PATH` is deliberately kept in the cache ('no page reads it', `token-roi.script.ts:14-18`) and stays there.
- A per-session or per-agent cost model, and any claim about economic totals. delendai does not observe the tokens a host spends privately; only what crossed its own boundary.
- Making any plugin faster or smaller. This proposal measures and reports; it does not optimise a payload.

## slices

- global_gate: type

### S1 — A plugin can declare what it is worth, and its silence is visible
- **Status**: done
- **Files**: `packages/core/src/lib/budgets/manifest.ts`, `packages/core/src/lib/contracts/interfaces/roi-report.interface.ts`, `packages/core/tests/src/lib/budgets/manifest.spec.ts`
- **Gate**: none
- acceptance:
  - "`buildValueLookup` keeps reporting `undefined` for a plugin that declares no value (no coercion to `0`), and `parsePluginValue`'s existing rule — a positive integer or nothing (`manifest.ts:25-30`) — is unchanged."
  - "A lookup can report every plugin it could not rank and why, so an unranked plugin is a named result rather than a silent skip."
  - "A spec drives the lookup over a fixture where one plugin declares a valid value, one declares a rejected value, and one declares none."

### S2 — Measurements are derived model-free, and an unmeasured entry never scores zero
- **Status**: done
- **Files**: `packages/core/src/lib/budgets/roi.ts`, `packages/core/src/lib/contracts/interfaces/roi-report.interface.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/budgets/roi.spec.ts`
- **Gate**: none
- acceptance:
  - "A producer (`measurementsFromSnapshot`) turns a metrics snapshot into `IRoiMeasurement[]`: `pluginId` from the same `classifyToolOwner` the dashboard uses, `successfulCalls = calls − errors`, `schemaBytes` from the bytes the same session's `tools/list` served for that owner's tools (the snapshot keeps only the listing's total), `responseTokens` from each owner's tools' `cost.estimatedTokens.estimatedTokens4B` (the snapshot total is every owner's at once). It reads call counts and bytes only, never a model name; an owner whose tools were served and never called is a measurement with zero calls."
  - "`IRoiReport` carries an explicit measured/unmeasured discriminator, modelled on the `hasSamples` union at `payload-percentile.ts:26-32`. An unmeasured entry has no `roi` and no `sampleSize`; it cannot be rendered as `0`."
  - "Any consumer that sorts by ROI orders only measured entries; a plugin with no calls cannot sort above one with calls."
  - "`aggregateROI` keeps skipping plugins whose value is `undefined` (`roi.ts:91`); it does not begin emitting `roi: 0` for them."

### S3 — The generator fills the report from a real measurement session
- **Status**: done
- **Files**: `tools/scripts/report/token-roi.script.ts`, `tools/scripts/metrics/collect-candidate.script.ts`, `tools/scripts/report/token-roi.spec.ts`
- **Gate**: none
- acceptance:
  - "The generator obtains its snapshot by reusing `collect-candidate.script.ts`'s boot path — same preset, same `--surface=native`, same `REPEATS` averaging — rather than a second measurement route; a comment states why, in the terms `preset-metadata.script.ts:88-94` already used."
  - "Running the generator writes a report at `TOKEN_ROI_OUTPUT_PATH` (`.cache/delendai/reports/token-roi.json`, `:20`) whose rows come from that real measurement session, through `withFileMutex` and `writeFileAtomic` as the script already does at `:120-126`."
  - "The generator reports which plugins were measured but unrankable for want of a declared value, and a plugin with zero calls is distinguishable from one that was called and cheap."
  - "`renderRoiMarkdown` is wired into the output: a run prints it, with the unmeasured and the unranked plugins, before naming the file it wrote."

### S4 — Model-dependent numbers arrive as labelled annotations, never as inputs
- **Status**: done
- **Files**: `tools/scripts/report/token-roi.script.ts`, `tools/scripts/report/token-roi.spec.ts`
- **Gate**: none
- acceptance:
  - "Each row may carry an annotation block holding a model-dependent estimate — a real token count, a price, a context-window share — and every such value carries its `ITokenizerConfidence` (the vocabulary already at `tokenizer-real.script.ts:27-30`) and names where it came from."
  - "Removing every annotation leaves the ranking and the rows byte-identical; a spec asserts this by computing the report with and without annotations."
  - "A model absent from `TOKENIZER_PROFILES` yields the declared generic `bytes/4` estimate at `estimated-byte-ratio` confidence with a row present, instead of being silently omitted as `measurePresetTokenizerCosts` did (`tokenizer-real.script.ts:113-139`) — shipped by `f00777` S5, which carries the same acceptance."

### S5 — A gate keeps the report honest and the metrics path model-free
- **Status**: done
- **Files**: `package.json`, `tools/scripts/lint/roi-model-free.script.ts`, `tools/scripts/lint/roi-model-free.spec.ts`, `tools/scripts/report/token-roi.script.ts`
- **Gate**: none
- acceptance:
  - "The generator refuses to write a report that claims rows it did not measure: `unsupportedRoiClaims` checks every row and unmeasured entry against the session's measurements, which the report carries, and fails on any with no traceable sample or a sample size that is not the measured calls."
  - "The same check fails when an owner with successful calls is neither ranked nor named unranked, so a regression back to the empty array while the session had calls cannot pass silently."
  - "A gate asserts that `packages/core/src/lib/budgets/` and `packages/core/src/lib/metrics/` contain no model identifier, no price and no currency symbol, rather than trusting review."
  - "`package.json` wires the model-free gate (`lint:roi-model-free`) into `lint:architecture`, which CI and `bun run validate` run."

## acceptance

- `buildValueLookup` keeps reporting `undefined` for a plugin that declares no value (no coercion to `0`), and `parsePluginValue`'s existing rule — a positive integer or nothing (`manifest.ts:25-30`) — is unchanged.
- A lookup can report every plugin it could not rank and why, so an unranked plugin is a named result rather than a silent skip.
- A spec drives the lookup over a fixture where one plugin declares a valid value, one declares a rejected value, and one declares none.
- A producer (`measurementsFromSnapshot`) turns a metrics snapshot into `IRoiMeasurement[]`: `pluginId` from the same `classifyToolOwner` the dashboard uses, `successfulCalls = calls − errors`, `schemaBytes` from the bytes the same session's `tools/list` served for that owner's tools (the snapshot keeps only the listing's total), `responseTokens` from each owner's tools' `cost.estimatedTokens.estimatedTokens4B` (the snapshot total is every owner's at once). It reads call counts and bytes only, never a model name; an owner whose tools were served and never called is a measurement with zero calls.
- `IRoiReport` carries an explicit measured/unmeasured discriminator, modelled on the `hasSamples` union at `payload-percentile.ts:26-32`. An unmeasured entry has no `roi` and no `sampleSize`; it cannot be rendered as `0`.
- Any consumer that sorts by ROI orders only measured entries; a plugin with no calls cannot sort above one with calls.
- `aggregateROI` keeps skipping plugins whose value is `undefined` (`roi.ts:91`); it does not begin emitting `roi: 0` for them.
- The generator obtains its snapshot by reusing `collect-candidate.script.ts`'s boot path — same preset, same `--surface=native`, same `REPEATS` averaging — rather than a second measurement route; a comment states why, in the terms `preset-metadata.script.ts:88-94` already used.
- Running the generator writes a report at `TOKEN_ROI_OUTPUT_PATH` (`.cache/delendai/reports/token-roi.json`, `:20`) whose rows come from that real measurement session, through `withFileMutex` and `writeFileAtomic` as the script already does at `:120-126`.
- The generator reports which plugins were measured but unrankable for want of a declared value, and a plugin with zero calls is distinguishable from one that was called and cheap.
- `renderRoiMarkdown` is wired into the output: a run prints it, with the unmeasured and the unranked plugins, before naming the file it wrote.
- Each row may carry an annotation block holding a model-dependent estimate — a real token count, a price, a context-window share — and every such value carries its `ITokenizerConfidence` (the vocabulary already at `tokenizer-real.script.ts:27-30`) and names where it came from.
- Removing every annotation leaves the ranking and the rows byte-identical; a spec asserts this by computing the report with and without annotations.
- A model absent from `TOKENIZER_PROFILES` yields the declared generic `bytes/4` estimate at `estimated-byte-ratio` confidence with a row present, instead of being silently omitted as `measurePresetTokenizerCosts` did (`tokenizer-real.script.ts:113-139`) — shipped by `f00777` S5, which carries the same acceptance.
- The generator refuses to write a report that claims rows it did not measure: `unsupportedRoiClaims` checks every row and unmeasured entry against the session's measurements, which the report carries, and fails on any with no traceable sample or a sample size that is not the measured calls.
- The same check fails when an owner with successful calls is neither ranked nor named unranked, so a regression back to the empty array while the session had calls cannot pass silently.
- A gate asserts that `packages/core/src/lib/budgets/` and `packages/core/src/lib/metrics/` contain no model identifier, no price and no currency symbol, rather than trusting review.
- `package.json` wires the model-free gate (`lint:roi-model-free`) into `lint:architecture`, which CI and `bun run validate` run.
