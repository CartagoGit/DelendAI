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
| overview full (native) | native | 56 | 14 | 12,300 | 12,650 | within hard |
| overview compact (native) | native | 64 | 16 | 1,750 | 1,800 | within hard |
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
| native core catalog | 30 | 47,031 | 39,194 | 12,111 | 27,083 | 0 |
| swarm native preset | 188 | 235,266 | 189,029 | 54,044 | 134,985 | 75,486 |

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
| minimal | minimal | native | managed | tokens-gate | 2 | 41 | 55,892 | 13973 | 45,775 | 3,898 | 14,040 | 31,735 | 5,305 | 64 | n/a | within hard | within hard | none |
| minimal | minimal | adaptive | managed | dynamic-client | 2 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 63 | n/a | within hard | within hard | none |
| lean | lean | native | managed | tokens-gate | 4 | 54 | 67,985 | 16997 | 55,076 | 4,686 | 17,471 | 37,605 | 8,909 | 64 | n/a | within hard | within hard | none |
| lean | lean | adaptive | managed | dynamic-client | 4 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 63 | n/a | within hard | within hard | none |
| standard | standard | native | managed | tokens-gate | 19 | 107 | 133,936 | 33484 | 107,795 | 9,466 | 31,974 | 75,821 | 12,901 | 67 | n/a | over warning (132,000B) | over hard (11,000B) | none |
| standard | standard | adaptive | managed | dynamic-client | 19 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 64 | n/a | within hard | within hard | none |
| swarm | swarm | native | managed | tokens-gate | 27 | 188 | 235,266 | 58817 | 189,029 | 16,730 | 54,044 | 134,985 | 75,486 | 67 | 151 | over hard (210,000B) | over warning (70,000B) | none |
| swarm | swarm | adaptive | managed | dynamic-client | 27 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 64 | n/a | within hard | within hard | none |
| full | full | native | managed | tokens-gate | 39 | 218 | 268,717 | 67180 | 215,466 | 18,986 | 62,348 | 153,118 | 75,486 | 67 | 151 | over hard (256,000B) | over warning (70,000B) | none |
| full | full | adaptive | managed | dynamic-client | 39 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 64 | n/a | within hard | within hard | none |
| dogfood | dogfood | native | managed | tokens-gate | 38 | 220 | 291,479 | 72870 | 235,461 | 21,055 | 67,015 | 168,446 | 75,486 | 67 | 151 | within hard | over warning (70,000B) | none |
| dogfood | dogfood | adaptive | managed | dynamic-client | 38 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 64 | n/a | within hard | within hard | none |
| web-app | web-app | native | managed | tokens-gate | 18 | 96 | 114,274 | 28569 | 91,288 | 8,111 | 27,782 | 63,506 | 8,909 | 66 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | managed | dynamic-client | 18 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 64 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | managed | tokens-gate | 16 | 95 | 112,641 | 28161 | 89,878 | 8,068 | 27,761 | 62,117 | 8,909 | 66 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | managed | dynamic-client | 16 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 64 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | managed | tokens-gate | 7 | 61 | 77,634 | 19409 | 62,950 | 5,373 | 19,638 | 43,312 | 8,909 | 64 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | managed | dynamic-client | 7 | 7 | 6,850 | 1713 | 4,885 | 902 | 1,319 | 3,566 | 0 | 63 | n/a | n/a | n/a | none |

## Plugin marginal dashboard — component breakdown by owner

`Tools/List Bytes` per owner is the sum of each tool's own serialized entry (`JSON.stringify({name, description, inputSchema, outputSchema, annotations})`), decomposed into the fields that make it up. `Envelope Bytes` is JSON punctuation and key labels — derived by subtraction, so every row's named-field columns plus Envelope Bytes sum exactly to Tools/List Bytes. `Share of Preset` is this owner's bytes divided by the sum of all owners' bytes in that preset row (not divided by the whole-array `Tools/List Bytes` on the preset-summary table above, which also carries the array's own brackets/commas) — shares always sum to 100%.

| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools | Tools/List Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes | Share of Preset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | core | 30 | 47,000 | 3,268 | 12,111 | 27,083 | 0 | 1,500 | 2,310 | 84.2% |
| minimal | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 9.5% |
| minimal | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 6.3% |
| minimal | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |
| lean | native | managed | tokens-gate | core | 30 | 47,000 | 3,268 | 12,111 | 27,083 | 0 | 1,500 | 2,310 | 69.2% |
| lean | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 7.8% |
| lean | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 5.2% |
| lean | native | managed | tokens-gate | memory | 9 | 8,909 | 553 | 2,737 | 4,242 | 0 | 450 | 693 | 13.1% |
| lean | native | managed | tokens-gate | docs | 4 | 3,171 | 235 | 694 | 1,628 | 0 | 200 | 308 | 4.7% |
| lean | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |
| standard | native | managed | tokens-gate | core | 30 | 47,000 | 3,268 | 12,111 | 27,083 | 0 | 1,500 | 2,310 | 35.1% |
| standard | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 4.0% |
| standard | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 2.6% |
| standard | native | managed | tokens-gate | memory | 9 | 8,909 | 553 | 2,737 | 4,242 | 0 | 450 | 693 | 6.7% |
| standard | native | managed | tokens-gate | docs | 4 | 3,171 | 235 | 694 | 1,628 | 0 | 200 | 308 | 2.4% |
| standard | native | managed | tokens-gate | i18n | 2 | 2,785 | 174 | 230 | 2,072 | 0 | 100 | 154 | 2.1% |
| standard | native | managed | tokens-gate | rules | 3 | 5,946 | 263 | 520 | 4,700 | 0 | 150 | 231 | 4.4% |
| standard | native | managed | tokens-gate | quality | 6 | 4,278 | 406 | 1,029 | 1,891 | 0 | 300 | 462 | 3.2% |
| standard | native | managed | tokens-gate | refactor | 6 | 7,332 | 319 | 2,116 | 3,916 | 0 | 300 | 462 | 5.5% |
| standard | native | managed | tokens-gate | deps | 5 | 5,781 | 384 | 773 | 3,855 | 0 | 250 | 385 | 4.3% |
| standard | native | managed | tokens-gate | test-policy | 2 | 1,992 | 179 | 365 | 1,118 | 0 | 100 | 154 | 1.5% |
| standard | native | managed | tokens-gate | database | 5 | 4,451 | 398 | 1,091 | 2,218 | 0 | 250 | 353 | 3.3% |
| standard | native | managed | tokens-gate | container | 5 | 3,634 | 580 | 1,622 | 687 | 0 | 250 | 321 | 2.7% |
| standard | native | managed | tokens-gate | diagram | 4 | 4,017 | 337 | 1,435 | 1,606 | 0 | 200 | 308 | 3.0% |
| standard | native | managed | tokens-gate | env | 2 | 3,688 | 227 | 650 | 2,506 | 0 | 100 | 154 | 2.8% |
| standard | native | managed | tokens-gate | error-reporting | 2 | 1,692 | 156 | 935 | 268 | 0 | 100 | 154 | 1.3% |
| standard | native | managed | tokens-gate | auto-agent-selector | 5 | 7,401 | 620 | 1,377 | 4,557 | 0 | 250 | 385 | 5.5% |
| standard | native | managed | tokens-gate | agent-orchestrator | 6 | 12,901 | 737 | 2,360 | 8,822 | 0 | 300 | 462 | 9.6% |
| standard | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |
| swarm | native | managed | tokens-gate | core | 30 | 47,000 | 3,268 | 12,111 | 27,083 | 0 | 1,500 | 2,310 | 20.0% |
| swarm | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 2.3% |
| swarm | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 1.5% |
| swarm | native | managed | tokens-gate | memory | 9 | 8,909 | 553 | 2,737 | 4,242 | 0 | 450 | 693 | 3.8% |
| swarm | native | managed | tokens-gate | docs | 4 | 3,171 | 235 | 694 | 1,628 | 0 | 200 | 308 | 1.3% |
| swarm | native | managed | tokens-gate | i18n | 2 | 2,785 | 174 | 230 | 2,072 | 0 | 100 | 154 | 1.2% |
| swarm | native | managed | tokens-gate | rules | 3 | 5,946 | 263 | 520 | 4,700 | 0 | 150 | 231 | 2.5% |
| swarm | native | managed | tokens-gate | quality | 6 | 4,278 | 406 | 1,029 | 1,891 | 0 | 300 | 462 | 1.8% |
| swarm | native | managed | tokens-gate | refactor | 6 | 7,332 | 319 | 2,116 | 3,916 | 0 | 300 | 462 | 3.1% |
| swarm | native | managed | tokens-gate | deps | 5 | 5,781 | 384 | 773 | 3,855 | 0 | 250 | 385 | 2.5% |
| swarm | native | managed | tokens-gate | test-policy | 2 | 1,992 | 179 | 365 | 1,118 | 0 | 100 | 154 | 0.8% |
| swarm | native | managed | tokens-gate | database | 5 | 4,451 | 398 | 1,091 | 2,218 | 0 | 250 | 353 | 1.9% |
| swarm | native | managed | tokens-gate | container | 5 | 3,634 | 580 | 1,622 | 687 | 0 | 250 | 321 | 1.5% |
| swarm | native | managed | tokens-gate | diagram | 4 | 4,017 | 337 | 1,435 | 1,606 | 0 | 200 | 308 | 1.7% |
| swarm | native | managed | tokens-gate | env | 2 | 3,688 | 227 | 650 | 2,506 | 0 | 100 | 154 | 1.6% |
| swarm | native | managed | tokens-gate | error-reporting | 2 | 1,692 | 156 | 935 | 268 | 0 | 100 | 154 | 0.7% |
| swarm | native | managed | tokens-gate | auto-agent-selector | 5 | 7,401 | 620 | 1,377 | 4,557 | 0 | 250 | 385 | 3.1% |
| swarm | native | managed | tokens-gate | agent-orchestrator | 6 | 12,901 | 737 | 2,360 | 8,822 | 0 | 300 | 462 | 5.5% |
| swarm | native | managed | tokens-gate | proposals | 48 | 75,486 | 4,671 | 13,151 | 49,883 | 0 | 2,400 | 3,696 | 32.1% |
| swarm | native | managed | tokens-gate | notification | 2 | 2,050 | 196 | 331 | 1,198 | 0 | 100 | 154 | 0.9% |
| swarm | native | managed | tokens-gate | completion | 3 | 2,702 | 396 | 704 | 1,129 | 0 | 150 | 231 | 1.1% |
| swarm | native | managed | tokens-gate | logs | 9 | 7,855 | 710 | 3,016 | 2,775 | 0 | 450 | 693 | 3.3% |
| swarm | native | managed | tokens-gate | status-marker | 3 | 2,303 | 197 | 573 | 1,076 | 0 | 150 | 215 | 1.0% |
| swarm | native | managed | tokens-gate | test-convention | 3 | 3,496 | 289 | 689 | 2,015 | 0 | 150 | 231 | 1.5% |
| swarm | native | managed | tokens-gate | conventions | 2 | 2,022 | 164 | 433 | 1,088 | 0 | 100 | 154 | 0.9% |
| swarm | native | managed | tokens-gate | forge | 11 | 5,335 | 641 | 3,173 | 0 | 0 | 550 | 671 | 2.3% |
| swarm | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |
| full | native | managed | tokens-gate | core | 29 | 46,030 | 3,188 | 11,971 | 26,486 | 0 | 1,450 | 2,233 | 17.1% |
| full | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 2.0% |
| full | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 1.3% |
| full | native | managed | tokens-gate | memory | 9 | 8,909 | 553 | 2,737 | 4,242 | 0 | 450 | 693 | 3.3% |
| full | native | managed | tokens-gate | docs | 4 | 3,171 | 235 | 694 | 1,628 | 0 | 200 | 308 | 1.2% |
| full | native | managed | tokens-gate | i18n | 2 | 2,785 | 174 | 230 | 2,072 | 0 | 100 | 154 | 1.0% |
| full | native | managed | tokens-gate | rules | 3 | 5,946 | 263 | 520 | 4,700 | 0 | 150 | 231 | 2.2% |
| full | native | managed | tokens-gate | quality | 6 | 4,278 | 406 | 1,029 | 1,891 | 0 | 300 | 462 | 1.6% |
| full | native | managed | tokens-gate | refactor | 6 | 7,332 | 319 | 2,116 | 3,916 | 0 | 300 | 462 | 2.7% |
| full | native | managed | tokens-gate | deps | 5 | 5,781 | 384 | 773 | 3,855 | 0 | 250 | 385 | 2.2% |
| full | native | managed | tokens-gate | test-policy | 2 | 1,992 | 179 | 365 | 1,118 | 0 | 100 | 154 | 0.7% |
| full | native | managed | tokens-gate | database | 5 | 4,451 | 398 | 1,091 | 2,218 | 0 | 250 | 353 | 1.7% |
| full | native | managed | tokens-gate | container | 5 | 3,634 | 580 | 1,622 | 687 | 0 | 250 | 321 | 1.4% |
| full | native | managed | tokens-gate | diagram | 4 | 4,017 | 337 | 1,435 | 1,606 | 0 | 200 | 308 | 1.5% |
| full | native | managed | tokens-gate | env | 2 | 3,688 | 227 | 650 | 2,506 | 0 | 100 | 154 | 1.4% |
| full | native | managed | tokens-gate | error-reporting | 2 | 1,692 | 156 | 935 | 268 | 0 | 100 | 154 | 0.6% |
| full | native | managed | tokens-gate | auto-agent-selector | 5 | 7,401 | 620 | 1,377 | 4,557 | 0 | 250 | 385 | 2.8% |
| full | native | managed | tokens-gate | agent-orchestrator | 6 | 12,901 | 737 | 2,360 | 8,822 | 0 | 300 | 462 | 4.8% |
| full | native | managed | tokens-gate | proposals | 48 | 75,486 | 4,671 | 13,151 | 49,883 | 0 | 2,400 | 3,696 | 28.1% |
| full | native | managed | tokens-gate | notification | 2 | 2,050 | 196 | 331 | 1,198 | 0 | 100 | 154 | 0.8% |
| full | native | managed | tokens-gate | completion | 3 | 2,702 | 396 | 704 | 1,129 | 0 | 150 | 231 | 1.0% |
| full | native | managed | tokens-gate | logs | 9 | 7,855 | 710 | 3,016 | 2,775 | 0 | 450 | 693 | 2.9% |
| full | native | managed | tokens-gate | status-marker | 3 | 2,303 | 197 | 573 | 1,076 | 0 | 150 | 215 | 0.9% |
| full | native | managed | tokens-gate | test-convention | 3 | 3,496 | 289 | 689 | 2,015 | 0 | 150 | 231 | 1.3% |
| full | native | managed | tokens-gate | conventions | 2 | 2,022 | 164 | 433 | 1,088 | 0 | 100 | 154 | 0.8% |
| full | native | managed | tokens-gate | forge | 11 | 5,335 | 641 | 3,173 | 0 | 0 | 550 | 671 | 2.0% |
| full | native | managed | tokens-gate | web-fetch | 1 | 995 | 70 | 309 | 459 | 0 | 50 | 77 | 0.4% |
| full | native | managed | tokens-gate | issues | 1 | 926 | 65 | 85 | 619 | 0 | 50 | 77 | 0.3% |
| full | native | managed | tokens-gate | api | 3 | 4,062 | 205 | 1,886 | 1,533 | 0 | 150 | 215 | 1.5% |
| full | native | managed | tokens-gate | prompt-eval | 2 | 2,722 | 139 | 754 | 1,510 | 0 | 100 | 154 | 1.0% |
| full | native | managed | tokens-gate | audit-orchestrator | 2 | 1,816 | 159 | 550 | 778 | 0 | 100 | 138 | 0.7% |
| full | native | managed | tokens-gate | browser | 8 | 6,891 | 502 | 2,243 | 2,913 | 0 | 400 | 568 | 2.6% |
| full | native | managed | tokens-gate | cache | 2 | 2,262 | 153 | 296 | 1,508 | 0 | 100 | 154 | 0.8% |
| full | native | managed | tokens-gate | external-mcps | 7 | 7,977 | 620 | 1,141 | 5,102 | 0 | 350 | 539 | 3.0% |
| full | native | managed | tokens-gate | observability | 5 | 6,740 | 423 | 1,180 | 4,308 | 0 | 250 | 385 | 2.5% |
| full | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |
| dogfood | native | managed | tokens-gate | core | 30 | 47,000 | 3,268 | 12,111 | 27,083 | 0 | 1,500 | 2,310 | 16.1% |
| dogfood | native | managed | tokens-gate | adaptive-optimizer | 3 | 8,140 | 354 | 2,112 | 5,158 | 0 | 150 | 231 | 2.8% |
| dogfood | native | managed | tokens-gate | audit | 4 | 10,179 | 800 | 1,992 | 6,765 | 0 | 200 | 308 | 3.5% |
| dogfood | native | managed | tokens-gate | auto-agent-selector | 5 | 7,401 | 620 | 1,377 | 4,557 | 0 | 250 | 385 | 2.5% |
| dogfood | native | managed | tokens-gate | auto-plugin-selector | 1 | 3,857 | 154 | 1,227 | 2,300 | 0 | 50 | 77 | 1.3% |
| dogfood | native | managed | tokens-gate | commit-policy | 5 | 6,065 | 740 | 1,060 | 3,407 | 0 | 250 | 369 | 2.1% |
| dogfood | native | managed | tokens-gate | completion | 3 | 2,702 | 396 | 704 | 1,129 | 0 | 150 | 231 | 0.9% |
| dogfood | native | managed | tokens-gate | container | 5 | 3,634 | 580 | 1,622 | 687 | 0 | 250 | 321 | 1.2% |
| dogfood | native | managed | tokens-gate | conventions | 2 | 2,022 | 164 | 433 | 1,088 | 0 | 100 | 154 | 0.7% |
| dogfood | native | managed | tokens-gate | context-for-change | 1 | 1,138 | 99 | 215 | 649 | 0 | 50 | 77 | 0.4% |
| dogfood | native | managed | tokens-gate | deps | 5 | 5,781 | 384 | 773 | 3,855 | 0 | 250 | 385 | 2.0% |
| dogfood | native | managed | tokens-gate | diagram | 4 | 4,017 | 337 | 1,435 | 1,606 | 0 | 200 | 308 | 1.4% |
| dogfood | native | managed | tokens-gate | docs | 4 | 3,171 | 235 | 694 | 1,628 | 0 | 200 | 308 | 1.1% |
| dogfood | native | managed | tokens-gate | env | 2 | 3,688 | 227 | 650 | 2,506 | 0 | 100 | 154 | 1.3% |
| dogfood | native | managed | tokens-gate | forge | 11 | 5,335 | 641 | 3,173 | 0 | 0 | 550 | 671 | 1.8% |
| dogfood | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 1.8% |
| dogfood | native | managed | tokens-gate | i18n | 2 | 2,785 | 174 | 230 | 2,072 | 0 | 100 | 154 | 1.0% |
| dogfood | native | managed | tokens-gate | impact-analysis | 2 | 2,112 | 248 | 404 | 1,122 | 0 | 100 | 154 | 0.7% |
| dogfood | native | managed | tokens-gate | project-health | 1 | 1,422 | 100 | 227 | 928 | 0 | 50 | 77 | 0.5% |
| dogfood | native | managed | tokens-gate | quality-policy | 2 | 1,336 | 286 | 448 | 268 | 0 | 100 | 154 | 0.5% |
| dogfood | native | managed | tokens-gate | link-check | 1 | 1,384 | 112 | 85 | 1,028 | 0 | 50 | 77 | 0.5% |
| dogfood | native | managed | tokens-gate | logs | 9 | 7,855 | 710 | 3,016 | 2,775 | 0 | 450 | 693 | 2.7% |
| dogfood | native | managed | tokens-gate | memory | 9 | 8,909 | 553 | 2,737 | 4,242 | 0 | 450 | 693 | 3.1% |
| dogfood | native | managed | tokens-gate | notification | 2 | 2,050 | 196 | 331 | 1,198 | 0 | 100 | 154 | 0.7% |
| dogfood | native | managed | tokens-gate | orchestrator-runner | 11 | 14,440 | 1,028 | 4,205 | 7,310 | 0 | 550 | 847 | 5.0% |
| dogfood | native | managed | tokens-gate | agent-orchestrator | 6 | 12,901 | 737 | 2,360 | 8,822 | 0 | 300 | 462 | 4.4% |
| dogfood | native | managed | tokens-gate | perf | 3 | 3,962 | 281 | 1,152 | 2,083 | 0 | 150 | 215 | 1.4% |
| dogfood | native | managed | tokens-gate | proposals | 48 | 75,486 | 4,671 | 13,151 | 49,883 | 0 | 2,400 | 3,696 | 25.9% |
| dogfood | native | managed | tokens-gate | project-kpis | 1 | 4,305 | 118 | 1,129 | 2,895 | 0 | 50 | 77 | 1.5% |
| dogfood | native | managed | tokens-gate | quality | 6 | 4,278 | 406 | 1,029 | 1,891 | 0 | 300 | 462 | 1.5% |
| dogfood | native | managed | tokens-gate | rules | 3 | 5,946 | 263 | 520 | 4,700 | 0 | 150 | 231 | 2.0% |
| dogfood | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 1.2% |
| dogfood | native | managed | tokens-gate | security | 4 | 5,977 | 370 | 810 | 4,153 | 0 | 200 | 308 | 2.1% |
| dogfood | native | managed | tokens-gate | status-marker | 3 | 2,303 | 197 | 573 | 1,076 | 0 | 150 | 215 | 0.8% |
| dogfood | native | managed | tokens-gate | tech-debt | 1 | 1,438 | 117 | 134 | 1,030 | 0 | 50 | 77 | 0.5% |
| dogfood | native | managed | tokens-gate | test-convention | 3 | 3,496 | 289 | 689 | 2,015 | 0 | 150 | 231 | 1.2% |
| dogfood | native | managed | tokens-gate | test-policy | 2 | 1,992 | 179 | 365 | 1,118 | 0 | 100 | 154 | 0.7% |
| dogfood | native | managed | tokens-gate | usage-tracking | 3 | 2,209 | 235 | 978 | 499 | 0 | 150 | 231 | 0.8% |
| dogfood | native | managed | tokens-gate | error-reporting | 2 | 1,692 | 156 | 935 | 268 | 0 | 100 | 154 | 0.6% |
| dogfood | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |
| web-app | native | managed | tokens-gate | core | 30 | 47,000 | 3,268 | 12,111 | 27,083 | 0 | 1,500 | 2,310 | 41.2% |
| web-app | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 4.6% |
| web-app | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 3.1% |
| web-app | native | managed | tokens-gate | memory | 9 | 8,909 | 553 | 2,737 | 4,242 | 0 | 450 | 693 | 7.8% |
| web-app | native | managed | tokens-gate | docs | 4 | 3,171 | 235 | 694 | 1,628 | 0 | 200 | 308 | 2.8% |
| web-app | native | managed | tokens-gate | i18n | 2 | 2,785 | 174 | 230 | 2,072 | 0 | 100 | 154 | 2.4% |
| web-app | native | managed | tokens-gate | rules | 3 | 5,946 | 263 | 520 | 4,700 | 0 | 150 | 231 | 5.2% |
| web-app | native | managed | tokens-gate | quality | 6 | 4,278 | 406 | 1,029 | 1,891 | 0 | 300 | 462 | 3.7% |
| web-app | native | managed | tokens-gate | refactor | 6 | 7,332 | 319 | 2,116 | 3,916 | 0 | 300 | 462 | 6.4% |
| web-app | native | managed | tokens-gate | deps | 5 | 5,781 | 384 | 773 | 3,855 | 0 | 250 | 385 | 5.1% |
| web-app | native | managed | tokens-gate | test-policy | 2 | 1,992 | 179 | 365 | 1,118 | 0 | 100 | 154 | 1.7% |
| web-app | native | managed | tokens-gate | test-convention | 3 | 3,496 | 289 | 689 | 2,015 | 0 | 150 | 231 | 3.1% |
| web-app | native | managed | tokens-gate | diagram | 4 | 4,017 | 337 | 1,435 | 1,606 | 0 | 200 | 308 | 3.5% |
| web-app | native | managed | tokens-gate | env | 2 | 3,688 | 227 | 650 | 2,506 | 0 | 100 | 154 | 3.2% |
| web-app | native | managed | tokens-gate | container | 5 | 3,634 | 580 | 1,622 | 687 | 0 | 250 | 321 | 3.2% |
| web-app | native | managed | tokens-gate | web-fetch | 1 | 995 | 70 | 309 | 459 | 0 | 50 | 77 | 0.9% |
| web-app | native | managed | tokens-gate | status-marker | 3 | 2,303 | 197 | 573 | 1,076 | 0 | 150 | 215 | 2.0% |
| web-app | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |
| backend-api | native | managed | tokens-gate | core | 30 | 47,000 | 3,268 | 12,111 | 27,083 | 0 | 1,500 | 2,310 | 41.8% |
| backend-api | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 4.7% |
| backend-api | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 3.1% |
| backend-api | native | managed | tokens-gate | memory | 9 | 8,909 | 553 | 2,737 | 4,242 | 0 | 450 | 693 | 7.9% |
| backend-api | native | managed | tokens-gate | docs | 4 | 3,171 | 235 | 694 | 1,628 | 0 | 200 | 308 | 2.8% |
| backend-api | native | managed | tokens-gate | rules | 3 | 5,946 | 263 | 520 | 4,700 | 0 | 150 | 231 | 5.3% |
| backend-api | native | managed | tokens-gate | quality | 6 | 4,278 | 406 | 1,029 | 1,891 | 0 | 300 | 462 | 3.8% |
| backend-api | native | managed | tokens-gate | refactor | 6 | 7,332 | 319 | 2,116 | 3,916 | 0 | 300 | 462 | 6.5% |
| backend-api | native | managed | tokens-gate | deps | 5 | 5,781 | 384 | 773 | 3,855 | 0 | 250 | 385 | 5.1% |
| backend-api | native | managed | tokens-gate | test-policy | 2 | 1,992 | 179 | 365 | 1,118 | 0 | 100 | 154 | 1.8% |
| backend-api | native | managed | tokens-gate | test-convention | 3 | 3,496 | 289 | 689 | 2,015 | 0 | 150 | 231 | 3.1% |
| backend-api | native | managed | tokens-gate | database | 5 | 4,451 | 398 | 1,091 | 2,218 | 0 | 250 | 353 | 4.0% |
| backend-api | native | managed | tokens-gate | diagram | 4 | 4,017 | 337 | 1,435 | 1,606 | 0 | 200 | 308 | 3.6% |
| backend-api | native | managed | tokens-gate | env | 2 | 3,688 | 227 | 650 | 2,506 | 0 | 100 | 154 | 3.3% |
| backend-api | native | managed | tokens-gate | container | 5 | 3,634 | 580 | 1,622 | 687 | 0 | 250 | 321 | 3.2% |
| backend-api | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |
| cli-tool | native | managed | tokens-gate | core | 30 | 47,000 | 3,268 | 12,111 | 27,083 | 0 | 1,500 | 2,310 | 60.6% |
| cli-tool | native | managed | tokens-gate | git | 8 | 5,305 | 442 | 900 | 2,781 | 0 | 400 | 616 | 6.8% |
| cli-tool | native | managed | tokens-gate | search | 3 | 3,545 | 188 | 1,029 | 1,871 | 0 | 150 | 231 | 4.6% |
| cli-tool | native | managed | tokens-gate | memory | 9 | 8,909 | 553 | 2,737 | 4,242 | 0 | 450 | 693 | 11.5% |
| cli-tool | native | managed | tokens-gate | docs | 4 | 3,171 | 235 | 694 | 1,628 | 0 | 200 | 308 | 4.1% |
| cli-tool | native | managed | tokens-gate | env | 2 | 3,688 | 227 | 650 | 2,506 | 0 | 100 | 154 | 4.8% |
| cli-tool | native | managed | tokens-gate | perf | 3 | 3,962 | 281 | 1,152 | 2,083 | 0 | 150 | 215 | 5.1% |
| cli-tool | native | managed | tokens-gate | test-policy | 2 | 1,992 | 179 | 365 | 1,118 | 0 | 100 | 154 | 2.6% |
| cli-tool | adaptive | managed | dynamic-client | core | 7 | 6,842 | 902 | 1,319 | 3,566 | 0 | 350 | 539 | 100.0% |

## Top tools by bytes (dogfood preset, native surface)

The 20 individual tools that cost the most tools/list bytes in the largest governed preset, with the same component breakdown as the owner table above. This is where "concentration" becomes concrete: a handful of tools account for a disproportionate share of the whole surface.

| Tool | Owner | Total Bytes | Name Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| delendai_agent-orchestrator_dispatch | agent-orchestrator | 4,865 | 38 | 113 | 642 | 3,945 | 0 | 50 | 77 |
| delendai_adaptive-optimizer_adaptive_facade | adaptive-optimizer | 4,801 | 45 | 127 | 836 | 3,666 | 0 | 50 | 77 |
| delendai_project-kpis_project_kpis | project-kpis | 4,305 | 36 | 118 | 1,129 | 2,895 | 0 | 50 | 77 |
| delendai_configuration_center | core | 3,999 | 31 | 92 | 282 | 3,467 | 0 | 50 | 77 |
| delendai_auto-plugin-selector_plugins_recommend | auto-plugin-selector | 3,857 | 49 | 154 | 1,227 | 2,300 | 0 | 50 | 77 |
| delendai_audit_audit_run | audit | 3,742 | 26 | 277 | 1,067 | 2,245 | 0 | 50 | 77 |
| delendai_create_project | core | 3,734 | 25 | 114 | 3,073 | 395 | 0 | 50 | 77 |
| delendai_adopt_project | core | 3,656 | 24 | 141 | 407 | 2,957 | 0 | 50 | 77 |
| delendai_proposals_agent_lock | proposals | 3,229 | 31 | 136 | 434 | 2,501 | 0 | 50 | 77 |
| delendai_proposals_proposals_close_plan | proposals | 3,214 | 41 | 141 | 274 | 2,631 | 0 | 50 | 77 |
| delendai_proposals_close_slice | proposals | 3,036 | 32 | 75 | 610 | 2,192 | 0 | 50 | 77 |
| delendai_audit_audit_consolidate | audit | 2,995 | 34 | 269 | 366 | 2,199 | 0 | 50 | 77 |
| delendai_proposals_proposal_transition | proposals | 2,966 | 40 | 78 | 884 | 1,837 | 0 | 50 | 77 |
| delendai_rules_check_rules | rules | 2,680 | 28 | 84 | 138 | 2,303 | 0 | 50 | 77 |
| delendai_auto-agent-selector_auto_run | auto-agent-selector | 2,676 | 39 | 149 | 565 | 1,796 | 0 | 50 | 77 |
| delendai_proposals_proposal_adopt | proposals | 2,636 | 35 | 121 | 263 | 2,090 | 0 | 50 | 77 |
| delendai_proposals_proposal_get | proposals | 2,612 | 33 | 44 | 33 | 2,375 | 0 | 50 | 77 |
| delendai_scaffold | core | 2,546 | 19 | 103 | 1,513 | 784 | 0 | 50 | 77 |
| delendai_proposals_db_rebuild | proposals | 2,544 | 31 | 114 | 200 | 2,072 | 0 | 50 | 77 |
| delendai_create_plugin | core | 2,532 | 24 | 194 | 292 | 1,895 | 0 | 50 | 77 |

## CHECK-007 — tokenizer cost by preset

This gate (`tokens:gate` / `tokens:dashboard:generate`) measures serialized BYTES of the tools/list JSON payload, not native LLM tokens — bytes-per-token varies enough across prose descriptions, JSON schemas, and identifiers that a byte count cannot substitute for a real token count. The table below reports both, with an explicit confidence label per model: `measured-real-bpe` is a real encode with the model's own published tokenizer (gpt-tokenizer for gpt-5.4); `measured-legacy-bpe` is a real BPE encode but on a vocabulary the vendor published for an older model generation (Anthropic has not published an offline tokenizer for Claude Sonnet 4, so @anthropic-ai/tokenizer's pre-Claude-3 vocabulary is used as the closest available real encoder); `estimated-byte-ratio` is bytes / 4, used only where no offline tokenizer package exists (Gemini). See tools/scripts/report/tokenizer-real.script.ts for the profile definitions.

| Preset | Measurement Surface | Runtime Surface | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Confidence (per model, in order above) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | 55,892 | 13098 | 13405 | 13973 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| minimal | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | native | managed | tokens-gate | 67,985 | 16014 | 16415 | 16997 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | native | managed | tokens-gate | 133,936 | 32013 | 32793 | 33484 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | native | managed | tokens-gate | 235,266 | 56736 | 58107 | 58817 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | native | managed | tokens-gate | 268,717 | 64895 | 66498 | 67180 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| dogfood | native | managed | tokens-gate | 291,479 | 70466 | 71967 | 72870 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| dogfood | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | native | managed | tokens-gate | 114,274 | 27197 | 27907 | 28569 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | native | managed | tokens-gate | 112,641 | 26769 | 27471 | 28161 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | native | managed | tokens-gate | 77,634 | 18307 | 18750 | 19409 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | adaptive | managed | dynamic-client | 6,850 | 1590 | 1641 | 1713 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |

## Documented deficits (kept, not auto-bumped)

- swarm native/tokens-gate tools/list = 235,266B, documented hard ceiling = 210,000B. Derived from the same measurement semantics as tokens:gate; kept as-is per v00123 non-goal: report the deficit, do not auto-bump.
- full native/tokens-gate tools/list = 268,717B, documented hard ceiling = 256,000B. Derived from the same measurement semantics as tokens:gate; kept as-is per v00123 non-goal: report the deficit, do not auto-bump.

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 6,850 | ok | — | 55,892 | ok | — |
| lean | 6,850 | ok | — | 67,985 | ok | — |
| standard | 6,850 | ok | — | 133,936 | warning | — |
| swarm | 6,850 | ok | — | 235,266 | breach | breach: 235,266B > hard 210,000B |
| full | 6,850 | ok | — | 268,717 | breach | breach: 268,717B > hard 256,000B |
| dogfood | 6,850 | ok | — | 291,479 | ok | — |
| web-app | 6,850 | n/a | — | 114,274 | n/a | — |
| backend-api | 6,850 | n/a | — | 112,641 | n/a | — |
| cli-tool | 6,850 | n/a | — | 77,634 | n/a | — |

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
