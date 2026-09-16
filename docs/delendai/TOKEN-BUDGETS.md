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
| overview full | managed | 55 | 14 | 11,000 | 11,100 | within hard |
| overview compact | managed | 63 | 16 | 1,450 | 1,500 | within hard |
| overview full (native) | native | 56 | 14 | 27,000 | 28,000 | within hard |
| overview compact (native) | native | 64 | 16 | 4,400 | 4,500 | within hard |
| auto_work idle | native | 159 | 40 | 2,400 | 2,600 | within hard |
| auto_work work plan | native | 2,433 | 609 | 2,400 | 2,600 | over warning (2,400B) |
| agent_catalog compact | native | 32 | 8 | 800 | 900 | within hard |
| agent_catalog full | native | 33 | 9 | 9,800 | 10,500 | within hard |
| analyze_project {} | native | 830 | 208 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | native | 856 | 214 | 1,800 | 2,000 | within hard |
| search_search | native | 872 | 218 | 2,700 | 3,000 | within hard |
| docs_docs_list | native | 207 | 52 | 2,200 | 2,500 | within hard |
| proposals_round_context | native | 151 | 38 | 2,700 | 3,000 | within hard |
| logs_tail | native | 28 | 7 | 5,500 | 6,000 | within hard |

## Catalog and task context cost addendum

Measured with `bun tools/scripts/measure/catalog-task-context-cost.script.ts` against the same synthetic fixture workspace used by the token budget suite. Result bytes are computed from `structuredContent` when present and fall back to concatenated text content otherwise, so compact structured responses and classic text tools are measured on the same reproducible basis. The existing real-preset, plugin-marginal and top-tool tables below remain the schema breakdown source; this addendum pins the extra S1 measurements for `agent_catalog` payloads and routed `project_context` task context snapshots.

| Catalog payload | Surface | Bytes | Est. Tokens |
| --- | --- | --- | --- |
| agent_catalog compact | native | 745 | 187 |
| agent_catalog full | native | 10,018 | 2,505 |

| Catalog breakdown snapshot | Tools | Tools/List Bytes | Schema Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| native core catalog | 30 | 44,752 | 36,826 | 10,522 | 26,304 | 0 |
| swarm native preset | 150 | 162,377 | 125,926 | 36,039 | 89,887 | 15,221 |

Task context corpus: `cold start -> search.search -> docs.docs_list -> logs.tail`, measured as `delendai_compact_router { domain: "core", action: "project_context" }` on the `swarm` preset under `managed`.

| Task context sample | Bytes | Est. Tokens |
| --- | --- | --- |
| cold start | 672 | 168 |
| after search.search | 728 | 182 |
| after docs.docs_list | 776 | 194 |
| after logs.tail | 826 | 207 |

| Percentile | Bytes | Est. Tokens |
| --- | --- | --- |
| p50 | 728 | 182 |
| p95 | 826 | 207 |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface measurement baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap measurement). `Runtime Surface` is shown separately because ordinary DelendAI execution defaults to `managed`; `native` here does not mean that the server is running native.

| Preset | Title | Measurement Surface | Runtime Surface | Source | Plugins | Tools | Tools/List Bytes | Est. Tokens | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | native | managed | tokens-gate | 2 | 41 | 52,571 | 13143 | 42,365 | 3,898 | 11,981 | 30,384 | 4,575 | 64 | n/a | within hard | within hard | none |
| minimal | minimal | adaptive | managed | dynamic-client | 2 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 63 | n/a | within hard | n/a | none |
| lean | lean | native | managed | tokens-gate | 4 | 54 | 63,541 | 15886 | 50,543 | 4,686 | 14,809 | 35,734 | 8,202 | 64 | n/a | within hard | within hard | none |
| lean | lean | adaptive | managed | dynamic-client | 4 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 63 | n/a | within hard | n/a | none |
| standard | standard | native | managed | tokens-gate | 19 | 106 | 121,538 | 30385 | 95,585 | 9,353 | 25,946 | 69,639 | 10,577 | 67 | n/a | within hard | over warning (9,500B) | none |
| standard | standard | adaptive | managed | dynamic-client | 19 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 64 | n/a | within hard | n/a | none |
| swarm | swarm | native | managed | tokens-gate | 27 | 150 | 162,377 | 40595 | 125,926 | 13,038 | 36,039 | 89,887 | 15,221 | 67 | n/a | within hard | within hard | none |
| swarm | swarm | adaptive | managed | dynamic-client | 27 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 64 | n/a | within hard | n/a | none |
| full | full | native | managed | tokens-gate | 39 | 180 | 191,749 | 47938 | 148,284 | 15,294 | 42,594 | 105,690 | 15,221 | 67 | n/a | within hard | within hard | none |
| full | full | adaptive | managed | dynamic-client | 39 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 64 | n/a | within hard | n/a | none |
| dogfood | dogfood | native | managed | tokens-gate | 38 | 223 | 270,041 | 67511 | 212,786 | 21,405 | 55,857 | 156,929 | 69,119 | 67 | 151 | within hard | within hard | none |
| dogfood | dogfood | adaptive | managed | dynamic-client | 38 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 64 | n/a | within hard | n/a | none |
| web-app | web-app | native | managed | tokens-gate | 18 | 96 | 104,858 | 26215 | 81,783 | 8,111 | 22,558 | 59,225 | 8,202 | 66 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | managed | dynamic-client | 18 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 64 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | managed | tokens-gate | 16 | 95 | 103,273 | 25819 | 80,421 | 8,068 | 22,589 | 57,832 | 8,202 | 66 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | managed | dynamic-client | 16 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 64 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | managed | tokens-gate | 7 | 61 | 72,460 | 18115 | 57,687 | 5,373 | 16,585 | 41,102 | 8,202 | 64 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | managed | dynamic-client | 7 | 7 | 6,143 | 1536 | 4,157 | 902 | 955 | 3,202 | 0 | 63 | n/a | n/a | n/a | none |

## Plugin marginal dashboard — component breakdown by owner

`Tools/List Bytes` per owner is the sum of each tool's own serialized entry (`JSON.stringify({name, description, inputSchema, outputSchema, annotations})`), decomposed into the fields that make it up. `Envelope Bytes` is JSON punctuation and key labels — derived by subtraction, so every row's named-field columns plus Envelope Bytes sum exactly to Tools/List Bytes. `Share of Preset` is this owner's bytes divided by the sum of all owners' bytes in that preset row (not divided by the whole-array `Tools/List Bytes` on the preset-summary table above, which also carries the array's own brackets/commas) — shares always sum to 100%.

| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools | Tools/List Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes | Share of Preset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | core | 30 | 44,721 | 3,268 | 10,522 | 26,304 | 0 | 1,589 | 2,310 | 85.1% |
| minimal | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 8.7% |
| minimal | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 6.2% |
| minimal | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |
| lean | native | managed | tokens-gate | core | 30 | 44,721 | 3,268 | 10,522 | 26,304 | 0 | 1,589 | 2,310 | 70.4% |
| lean | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 7.2% |
| lean | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 5.1% |
| lean | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 12.9% |
| lean | native | managed | tokens-gate | docs | 4 | 2,755 | 235 | 486 | 1,420 | 0 | 200 | 308 | 4.3% |
| lean | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |
| standard | native | managed | tokens-gate | core | 30 | 44,721 | 3,268 | 10,522 | 26,304 | 0 | 1,589 | 2,310 | 36.8% |
| standard | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 3.8% |
| standard | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.7% |
| standard | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 6.8% |
| standard | native | managed | tokens-gate | docs | 4 | 2,755 | 235 | 486 | 1,420 | 0 | 200 | 308 | 2.3% |
| standard | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 2.1% |
| standard | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 4.6% |
| standard | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 3.0% |
| standard | native | managed | tokens-gate | refactor | 6 | 6,222 | 319 | 1,696 | 3,226 | 0 | 300 | 462 | 5.1% |
| standard | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 4.3% |
| standard | native | managed | tokens-gate | test-policy | 2 | 1,784 | 179 | 261 | 1,014 | 0 | 100 | 154 | 1.5% |
| standard | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 3.2% |
| standard | native | managed | tokens-gate | container | 5 | 3,295 | 580 | 1,362 | 608 | 0 | 250 | 321 | 2.7% |
| standard | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 2.7% |
| standard | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 2.9% |
| standard | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 1.2% |
| standard | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 5.7% |
| standard | native | managed | tokens-gate | agent-orchestrator | 5 | 10,577 | 624 | 1,897 | 7,237 | 0 | 250 | 385 | 8.7% |
| standard | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |
| swarm | native | managed | tokens-gate | core | 31 | 45,651 | 3,369 | 10,724 | 26,775 | 0 | 1,643 | 2,387 | 28.1% |
| swarm | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 2.8% |
| swarm | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 2.0% |
| swarm | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 5.1% |
| swarm | native | managed | tokens-gate | docs | 4 | 2,755 | 235 | 486 | 1,420 | 0 | 200 | 308 | 1.7% |
| swarm | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 1.6% |
| swarm | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 3.5% |
| swarm | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 2.2% |
| swarm | native | managed | tokens-gate | refactor | 6 | 6,222 | 319 | 1,696 | 3,226 | 0 | 300 | 462 | 3.8% |
| swarm | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 3.2% |
| swarm | native | managed | tokens-gate | test-policy | 2 | 1,784 | 179 | 261 | 1,014 | 0 | 100 | 154 | 1.1% |
| swarm | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 2.4% |
| swarm | native | managed | tokens-gate | container | 5 | 3,295 | 580 | 1,362 | 608 | 0 | 250 | 321 | 2.0% |
| swarm | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 2.0% |
| swarm | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 2.1% |
| swarm | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 0.9% |
| swarm | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 4.2% |
| swarm | native | managed | tokens-gate | agent-orchestrator | 5 | 10,577 | 624 | 1,897 | 7,237 | 0 | 250 | 385 | 6.5% |
| swarm | native | managed | tokens-gate | proposals | 8 | 15,221 | 804 | 2,545 | 10,577 | 0 | 400 | 616 | 9.4% |
| swarm | native | managed | tokens-gate | notification | 2 | 1,842 | 196 | 227 | 1,094 | 0 | 100 | 154 | 1.1% |
| swarm | native | managed | tokens-gate | completion | 3 | 2,390 | 396 | 548 | 973 | 0 | 150 | 231 | 1.5% |
| swarm | native | managed | tokens-gate | logs | 9 | 6,919 | 710 | 2,548 | 2,307 | 0 | 450 | 693 | 4.3% |
| swarm | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 1.3% |
| swarm | native | managed | tokens-gate | test-convention | 3 | 3,184 | 289 | 533 | 1,859 | 0 | 150 | 231 | 2.0% |
| swarm | native | managed | tokens-gate | conventions | 4 | 3,584 | 351 | 553 | 1,995 | 0 | 200 | 308 | 2.2% |
| swarm | native | managed | tokens-gate | forge | 11 | 4,682 | 641 | 2,520 | 0 | 0 | 550 | 671 | 2.9% |
| swarm | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |
| full | native | managed | tokens-gate | core | 30 | 44,782 | 3,289 | 10,636 | 26,230 | 0 | 1,590 | 2,310 | 23.4% |
| full | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 2.4% |
| full | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 1.7% |
| full | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 4.3% |
| full | native | managed | tokens-gate | docs | 4 | 2,755 | 235 | 486 | 1,420 | 0 | 200 | 308 | 1.4% |
| full | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 1.3% |
| full | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 2.9% |
| full | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 1.9% |
| full | native | managed | tokens-gate | refactor | 6 | 6,222 | 319 | 1,696 | 3,226 | 0 | 300 | 462 | 3.2% |
| full | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 2.7% |
| full | native | managed | tokens-gate | test-policy | 2 | 1,784 | 179 | 261 | 1,014 | 0 | 100 | 154 | 0.9% |
| full | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 2.0% |
| full | native | managed | tokens-gate | container | 5 | 3,295 | 580 | 1,362 | 608 | 0 | 250 | 321 | 1.7% |
| full | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 1.7% |
| full | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 1.8% |
| full | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 0.7% |
| full | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 3.6% |
| full | native | managed | tokens-gate | agent-orchestrator | 5 | 10,577 | 624 | 1,897 | 7,237 | 0 | 250 | 385 | 5.5% |
| full | native | managed | tokens-gate | proposals | 8 | 15,221 | 804 | 2,545 | 10,577 | 0 | 400 | 616 | 7.9% |
| full | native | managed | tokens-gate | notification | 2 | 1,842 | 196 | 227 | 1,094 | 0 | 100 | 154 | 1.0% |
| full | native | managed | tokens-gate | completion | 3 | 2,390 | 396 | 548 | 973 | 0 | 150 | 231 | 1.2% |
| full | native | managed | tokens-gate | logs | 9 | 6,919 | 710 | 2,548 | 2,307 | 0 | 450 | 693 | 3.6% |
| full | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 1.1% |
| full | native | managed | tokens-gate | test-convention | 3 | 3,184 | 289 | 533 | 1,859 | 0 | 150 | 231 | 1.7% |
| full | native | managed | tokens-gate | conventions | 4 | 3,584 | 351 | 553 | 1,995 | 0 | 200 | 308 | 1.9% |
| full | native | managed | tokens-gate | forge | 11 | 4,682 | 641 | 2,520 | 0 | 0 | 550 | 671 | 2.4% |
| full | native | managed | tokens-gate | web-fetch | 1 | 891 | 70 | 257 | 407 | 0 | 50 | 77 | 0.5% |
| full | native | managed | tokens-gate | issues | 1 | 822 | 65 | 33 | 567 | 0 | 50 | 77 | 0.4% |
| full | native | managed | tokens-gate | api | 3 | 3,613 | 205 | 1,568 | 1,402 | 0 | 150 | 215 | 1.9% |
| full | native | managed | tokens-gate | prompt-eval | 2 | 2,514 | 139 | 650 | 1,406 | 0 | 100 | 154 | 1.3% |
| full | native | managed | tokens-gate | audit-orchestrator | 2 | 1,660 | 159 | 446 | 726 | 0 | 100 | 138 | 0.9% |
| full | native | managed | tokens-gate | browser | 8 | 5,887 | 502 | 1,800 | 2,352 | 0 | 400 | 568 | 3.1% |
| full | native | managed | tokens-gate | cache | 2 | 2,057 | 153 | 192 | 1,404 | 0 | 103 | 154 | 1.1% |
| full | native | managed | tokens-gate | external-mcps | 7 | 7,033 | 620 | 777 | 4,522 | 0 | 350 | 539 | 3.7% |
| full | native | managed | tokens-gate | observability | 5 | 5,734 | 423 | 920 | 3,562 | 0 | 250 | 385 | 3.0% |
| full | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |
| dogfood | native | managed | tokens-gate | core | 30 | 44,721 | 3,268 | 10,522 | 26,304 | 0 | 1,589 | 2,310 | 16.6% |
| dogfood | native | managed | tokens-gate | adaptive-optimizer | 3 | 7,693 | 354 | 1,929 | 4,894 | 0 | 150 | 231 | 2.9% |
| dogfood | native | managed | tokens-gate | audit | 4 | 9,736 | 800 | 1,757 | 6,557 | 0 | 200 | 308 | 3.6% |
| dogfood | native | managed | tokens-gate | auto-agent-selector | 5 | 6,881 | 620 | 1,117 | 4,297 | 0 | 250 | 385 | 2.6% |
| dogfood | native | managed | tokens-gate | auto-plugin-selector | 1 | 3,726 | 154 | 1,148 | 2,248 | 0 | 50 | 77 | 1.4% |
| dogfood | native | managed | tokens-gate | commit-policy | 7 | 7,232 | 1,016 | 1,738 | 3,270 | 0 | 350 | 523 | 2.7% |
| dogfood | native | managed | tokens-gate | completion | 3 | 2,390 | 396 | 548 | 973 | 0 | 150 | 231 | 0.9% |
| dogfood | native | managed | tokens-gate | container | 5 | 3,295 | 580 | 1,362 | 608 | 0 | 250 | 321 | 1.2% |
| dogfood | native | managed | tokens-gate | conventions | 4 | 3,584 | 351 | 553 | 1,995 | 0 | 200 | 308 | 1.3% |
| dogfood | native | managed | tokens-gate | context-for-change | 1 | 1,034 | 99 | 163 | 597 | 0 | 50 | 77 | 0.4% |
| dogfood | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 1.9% |
| dogfood | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 1.2% |
| dogfood | native | managed | tokens-gate | docs | 4 | 2,755 | 235 | 486 | 1,420 | 0 | 200 | 308 | 1.0% |
| dogfood | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 1.3% |
| dogfood | native | managed | tokens-gate | forge | 11 | 4,682 | 641 | 2,520 | 0 | 0 | 550 | 671 | 1.7% |
| dogfood | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 1.7% |
| dogfood | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 1.0% |
| dogfood | native | managed | tokens-gate | impact-analysis | 2 | 1,904 | 248 | 300 | 1,018 | 0 | 100 | 154 | 0.7% |
| dogfood | native | managed | tokens-gate | project-health | 1 | 1,318 | 100 | 175 | 876 | 0 | 50 | 77 | 0.5% |
| dogfood | native | managed | tokens-gate | quality-policy | 2 | 1,101 | 286 | 317 | 164 | 0 | 100 | 154 | 0.4% |
| dogfood | native | managed | tokens-gate | link-check | 1 | 1,280 | 112 | 33 | 976 | 0 | 50 | 77 | 0.5% |
| dogfood | native | managed | tokens-gate | logs | 9 | 6,919 | 710 | 2,548 | 2,307 | 0 | 450 | 693 | 2.6% |
| dogfood | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 3.0% |
| dogfood | native | managed | tokens-gate | notification | 2 | 1,842 | 196 | 227 | 1,094 | 0 | 100 | 154 | 0.7% |
| dogfood | native | managed | tokens-gate | orchestrator-runner | 11 | 13,242 | 1,028 | 3,579 | 6,738 | 0 | 550 | 847 | 4.9% |
| dogfood | native | managed | tokens-gate | agent-orchestrator | 5 | 10,577 | 624 | 1,897 | 7,237 | 0 | 250 | 385 | 3.9% |
| dogfood | native | managed | tokens-gate | perf | 3 | 3,648 | 281 | 969 | 1,952 | 0 | 150 | 215 | 1.4% |
| dogfood | native | managed | tokens-gate | proposals | 48 | 69,119 | 4,671 | 10,509 | 45,898 | 0 | 2,520 | 3,696 | 25.6% |
| dogfood | native | managed | tokens-gate | project-kpis | 1 | 4,093 | 118 | 996 | 2,816 | 0 | 50 | 77 | 1.5% |
| dogfood | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 1.3% |
| dogfood | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 2.1% |
| dogfood | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 1.2% |
| dogfood | native | managed | tokens-gate | security | 4 | 5,561 | 370 | 602 | 3,945 | 0 | 200 | 308 | 2.1% |
| dogfood | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 0.8% |
| dogfood | native | managed | tokens-gate | tech-debt | 1 | 1,334 | 117 | 82 | 978 | 0 | 50 | 77 | 0.5% |
| dogfood | native | managed | tokens-gate | test-convention | 3 | 3,184 | 289 | 533 | 1,859 | 0 | 150 | 231 | 1.2% |
| dogfood | native | managed | tokens-gate | test-policy | 2 | 1,784 | 179 | 261 | 1,014 | 0 | 100 | 154 | 0.7% |
| dogfood | native | managed | tokens-gate | usage-tracking | 3 | 1,870 | 235 | 795 | 343 | 0 | 150 | 231 | 0.7% |
| dogfood | native | managed | tokens-gate | error-reporting | 2 | 1,403 | 156 | 750 | 164 | 0 | 100 | 154 | 0.5% |
| dogfood | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |
| web-app | native | managed | tokens-gate | core | 30 | 44,721 | 3,268 | 10,522 | 26,304 | 0 | 1,589 | 2,310 | 42.7% |
| web-app | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 4.4% |
| web-app | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 3.1% |
| web-app | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 7.8% |
| web-app | native | managed | tokens-gate | docs | 4 | 2,755 | 235 | 486 | 1,420 | 0 | 200 | 308 | 2.6% |
| web-app | native | managed | tokens-gate | i18n | 2 | 2,577 | 174 | 126 | 1,968 | 0 | 100 | 154 | 2.5% |
| web-app | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 5.4% |
| web-app | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 3.5% |
| web-app | native | managed | tokens-gate | refactor | 6 | 6,222 | 319 | 1,696 | 3,226 | 0 | 300 | 462 | 5.9% |
| web-app | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 5.0% |
| web-app | native | managed | tokens-gate | test-policy | 2 | 1,784 | 179 | 261 | 1,014 | 0 | 100 | 154 | 1.7% |
| web-app | native | managed | tokens-gate | test-convention | 3 | 3,184 | 289 | 533 | 1,859 | 0 | 150 | 231 | 3.0% |
| web-app | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 3.1% |
| web-app | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 3.3% |
| web-app | native | managed | tokens-gate | container | 5 | 3,295 | 580 | 1,362 | 608 | 0 | 250 | 321 | 3.1% |
| web-app | native | managed | tokens-gate | web-fetch | 1 | 891 | 70 | 257 | 407 | 0 | 50 | 77 | 0.9% |
| web-app | native | managed | tokens-gate | status-marker | 3 | 2,043 | 197 | 417 | 972 | 0 | 150 | 215 | 2.0% |
| web-app | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |
| backend-api | native | managed | tokens-gate | core | 30 | 44,721 | 3,268 | 10,522 | 26,304 | 0 | 1,589 | 2,310 | 43.3% |
| backend-api | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 4.4% |
| backend-api | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 3.1% |
| backend-api | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 7.9% |
| backend-api | native | managed | tokens-gate | docs | 4 | 2,755 | 235 | 486 | 1,420 | 0 | 200 | 308 | 2.7% |
| backend-api | native | managed | tokens-gate | rules | 3 | 5,634 | 263 | 364 | 4,544 | 0 | 150 | 231 | 5.5% |
| backend-api | native | managed | tokens-gate | quality | 6 | 3,627 | 406 | 690 | 1,579 | 0 | 300 | 462 | 3.5% |
| backend-api | native | managed | tokens-gate | refactor | 6 | 6,222 | 319 | 1,696 | 3,226 | 0 | 300 | 462 | 6.0% |
| backend-api | native | managed | tokens-gate | deps | 5 | 5,261 | 384 | 513 | 3,595 | 0 | 250 | 385 | 5.1% |
| backend-api | native | managed | tokens-gate | test-policy | 2 | 1,784 | 179 | 261 | 1,014 | 0 | 100 | 154 | 1.7% |
| backend-api | native | managed | tokens-gate | test-convention | 3 | 3,184 | 289 | 533 | 1,859 | 0 | 150 | 231 | 3.1% |
| backend-api | native | managed | tokens-gate | database | 5 | 3,927 | 398 | 831 | 1,954 | 0 | 250 | 353 | 3.8% |
| backend-api | native | managed | tokens-gate | diagram | 4 | 3,277 | 337 | 984 | 1,317 | 0 | 200 | 308 | 3.2% |
| backend-api | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 3.4% |
| backend-api | native | managed | tokens-gate | container | 5 | 3,295 | 580 | 1,362 | 608 | 0 | 250 | 321 | 3.2% |
| backend-api | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |
| cli-tool | native | managed | tokens-gate | core | 30 | 44,721 | 3,268 | 10,522 | 26,304 | 0 | 1,589 | 2,310 | 61.8% |
| cli-tool | native | managed | tokens-gate | git | 8 | 4,575 | 442 | 586 | 2,365 | 0 | 400 | 616 | 6.3% |
| cli-tool | native | managed | tokens-gate | search | 3 | 3,233 | 188 | 873 | 1,715 | 0 | 150 | 231 | 4.5% |
| cli-tool | native | managed | tokens-gate | memory | 9 | 8,202 | 553 | 2,342 | 3,930 | 0 | 450 | 693 | 11.3% |
| cli-tool | native | managed | tokens-gate | docs | 4 | 2,755 | 235 | 486 | 1,420 | 0 | 200 | 308 | 3.8% |
| cli-tool | native | managed | tokens-gate | env | 2 | 3,480 | 227 | 546 | 2,402 | 0 | 100 | 154 | 4.8% |
| cli-tool | native | managed | tokens-gate | perf | 3 | 3,648 | 281 | 969 | 1,952 | 0 | 150 | 215 | 5.0% |
| cli-tool | native | managed | tokens-gate | test-policy | 2 | 1,784 | 179 | 261 | 1,014 | 0 | 100 | 154 | 2.5% |
| cli-tool | adaptive | managed | dynamic-client | core | 7 | 6,135 | 902 | 955 | 3,202 | 0 | 371 | 539 | 100.0% |

## Top tools by bytes (dogfood preset, native surface)

The 20 individual tools that cost the most tools/list bytes in the largest governed preset, with the same component breakdown as the owner table above. This is where "concentration" becomes concrete: a handful of tools account for a disproportionate share of the whole surface.

| Tool | Owner | Total Bytes | Name Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| delendai_adaptive-optimizer_adaptive_facade | adaptive-optimizer | 4,589 | 45 | 127 | 757 | 3,533 | 0 | 50 | 77 |
| delendai_agent-orchestrator_dispatch | agent-orchestrator | 4,246 | 38 | 113 | 590 | 3,378 | 0 | 50 | 77 |
| delendai_project-kpis_project_kpis | project-kpis | 4,093 | 36 | 118 | 996 | 2,816 | 0 | 50 | 77 |
| delendai_configuration_center | core | 3,796 | 31 | 92 | 203 | 3,334 | 0 | 59 | 77 |
| delendai_auto-plugin-selector_plugins_recommend | auto-plugin-selector | 3,726 | 49 | 154 | 1,148 | 2,248 | 0 | 50 | 77 |
| delendai_adopt_project | core | 3,640 | 24 | 141 | 355 | 2,992 | 0 | 51 | 77 |
| delendai_create_project | core | 3,632 | 25 | 114 | 3,021 | 343 | 0 | 52 | 77 |
| delendai_audit_audit_run | audit | 3,611 | 26 | 277 | 988 | 2,193 | 0 | 50 | 77 |
| delendai_proposals_agent_lock | proposals | 3,125 | 31 | 136 | 382 | 2,449 | 0 | 50 | 77 |
| delendai_proposals_proposals_close_plan | proposals | 3,110 | 41 | 141 | 222 | 2,579 | 0 | 50 | 77 |
| delendai_proposals_close_slice | proposals | 2,936 | 32 | 75 | 503 | 2,199 | 0 | 50 | 77 |
| delendai_audit_audit_consolidate | audit | 2,891 | 34 | 269 | 314 | 2,147 | 0 | 50 | 77 |
| delendai_proposals_proposal_transition | proposals | 2,832 | 40 | 78 | 777 | 1,810 | 0 | 50 | 77 |
| delendai_proposals_proposal_get | proposals | 2,638 | 33 | 44 | 33 | 2,401 | 0 | 50 | 77 |
| delendai_rules_check_rules | rules | 2,576 | 28 | 84 | 86 | 2,251 | 0 | 50 | 77 |
| delendai_auto-agent-selector_auto_run | auto-agent-selector | 2,572 | 39 | 149 | 513 | 1,744 | 0 | 50 | 77 |
| delendai_proposals_proposal_adopt | proposals | 2,532 | 35 | 121 | 211 | 2,038 | 0 | 50 | 77 |
| delendai_scaffold | core | 2,446 | 19 | 103 | 1,461 | 732 | 0 | 54 | 77 |
| delendai_create_plugin | core | 2,429 | 24 | 194 | 240 | 1,843 | 0 | 51 | 77 |
| delendai_commit-policy_commit_policy_storms | commit-policy | 2,299 | 45 | 228 | 33 | 1,866 | 0 | 50 | 77 |

## CHECK-007 — tokenizer cost by preset

This gate (`tokens:gate` / `tokens:dashboard:generate`) measures serialized BYTES of the tools/list JSON payload, not native LLM tokens — bytes-per-token varies enough across prose descriptions, JSON schemas, and identifiers that a byte count cannot substitute for a real token count. The table below reports both, with an explicit confidence label per model: `measured-real-bpe` is a real encode with the model's own published tokenizer (gpt-tokenizer for gpt-5.4); `measured-legacy-bpe` is a real BPE encode but on a vocabulary the vendor published for an older model generation (Anthropic has not published an offline tokenizer for Claude Sonnet 4, so @anthropic-ai/tokenizer's pre-Claude-3 vocabulary is used as the closest available real encoder); `estimated-byte-ratio` is bytes / 4, used only where no offline tokenizer package exists (Gemini). See tools/scripts/report/tokenizer-real.script.ts for the profile definitions.

| Preset | Measurement Surface | Runtime Surface | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Confidence (per model, in order above) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | 52,571 | 12065 | 12114 | 13143 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| minimal | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | native | managed | tokens-gate | 63,541 | 14630 | 14677 | 15886 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | native | managed | tokens-gate | 121,538 | 28302 | 28290 | 30385 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | native | managed | tokens-gate | 162,377 | 37936 | 37956 | 40595 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | native | managed | tokens-gate | 191,749 | 44894 | 44899 | 47938 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| dogfood | native | managed | tokens-gate | 270,041 | 63861 | 63748 | 67511 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| dogfood | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | native | managed | tokens-gate | 104,858 | 24360 | 24407 | 26215 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | native | managed | tokens-gate | 103,273 | 23940 | 23985 | 25819 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | native | managed | tokens-gate | 72,460 | 16713 | 16755 | 18115 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | adaptive | managed | dynamic-client | 6,143 | 1384 | 1391 | 1536 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |

## Documented deficits (kept, not auto-bumped)

- none

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 6,143 | ok | — | 52,571 | ok | — |
| lean | 6,143 | ok | — | 63,541 | ok | — |
| standard | 6,143 | ok | — | 121,538 | ok | — |
| swarm | 6,143 | ok | — | 162,377 | ok | — |
| full | 6,143 | ok | — | 191,749 | ok | — |
| dogfood | 6,143 | ok | — | 270,041 | ok | — |
| web-app | 6,143 | n/a | — | 104,858 | n/a | — |
| backend-api | 6,143 | n/a | — | 103,273 | n/a | — |
| cli-tool | 6,143 | n/a | — | 72,460 | n/a | — |

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
