# Token Budgets — generated dashboard

<!-- generated: token-budget-dashboard.script.ts -->
<!-- generated — do not edit by hand -->

Generated at: 2026-08-25T04:22:43.071Z

This file is generated from the same budget contract the e2e test imports: packages/core/src/lib/contracts/constants/token-budgets.constant.ts. Do not edit this markdown by hand; regenerate it with bun tools/scripts/report/token-budget-dashboard.script.ts.

## Semantics

- hard ceiling: the documented absolute limit for a governed surface. In the e2e gate it is the failing threshold; in this generated dashboard it is also used to flag real preset deficits that must not be auto-bumped.
- warning ceiling: advisory threshold. Crossing it emits a warning or a report flag but does not fail by itself.
- release ceiling: the relative release gate remains 20% against the persisted metrics baseline; this proposal does not replace that longitudinal guard.
- marginal plugin ceiling: max static tools/list bytes one plugin is allowed to contribute within a governed preset. This is tracked separately from the total preset ceiling.

## Bump policy

Any ceiling increase must be deliberate: justify the cost, show the benefit, attempt a compensation, and document the decision in this contract and the generated report.

1. justify-the-cost
2. show-the-benefit
3. attempt-a-compensation
4. document-the-decision

## Fixture-gated surfaces

These are the bounded payloads the e2e spec governs directly today. They use the historical synthetic workspace fixture, so the hard ceilings stay stable until a future proposal deliberately tightens or re-baselines them.

| Surface | Bytes | Est. Tokens | Warning | Hard | Status |
| --- | --- | --- | --- | --- | --- |
| overview full | 11,700 | 2925 | 11,000 | 11,100 | over hard (11,100B) |
| overview compact | 1,554 | 389 | 1,450 | 1,500 | over hard (1,500B) |
| auto_work idle | 159 | 40 | 2,400 | 2,600 | within hard |
| auto_work work plan | 2,453 | 614 | 2,400 | 2,600 | over warning (2,400B) |
| agent_catalog compact | 426 | 107 | 800 | 900 | within hard |
| agent_catalog full | 5,643 | 1411 | 6,500 | 6,800 | within hard |
| analyze_project {} | 829 | 208 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | 836 | 209 | 1,800 | 2,000 | within hard |
| search_search | 874 | 219 | 2,700 | 3,000 | within hard |
| docs_docs_list | 209 | 53 | 2,200 | 2,500 | within hard |
| proposals_round_context | 153 | 39 | 2,700 | 3,000 | within hard |
| logs_tail | 2,608 | 652 | 5,500 | 6,000 | within hard |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. It treats tools/list as first-order static context cost and breaks the payload down by preset and owner plugin.

| Preset | Title | Plugins | Tools | Tools/List Bytes | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | 2 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 494 | n/a | within hard | within hard | none |
| lean | lean | 4 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 554 | n/a | within hard | within hard | none |
| standard | standard | 18 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,144 | n/a | within hard | within hard | none |
| swarm | swarm | 26 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,599 | n/a | within hard | within hard | none |
| full | full | 30 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,805 | n/a | within hard | within hard | none |
| vertex | vertex | 35 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 2,017 | n/a | within hard | within hard | none |
| web-app | web-app | 18 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,202 | n/a | n/a | n/a | none |
| backend-api | backend-api | 16 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,105 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | 8 | 6 | 8,357 | 7,121 | 506 | 1,020 | 6,101 | 0 | 695 | n/a | n/a | n/a | none |

## Plugin marginal dashboard

| Preset | Owner | Tools | Tools/List Bytes | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| lean | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| standard | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| swarm | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| full | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| vertex | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| web-app | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| backend-api | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| cli-tool | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |

## CHECK-007 — tokenizer cost by preset

The repo has no lightweight LLM tokenizer dependency installed today. This report therefore uses an explicit fallback estimator of 4 bytes/token, published as an estimate rather than pretending to be an exact tokenizer. The script lives in tools/scripts/report/tokenizer-real.script.ts so the fallback can be replaced by a real tokenizer later without changing the dashboard contract.

| Preset | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Estimator | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 8,357 | 14434 | 14434 | 14434 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| lean | 8,357 | 17479 | 17479 | 17479 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| standard | 8,357 | 30514 | 30514 | 30514 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| swarm | 8,357 | 54747 | 54747 | 54747 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| full | 8,357 | 56505 | 56505 | 56505 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| vertex | 8,357 | 74644 | 74644 | 74644 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| web-app | 8,357 | 28550 | 28550 | 28550 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| backend-api | 8,357 | 28154 | 28154 | 28154 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| cli-tool | 8,357 | 20022 | 20022 | 20022 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |

## Documented deficits (kept, not auto-bumped)

- none

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
