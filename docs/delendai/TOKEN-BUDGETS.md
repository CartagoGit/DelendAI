# Token Budgets — generated dashboard

<!-- generated: token-budget-dashboard.script.ts -->
<!-- generated — do not edit by hand -->

Generated from the current repository measurements; timestamps are intentionally omitted for deterministic diffs.

This file is generated from the same budget contract the e2e test imports: packages/core/src/lib/contracts/constants/token-budgets.constant.ts. Do not edit this markdown by hand; regenerate it with bun tools/scripts/report/token-budget-dashboard.script.ts.

## What this gate actually measures

`tokens:gate` and this dashboard measure serialized BYTES of the tools/list JSON payload (`toolsListBytes` / `measureToolTextBytes`) — the wire size the MCP client receives, not native LLM tokens. Bytes and tokens correlate but are not interchangeable: bytes-per-token varies across prose descriptions, JSON schemas, and identifiers, so a byte delta does not reliably predict a token delta. The "Component breakdown" and "Top tools by bytes" sections below break every measurement down into name/description/inputSchema/outputSchema/annotations/envelope bytes — the parts that make up that wire size. The "CHECK-007" section separately reports token counts per model, each labelled with how much to trust it (real tokenizer encode vs. byte-ratio estimate) — see that section for what is measured versus estimated.

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

| Surface | Measurement Surface | Bytes | Est. Tokens | Warning | Hard | Status |
| --- | --- | --- | --- | --- | --- | --- |
| overview full | managed | 2,492 | 623 | 11,000 | 11,100 | within hard |
| overview compact | managed | 938 | 235 | 1,450 | 1,500 | within hard |
| overview full (native) | native | 14,799 | 3700 | 27,000 | 28,000 | within hard |
| overview compact (native) | native | 2,483 | 621 | 4,400 | 4,500 | within hard |
| auto_work idle | native | 159 | 40 | 2,400 | 2,600 | within hard |
| auto_work work plan | native | 2,263 | 566 | 2,400 | 2,600 | within hard |
| agent_catalog compact | native | 863 | 216 | 800 | 900 | over warning (800B) |
| agent_catalog full | native | 11,061 | 2766 | 9,800 | 10,500 | over hard (10,500B) |
| analyze_project {} | native | 830 | 208 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | native | 856 | 214 | 1,800 | 2,000 | within hard |
| search_search | native | 872 | 218 | 2,700 | 3,000 | within hard |
| docs_docs_list | native | 207 | 52 | 2,200 | 2,500 | within hard |
| proposals_round_context | native | 151 | 38 | 2,700 | 3,000 | within hard |
| logs_tail | native | 120 | 30 | 5,500 | 6,000 | within hard |

## Catalog and task context cost addendum

Measured with `bun tools/scripts/measure/catalog-task-context-cost.script.ts` against the same synthetic fixture workspace used by the token budget suite. Result bytes are computed from `structuredContent` when present and fall back to concatenated text content otherwise, so compact structured responses and classic text tools are measured on the same reproducible basis. The existing real-preset, plugin-marginal and top-tool tables below remain the schema breakdown source; this addendum pins the extra S1 measurements for `agent_catalog` payloads and routed `project_context` task context snapshots.

| Catalog payload | Surface | Bytes | Est. Tokens |
| --- | --- | --- | --- |
| agent_catalog compact | native | 830 | 208 |
| agent_catalog full | native | 11,027 | 2,757 |

| Catalog breakdown snapshot | Tools | Tools/List Bytes | Schema Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| native core catalog | 31 | 49,726 | 41,585 | 12,817 | 28,768 | 0 |
| swarm native preset | 125 | 137,886 | 107,148 | 32,527 | 74,621 | 10,998 |

Task context corpus: `cold start -> search.search -> docs.docs_list -> logs.tail`, measured as `delendai_compact_router { domain: "core", action: "project_context" }` on the `swarm` preset under `managed`.

| Task context sample | Bytes | Est. Tokens |
| --- | --- | --- |
| cold start | 388 | 97 |
| after search.search | 413 | 104 |
| after docs.docs_list | 434 | 109 |
| after logs.tail | 456 | 114 |

| Percentile | Bytes | Est. Tokens |
| --- | --- | --- |
| p50 | 413 | 104 |
| p95 | 456 | 114 |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface measurement baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap measurement). `Runtime Surface` is shown separately because ordinary DelendAI execution defaults to `managed`; `native` here does not mean that the server is running native.

| Preset | Title | Measurement Surface | Runtime Surface | Source | Plugins | Tools | Tools/List Bytes | Est. Tokens | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | native | managed | tokens-gate | 2 | 42 | 57,581 | 14396 | 47,160 | 3,970 | 14,312 | 32,848 | 4,611 | 1,428 | n/a | within hard | within hard | none |
| minimal | minimal | adaptive | managed | dynamic-client | 2 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 852 | n/a | within hard | n/a | none |
| solo | solo | native | managed | tokens-gate | 10 | 79 | 94,902 | 23726 | 76,087 | 6,536 | 21,210 | 54,877 | 8,202 | 2,632 | n/a | within hard | within hard | none |
| solo | solo | adaptive | managed | dynamic-client | 10 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,272 | n/a | within hard | n/a | none |
| team-pr | team-pr | native | managed | tokens-gate | 18 | 116 | 129,731 | 32433 | 101,723 | 9,832 | 29,606 | 72,117 | 11,615 | 3,869 | n/a | within hard | within hard | none |
| team-pr | team-pr | adaptive | managed | dynamic-client | 18 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,413 | n/a | within hard | n/a | none |
| swarm | swarm | native | managed | tokens-gate | 19 | 125 | 137,886 | 34472 | 107,148 | 11,098 | 32,527 | 74,621 | 10,998 | 4,174 | n/a | within hard | within hard | none |
| swarm | swarm | adaptive | managed | dynamic-client | 19 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,580 | n/a | within hard | n/a | none |
| audit | audit | native | managed | tokens-gate | 15 | 89 | 109,869 | 27468 | 87,762 | 8,210 | 24,031 | 63,731 | 11,568 | 2,799 | n/a | within hard | within hard | none |
| audit | audit | adaptive | managed | dynamic-client | 15 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,052 | n/a | within hard | n/a | none |
| docs-web | docs-web | native | managed | tokens-gate | 8 | 61 | 77,458 | 19365 | 62,726 | 5,341 | 18,102 | 44,624 | 8,202 | 2,252 | n/a | within hard | within hard | none |
| docs-web | docs-web | adaptive | managed | dynamic-client | 8 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,253 | n/a | within hard | n/a | none |
| everything | everything | native | managed | tokens-gate | 58 | 236 | 295,693 | 73924 | 236,429 | 21,727 | 69,667 | 166,762 | 36,062 | 8,012 | n/a | within hard | within hard | none |
| everything | everything | adaptive | managed | dynamic-client | 58 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 2,138 | n/a | within hard | n/a | none |
| dogfood | dogfood | native | managed | tokens-gate | 38 | 237 | 324,237 | 81060 | 263,401 | 22,687 | 74,940 | 188,461 | 79,943 | 7,296 | 151 | over warning (320,000B) | over warning (70,000B) | none |
| dogfood | dogfood | adaptive | managed | dynamic-client | 38 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,835 | n/a | within hard | n/a | none |

## Plugin marginal dashboard — component breakdown by owner

`Tools/List Bytes` per owner is the sum of each tool's own serialized entry (`JSON.stringify({name, description, inputSchema, outputSchema, annotations})`), decomposed into the fields that make it up. `Envelope Bytes` is JSON punctuation and key labels — derived by subtraction, so every row's named-field columns plus Envelope Bytes sum exactly to Tools/List Bytes. `Share of Preset` is this owner's bytes divided by the sum of all owners' bytes in that preset row (not divided by the whole-array `Tools/List Bytes` on the preset-summary table above, which also carries the array's own brackets/commas) — shares always sum to 100%.

| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools | Tools/List Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes | Share of Preset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | core | 31 | 49,694 | 3,340 | 12,817 | 28,768 | 0 | 1,639 | 2,387 | 86.4% |
| minimal | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 8.0% |
| minimal | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 5.6% |
| minimal | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| solo | native | managed | tokens-gate | core | 31 | 49,694 | 3,340 | 12,817 | 28,768 | 0 | 1,639 | 2,387 | 52.4% |
| solo | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 4.9% |
| solo | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 3.4% |
| solo | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 8.6% |
| solo | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 3.1% |
| solo | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 3.8% |
| solo | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 5.9% |
| solo | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 5.5% |
| solo | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 2.0% |
| solo | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 3.7% |
| solo | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 6.6% |
| solo | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| team-pr | native | managed | tokens-gate | core | 31 | 49,694 | 3,340 | 12,817 | 28,768 | 0 | 1,639 | 2,387 | 38.3% |
| team-pr | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 3.6% |
| team-pr | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.5% |
| team-pr | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 6.3% |
| team-pr | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 2.3% |
| team-pr | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 2.8% |
| team-pr | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 4.3% |
| team-pr | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 4.1% |
| team-pr | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 1.4% |
| team-pr | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 2.7% |
| team-pr | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 4.8% |
| team-pr | native | managed | tokens-gate | forge | 11 | 4,710 | 641 | 2,548 | 0 | 0 | 550 | 671 | 3.6% |
| team-pr | native | managed | tokens-gate | commit-policy | 8 | 11,615 | 1,129 | 2,528 | 6,578 | 0 | 400 | 600 | 9.0% |
| team-pr | native | managed | tokens-gate | conventions | 5 | 5,164 | 437 | 761 | 3,101 | 0 | 250 | 385 | 4.0% |
| team-pr | native | managed | tokens-gate | test-convention | 3 | 3,232 | 289 | 533 | 1,907 | 0 | 150 | 231 | 2.5% |
| team-pr | native | managed | tokens-gate | security | 4 | 5,697 | 377 | 602 | 4,074 | 0 | 200 | 308 | 4.4% |
| team-pr | native | managed | tokens-gate | web-fetch | 1 | 928 | 70 | 257 | 444 | 0 | 50 | 77 | 0.7% |
| team-pr | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 1.6% |
| team-pr | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 1.1% |
| team-pr | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| swarm | native | managed | tokens-gate | core | 32 | 50,624 | 3,441 | 13,019 | 29,239 | 0 | 1,693 | 2,464 | 36.7% |
| swarm | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 3.3% |
| swarm | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.3% |
| swarm | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 6.0% |
| swarm | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 2.1% |
| swarm | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 2.6% |
| swarm | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 1.4% |
| swarm | native | managed | tokens-gate | proposals | 4 | 5,026 | 370 | 600 | 3,403 | 0 | 200 | 308 | 3.6% |
| swarm | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 1.0% |
| swarm | native | managed | tokens-gate | logs | 9 | 7,303 | 710 | 2,548 | 2,691 | 0 | 450 | 693 | 5.3% |
| swarm | native | managed | tokens-gate | agent-orchestrator | 5 | 10,998 | 554 | 1,967 | 7,658 | 0 | 250 | 385 | 8.0% |
| swarm | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 5.0% |
| swarm | native | managed | tokens-gate | notification | 2 | 1,872 | 196 | 227 | 1,124 | 0 | 100 | 154 | 1.4% |
| swarm | native | managed | tokens-gate | completion | 3 | 2,431 | 396 | 548 | 1,014 | 0 | 150 | 231 | 1.8% |
| swarm | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 1.5% |
| swarm | native | managed | tokens-gate | forge | 11 | 4,710 | 641 | 2,548 | 0 | 0 | 550 | 671 | 3.4% |
| swarm | native | managed | tokens-gate | commit-policy | 6 | 9,720 | 853 | 1,423 | 6,414 | 0 | 300 | 446 | 7.1% |
| swarm | native | managed | tokens-gate | conventions | 5 | 5,164 | 437 | 761 | 3,101 | 0 | 250 | 385 | 3.7% |
| swarm | native | managed | tokens-gate | test-convention | 3 | 3,232 | 289 | 533 | 1,907 | 0 | 150 | 231 | 2.3% |
| swarm | native | managed | tokens-gate | usage-tracking | 3 | 1,870 | 235 | 795 | 343 | 0 | 150 | 231 | 1.4% |
| swarm | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| audit | native | managed | tokens-gate | core | 31 | 49,694 | 3,340 | 12,817 | 28,768 | 0 | 1,639 | 2,387 | 45.3% |
| audit | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 4.2% |
| audit | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.9% |
| audit | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 2.7% |
| audit | native | managed | tokens-gate | audit | 5 | 11,568 | 983 | 2,076 | 7,732 | 0 | 250 | 385 | 10.5% |
| audit | native | managed | tokens-gate | security | 4 | 5,697 | 377 | 602 | 4,074 | 0 | 200 | 308 | 5.2% |
| audit | native | managed | tokens-gate | web-fetch | 1 | 928 | 70 | 257 | 444 | 0 | 50 | 77 | 0.8% |
| audit | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 4.8% |
| audit | native | managed | tokens-gate | tech-debt | 1 | 1,778 | 117 | 82 | 1,422 | 0 | 50 | 77 | 1.6% |
| audit | native | managed | tokens-gate | link-check | 1 | 1,722 | 112 | 33 | 1,418 | 0 | 50 | 77 | 1.6% |
| audit | native | managed | tokens-gate | project-health | 1 | 1,373 | 100 | 175 | 931 | 0 | 50 | 77 | 1.3% |
| audit | native | managed | tokens-gate | impact-analysis | 2 | 1,904 | 248 | 300 | 1,018 | 0 | 100 | 154 | 1.7% |
| audit | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 5.7% |
| audit | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 3.3% |
| audit | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 1.7% |
| audit | native | managed | tokens-gate | logs | 9 | 7,303 | 710 | 2,548 | 2,691 | 0 | 450 | 693 | 6.7% |
| audit | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| docs-web | native | managed | tokens-gate | core | 31 | 49,694 | 3,340 | 12,817 | 28,768 | 0 | 1,639 | 2,387 | 64.2% |
| docs-web | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 6.0% |
| docs-web | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 4.2% |
| docs-web | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 10.6% |
| docs-web | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 3.8% |
| docs-web | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 3.3% |
| docs-web | native | managed | tokens-gate | link-check | 1 | 1,722 | 112 | 33 | 1,418 | 0 | 50 | 77 | 2.2% |
| docs-web | native | managed | tokens-gate | web-fetch | 1 | 928 | 70 | 257 | 444 | 0 | 50 | 77 | 1.2% |
| docs-web | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 4.5% |
| docs-web | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| everything | native | managed | tokens-gate | core | 31 | 49,755 | 3,361 | 12,931 | 28,694 | 0 | 1,640 | 2,387 | 16.8% |
| everything | native | managed | tokens-gate | adaptive-optimizer | 3 | 7,739 | 354 | 1,929 | 4,940 | 0 | 150 | 231 | 2.6% |
| everything | native | managed | tokens-gate | agent-orchestrator | 5 | 10,998 | 554 | 1,967 | 7,658 | 0 | 250 | 385 | 3.7% |
| everything | native | managed | tokens-gate | api | 3 | 3,832 | 205 | 1,568 | 1,621 | 0 | 150 | 215 | 1.3% |
| everything | native | managed | tokens-gate | audit | 5 | 11,568 | 983 | 2,076 | 7,732 | 0 | 250 | 385 | 3.9% |
| everything | native | managed | tokens-gate | audit-orchestrator | 2 | 1,660 | 159 | 446 | 726 | 0 | 100 | 138 | 0.6% |
| everything | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 2.3% |
| everything | native | managed | tokens-gate | auto-plugin-selector | 1 | 3,726 | 154 | 1,148 | 2,248 | 0 | 50 | 77 | 1.3% |
| everything | native | managed | tokens-gate | browser | 8 | 5,945 | 502 | 1,858 | 2,352 | 0 | 400 | 568 | 2.0% |
| everything | native | managed | tokens-gate | cache | 2 | 2,057 | 153 | 192 | 1,404 | 0 | 103 | 154 | 0.7% |
| everything | native | managed | tokens-gate | commit-policy | 6 | 9,720 | 853 | 1,423 | 6,414 | 0 | 300 | 446 | 3.3% |
| everything | native | managed | tokens-gate | completion | 3 | 2,431 | 396 | 548 | 1,014 | 0 | 150 | 231 | 0.8% |
| everything | native | managed | tokens-gate | container | 11 | 8,663 | 1,293 | 4,150 | 1,496 | 0 | 550 | 783 | 2.9% |
| everything | native | managed | tokens-gate | context-for-change | 1 | 1,034 | 99 | 163 | 597 | 0 | 50 | 77 | 0.3% |
| everything | native | managed | tokens-gate | conventions | 5 | 5,164 | 437 | 761 | 3,101 | 0 | 250 | 385 | 1.7% |
| everything | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 1.3% |
| everything | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 1.8% |
| everything | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 1.1% |
| everything | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 1.0% |
| everything | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 1.2% |
| everything | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 0.5% |
| everything | native | managed | tokens-gate | external-mcps | 8 | 9,394 | 739 | 1,315 | 6,061 | 0 | 400 | 616 | 3.2% |
| everything | native | managed | tokens-gate | forge | 11 | 4,710 | 641 | 2,548 | 0 | 0 | 550 | 671 | 1.6% |
| everything | native | managed | tokens-gate | framework-knowledge | 2 | 2,881 | 198 | 396 | 1,937 | 0 | 100 | 154 | 1.0% |
| everything | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 1.6% |
| everything | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 0.9% |
| everything | native | managed | tokens-gate | impact-analysis | 2 | 1,904 | 248 | 300 | 1,018 | 0 | 100 | 154 | 0.6% |
| everything | native | managed | tokens-gate | issues | 1 | 822 | 65 | 33 | 567 | 0 | 50 | 77 | 0.3% |
| everything | native | managed | tokens-gate | link-check | 1 | 1,722 | 112 | 33 | 1,418 | 0 | 50 | 77 | 0.6% |
| everything | native | managed | tokens-gate | logs | 9 | 7,303 | 710 | 2,548 | 2,691 | 0 | 450 | 693 | 2.5% |
| everything | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 2.8% |
| everything | native | managed | tokens-gate | notification | 2 | 1,872 | 196 | 227 | 1,124 | 0 | 100 | 154 | 0.6% |
| everything | native | managed | tokens-gate | observability | 5 | 5,734 | 423 | 920 | 3,562 | 0 | 250 | 385 | 1.9% |
| everything | native | managed | tokens-gate | orchestrator-runner | 13 | 36,062 | 1,252 | 11,088 | 21,488 | 0 | 650 | 1,001 | 12.2% |
| everything | native | managed | tokens-gate | perf | 3 | 3,668 | 301 | 969 | 1,952 | 0 | 150 | 215 | 1.2% |
| everything | native | managed | tokens-gate | project-health | 1 | 1,373 | 100 | 175 | 931 | 0 | 50 | 77 | 0.5% |
| everything | native | managed | tokens-gate | project-kpis | 1 | 4,093 | 118 | 996 | 2,816 | 0 | 50 | 77 | 1.4% |
| everything | native | managed | tokens-gate | prompt-eval | 2 | 2,514 | 139 | 650 | 1,406 | 0 | 100 | 154 | 0.9% |
| everything | native | managed | tokens-gate | proposals | 4 | 5,026 | 370 | 600 | 3,403 | 0 | 200 | 308 | 1.7% |
| everything | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 1.2% |
| everything | native | managed | tokens-gate | quality-policy | 2 | 1,101 | 286 | 317 | 164 | 0 | 100 | 154 | 0.4% |
| everything | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 2.1% |
| everything | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 1.9% |
| everything | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 1.1% |
| everything | native | managed | tokens-gate | security | 4 | 5,697 | 377 | 602 | 4,074 | 0 | 200 | 308 | 1.9% |
| everything | native | managed | tokens-gate | self-learning | 2 | 2,244 | 160 | 505 | 1,256 | 0 | 100 | 154 | 0.8% |
| everything | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 0.7% |
| everything | native | managed | tokens-gate | tech-debt | 1 | 1,778 | 117 | 82 | 1,422 | 0 | 50 | 77 | 0.6% |
| everything | native | managed | tokens-gate | test-convention | 3 | 3,232 | 289 | 533 | 1,907 | 0 | 150 | 231 | 1.1% |
| everything | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 0.6% |
| everything | native | managed | tokens-gate | usage-tracking | 3 | 1,870 | 235 | 795 | 343 | 0 | 150 | 231 | 0.6% |
| everything | native | managed | tokens-gate | web-fetch | 1 | 928 | 70 | 257 | 444 | 0 | 50 | 77 | 0.3% |
| everything | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| dogfood | native | managed | tokens-gate | core | 31 | 49,694 | 3,340 | 12,817 | 28,768 | 0 | 1,639 | 2,387 | 15.3% |
| dogfood | native | managed | tokens-gate | adaptive-optimizer | 3 | 7,739 | 354 | 1,929 | 4,940 | 0 | 150 | 231 | 2.4% |
| dogfood | native | managed | tokens-gate | audit | 5 | 11,568 | 983 | 2,076 | 7,732 | 0 | 250 | 385 | 3.6% |
| dogfood | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 2.1% |
| dogfood | native | managed | tokens-gate | auto-plugin-selector | 1 | 3,726 | 154 | 1,148 | 2,248 | 0 | 50 | 77 | 1.2% |
| dogfood | native | managed | tokens-gate | commit-policy | 8 | 11,615 | 1,129 | 2,528 | 6,578 | 0 | 400 | 600 | 3.6% |
| dogfood | native | managed | tokens-gate | completion | 3 | 2,431 | 396 | 548 | 1,014 | 0 | 150 | 231 | 0.8% |
| dogfood | native | managed | tokens-gate | container | 11 | 8,663 | 1,293 | 4,150 | 1,496 | 0 | 550 | 783 | 2.7% |
| dogfood | native | managed | tokens-gate | conventions | 5 | 5,164 | 437 | 761 | 3,101 | 0 | 250 | 385 | 1.6% |
| dogfood | native | managed | tokens-gate | context-for-change | 1 | 1,034 | 99 | 163 | 597 | 0 | 50 | 77 | 0.3% |
| dogfood | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 1.6% |
| dogfood | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 1.0% |
| dogfood | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 0.9% |
| dogfood | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 1.1% |
| dogfood | native | managed | tokens-gate | forge | 11 | 4,710 | 641 | 2,548 | 0 | 0 | 550 | 671 | 1.5% |
| dogfood | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 1.4% |
| dogfood | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 0.8% |
| dogfood | native | managed | tokens-gate | impact-analysis | 2 | 1,904 | 248 | 300 | 1,018 | 0 | 100 | 154 | 0.6% |
| dogfood | native | managed | tokens-gate | project-health | 1 | 1,373 | 100 | 175 | 931 | 0 | 50 | 77 | 0.4% |
| dogfood | native | managed | tokens-gate | quality-policy | 2 | 1,101 | 286 | 317 | 164 | 0 | 100 | 154 | 0.3% |
| dogfood | native | managed | tokens-gate | link-check | 1 | 1,722 | 112 | 33 | 1,418 | 0 | 50 | 77 | 0.5% |
| dogfood | native | managed | tokens-gate | logs | 9 | 7,303 | 710 | 2,548 | 2,691 | 0 | 450 | 693 | 2.3% |
| dogfood | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 2.5% |
| dogfood | native | managed | tokens-gate | notification | 2 | 1,872 | 196 | 227 | 1,124 | 0 | 100 | 154 | 0.6% |
| dogfood | native | managed | tokens-gate | orchestrator-runner | 13 | 36,062 | 1,252 | 11,088 | 21,488 | 0 | 650 | 1,001 | 11.1% |
| dogfood | native | managed | tokens-gate | agent-orchestrator | 5 | 10,998 | 554 | 1,967 | 7,658 | 0 | 250 | 385 | 3.4% |
| dogfood | native | managed | tokens-gate | perf | 3 | 3,668 | 301 | 969 | 1,952 | 0 | 150 | 215 | 1.1% |
| dogfood | native | managed | tokens-gate | proposals | 50 | 79,943 | 4,605 | 15,549 | 51,428 | 0 | 2,620 | 3,850 | 24.7% |
| dogfood | native | managed | tokens-gate | project-kpis | 1 | 4,093 | 118 | 996 | 2,816 | 0 | 50 | 77 | 1.3% |
| dogfood | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 1.1% |
| dogfood | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 1.7% |
| dogfood | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 1.0% |
| dogfood | native | managed | tokens-gate | security | 4 | 5,697 | 377 | 602 | 4,074 | 0 | 200 | 308 | 1.8% |
| dogfood | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 0.6% |
| dogfood | native | managed | tokens-gate | tech-debt | 1 | 1,778 | 117 | 82 | 1,422 | 0 | 50 | 77 | 0.5% |
| dogfood | native | managed | tokens-gate | test-convention | 3 | 3,232 | 289 | 533 | 1,907 | 0 | 150 | 231 | 1.0% |
| dogfood | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 0.6% |
| dogfood | native | managed | tokens-gate | usage-tracking | 3 | 1,870 | 235 | 795 | 343 | 0 | 150 | 231 | 0.6% |
| dogfood | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 0.4% |
| dogfood | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |

## Top tools by bytes (dogfood preset, native surface)

The 20 individual tools that cost the most tools/list bytes in the largest governed preset, with the same component breakdown as the owner table above. This is where "concentration" becomes concrete: a handful of tools account for a disproportionate share of the whole surface.

| Tool | Owner | Total Bytes | Name Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| delendai_orchestrator-runner_discover_providers | orchestrator-runner | 11,712 | 49 | 113 | 33 | 11,390 | 0 | 50 | 77 |
| delendai_orchestrator-runner_format_handoff | orchestrator-runner | 6,188 | 45 | 88 | 5,698 | 230 | 0 | 50 | 77 |
| delendai_agent-orchestrator_dispatch | agent-orchestrator | 4,737 | 38 | 113 | 660 | 3,799 | 0 | 50 | 77 |
| delendai_adaptive-optimizer_adaptive_facade | adaptive-optimizer | 4,589 | 45 | 127 | 757 | 3,533 | 0 | 50 | 77 |
| delendai_proposals_close_slice | proposals | 4,216 | 32 | 75 | 932 | 3,050 | 0 | 50 | 77 |
| delendai_project-kpis_project_kpis | project-kpis | 4,093 | 36 | 118 | 996 | 2,816 | 0 | 50 | 77 |
| delendai_configuration_center | core | 3,796 | 31 | 92 | 203 | 3,334 | 0 | 59 | 77 |
| delendai_auto-plugin-selector_plugins_recommend | auto-plugin-selector | 3,726 | 49 | 154 | 1,148 | 2,248 | 0 | 50 | 77 |
| delendai_commit-policy_commit_policy_status | commit-policy | 3,666 | 45 | 153 | 33 | 3,308 | 0 | 50 | 77 |
| delendai_adopt_project | core | 3,649 | 24 | 141 | 355 | 3,001 | 0 | 51 | 77 |
| delendai_create_project | core | 3,632 | 25 | 114 | 3,021 | 343 | 0 | 52 | 77 |
| delendai_audit_audit_run | audit | 3,611 | 26 | 277 | 988 | 2,193 | 0 | 50 | 77 |
| delendai_orchestrator-runner_list_models | orchestrator-runner | 3,440 | 42 | 89 | 33 | 3,149 | 0 | 50 | 77 |
| delendai_proposals_review_queue | proposals | 3,396 | 33 | 92 | 276 | 2,868 | 0 | 50 | 77 |
| delendai_proposals_proposals_close_plan | proposals | 3,387 | 41 | 123 | 517 | 2,579 | 0 | 50 | 77 |
| delendai_scaffold | core | 3,365 | 19 | 103 | 1,756 | 1,356 | 0 | 54 | 77 |
| delendai_create_plugin | core | 3,348 | 24 | 194 | 535 | 2,467 | 0 | 51 | 77 |
| delendai_audit_audit_consolidate | audit | 3,175 | 34 | 269 | 343 | 2,402 | 0 | 50 | 77 |
| delendai_proposals_agent_lock | proposals | 3,159 | 31 | 116 | 436 | 2,449 | 0 | 50 | 77 |
| delendai_proposals_proposal_transition | proposals | 3,127 | 40 | 78 | 1,072 | 1,810 | 0 | 50 | 77 |

## CHECK-007 — tokenizer cost by preset

This gate (`tokens:gate` / `tokens:dashboard:generate`) measures serialized BYTES of the tools/list JSON payload, not native LLM tokens — bytes-per-token varies enough across prose descriptions, JSON schemas, and identifiers that a byte count cannot substitute for a real token count. The table below reports both, with an explicit confidence label per model: `measured-real-bpe` is a real encode with the model's own published tokenizer (gpt-tokenizer for gpt-5.4); `measured-legacy-bpe` is a real BPE encode but on a vocabulary the vendor published for an older model generation (Anthropic has not published an offline tokenizer for Claude Sonnet 4, so @anthropic-ai/tokenizer's pre-Claude-3 vocabulary is used as the closest available real encoder); `estimated-byte-ratio` is bytes / 4, used only where no offline tokenizer package exists (Gemini). See tools/scripts/report/tokenizer-real.script.ts for the profile definitions.

| Preset | Measurement Surface | Runtime Surface | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Confidence (per model, in order above) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | 57,581 | 13258 | 13308 | 14396 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| minimal | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| solo | native | managed | tokens-gate | 94,902 | 21956 | 22004 | 23726 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| solo | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| team-pr | native | managed | tokens-gate | 129,731 | 30377 | 30444 | 32433 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| team-pr | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | native | managed | tokens-gate | 137,886 | 32349 | 32394 | 34472 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| audit | native | managed | tokens-gate | 109,869 | 25619 | 25606 | 27468 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| audit | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| docs-web | native | managed | tokens-gate | 77,458 | 17920 | 17925 | 19365 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| docs-web | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| everything | native | managed | tokens-gate | 295,693 | 69504 | 69562 | 73924 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| everything | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| dogfood | native | managed | tokens-gate | 324,237 | 76478 | 76528 | 81060 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| dogfood | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |

## Documented deficits (kept, not auto-bumped)

- none

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 6,336 | ok | — | 57,581 | ok | — |
| solo | 6,336 | ok | — | 94,902 | ok | — |
| team-pr | 6,336 | ok | — | 129,731 | ok | — |
| swarm | 6,336 | ok | — | 137,886 | ok | — |
| audit | 6,336 | ok | — | 109,869 | ok | — |
| docs-web | 6,336 | ok | — | 77,458 | ok | — |
| everything | 6,336 | ok | — | 295,693 | ok | — |
| dogfood | 6,336 | ok | — | 324,237 | warning | — |

Metrics for plugin lifecycle transitions (c00134). Counters are 
process-local aggregates; the router emits them on each transition 
and the dashboard projects the snapshot. All values below start at 
zero in a fresh process and accumulate over the host run.

## Plugin Lifecycle

### Counters

| Event | Count |
| --- | --- |
| loaded | 0 |
| activated | 0 |
| invoked | 0 |
| unloaded | 0 |
| denied | 0 |

### Histograms

| Event | Count | Total ms | Max ms |
| --- | --- | --- | --- |
| plugin.prepare.duration_ms | 0 | 0 | 0 |
| plugin.activate.duration_ms | 0 | 0 | 0 |

### State gauges

| State | Count |
| --- | --- |

### Top plugins by invocation

| Plugin | Invocations |
| --- | --- |

## Activation KPIs

Source snapshot: .vscode/delendai/kpis.json

No local activation KPI snapshot was found at .vscode/delendai/kpis.json.

This dashboard can only render a previously persisted local snapshot. Runtime collection and disk writes must be performed by the caller or host integration that owns the session lifecycle.

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
