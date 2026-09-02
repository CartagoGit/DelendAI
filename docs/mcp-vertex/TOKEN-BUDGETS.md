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
| overview full | managed | 47 | 12 | 11,000 | 11,100 | within hard |
| overview compact | managed | 55 | 14 | 1,450 | 1,500 | within hard |
| overview full (native) | native | 48 | 12 | 12,300 | 12,650 | within hard |
| overview compact (native) | native | 56 | 14 | 1,750 | 1,800 | within hard |
| auto_work idle | native | 159 | 40 | 2,400 | 2,600 | within hard |
| auto_work work plan | native | 2,453 | 614 | 2,400 | 2,600 | over warning (2,400B) |
| agent_catalog compact | native | 32 | 8 | 800 | 900 | within hard |
| agent_catalog full | native | 33 | 9 | 9,800 | 10,500 | within hard |
| analyze_project {} | native | 829 | 208 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | native | 836 | 209 | 1,800 | 2,000 | within hard |
| search_search | native | 874 | 219 | 2,700 | 3,000 | within hard |
| docs_docs_list | native | 209 | 53 | 2,200 | 2,500 | within hard |
| proposals_round_context | native | 153 | 39 | 2,700 | 3,000 | within hard |
| logs_tail | native | 63 | 16 | 5,500 | 6,000 | within hard |

## Catalog and task context cost addendum

Measured with `bun tools/scripts/measure/catalog-task-context-cost.script.ts` against the same synthetic fixture workspace used by the token budget suite. Result bytes are computed from `structuredContent` when present and fall back to concatenated text content otherwise, so compact structured responses and classic text tools are measured on the same reproducible basis. The existing real-preset, plugin-marginal and top-tool tables below remain the schema breakdown source; this addendum pins the extra S1 measurements for `agent_catalog` payloads and routed `project_context` task context snapshots.

| Catalog payload | Surface | Bytes | Est. Tokens |
| --- | --- | --- | --- |
| agent_catalog compact | native | 743 | 186 |
| agent_catalog full | native | 9,519 | 2,380 |

| Catalog breakdown snapshot | Tools | Tools/List Bytes | Schema Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| native core catalog | 28 | 42,768 | 36,508 | 11,533 | 24,975 | 0 |
| swarm native preset | 166 | 193,678 | 157,987 | 48,031 | 109,956 | 50,347 |

Task context corpus: `cold start -> search.search -> docs.docs_list -> logs.tail`, measured as `mcp-vertex_vertex { domain: "core", action: "project_context" }` on the `swarm` preset under `managed`.

| Task context sample | Bytes | Est. Tokens |
| --- | --- | --- |
| cold start | 682 | 171 |
| after search.search | 738 | 185 |
| after docs.docs_list | 786 | 197 |
| after logs.tail | 834 | 209 |

| Percentile | Bytes | Est. Tokens |
| --- | --- | --- |
| p50 | 738 | 185 |
| p95 | 834 | 209 |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface measurement baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap measurement). `Runtime Surface` is shown separately because ordinary MCP-Vertex execution defaults to `managed`; `native` here does not mean that the server is running native.

| Preset | Title | Measurement Surface | Runtime Surface | Source | Plugins | Tools | Tools/List Bytes | Est. Tokens | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | native | managed | tokens-gate | 2 | 37 | 49,715 | 12429 | 41,876 | 3,346 | 13,120 | 28,756 | 5,065 | 56 | n/a | within hard | within hard | none |
| minimal | minimal | adaptive | managed | dynamic-client | 2 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 55 | n/a | within hard | within hard | none |
| lean | lean | native | managed | tokens-gate | 4 | 49 | 60,296 | 15074 | 50,236 | 4,080 | 16,384 | 33,852 | 8,221 | 56 | n/a | within hard | within hard | none |
| lean | lean | adaptive | managed | dynamic-client | 4 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 55 | n/a | within hard | within hard | none |
| standard | standard | native | managed | tokens-gate | 19 | 99 | 118,750 | 29688 | 97,628 | 8,669 | 29,139 | 68,489 | 10,007 | 58 | n/a | within hard | over warning (9,500B) | none |
| standard | standard | adaptive | managed | dynamic-client | 19 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 56 | n/a | within hard | within hard | none |
| swarm | swarm | native | managed | tokens-gate | 27 | 166 | 193,678 | 48420 | 157,987 | 14,665 | 48,031 | 109,956 | 50,347 | 59 | 153 | within hard | within hard | none |
| swarm | swarm | adaptive | managed | dynamic-client | 27 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 56 | n/a | within hard | within hard | none |
| full | full | native | managed | tokens-gate | 39 | 196 | 226,447 | 56612 | 184,642 | 16,921 | 56,363 | 128,279 | 50,347 | 59 | 153 | within hard | within hard | none |
| full | full | adaptive | managed | dynamic-client | 39 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 56 | n/a | within hard | within hard | none |
| vertex | vertex | native | managed | tokens-gate | 38 | 197 | 255,066 | 63767 | 210,937 | 18,745 | 60,720 | 150,217 | 50,347 | 59 | 153 | within hard | within hard | none |
| vertex | vertex | adaptive | managed | dynamic-client | 38 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 56 | n/a | within hard | within hard | none |
| web-app | web-app | native | managed | tokens-gate | 18 | 89 | 103,208 | 25802 | 84,695 | 7,393 | 26,221 | 58,474 | 8,221 | 58 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | managed | dynamic-client | 18 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 56 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | managed | tokens-gate | 16 | 88 | 101,624 | 25406 | 83,304 | 7,350 | 26,200 | 57,104 | 8,221 | 58 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | managed | dynamic-client | 16 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 56 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | managed | tokens-gate | 7 | 56 | 69,735 | 17434 | 58,110 | 4,767 | 18,551 | 39,559 | 8,221 | 56 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | managed | dynamic-client | 7 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 55 | n/a | n/a | n/a | none |

## Plugin marginal dashboard — component breakdown by owner

`Tools/List Bytes` per owner is the sum of each tool's own serialized entry (`JSON.stringify({name, description, inputSchema, outputSchema, annotations})`), decomposed into the fields that make it up. `Envelope Bytes` is JSON punctuation and key labels — derived by subtraction, so every row's named-field columns plus Envelope Bytes sum exactly to Tools/List Bytes. `Share of Preset` is this owner's bytes divided by the sum of all owners' bytes in that preset row (not divided by the whole-array `Tools/List Bytes` on the preset-summary table above, which also carries the array's own brackets/commas) — shares always sum to 100%.

| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools | Tools/List Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes | Share of Preset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | core | 28 | 42,739 | 2,839 | 11,533 | 24,975 | 0 | 756 | 1,904 | 86.0% |
| minimal | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 10.2% |
| minimal | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 3.8% |
| minimal | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| lean | native | managed | tokens-gate | core | 28 | 42,739 | 2,839 | 11,533 | 24,975 | 0 | 756 | 1,904 | 70.9% |
| lean | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 8.4% |
| lean | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 3.1% |
| lean | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 13.6% |
| lean | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 3.9% |
| lean | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| standard | native | managed | tokens-gate | core | 28 | 42,739 | 2,839 | 11,533 | 24,975 | 0 | 756 | 1,904 | 36.0% |
| standard | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 4.3% |
| standard | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 1.6% |
| standard | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 6.9% |
| standard | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 2.0% |
| standard | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 2.3% |
| standard | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 4.9% |
| standard | native | managed | tokens-gate | quality | 4 | 1,902 | 294 | 550 | 536 | 0 | 108 | 272 | 1.6% |
| standard | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 6.0% |
| standard | native | managed | tokens-gate | deps | 5 | 5,688 | 384 | 773 | 3,912 | 0 | 135 | 340 | 4.8% |
| standard | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.6% |
| standard | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 3.7% |
| standard | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 2.9% |
| standard | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 3.3% |
| standard | native | managed | tokens-gate | env | 2 | 3,628 | 227 | 650 | 2,506 | 0 | 54 | 136 | 3.1% |
| standard | native | managed | tokens-gate | error-reporting | 1 | 462 | 77 | 114 | 134 | 0 | 27 | 68 | 0.4% |
| standard | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 6.2% |
| standard | native | managed | tokens-gate | agent-orchestrator | 6 | 10,007 | 737 | 1,907 | 6,561 | 0 | 162 | 408 | 8.4% |
| standard | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| swarm | native | managed | tokens-gate | core | 28 | 42,739 | 2,839 | 11,533 | 24,975 | 0 | 756 | 1,904 | 22.1% |
| swarm | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 2.6% |
| swarm | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 1.0% |
| swarm | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 4.2% |
| swarm | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 1.2% |
| swarm | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.4% |
| swarm | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 3.0% |
| swarm | native | managed | tokens-gate | quality | 4 | 1,902 | 294 | 550 | 536 | 0 | 108 | 272 | 1.0% |
| swarm | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 3.7% |
| swarm | native | managed | tokens-gate | deps | 5 | 5,688 | 384 | 773 | 3,912 | 0 | 135 | 340 | 2.9% |
| swarm | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.0% |
| swarm | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 2.2% |
| swarm | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.8% |
| swarm | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 2.0% |
| swarm | native | managed | tokens-gate | env | 2 | 3,628 | 227 | 650 | 2,506 | 0 | 54 | 136 | 1.9% |
| swarm | native | managed | tokens-gate | error-reporting | 1 | 462 | 77 | 114 | 134 | 0 | 27 | 68 | 0.2% |
| swarm | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 3.8% |
| swarm | native | managed | tokens-gate | agent-orchestrator | 6 | 10,007 | 737 | 1,907 | 6,561 | 0 | 162 | 408 | 5.2% |
| swarm | native | managed | tokens-gate | proposals | 34 | 50,347 | 3,399 | 10,013 | 32,411 | 0 | 918 | 2,312 | 26.0% |
| swarm | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.8% |
| swarm | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 1.3% |
| swarm | native | managed | tokens-gate | logs | 9 | 7,718 | 710 | 3,016 | 2,908 | 0 | 243 | 612 | 4.0% |
| swarm | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 1.1% |
| swarm | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.8% |
| swarm | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 1.0% |
| swarm | native | managed | tokens-gate | forge | 11 | 5,011 | 645 | 3,173 | 0 | 0 | 297 | 572 | 2.6% |
| swarm | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| full | native | managed | tokens-gate | core | 27 | 41,799 | 2,759 | 11,393 | 24,378 | 0 | 729 | 1,836 | 18.5% |
| full | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 2.2% |
| full | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 0.8% |
| full | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 3.6% |
| full | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 1.0% |
| full | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.2% |
| full | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 2.6% |
| full | native | managed | tokens-gate | quality | 4 | 1,902 | 294 | 550 | 536 | 0 | 108 | 272 | 0.8% |
| full | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 3.2% |
| full | native | managed | tokens-gate | deps | 5 | 5,688 | 384 | 773 | 3,912 | 0 | 135 | 340 | 2.5% |
| full | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 0.9% |
| full | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 1.9% |
| full | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.5% |
| full | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 1.7% |
| full | native | managed | tokens-gate | env | 2 | 3,628 | 227 | 650 | 2,506 | 0 | 54 | 136 | 1.6% |
| full | native | managed | tokens-gate | error-reporting | 1 | 462 | 77 | 114 | 134 | 0 | 27 | 68 | 0.2% |
| full | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 3.2% |
| full | native | managed | tokens-gate | agent-orchestrator | 6 | 10,007 | 737 | 1,907 | 6,561 | 0 | 162 | 408 | 4.4% |
| full | native | managed | tokens-gate | proposals | 34 | 50,347 | 3,399 | 10,013 | 32,411 | 0 | 918 | 2,312 | 22.3% |
| full | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.7% |
| full | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 1.2% |
| full | native | managed | tokens-gate | logs | 9 | 7,718 | 710 | 3,016 | 2,908 | 0 | 243 | 612 | 3.4% |
| full | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 1.0% |
| full | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.5% |
| full | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 0.9% |
| full | native | managed | tokens-gate | forge | 11 | 5,011 | 645 | 3,173 | 0 | 0 | 297 | 572 | 2.2% |
| full | native | managed | tokens-gate | web-fetch | 1 | 984 | 70 | 309 | 478 | 0 | 27 | 68 | 0.4% |
| full | native | managed | tokens-gate | issues | 1 | 915 | 65 | 85 | 638 | 0 | 27 | 68 | 0.4% |
| full | native | managed | tokens-gate | api | 3 | 4,019 | 205 | 1,914 | 1,552 | 0 | 81 | 188 | 1.8% |
| full | native | managed | tokens-gate | prompt-eval | 2 | 2,757 | 139 | 754 | 1,605 | 0 | 54 | 136 | 1.2% |
| full | native | managed | tokens-gate | audit-orchestrator | 2 | 1,756 | 159 | 550 | 778 | 0 | 54 | 120 | 0.8% |
| full | native | managed | tokens-gate | browser | 8 | 6,651 | 502 | 2,243 | 2,913 | 0 | 216 | 496 | 2.9% |
| full | native | managed | tokens-gate | cache | 2 | 2,202 | 153 | 296 | 1,508 | 0 | 54 | 136 | 1.0% |
| full | native | managed | tokens-gate | external-mcps | 7 | 7,767 | 620 | 1,141 | 5,102 | 0 | 189 | 476 | 3.4% |
| full | native | managed | tokens-gate | observability | 5 | 6,628 | 423 | 1,180 | 4,346 | 0 | 135 | 340 | 2.9% |
| full | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| vertex | native | managed | tokens-gate | core | 28 | 42,739 | 2,839 | 11,533 | 24,975 | 0 | 756 | 1,904 | 16.8% |
| vertex | native | managed | tokens-gate | adaptive-optimizer | 3 | 8,050 | 354 | 2,112 | 5,158 | 0 | 81 | 204 | 3.2% |
| vertex | native | managed | tokens-gate | audit | 4 | 10,099 | 802 | 1,992 | 6,803 | 0 | 108 | 272 | 4.0% |
| vertex | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 2.9% |
| vertex | native | managed | tokens-gate | auto-plugin-selector | 1 | 3,827 | 154 | 1,227 | 2,300 | 0 | 27 | 68 | 1.5% |
| vertex | native | managed | tokens-gate | commit-policy | 5 | 6,866 | 665 | 1,060 | 4,433 | 0 | 135 | 324 | 2.7% |
| vertex | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 1.0% |
| vertex | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.4% |
| vertex | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 0.8% |
| vertex | native | managed | tokens-gate | context-for-change | 1 | 1,108 | 99 | 215 | 649 | 0 | 27 | 68 | 0.4% |
| vertex | native | managed | tokens-gate | deps | 5 | 5,688 | 384 | 773 | 3,912 | 0 | 135 | 340 | 2.2% |
| vertex | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 1.5% |
| vertex | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 0.9% |
| vertex | native | managed | tokens-gate | env | 2 | 3,628 | 227 | 650 | 2,506 | 0 | 54 | 136 | 1.4% |
| vertex | native | managed | tokens-gate | forge | 11 | 5,011 | 645 | 3,173 | 0 | 0 | 297 | 572 | 2.0% |
| vertex | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 2.0% |
| vertex | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.1% |
| vertex | native | managed | tokens-gate | impact-analysis | 2 | 2,052 | 248 | 404 | 1,122 | 0 | 54 | 136 | 0.8% |
| vertex | native | managed | tokens-gate | project-health | 1 | 1,392 | 100 | 227 | 928 | 0 | 27 | 68 | 0.5% |
| vertex | native | managed | tokens-gate | quality-policy | 1 | 551 | 114 | 166 | 134 | 0 | 27 | 68 | 0.2% |
| vertex | native | managed | tokens-gate | link-check | 1 | 1,354 | 112 | 85 | 1,028 | 0 | 27 | 68 | 0.5% |
| vertex | native | managed | tokens-gate | logs | 9 | 7,718 | 710 | 3,016 | 2,908 | 0 | 243 | 612 | 3.0% |
| vertex | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 3.2% |
| vertex | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.6% |
| vertex | native | managed | tokens-gate | orchestrator-runner | 11 | 14,395 | 1,028 | 4,205 | 7,595 | 0 | 297 | 748 | 5.6% |
| vertex | native | managed | tokens-gate | agent-orchestrator | 6 | 10,007 | 737 | 1,907 | 6,561 | 0 | 162 | 408 | 3.9% |
| vertex | native | managed | tokens-gate | perf | 3 | 3,872 | 281 | 1,152 | 2,083 | 0 | 81 | 188 | 1.5% |
| vertex | native | managed | tokens-gate | proposals | 34 | 50,347 | 3,399 | 10,013 | 32,411 | 0 | 918 | 2,312 | 19.8% |
| vertex | native | managed | tokens-gate | project-kpis | 1 | 9,898 | 118 | 1,129 | 8,518 | 0 | 27 | 68 | 3.9% |
| vertex | native | managed | tokens-gate | quality | 4 | 1,902 | 294 | 550 | 536 | 0 | 108 | 272 | 0.7% |
| vertex | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 2.3% |
| vertex | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 0.7% |
| vertex | native | managed | tokens-gate | security | 4 | 5,857 | 370 | 810 | 4,153 | 0 | 108 | 272 | 2.3% |
| vertex | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 0.9% |
| vertex | native | managed | tokens-gate | tech-debt | 1 | 1,408 | 117 | 134 | 1,030 | 0 | 27 | 68 | 0.6% |
| vertex | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.3% |
| vertex | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 0.8% |
| vertex | native | managed | tokens-gate | usage-tracking | 3 | 2,119 | 235 | 978 | 499 | 0 | 81 | 204 | 0.8% |
| vertex | native | managed | tokens-gate | error-reporting | 1 | 462 | 77 | 114 | 134 | 0 | 27 | 68 | 0.2% |
| vertex | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| web-app | native | managed | tokens-gate | core | 28 | 42,739 | 2,839 | 11,533 | 24,975 | 0 | 756 | 1,904 | 41.4% |
| web-app | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 4.9% |
| web-app | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 1.8% |
| web-app | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 8.0% |
| web-app | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 2.3% |
| web-app | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 2.6% |
| web-app | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 5.7% |
| web-app | native | managed | tokens-gate | quality | 4 | 1,902 | 294 | 550 | 536 | 0 | 108 | 272 | 1.8% |
| web-app | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 6.9% |
| web-app | native | managed | tokens-gate | deps | 5 | 5,688 | 384 | 773 | 3,912 | 0 | 135 | 340 | 5.5% |
| web-app | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.9% |
| web-app | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 3.3% |
| web-app | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 3.8% |
| web-app | native | managed | tokens-gate | env | 2 | 3,628 | 227 | 650 | 2,506 | 0 | 54 | 136 | 3.5% |
| web-app | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 3.4% |
| web-app | native | managed | tokens-gate | web-fetch | 1 | 984 | 70 | 309 | 478 | 0 | 27 | 68 | 1.0% |
| web-app | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 2.1% |
| web-app | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| backend-api | native | managed | tokens-gate | core | 28 | 42,739 | 2,839 | 11,533 | 24,975 | 0 | 756 | 1,904 | 42.1% |
| backend-api | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 5.0% |
| backend-api | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 1.8% |
| backend-api | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 8.1% |
| backend-api | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 2.3% |
| backend-api | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 5.8% |
| backend-api | native | managed | tokens-gate | quality | 4 | 1,902 | 294 | 550 | 536 | 0 | 108 | 272 | 1.9% |
| backend-api | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 7.0% |
| backend-api | native | managed | tokens-gate | deps | 5 | 5,688 | 384 | 773 | 3,912 | 0 | 135 | 340 | 5.6% |
| backend-api | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.9% |
| backend-api | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 3.4% |
| backend-api | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 4.3% |
| backend-api | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 3.8% |
| backend-api | native | managed | tokens-gate | env | 2 | 3,628 | 227 | 650 | 2,506 | 0 | 54 | 136 | 3.6% |
| backend-api | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 3.4% |
| backend-api | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| cli-tool | native | managed | tokens-gate | core | 28 | 42,739 | 2,839 | 11,533 | 24,975 | 0 | 756 | 1,904 | 61.3% |
| cli-tool | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 7.3% |
| cli-tool | native | managed | tokens-gate | search | 1 | 1,873 | 65 | 687 | 1,000 | 0 | 27 | 68 | 2.7% |
| cli-tool | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 11.8% |
| cli-tool | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 3.4% |
| cli-tool | native | managed | tokens-gate | env | 2 | 3,628 | 227 | 650 | 2,506 | 0 | 54 | 136 | 5.2% |
| cli-tool | native | managed | tokens-gate | perf | 3 | 3,872 | 281 | 1,152 | 2,083 | 0 | 81 | 188 | 5.6% |
| cli-tool | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 2.8% |
| cli-tool | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |

## Top tools by bytes (vertex preset, native surface)

The 20 individual tools that cost the most tools/list bytes in the largest governed preset, with the same component breakdown as the owner table above. This is where "concentration" becomes concrete: a handful of tools account for a disproportionate share of the whole surface.

| Tool | Owner | Total Bytes | Name Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mcp-vertex_project-kpis_project_kpis | project-kpis | 9,898 | 38 | 118 | 1,129 | 8,518 | 0 | 27 | 68 |
| mcp-vertex_adaptive-optimizer_adaptive_facade | adaptive-optimizer | 4,771 | 47 | 127 | 836 | 3,666 | 0 | 27 | 68 |
| mcp-vertex_configuration_center | core | 3,988 | 33 | 92 | 282 | 3,486 | 0 | 27 | 68 |
| mcp-vertex_auto-plugin-selector_plugins_recommend | auto-plugin-selector | 3,827 | 51 | 154 | 1,227 | 2,300 | 0 | 27 | 68 |
| mcp-vertex_audit_audit_run | audit | 3,712 | 28 | 277 | 1,067 | 2,245 | 0 | 27 | 68 |
| mcp-vertex_create_project | core | 3,704 | 27 | 114 | 3,073 | 395 | 0 | 27 | 68 |
| mcp-vertex_adopt_project | core | 3,626 | 26 | 141 | 407 | 2,957 | 0 | 27 | 68 |
| mcp-vertex_commit-policy_commit_policy_status | commit-policy | 3,417 | 47 | 153 | 85 | 3,037 | 0 | 27 | 68 |
| mcp-vertex_audit_audit_consolidate | audit | 3,003 | 36 | 269 | 366 | 2,237 | 0 | 27 | 68 |
| mcp-vertex_proposals_proposal_get | proposals | 2,772 | 35 | 44 | 33 | 2,565 | 0 | 27 | 68 |
| mcp-vertex_auto-agent-selector_auto_run | auto-agent-selector | 2,684 | 41 | 149 | 565 | 1,834 | 0 | 27 | 68 |
| mcp-vertex_rules_check_rules | rules | 2,650 | 30 | 84 | 138 | 2,303 | 0 | 27 | 68 |
| mcp-vertex_proposals_proposal_adopt | proposals | 2,597 | 37 | 121 | 263 | 2,081 | 0 | 27 | 68 |
| mcp-vertex_scaffold | core | 2,522 | 21 | 103 | 1,519 | 784 | 0 | 27 | 68 |
| mcp-vertex_create_plugin | core | 2,502 | 26 | 194 | 292 | 1,895 | 0 | 27 | 68 |
| mcp-vertex_agent-orchestrator_dispatch | agent-orchestrator | 2,423 | 40 | 113 | 491 | 1,684 | 0 | 27 | 68 |
| mcp-vertex_proposals_close_slice | proposals | 2,396 | 34 | 75 | 498 | 1,694 | 0 | 27 | 68 |
| mcp-vertex_agent-orchestrator_plan | agent-orchestrator | 2,337 | 36 | 176 | 491 | 1,539 | 0 | 27 | 68 |
| mcp-vertex_project_plugins_create | core | 2,335 | 35 | 97 | 497 | 1,611 | 0 | 27 | 68 |
| mcp-vertex_adaptive-optimizer_optimize_run | adaptive-optimizer | 2,302 | 44 | 116 | 1,136 | 911 | 0 | 27 | 68 |

## CHECK-007 — tokenizer cost by preset

This gate (`tokens:gate` / `tokens:dashboard:generate`) measures serialized BYTES of the tools/list JSON payload, not native LLM tokens — bytes-per-token varies enough across prose descriptions, JSON schemas, and identifiers that a byte count cannot substitute for a real token count. The table below reports both, with an explicit confidence label per model: `measured-real-bpe` is a real encode with the model's own published tokenizer (gpt-tokenizer for gpt-5.4); `measured-legacy-bpe` is a real BPE encode but on a vocabulary the vendor published for an older model generation (Anthropic has not published an offline tokenizer for Claude Sonnet 4, so @anthropic-ai/tokenizer's pre-Claude-3 vocabulary is used as the closest available real encoder); `estimated-byte-ratio` is bytes / 4, used only where no offline tokenizer package exists (Gemini). See tools/scripts/report/tokenizer-real.script.ts for the profile definitions.

| Preset | Measurement Surface | Runtime Surface | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Confidence (per model, in order above) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | 49,715 | 11679 | 11938 | 12429 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| minimal | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | native | managed | tokens-gate | 60,296 | 14240 | 14591 | 15074 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | native | managed | tokens-gate | 118,750 | 28456 | 29145 | 29688 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | native | managed | tokens-gate | 193,678 | 46722 | 47820 | 48420 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | native | managed | tokens-gate | 226,447 | 54750 | 56070 | 56612 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| vertex | native | managed | tokens-gate | 255,066 | 61452 | 62596 | 63767 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| vertex | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | native | managed | tokens-gate | 103,208 | 24635 | 25277 | 25802 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | native | managed | tokens-gate | 101,624 | 24221 | 24854 | 25406 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | native | managed | tokens-gate | 69,735 | 16484 | 16877 | 17434 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |

## Documented deficits (kept, not auto-bumped)

- none

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 4,900 | ok | — | 49,715 | ok | — |
| lean | 4,900 | ok | — | 60,296 | ok | — |
| standard | 4,900 | ok | — | 118,750 | ok | — |
| swarm | 4,900 | ok | — | 193,678 | ok | — |
| full | 4,900 | ok | — | 226,447 | ok | — |
| vertex | 4,900 | ok | — | 255,066 | ok | — |
| web-app | 4,900 | n/a | — | 103,208 | n/a | — |
| backend-api | 4,900 | n/a | — | 101,624 | n/a | — |
| cli-tool | 4,900 | n/a | — | 69,735 | n/a | — |

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

Source snapshot: .vscode/mcp-vertex/kpis.json

No local activation KPI snapshot was found at .vscode/mcp-vertex/kpis.json.

This dashboard can only render a previously persisted local snapshot. Runtime collection and disk writes must be performed by the caller or host integration that owns the session lifecycle.

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
