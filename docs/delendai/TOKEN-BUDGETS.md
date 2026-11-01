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
| overview full (native) | native | 14,859 | 3715 | 27,000 | 28,000 | within hard |
| overview compact (native) | native | 2,483 | 621 | 4,400 | 4,500 | within hard |
| auto_work idle | native | 159 | 40 | 2,400 | 2,600 | within hard |
| auto_work work plan | native | 2,263 | 566 | 2,400 | 2,600 | within hard |
| agent_catalog compact | native | 863 | 216 | 800 | 900 | over warning (800B) |
| agent_catalog full | native | 11,027 | 2757 | 9,800 | 10,500 | over hard (10,500B) |
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
| agent_catalog full | native | 10,993 | 2,749 |

| Catalog breakdown snapshot | Tools | Tools/List Bytes | Schema Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| native core catalog | 31 | 49,688 | 41,547 | 12,817 | 28,730 | 0 |
| swarm native preset | 154 | 165,376 | 127,895 | 39,519 | 88,376 | 10,998 |

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
| minimal | minimal | native | managed | tokens-gate | 2 | 42 | 57,543 | 14386 | 47,122 | 3,970 | 14,312 | 32,810 | 4,611 | 1,428 | n/a | within hard | within hard | none |
| minimal | minimal | adaptive | managed | dynamic-client | 2 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 852 | n/a | within hard | n/a | none |
| lean | lean | native | managed | tokens-gate | 4 | 55 | 68,707 | 17177 | 55,494 | 4,758 | 17,140 | 38,354 | 8,202 | 1,993 | n/a | within hard | within hard | none |
| lean | lean | adaptive | managed | dynamic-client | 4 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,215 | n/a | within hard | n/a | none |
| standard | standard | native | managed | tokens-gate | 19 | 113 | 132,624 | 33156 | 104,828 | 10,068 | 31,135 | 73,693 | 10,998 | 3,705 | n/a | over warning (132,000B) | over warning (9,500B) | none |
| standard | standard | adaptive | managed | dynamic-client | 19 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,430 | n/a | within hard | n/a | none |
| swarm | swarm | native | managed | tokens-gate | 27 | 154 | 165,376 | 41344 | 127,895 | 13,405 | 39,519 | 88,376 | 10,998 | 4,903 | n/a | within hard | within hard | none |
| swarm | swarm | adaptive | managed | dynamic-client | 27 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,625 | n/a | within hard | n/a | none |
| full | full | native | managed | tokens-gate | 39 | 185 | 197,424 | 49356 | 152,644 | 15,780 | 46,670 | 105,974 | 10,998 | 6,013 | n/a | within hard | within hard | none |
| full | full | adaptive | managed | dynamic-client | 39 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,804 | n/a | within hard | n/a | none |
| dogfood | dogfood | native | managed | tokens-gate | 38 | 237 | 324,229 | 81058 | 263,309 | 22,771 | 74,940 | 188,369 | 79,973 | 7,296 | 151 | over warning (320,000B) | over warning (70,000B) | none |
| dogfood | dogfood | adaptive | managed | dynamic-client | 38 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,835 | n/a | within hard | n/a | none |
| web-app | web-app | native | managed | tokens-gate | 18 | 103 | 115,608 | 28902 | 90,620 | 8,896 | 27,677 | 62,943 | 8,663 | 3,563 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | managed | dynamic-client | 18 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,378 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | managed | tokens-gate | 16 | 102 | 113,986 | 28497 | 89,221 | 8,853 | 27,708 | 61,513 | 8,663 | 3,427 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | managed | dynamic-client | 16 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,354 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | managed | tokens-gate | 7 | 62 | 77,723 | 19431 | 62,715 | 5,465 | 18,916 | 43,799 | 8,202 | 2,224 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | managed | dynamic-client | 7 | 7 | 6,336 | 1584 | 4,350 | 902 | 997 | 3,353 | 0 | 1,242 | n/a | n/a | n/a | none |

## Plugin marginal dashboard — component breakdown by owner

`Tools/List Bytes` per owner is the sum of each tool's own serialized entry (`JSON.stringify({name, description, inputSchema, outputSchema, annotations})`), decomposed into the fields that make it up. `Envelope Bytes` is JSON punctuation and key labels — derived by subtraction, so every row's named-field columns plus Envelope Bytes sum exactly to Tools/List Bytes. `Share of Preset` is this owner's bytes divided by the sum of all owners' bytes in that preset row (not divided by the whole-array `Tools/List Bytes` on the preset-summary table above, which also carries the array's own brackets/commas) — shares always sum to 100%.

| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools | Tools/List Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes | Share of Preset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | core | 31 | 49,656 | 3,340 | 12,817 | 28,730 | 0 | 1,639 | 2,387 | 86.4% |
| minimal | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 8.0% |
| minimal | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 5.6% |
| minimal | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| lean | native | managed | tokens-gate | core | 31 | 49,656 | 3,340 | 12,817 | 28,730 | 0 | 1,639 | 2,387 | 72.3% |
| lean | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 6.7% |
| lean | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 4.7% |
| lean | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 11.9% |
| lean | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 4.3% |
| lean | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| standard | native | managed | tokens-gate | core | 31 | 49,656 | 3,340 | 12,817 | 28,730 | 0 | 1,639 | 2,387 | 37.5% |
| standard | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 3.5% |
| standard | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.4% |
| standard | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 6.2% |
| standard | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 2.2% |
| standard | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 1.9% |
| standard | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 4.3% |
| standard | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 2.7% |
| standard | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 4.7% |
| standard | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 4.0% |
| standard | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 1.4% |
| standard | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 3.0% |
| standard | native | managed | tokens-gate | container | 11 | 8,663 | 1,293 | 4,150 | 1,496 | 0 | 550 | 783 | 6.5% |
| standard | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 2.5% |
| standard | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 2.6% |
| standard | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 1.1% |
| standard | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 5.2% |
| standard | native | managed | tokens-gate | agent-orchestrator | 5 | 10,998 | 554 | 1,967 | 7,658 | 0 | 250 | 385 | 8.3% |
| standard | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| swarm | native | managed | tokens-gate | core | 32 | 50,586 | 3,441 | 13,019 | 29,201 | 0 | 1,693 | 2,464 | 30.6% |
| swarm | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 2.8% |
| swarm | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.0% |
| swarm | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 5.0% |
| swarm | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 1.8% |
| swarm | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 1.6% |
| swarm | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 3.4% |
| swarm | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 2.2% |
| swarm | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 3.8% |
| swarm | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 3.2% |
| swarm | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 1.1% |
| swarm | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 2.4% |
| swarm | native | managed | tokens-gate | container | 11 | 8,663 | 1,293 | 4,150 | 1,496 | 0 | 550 | 783 | 5.2% |
| swarm | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 2.0% |
| swarm | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 2.1% |
| swarm | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 0.8% |
| swarm | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 4.2% |
| swarm | native | managed | tokens-gate | agent-orchestrator | 5 | 10,998 | 554 | 1,967 | 7,658 | 0 | 250 | 385 | 6.7% |
| swarm | native | managed | tokens-gate | proposals | 4 | 5,026 | 370 | 600 | 3,403 | 0 | 200 | 308 | 3.0% |
| swarm | native | managed | tokens-gate | notification | 2 | 1,872 | 196 | 227 | 1,124 | 0 | 100 | 154 | 1.1% |
| swarm | native | managed | tokens-gate | completion | 3 | 2,431 | 396 | 548 | 1,014 | 0 | 150 | 231 | 1.5% |
| swarm | native | managed | tokens-gate | logs | 9 | 7,303 | 710 | 2,548 | 2,691 | 0 | 450 | 693 | 4.4% |
| swarm | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 1.2% |
| swarm | native | managed | tokens-gate | test-convention | 3 | 3,232 | 289 | 533 | 1,907 | 0 | 150 | 231 | 2.0% |
| swarm | native | managed | tokens-gate | conventions | 5 | 5,164 | 437 | 761 | 3,101 | 0 | 250 | 385 | 3.1% |
| swarm | native | managed | tokens-gate | forge | 11 | 4,710 | 641 | 2,548 | 0 | 0 | 550 | 671 | 2.9% |
| swarm | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| full | native | managed | tokens-gate | core | 31 | 49,717 | 3,361 | 12,931 | 28,656 | 0 | 1,640 | 2,387 | 25.2% |
| full | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 2.3% |
| full | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 1.6% |
| full | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 4.2% |
| full | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 1.5% |
| full | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 1.3% |
| full | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 2.9% |
| full | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 1.8% |
| full | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 3.2% |
| full | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 2.7% |
| full | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 0.9% |
| full | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 2.0% |
| full | native | managed | tokens-gate | container | 11 | 8,663 | 1,293 | 4,150 | 1,496 | 0 | 550 | 783 | 4.4% |
| full | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 1.7% |
| full | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 1.8% |
| full | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 0.7% |
| full | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 3.5% |
| full | native | managed | tokens-gate | agent-orchestrator | 5 | 10,998 | 554 | 1,967 | 7,658 | 0 | 250 | 385 | 5.6% |
| full | native | managed | tokens-gate | proposals | 4 | 5,026 | 370 | 600 | 3,403 | 0 | 200 | 308 | 2.5% |
| full | native | managed | tokens-gate | notification | 2 | 1,872 | 196 | 227 | 1,124 | 0 | 100 | 154 | 0.9% |
| full | native | managed | tokens-gate | completion | 3 | 2,431 | 396 | 548 | 1,014 | 0 | 150 | 231 | 1.2% |
| full | native | managed | tokens-gate | logs | 9 | 7,303 | 710 | 2,548 | 2,691 | 0 | 450 | 693 | 3.7% |
| full | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 1.0% |
| full | native | managed | tokens-gate | test-convention | 3 | 3,232 | 289 | 533 | 1,907 | 0 | 150 | 231 | 1.6% |
| full | native | managed | tokens-gate | conventions | 5 | 5,164 | 437 | 761 | 3,101 | 0 | 250 | 385 | 2.6% |
| full | native | managed | tokens-gate | forge | 11 | 4,710 | 641 | 2,548 | 0 | 0 | 550 | 671 | 2.4% |
| full | native | managed | tokens-gate | web-fetch | 1 | 928 | 70 | 257 | 444 | 0 | 50 | 77 | 0.5% |
| full | native | managed | tokens-gate | issues | 1 | 822 | 65 | 33 | 567 | 0 | 50 | 77 | 0.4% |
| full | native | managed | tokens-gate | api | 3 | 3,832 | 205 | 1,568 | 1,621 | 0 | 150 | 215 | 1.9% |
| full | native | managed | tokens-gate | prompt-eval | 2 | 2,514 | 139 | 650 | 1,406 | 0 | 100 | 154 | 1.3% |
| full | native | managed | tokens-gate | audit-orchestrator | 2 | 1,660 | 159 | 446 | 726 | 0 | 100 | 138 | 0.8% |
| full | native | managed | tokens-gate | browser | 8 | 5,945 | 502 | 1,858 | 2,352 | 0 | 400 | 568 | 3.0% |
| full | native | managed | tokens-gate | cache | 2 | 2,057 | 153 | 192 | 1,404 | 0 | 103 | 154 | 1.0% |
| full | native | managed | tokens-gate | external-mcps | 8 | 9,394 | 739 | 1,315 | 6,061 | 0 | 400 | 616 | 4.8% |
| full | native | managed | tokens-gate | observability | 5 | 5,734 | 423 | 920 | 3,562 | 0 | 250 | 385 | 2.9% |
| full | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| dogfood | native | managed | tokens-gate | core | 31 | 49,656 | 3,340 | 12,817 | 28,730 | 0 | 1,639 | 2,387 | 15.3% |
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
| dogfood | native | managed | tokens-gate | proposals | 50 | 79,973 | 4,689 | 15,549 | 51,374 | 0 | 2,620 | 3,850 | 24.7% |
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
| web-app | native | managed | tokens-gate | core | 31 | 49,656 | 3,340 | 12,817 | 28,730 | 0 | 1,639 | 2,387 | 43.0% |
| web-app | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 4.0% |
| web-app | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.8% |
| web-app | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 7.1% |
| web-app | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 2.6% |
| web-app | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 2.2% |
| web-app | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 4.9% |
| web-app | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 3.1% |
| web-app | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 5.4% |
| web-app | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 4.6% |
| web-app | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 1.6% |
| web-app | native | managed | tokens-gate | test-convention | 3 | 3,232 | 289 | 533 | 1,907 | 0 | 150 | 231 | 2.8% |
| web-app | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 2.8% |
| web-app | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 3.0% |
| web-app | native | managed | tokens-gate | container | 11 | 8,663 | 1,293 | 4,150 | 1,496 | 0 | 550 | 783 | 7.5% |
| web-app | native | managed | tokens-gate | web-fetch | 1 | 928 | 70 | 257 | 444 | 0 | 50 | 77 | 0.8% |
| web-app | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 1.8% |
| web-app | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| backend-api | native | managed | tokens-gate | core | 31 | 49,656 | 3,340 | 12,817 | 28,730 | 0 | 1,639 | 2,387 | 43.6% |
| backend-api | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 4.0% |
| backend-api | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.8% |
| backend-api | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 7.2% |
| backend-api | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 2.6% |
| backend-api | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 4.9% |
| backend-api | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 3.2% |
| backend-api | native | managed | tokens-gate | refactor | 6 | 6,270 | 319 | 1,696 | 3,274 | 0 | 300 | 462 | 5.5% |
| backend-api | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 4.6% |
| backend-api | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 1.6% |
| backend-api | native | managed | tokens-gate | test-convention | 3 | 3,232 | 289 | 533 | 1,907 | 0 | 150 | 231 | 2.8% |
| backend-api | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 3.4% |
| backend-api | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 2.9% |
| backend-api | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 3.1% |
| backend-api | native | managed | tokens-gate | container | 11 | 8,663 | 1,293 | 4,150 | 1,496 | 0 | 550 | 783 | 7.6% |
| backend-api | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |
| cli-tool | native | managed | tokens-gate | core | 31 | 49,656 | 3,340 | 12,817 | 28,730 | 0 | 1,639 | 2,387 | 63.9% |
| cli-tool | native | managed | tokens-gate | git | 8 | 4,611 | 442 | 622 | 2,365 | 0 | 400 | 616 | 5.9% |
| cli-tool | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 4.2% |
| cli-tool | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 10.6% |
| cli-tool | native | managed | tokens-gate | docs | 4 | 2,949 | 235 | 486 | 1,614 | 0 | 200 | 308 | 3.8% |
| cli-tool | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 4.5% |
| cli-tool | native | managed | tokens-gate | perf | 3 | 3,668 | 301 | 969 | 1,952 | 0 | 150 | 215 | 4.7% |
| cli-tool | native | managed | tokens-gate | test-policy | 2 | 1,861 | 179 | 261 | 1,091 | 0 | 100 | 154 | 2.4% |
| cli-tool | adaptive | managed | dynamic-client | core | 7 | 6,328 | 902 | 997 | 3,353 | 0 | 371 | 539 | 100.0% |

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
| minimal | native | managed | tokens-gate | 57,543 | 13249 | 13298 | 14386 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| minimal | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | native | managed | tokens-gate | 68,707 | 15861 | 15905 | 17177 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | native | managed | tokens-gate | 132,624 | 31063 | 31038 | 33156 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | native | managed | tokens-gate | 165,376 | 38767 | 38767 | 41344 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | native | managed | tokens-gate | 197,424 | 46335 | 46319 | 49356 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| dogfood | native | managed | tokens-gate | 324,229 | 76468 | 76518 | 81058 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| dogfood | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | native | managed | tokens-gate | 115,608 | 27035 | 27074 | 28902 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | native | managed | tokens-gate | 113,986 | 26609 | 26644 | 28497 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | native | managed | tokens-gate | 77,723 | 17974 | 18014 | 19431 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | adaptive | managed | dynamic-client | 6,336 | 1435 | 1442 | 1584 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |

## Documented deficits (kept, not auto-bumped)

- none

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 6,336 | ok | — | 57,543 | ok | — |
| lean | 6,336 | ok | — | 68,707 | ok | — |
| standard | 6,336 | ok | — | 132,624 | warning | — |
| swarm | 6,336 | ok | — | 165,376 | ok | — |
| full | 6,336 | ok | — | 197,424 | ok | — |
| dogfood | 6,336 | ok | — | 324,229 | warning | — |
| web-app | 6,336 | n/a | — | 115,608 | n/a | — |
| backend-api | 6,336 | n/a | — | 113,986 | n/a | — |
| cli-tool | 6,336 | n/a | — | 77,723 | n/a | — |

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
