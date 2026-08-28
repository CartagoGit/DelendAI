# Token Budgets — generated dashboard

<!-- generated: token-budget-dashboard.script.ts -->
<!-- generated — do not edit by hand -->

Generated at: 2026-08-28T07:34:22.493Z

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

| Surface | Bytes | Est. Tokens | Warning | Hard | Status |
| --- | --- | --- | --- | --- | --- |
| overview full | 11,727 | 2932 | 11,000 | 11,100 | over hard (11,100B) |
| overview compact | 1,651 | 413 | 1,450 | 1,500 | over hard (1,500B) |
| auto_work idle | 159 | 40 | 2,400 | 2,600 | within hard |
| auto_work work plan | 2,453 | 614 | 2,400 | 2,600 | over warning (2,400B) |
| agent_catalog compact | 743 | 186 | 800 | 900 | within hard |
| agent_catalog full | 8,736 | 2184 | 8,500 | 9,000 | over warning (8,500B) |
| analyze_project {} | 829 | 208 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | 836 | 209 | 1,800 | 2,000 | within hard |
| search_search | 874 | 219 | 2,700 | 3,000 | within hard |
| docs_docs_list | 209 | 53 | 2,200 | 2,500 | within hard |
| proposals_round_context | 153 | 39 | 2,700 | 3,000 | within hard |
| logs_tail | 2,594 | 649 | 5,500 | 6,000 | within hard |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface measurement baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap measurement). `Runtime Surface` is shown separately because ordinary MCP-Vertex execution defaults to `managed`; `native` here does not mean that the server is running native.

| Preset | Title | Measurement Surface | Runtime Surface | Source | Plugins | Tools | Tools/List Bytes | Est. Tokens | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | native | managed | tokens-gate | 2 | 33 | 58,634 | 14659 | 51,630 | 3,029 | 11,915 | 39,715 | 5,065 | 996 | n/a | over warning (58,000B) | within hard | none |
| minimal | minimal | adaptive | managed | dynamic-client | 2 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 551 | n/a | within hard | within hard | none |
| lean | lean | native | managed | tokens-gate | 4 | 45 | 69,215 | 17304 | 59,990 | 3,763 | 15,179 | 44,811 | 8,221 | 1,213 | n/a | over warning (69,000B) | within hard | none |
| lean | lean | adaptive | managed | dynamic-client | 4 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 567 | n/a | within hard | within hard | none |
| standard | standard | native | managed | tokens-gate | 19 | 93 | 130,684 | 32671 | 110,889 | 8,130 | 26,860 | 84,029 | 8,221 | 2,760 | n/a | within hard | within hard | none |
| standard | standard | adaptive | managed | dynamic-client | 19 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 753 | n/a | within hard | within hard | none |
| swarm | swarm | native | managed | tokens-gate | 27 | 159 | 199,236 | 49809 | 165,036 | 14,084 | 45,074 | 119,962 | 45,277 | 4,372 | 153 | within hard | within hard | none |
| swarm | swarm | adaptive | managed | dynamic-client | 27 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 858 | n/a | within hard | within hard | none |
| full | full | native | managed | tokens-gate | 31 | 166 | 207,918 | 51980 | 172,371 | 14,563 | 48,136 | 124,235 | 45,277 | 4,710 | 153 | within hard | within hard | none |
| full | full | adaptive | managed | dynamic-client | 31 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 899 | n/a | within hard | within hard | none |
| vertex | vertex | native | managed | tokens-gate | 37 | 187 | 281,138 | 70285 | 239,322 | 17,781 | 55,036 | 184,286 | 45,277 | 5,595 | 153 | within hard | within hard | none |
| vertex | vertex | adaptive | managed | dynamic-client | 37 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 1,030 | n/a | within hard | within hard | none |
| web-app | web-app | native | managed | tokens-gate | 18 | 85 | 113,501 | 28376 | 95,823 | 7,076 | 24,515 | 71,308 | 8,221 | 2,644 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | managed | dynamic-client | 18 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 727 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | managed | tokens-gate | 16 | 84 | 111,917 | 27980 | 94,432 | 7,033 | 24,494 | 69,938 | 8,221 | 2,508 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | managed | dynamic-client | 16 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 703 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | managed | tokens-gate | 7 | 52 | 78,276 | 19569 | 67,486 | 4,450 | 16,968 | 50,518 | 8,221 | 1,444 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | managed | dynamic-client | 7 | 6 | 8,934 | 2234 | 7,690 | 526 | 1,020 | 6,670 | 0 | 594 | n/a | n/a | n/a | none |

## Plugin marginal dashboard — component breakdown by owner

`Tools/List Bytes` per owner is the sum of each tool's own serialized entry (`JSON.stringify({name, description, inputSchema, outputSchema, annotations})`), decomposed into the fields that make it up. `Envelope Bytes` is JSON punctuation and key labels — derived by subtraction, so every row's named-field columns plus Envelope Bytes sum exactly to Tools/List Bytes. `Share of Preset` is this owner's bytes divided by the sum of all owners' bytes in that preset row (not divided by the whole-array `Tools/List Bytes` on the preset-summary table above, which also carries the array's own brackets/commas) — shares always sum to 100%.

| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools | Tools/List Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes | Share of Preset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 88.4% |
| minimal | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 8.6% |
| minimal | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 3.0% |
| minimal | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |
| lean | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 74.9% |
| lean | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 7.3% |
| lean | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 2.5% |
| lean | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 11.9% |
| lean | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 3.4% |
| lean | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |
| standard | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 39.7% |
| standard | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 3.9% |
| standard | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 1.3% |
| standard | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 6.3% |
| standard | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 1.8% |
| standard | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 2.1% |
| standard | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 4.5% |
| standard | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 3.0% |
| standard | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 5.5% |
| standard | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 4.2% |
| standard | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.5% |
| standard | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 3.3% |
| standard | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 2.7% |
| standard | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 3.0% |
| standard | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 2.5% |
| standard | native | managed | tokens-gate | error-reporting | 1 | 4,237 | 77 | 114 | 3,909 | 0 | 27 | 68 | 3.2% |
| standard | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 5.6% |
| standard | native | managed | tokens-gate | agent-orchestrator | 4 | 7,875 | 515 | 1,334 | 5,492 | 0 | 108 | 272 | 6.0% |
| standard | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |
| swarm | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 26.0% |
| swarm | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 2.5% |
| swarm | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 0.9% |
| swarm | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 4.1% |
| swarm | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 1.2% |
| swarm | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.4% |
| swarm | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 2.9% |
| swarm | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 2.0% |
| swarm | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 3.6% |
| swarm | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 2.7% |
| swarm | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.0% |
| swarm | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 2.2% |
| swarm | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.8% |
| swarm | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 2.0% |
| swarm | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 1.6% |
| swarm | native | managed | tokens-gate | error-reporting | 1 | 4,237 | 77 | 114 | 3,909 | 0 | 27 | 68 | 2.1% |
| swarm | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 3.7% |
| swarm | native | managed | tokens-gate | agent-orchestrator | 4 | 7,875 | 515 | 1,334 | 5,492 | 0 | 108 | 272 | 4.0% |
| swarm | native | managed | tokens-gate | proposals | 34 | 45,277 | 3,449 | 10,001 | 27,303 | 0 | 918 | 2,312 | 22.7% |
| swarm | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.8% |
| swarm | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 1.3% |
| swarm | native | managed | tokens-gate | logs | 9 | 6,905 | 695 | 2,644 | 2,482 | 0 | 243 | 612 | 3.5% |
| swarm | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 1.1% |
| swarm | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.7% |
| swarm | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 1.0% |
| swarm | native | managed | tokens-gate | forge | 10 | 4,519 | 568 | 2,879 | 0 | 0 | 270 | 520 | 2.3% |
| swarm | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |
| full | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 24.9% |
| full | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 2.4% |
| full | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 0.8% |
| full | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 4.0% |
| full | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 1.1% |
| full | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.3% |
| full | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 2.8% |
| full | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 1.9% |
| full | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 3.4% |
| full | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 2.6% |
| full | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 0.9% |
| full | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 2.1% |
| full | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.7% |
| full | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 1.9% |
| full | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 1.6% |
| full | native | managed | tokens-gate | error-reporting | 1 | 4,237 | 77 | 114 | 3,909 | 0 | 27 | 68 | 2.0% |
| full | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 3.5% |
| full | native | managed | tokens-gate | agent-orchestrator | 4 | 7,875 | 515 | 1,334 | 5,492 | 0 | 108 | 272 | 3.8% |
| full | native | managed | tokens-gate | proposals | 34 | 45,277 | 3,449 | 10,001 | 27,303 | 0 | 918 | 2,312 | 21.8% |
| full | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.8% |
| full | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 1.3% |
| full | native | managed | tokens-gate | logs | 9 | 6,905 | 695 | 2,644 | 2,482 | 0 | 243 | 612 | 3.3% |
| full | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 1.1% |
| full | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.6% |
| full | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 0.9% |
| full | native | managed | tokens-gate | forge | 10 | 4,519 | 568 | 2,879 | 0 | 0 | 270 | 520 | 2.2% |
| full | native | managed | tokens-gate | web-fetch | 1 | 984 | 70 | 309 | 478 | 0 | 27 | 68 | 0.5% |
| full | native | managed | tokens-gate | issues | 1 | 915 | 65 | 85 | 638 | 0 | 27 | 68 | 0.4% |
| full | native | managed | tokens-gate | api | 3 | 4,019 | 205 | 1,914 | 1,552 | 0 | 81 | 188 | 1.9% |
| full | native | managed | tokens-gate | prompt-eval | 2 | 2,757 | 139 | 754 | 1,605 | 0 | 54 | 136 | 1.3% |
| full | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |
| vertex | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 18.4% |
| vertex | native | managed | tokens-gate | adaptive-optimizer | 2 | 3,279 | 227 | 1,276 | 1,492 | 0 | 54 | 136 | 1.2% |
| vertex | native | managed | tokens-gate | audit | 4 | 9,116 | 726 | 1,632 | 6,256 | 0 | 108 | 272 | 3.2% |
| vertex | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 2.6% |
| vertex | native | managed | tokens-gate | auto-plugin-selector | 1 | 3,827 | 154 | 1,227 | 2,300 | 0 | 27 | 68 | 1.4% |
| vertex | native | managed | tokens-gate | commit-policy | 4 | 4,940 | 603 | 975 | 2,815 | 0 | 108 | 256 | 1.8% |
| vertex | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 0.9% |
| vertex | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.2% |
| vertex | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 0.7% |
| vertex | native | managed | tokens-gate | context-for-change | 1 | 1,108 | 99 | 215 | 649 | 0 | 27 | 68 | 0.4% |
| vertex | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 1.9% |
| vertex | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 1.4% |
| vertex | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 0.8% |
| vertex | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 1.2% |
| vertex | native | managed | tokens-gate | forge | 10 | 4,519 | 568 | 2,879 | 0 | 0 | 270 | 520 | 1.6% |
| vertex | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 1.8% |
| vertex | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.0% |
| vertex | native | managed | tokens-gate | impact-analysis | 2 | 2,052 | 248 | 404 | 1,122 | 0 | 54 | 136 | 0.7% |
| vertex | native | managed | tokens-gate | project-health | 1 | 1,268 | 100 | 165 | 866 | 0 | 27 | 68 | 0.5% |
| vertex | native | managed | tokens-gate | quality-policy | 1 | 8,319 | 114 | 166 | 7,902 | 0 | 27 | 68 | 3.0% |
| vertex | native | managed | tokens-gate | link-check | 1 | 1,354 | 112 | 85 | 1,028 | 0 | 27 | 68 | 0.5% |
| vertex | native | managed | tokens-gate | logs | 9 | 6,905 | 695 | 2,644 | 2,482 | 0 | 243 | 612 | 2.5% |
| vertex | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 2.9% |
| vertex | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.6% |
| vertex | native | managed | tokens-gate | orchestrator-runner | 11 | 36,369 | 1,028 | 4,012 | 29,762 | 0 | 297 | 748 | 12.9% |
| vertex | native | managed | tokens-gate | agent-orchestrator | 4 | 7,875 | 515 | 1,334 | 5,492 | 0 | 108 | 272 | 2.8% |
| vertex | native | managed | tokens-gate | perf | 3 | 3,872 | 281 | 1,152 | 2,083 | 0 | 81 | 188 | 1.4% |
| vertex | native | managed | tokens-gate | proposals | 34 | 45,277 | 3,449 | 10,001 | 27,303 | 0 | 918 | 2,312 | 16.1% |
| vertex | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 1.4% |
| vertex | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 2.1% |
| vertex | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 0.6% |
| vertex | native | managed | tokens-gate | security | 4 | 5,857 | 370 | 810 | 4,153 | 0 | 108 | 272 | 2.1% |
| vertex | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 0.8% |
| vertex | native | managed | tokens-gate | tech-debt | 1 | 1,408 | 117 | 134 | 1,030 | 0 | 27 | 68 | 0.5% |
| vertex | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.2% |
| vertex | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 0.7% |
| vertex | native | managed | tokens-gate | usage-tracking | 3 | 10,596 | 235 | 916 | 9,038 | 0 | 81 | 204 | 3.8% |
| vertex | native | managed | tokens-gate | error-reporting | 1 | 4,237 | 77 | 114 | 3,909 | 0 | 27 | 68 | 1.5% |
| vertex | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |
| web-app | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 45.7% |
| web-app | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 4.5% |
| web-app | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 1.5% |
| web-app | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 7.2% |
| web-app | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 2.1% |
| web-app | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 2.4% |
| web-app | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 5.2% |
| web-app | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 3.4% |
| web-app | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 6.3% |
| web-app | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 4.8% |
| web-app | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.7% |
| web-app | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 3.0% |
| web-app | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 3.4% |
| web-app | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 2.9% |
| web-app | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 3.1% |
| web-app | native | managed | tokens-gate | web-fetch | 1 | 984 | 70 | 309 | 478 | 0 | 27 | 68 | 0.9% |
| web-app | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 2.0% |
| web-app | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |
| backend-api | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 46.3% |
| backend-api | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 4.5% |
| backend-api | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 1.6% |
| backend-api | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 7.4% |
| backend-api | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 2.1% |
| backend-api | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 5.2% |
| backend-api | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 3.5% |
| backend-api | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 6.4% |
| backend-api | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 4.9% |
| backend-api | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.7% |
| backend-api | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 3.0% |
| backend-api | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 3.9% |
| backend-api | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 3.5% |
| backend-api | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 2.9% |
| backend-api | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 3.1% |
| backend-api | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |
| cli-tool | native | managed | tokens-gate | core | 24 | 51,786 | 2,522 | 10,390 | 35,996 | 0 | 648 | 1,632 | 66.2% |
| cli-tool | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 6.5% |
| cli-tool | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 2.2% |
| cli-tool | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 10.5% |
| cli-tool | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 3.0% |
| cli-tool | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 4.2% |
| cli-tool | native | managed | tokens-gate | perf | 3 | 3,872 | 281 | 1,152 | 2,083 | 0 | 81 | 188 | 4.9% |
| cli-tool | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 2.5% |
| cli-tool | adaptive | managed | dynamic-client | core | 6 | 8,927 | 526 | 1,020 | 6,670 | 0 | 162 | 408 | 100.0% |

## Top tools by bytes (vertex preset, native surface)

The 20 individual tools that cost the most tools/list bytes in the largest governed preset, with the same component breakdown as the owner table above. This is where "concentration" becomes concrete: a handful of tools account for a disproportionate share of the whole surface.

| Tool | Owner | Total Bytes | Name Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mcp-vertex_orchestrator-runner_invoke | orchestrator-runner | 10,149 | 39 | 131 | 799 | 9,085 | 0 | 27 | 68 |
| mcp-vertex_orchestrator-runner_advise_routing | orchestrator-runner | 8,804 | 47 | 88 | 605 | 7,969 | 0 | 27 | 68 |
| mcp-vertex_quality-policy_quality_policy | quality-policy | 8,319 | 42 | 114 | 166 | 7,902 | 0 | 27 | 68 |
| mcp-vertex_usage-tracking_usage_report | usage-tracking | 6,629 | 40 | 99 | 578 | 5,817 | 0 | 27 | 68 |
| mcp-vertex_plan_mcp_project | core | 6,486 | 29 | 117 | 1,061 | 5,184 | 0 | 27 | 68 |
| mcp-vertex_orchestrator-runner_advise_spend | orchestrator-runner | 5,950 | 45 | 97 | 198 | 5,515 | 0 | 27 | 68 |
| mcp-vertex_analyze_project | core | 5,165 | 28 | 99 | 780 | 4,163 | 0 | 27 | 68 |
| mcp-vertex_overview | core | 4,571 | 21 | 118 | 169 | 4,168 | 0 | 27 | 68 |
| mcp-vertex_error-reporting_report_status | error-reporting | 4,237 | 42 | 77 | 114 | 3,909 | 0 | 27 | 68 |
| mcp-vertex_agent_catalog | core | 3,995 | 26 | 99 | 227 | 3,548 | 0 | 27 | 68 |
| mcp-vertex_configuration_center | core | 3,988 | 33 | 92 | 282 | 3,486 | 0 | 27 | 68 |
| mcp-vertex_auto-plugin-selector_plugins_recommend | auto-plugin-selector | 3,827 | 51 | 154 | 1,227 | 2,300 | 0 | 27 | 68 |
| mcp-vertex_create_project | core | 3,704 | 27 | 114 | 3,073 | 395 | 0 | 27 | 68 |
| mcp-vertex_adopt_project | core | 3,471 | 26 | 138 | 331 | 2,881 | 0 | 27 | 68 |
| mcp-vertex_audit_audit_run | audit | 3,350 | 28 | 238 | 947 | 2,042 | 0 | 27 | 68 |
| mcp-vertex_usage-tracking_session_hygiene | usage-tracking | 3,345 | 43 | 71 | 146 | 2,990 | 0 | 27 | 68 |
| mcp-vertex_auto-agent-selector_auto_run | auto-agent-selector | 2,684 | 41 | 149 | 565 | 1,834 | 0 | 27 | 68 |
| mcp-vertex_rules_check_rules | rules | 2,650 | 30 | 84 | 138 | 2,303 | 0 | 27 | 68 |
| mcp-vertex_audit_audit_consolidate | audit | 2,643 | 36 | 232 | 246 | 2,034 | 0 | 27 | 68 |
| mcp-vertex_proposals_proposal_adopt | proposals | 2,597 | 37 | 121 | 263 | 2,081 | 0 | 27 | 68 |

## CHECK-007 — tokenizer cost by preset

This gate (`tokens:gate` / `tokens:dashboard:generate`) measures serialized BYTES of the tools/list JSON payload, not native LLM tokens — bytes-per-token varies enough across prose descriptions, JSON schemas, and identifiers that a byte count cannot substitute for a real token count. The table below reports both, with an explicit confidence label per model: `measured-real-bpe` is a real encode with the model's own published tokenizer (gpt-tokenizer for gpt-5.4); `measured-legacy-bpe` is a real BPE encode but on a vocabulary the vendor published for an older model generation (Anthropic has not published an offline tokenizer for Claude Sonnet 4, so @anthropic-ai/tokenizer's pre-Claude-3 vocabulary is used as the closest available real encoder); `estimated-byte-ratio` is bytes / 4, used only where no offline tokenizer package exists (Gemini). See tools/scripts/report/tokenizer-real.script.ts for the profile definitions.

| Preset | Measurement Surface | Runtime Surface | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Confidence (per model, in order above) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | 58,634 | 13801 | 14041 | 14659 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| minimal | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | native | managed | tokens-gate | 69,215 | 16362 | 16694 | 17304 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | native | managed | tokens-gate | 130,684 | 31263 | 31944 | 32671 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | native | managed | tokens-gate | 199,236 | 47990 | 49107 | 49809 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | native | managed | tokens-gate | 207,918 | 50146 | 51304 | 51980 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| vertex | native | managed | tokens-gate | 281,138 | 67795 | 68843 | 70285 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| vertex | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | native | managed | tokens-gate | 113,501 | 27083 | 27692 | 28376 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | native | managed | tokens-gate | 111,917 | 26669 | 27269 | 27980 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | native | managed | tokens-gate | 78,276 | 18519 | 18893 | 19569 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | adaptive | managed | dynamic-client | 8,934 | 2103 | 2139 | 2234 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |

## Documented deficits (kept, not auto-bumped)

- none

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 8,934 | ok | — | 58,634 | warning | — |
| lean | 8,934 | ok | — | 69,215 | warning | — |
| standard | 8,934 | ok | — | 130,684 | ok | — |
| swarm | 8,934 | ok | — | 199,236 | ok | — |
| full | 8,934 | ok | — | 207,918 | ok | — |
| vertex | 8,934 | ok | — | 281,138 | ok | — |
| web-app | 8,934 | n/a | — | 113,501 | n/a | — |
| backend-api | 8,934 | n/a | — | 111,917 | n/a | — |
| cli-tool | 8,934 | n/a | — | 78,276 | n/a | — |

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
