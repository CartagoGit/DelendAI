# Token Budgets — generated dashboard

<!-- generated: token-budget-dashboard.script.ts -->
<!-- generated — do not edit by hand -->

Generated at: 2026-08-29T22:50:58.750Z

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
| overview full | managed | 1,466 | 367 | 11,000 | 11,100 | within hard |
| overview compact | managed | 556 | 139 | 1,450 | 1,500 | within hard |
| overview full (native) | native | 11,939 | 2985 | 12,300 | 12,650 | within hard |
| overview compact (native) | native | 1,696 | 424 | 1,750 | 1,800 | within hard |
| auto_work idle | native | 159 | 40 | 2,400 | 2,600 | within hard |
| auto_work work plan | native | 2,453 | 614 | 2,400 | 2,600 | over warning (2,400B) |
| agent_catalog compact | native | 743 | 186 | 800 | 900 | within hard |
| agent_catalog full | native | 8,736 | 2184 | 8,500 | 9,000 | over warning (8,500B) |
| analyze_project {} | native | 829 | 208 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | native | 836 | 209 | 1,800 | 2,000 | within hard |
| search_search | native | 797 | 200 | 2,700 | 3,000 | within hard |
| docs_docs_list | native | 276 | 69 | 2,200 | 2,500 | within hard |
| proposals_round_context | native | 153 | 39 | 2,700 | 3,000 | within hard |
| logs_tail | native | 2,324 | 581 | 5,500 | 6,000 | within hard |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface measurement baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap measurement). `Runtime Surface` is shown separately because ordinary MCP-Vertex execution defaults to `managed`; `native` here does not mean that the server is running native.

| Preset | Title | Measurement Surface | Runtime Surface | Source | Plugins | Tools | Tools/List Bytes | Est. Tokens | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | native | managed | tokens-gate | 2 | 33 | 42,107 | 10527 | 35,103 | 3,029 | 11,915 | 23,188 | 5,065 | 996 | n/a | within hard | within hard | none |
| minimal | minimal | adaptive | managed | dynamic-client | 2 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 551 | n/a | within hard | within hard | none |
| lean | lean | native | managed | tokens-gate | 4 | 45 | 52,688 | 13172 | 43,463 | 3,763 | 15,179 | 28,284 | 8,221 | 1,213 | n/a | within hard | within hard | none |
| lean | lean | adaptive | managed | dynamic-client | 4 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 567 | n/a | within hard | within hard | none |
| standard | standard | native | managed | tokens-gate | 19 | 95 | 112,516 | 28129 | 92,229 | 8,352 | 27,433 | 64,796 | 10,007 | 2,771 | n/a | within hard | over warning (9,500B) | none |
| standard | standard | adaptive | managed | dynamic-client | 19 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 753 | n/a | within hard | within hard | none |
| swarm | swarm | native | managed | tokens-gate | 27 | 161 | 184,341 | 46086 | 149,734 | 14,221 | 45,606 | 104,128 | 48,550 | 4,383 | 153 | within hard | within hard | none |
| swarm | swarm | adaptive | managed | dynamic-client | 27 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 858 | n/a | within hard | within hard | none |
| full | full | native | managed | tokens-gate | 31 | 168 | 193,023 | 48256 | 157,069 | 14,700 | 48,668 | 108,401 | 48,550 | 4,721 | 153 | within hard | within hard | none |
| full | full | adaptive | managed | dynamic-client | 31 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 899 | n/a | within hard | within hard | none |
| vertex | vertex | native | managed | tokens-gate | 37 | 189 | 244,723 | 61181 | 202,424 | 17,994 | 55,742 | 146,682 | 48,550 | 5,606 | 153 | within hard | within hard | none |
| vertex | vertex | adaptive | managed | dynamic-client | 37 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 1,030 | n/a | within hard | within hard | none |
| web-app | web-app | native | managed | tokens-gate | 18 | 85 | 96,974 | 24244 | 79,296 | 7,076 | 24,515 | 54,781 | 8,221 | 2,644 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | managed | dynamic-client | 18 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 727 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | managed | tokens-gate | 16 | 84 | 95,390 | 23848 | 77,905 | 7,033 | 24,494 | 53,411 | 8,221 | 2,508 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | managed | dynamic-client | 16 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 703 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | managed | tokens-gate | 7 | 52 | 61,749 | 15438 | 50,959 | 4,450 | 16,968 | 33,991 | 8,221 | 1,444 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | managed | dynamic-client | 7 | 6 | 4,900 | 1225 | 3,656 | 526 | 1,020 | 2,636 | 0 | 594 | n/a | n/a | n/a | none |

## Plugin marginal dashboard — component breakdown by owner

`Tools/List Bytes` per owner is the sum of each tool's own serialized entry (`JSON.stringify({name, description, inputSchema, outputSchema, annotations})`), decomposed into the fields that make it up. `Envelope Bytes` is JSON punctuation and key labels — derived by subtraction, so every row's named-field columns plus Envelope Bytes sum exactly to Tools/List Bytes. `Share of Preset` is this owner's bytes divided by the sum of all owners' bytes in that preset row (not divided by the whole-array `Tools/List Bytes` on the preset-summary table above, which also carries the array's own brackets/commas) — shares always sum to 100%.

| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools | Tools/List Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes | Share of Preset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 83.8% |
| minimal | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 12.0% |
| minimal | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 4.2% |
| minimal | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| lean | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 67.0% |
| lean | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 9.6% |
| lean | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 3.3% |
| lean | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 15.6% |
| lean | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 4.5% |
| lean | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| standard | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 31.4% |
| standard | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 4.5% |
| standard | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 1.6% |
| standard | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 7.3% |
| standard | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 2.1% |
| standard | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 2.4% |
| standard | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 5.2% |
| standard | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 3.5% |
| standard | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 6.4% |
| standard | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 4.8% |
| standard | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.7% |
| standard | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 3.9% |
| standard | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 3.1% |
| standard | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 3.5% |
| standard | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 2.9% |
| standard | native | managed | tokens-gate | error-reporting | 1 | 462 | 77 | 114 | 134 | 0 | 27 | 68 | 0.4% |
| standard | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 6.5% |
| standard | native | managed | tokens-gate | agent-orchestrator | 6 | 10,007 | 737 | 1,907 | 6,561 | 0 | 162 | 408 | 8.9% |
| standard | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| swarm | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 19.1% |
| swarm | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 2.8% |
| swarm | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 0.9% |
| swarm | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 4.5% |
| swarm | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 1.3% |
| swarm | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.5% |
| swarm | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 3.2% |
| swarm | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 2.1% |
| swarm | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 3.9% |
| swarm | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 3.0% |
| swarm | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.0% |
| swarm | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 2.4% |
| swarm | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.9% |
| swarm | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 2.1% |
| swarm | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 1.8% |
| swarm | native | managed | tokens-gate | error-reporting | 1 | 462 | 77 | 114 | 134 | 0 | 27 | 68 | 0.3% |
| swarm | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 4.0% |
| swarm | native | managed | tokens-gate | agent-orchestrator | 6 | 10,007 | 737 | 1,907 | 6,561 | 0 | 162 | 408 | 5.4% |
| swarm | native | managed | tokens-gate | proposals | 34 | 48,550 | 3,364 | 9,960 | 30,702 | 0 | 918 | 2,312 | 26.4% |
| swarm | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.9% |
| swarm | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 1.4% |
| swarm | native | managed | tokens-gate | logs | 9 | 6,905 | 695 | 2,644 | 2,482 | 0 | 243 | 612 | 3.7% |
| swarm | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 1.2% |
| swarm | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.8% |
| swarm | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 1.1% |
| swarm | native | managed | tokens-gate | forge | 10 | 4,519 | 568 | 2,879 | 0 | 0 | 270 | 520 | 2.5% |
| swarm | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| full | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 18.3% |
| full | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 2.6% |
| full | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 0.9% |
| full | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 4.3% |
| full | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 1.2% |
| full | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.4% |
| full | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 3.0% |
| full | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 2.0% |
| full | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 3.7% |
| full | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 2.8% |
| full | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 1.0% |
| full | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 2.2% |
| full | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.8% |
| full | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 2.0% |
| full | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 1.7% |
| full | native | managed | tokens-gate | error-reporting | 1 | 462 | 77 | 114 | 134 | 0 | 27 | 68 | 0.2% |
| full | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 3.8% |
| full | native | managed | tokens-gate | agent-orchestrator | 6 | 10,007 | 737 | 1,907 | 6,561 | 0 | 162 | 408 | 5.2% |
| full | native | managed | tokens-gate | proposals | 34 | 48,550 | 3,364 | 9,960 | 30,702 | 0 | 918 | 2,312 | 25.2% |
| full | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.8% |
| full | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 1.4% |
| full | native | managed | tokens-gate | logs | 9 | 6,905 | 695 | 2,644 | 2,482 | 0 | 243 | 612 | 3.6% |
| full | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 1.1% |
| full | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.8% |
| full | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 1.0% |
| full | native | managed | tokens-gate | forge | 10 | 4,519 | 568 | 2,879 | 0 | 0 | 270 | 520 | 2.3% |
| full | native | managed | tokens-gate | web-fetch | 1 | 984 | 70 | 309 | 478 | 0 | 27 | 68 | 0.5% |
| full | native | managed | tokens-gate | issues | 1 | 915 | 65 | 85 | 638 | 0 | 27 | 68 | 0.5% |
| full | native | managed | tokens-gate | api | 3 | 4,019 | 205 | 1,914 | 1,552 | 0 | 81 | 188 | 2.1% |
| full | native | managed | tokens-gate | prompt-eval | 2 | 2,757 | 139 | 754 | 1,605 | 0 | 54 | 136 | 1.4% |
| full | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| vertex | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 14.4% |
| vertex | native | managed | tokens-gate | adaptive-optimizer | 2 | 3,279 | 227 | 1,276 | 1,492 | 0 | 54 | 136 | 1.3% |
| vertex | native | managed | tokens-gate | audit | 4 | 9,700 | 802 | 1,806 | 6,590 | 0 | 108 | 272 | 4.0% |
| vertex | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 620 | 1,377 | 4,633 | 0 | 135 | 340 | 3.0% |
| vertex | native | managed | tokens-gate | auto-plugin-selector | 1 | 3,827 | 154 | 1,227 | 2,300 | 0 | 27 | 68 | 1.6% |
| vertex | native | managed | tokens-gate | commit-policy | 4 | 5,003 | 603 | 975 | 2,878 | 0 | 108 | 256 | 2.0% |
| vertex | native | managed | tokens-gate | completion | 3 | 2,612 | 396 | 704 | 1,129 | 0 | 81 | 204 | 1.1% |
| vertex | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 1.4% |
| vertex | native | managed | tokens-gate | conventions | 2 | 1,962 | 164 | 433 | 1,088 | 0 | 54 | 136 | 0.8% |
| vertex | native | managed | tokens-gate | context-for-change | 1 | 1,108 | 99 | 215 | 649 | 0 | 27 | 68 | 0.5% |
| vertex | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 2.2% |
| vertex | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 1.6% |
| vertex | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 1.0% |
| vertex | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 1.3% |
| vertex | native | managed | tokens-gate | forge | 10 | 4,519 | 568 | 2,879 | 0 | 0 | 270 | 520 | 1.8% |
| vertex | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 2.1% |
| vertex | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 1.1% |
| vertex | native | managed | tokens-gate | impact-analysis | 2 | 2,052 | 248 | 404 | 1,122 | 0 | 54 | 136 | 0.8% |
| vertex | native | managed | tokens-gate | project-health | 1 | 1,268 | 100 | 165 | 866 | 0 | 27 | 68 | 0.5% |
| vertex | native | managed | tokens-gate | quality-policy | 1 | 8,319 | 114 | 166 | 7,902 | 0 | 27 | 68 | 3.4% |
| vertex | native | managed | tokens-gate | link-check | 1 | 1,354 | 112 | 85 | 1,028 | 0 | 27 | 68 | 0.6% |
| vertex | native | managed | tokens-gate | logs | 9 | 6,905 | 695 | 2,644 | 2,482 | 0 | 243 | 612 | 2.8% |
| vertex | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 3.4% |
| vertex | native | managed | tokens-gate | notification | 2 | 1,592 | 196 | 291 | 840 | 0 | 54 | 136 | 0.7% |
| vertex | native | managed | tokens-gate | orchestrator-runner | 11 | 14,202 | 1,028 | 4,012 | 7,595 | 0 | 297 | 748 | 5.8% |
| vertex | native | managed | tokens-gate | agent-orchestrator | 6 | 10,007 | 737 | 1,907 | 6,561 | 0 | 162 | 408 | 4.1% |
| vertex | native | managed | tokens-gate | perf | 3 | 3,872 | 281 | 1,152 | 2,083 | 0 | 81 | 188 | 1.6% |
| vertex | native | managed | tokens-gate | proposals | 34 | 48,550 | 3,364 | 9,960 | 30,702 | 0 | 918 | 2,312 | 19.9% |
| vertex | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 1.6% |
| vertex | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 2.4% |
| vertex | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 0.7% |
| vertex | native | managed | tokens-gate | security | 4 | 5,857 | 370 | 810 | 4,153 | 0 | 108 | 272 | 2.4% |
| vertex | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 0.9% |
| vertex | native | managed | tokens-gate | tech-debt | 1 | 1,408 | 117 | 134 | 1,030 | 0 | 27 | 68 | 0.6% |
| vertex | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 1.4% |
| vertex | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 0.8% |
| vertex | native | managed | tokens-gate | usage-tracking | 3 | 10,596 | 235 | 916 | 9,038 | 0 | 81 | 204 | 4.3% |
| vertex | native | managed | tokens-gate | error-reporting | 1 | 462 | 77 | 114 | 134 | 0 | 27 | 68 | 0.2% |
| vertex | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| web-app | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 36.4% |
| web-app | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 5.2% |
| web-app | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 1.8% |
| web-app | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 8.5% |
| web-app | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 2.4% |
| web-app | native | managed | tokens-gate | i18n | 2 | 2,725 | 174 | 230 | 2,072 | 0 | 54 | 136 | 2.8% |
| web-app | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 6.0% |
| web-app | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 4.0% |
| web-app | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 7.4% |
| web-app | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 5.6% |
| web-app | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 2.0% |
| web-app | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 3.5% |
| web-app | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 4.0% |
| web-app | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 3.4% |
| web-app | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 3.6% |
| web-app | native | managed | tokens-gate | web-fetch | 1 | 984 | 70 | 309 | 478 | 0 | 27 | 68 | 1.0% |
| web-app | native | managed | tokens-gate | status-marker | 3 | 2,213 | 197 | 573 | 1,076 | 0 | 81 | 188 | 2.3% |
| web-app | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| backend-api | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 37.0% |
| backend-api | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 5.3% |
| backend-api | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 1.8% |
| backend-api | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 8.6% |
| backend-api | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 2.5% |
| backend-api | native | managed | tokens-gate | rules | 3 | 5,856 | 263 | 520 | 4,700 | 0 | 81 | 204 | 6.1% |
| backend-api | native | managed | tokens-gate | quality | 4 | 3,901 | 294 | 550 | 2,535 | 0 | 108 | 272 | 4.1% |
| backend-api | native | managed | tokens-gate | refactor | 6 | 7,152 | 319 | 2,116 | 3,916 | 0 | 162 | 408 | 7.5% |
| backend-api | native | managed | tokens-gate | deps | 5 | 5,441 | 384 | 650 | 3,788 | 0 | 135 | 340 | 5.7% |
| backend-api | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 2.0% |
| backend-api | native | managed | tokens-gate | test-convention | 3 | 3,406 | 289 | 689 | 2,015 | 0 | 81 | 204 | 3.6% |
| backend-api | native | managed | tokens-gate | database | 5 | 4,339 | 398 | 1,091 | 2,256 | 0 | 135 | 308 | 4.6% |
| backend-api | native | managed | tokens-gate | diagram | 4 | 3,897 | 337 | 1,435 | 1,606 | 0 | 108 | 272 | 4.1% |
| backend-api | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 3.4% |
| backend-api | native | managed | tokens-gate | container | 5 | 3,489 | 580 | 1,627 | 687 | 0 | 135 | 276 | 3.7% |
| backend-api | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |
| cli-tool | native | managed | tokens-gate | core | 24 | 35,259 | 2,522 | 10,390 | 19,469 | 0 | 648 | 1,632 | 57.1% |
| cli-tool | native | managed | tokens-gate | git | 8 | 5,065 | 442 | 900 | 2,781 | 0 | 216 | 544 | 8.2% |
| cli-tool | native | managed | tokens-gate | search | 1 | 1,749 | 65 | 625 | 938 | 0 | 27 | 68 | 2.8% |
| cli-tool | native | managed | tokens-gate | memory | 9 | 8,221 | 553 | 2,737 | 3,824 | 0 | 243 | 612 | 13.3% |
| cli-tool | native | managed | tokens-gate | docs | 3 | 2,348 | 181 | 527 | 1,272 | 0 | 81 | 204 | 3.8% |
| cli-tool | native | managed | tokens-gate | env | 2 | 3,250 | 227 | 272 | 2,506 | 0 | 54 | 136 | 5.3% |
| cli-tool | native | managed | tokens-gate | perf | 3 | 3,872 | 281 | 1,152 | 2,083 | 0 | 81 | 188 | 6.3% |
| cli-tool | native | managed | tokens-gate | test-policy | 2 | 1,932 | 179 | 365 | 1,118 | 0 | 54 | 136 | 3.1% |
| cli-tool | adaptive | managed | dynamic-client | core | 6 | 4,893 | 526 | 1,020 | 2,636 | 0 | 162 | 408 | 100.0% |

## Top tools by bytes (vertex preset, native surface)

The 20 individual tools that cost the most tools/list bytes in the largest governed preset, with the same component breakdown as the owner table above. This is where "concentration" becomes concrete: a handful of tools account for a disproportionate share of the whole surface.

| Tool | Owner | Total Bytes | Name Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Annotations Bytes | Other Bytes | Envelope Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mcp-vertex_quality-policy_quality_policy | quality-policy | 8,319 | 42 | 114 | 166 | 7,902 | 0 | 27 | 68 |
| mcp-vertex_usage-tracking_usage_report | usage-tracking | 6,629 | 40 | 99 | 578 | 5,817 | 0 | 27 | 68 |
| mcp-vertex_configuration_center | core | 3,988 | 33 | 92 | 282 | 3,486 | 0 | 27 | 68 |
| mcp-vertex_auto-plugin-selector_plugins_recommend | auto-plugin-selector | 3,827 | 51 | 154 | 1,227 | 2,300 | 0 | 27 | 68 |
| mcp-vertex_create_project | core | 3,704 | 27 | 114 | 3,073 | 395 | 0 | 27 | 68 |
| mcp-vertex_audit_audit_run | audit | 3,579 | 28 | 277 | 1,005 | 2,174 | 0 | 27 | 68 |
| mcp-vertex_adopt_project | core | 3,471 | 26 | 138 | 331 | 2,881 | 0 | 27 | 68 |
| mcp-vertex_usage-tracking_session_hygiene | usage-tracking | 3,345 | 43 | 71 | 146 | 2,990 | 0 | 27 | 68 |
| mcp-vertex_audit_audit_consolidate | audit | 2,870 | 36 | 269 | 304 | 2,166 | 0 | 27 | 68 |
| mcp-vertex_proposals_proposal_get | proposals | 2,772 | 35 | 44 | 33 | 2,565 | 0 | 27 | 68 |
| mcp-vertex_auto-agent-selector_auto_run | auto-agent-selector | 2,684 | 41 | 149 | 565 | 1,834 | 0 | 27 | 68 |
| mcp-vertex_rules_check_rules | rules | 2,650 | 30 | 84 | 138 | 2,303 | 0 | 27 | 68 |
| mcp-vertex_proposals_proposal_adopt | proposals | 2,597 | 37 | 121 | 263 | 2,081 | 0 | 27 | 68 |
| mcp-vertex_scaffold | core | 2,522 | 21 | 103 | 1,519 | 784 | 0 | 27 | 68 |
| mcp-vertex_create_plugin | core | 2,502 | 26 | 194 | 292 | 1,895 | 0 | 27 | 68 |
| mcp-vertex_commit-policy_commit_policy_status | commit-policy | 2,465 | 47 | 155 | 85 | 2,083 | 0 | 27 | 68 |
| mcp-vertex_agent-orchestrator_dispatch | agent-orchestrator | 2,423 | 40 | 113 | 491 | 1,684 | 0 | 27 | 68 |
| mcp-vertex_agent-orchestrator_plan | agent-orchestrator | 2,337 | 36 | 176 | 491 | 1,539 | 0 | 27 | 68 |
| mcp-vertex_adaptive-optimizer_optimize_run | adaptive-optimizer | 2,302 | 44 | 116 | 1,136 | 911 | 0 | 27 | 68 |
| mcp-vertex_rules_get_rules | rules | 2,302 | 28 | 131 | 222 | 1,826 | 0 | 27 | 68 |

## CHECK-007 — tokenizer cost by preset

This gate (`tokens:gate` / `tokens:dashboard:generate`) measures serialized BYTES of the tools/list JSON payload, not native LLM tokens — bytes-per-token varies enough across prose descriptions, JSON schemas, and identifiers that a byte count cannot substitute for a real token count. The table below reports both, with an explicit confidence label per model: `measured-real-bpe` is a real encode with the model's own published tokenizer (gpt-tokenizer for gpt-5.4); `measured-legacy-bpe` is a real BPE encode but on a vocabulary the vendor published for an older model generation (Anthropic has not published an offline tokenizer for Claude Sonnet 4, so @anthropic-ai/tokenizer's pre-Claude-3 vocabulary is used as the closest available real encoder); `estimated-byte-ratio` is bytes / 4, used only where no offline tokenizer package exists (Gemini). See tools/scripts/report/tokenizer-real.script.ts for the profile definitions.

| Preset | Measurement Surface | Runtime Surface | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Confidence (per model, in order above) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | 42,107 | 9910 | 10152 | 10527 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| minimal | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | native | managed | tokens-gate | 52,688 | 12471 | 12805 | 13172 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| lean | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | native | managed | tokens-gate | 112,516 | 27013 | 27671 | 28129 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| standard | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | native | managed | tokens-gate | 184,341 | 44532 | 45596 | 46086 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| swarm | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | native | managed | tokens-gate | 193,023 | 46688 | 47793 | 48256 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| full | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| vertex | native | managed | tokens-gate | 244,723 | 59042 | 60094 | 61181 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| vertex | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | native | managed | tokens-gate | 96,974 | 23192 | 23803 | 24244 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| web-app | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | native | managed | tokens-gate | 95,390 | 22778 | 23380 | 23848 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| backend-api | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | native | managed | tokens-gate | 61,749 | 14628 | 15004 | 15438 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |
| cli-tool | adaptive | managed | dynamic-client | 4,900 | 1151 | 1187 | 1225 | measured-real-bpe, measured-legacy-bpe, estimated-byte-ratio |

## Documented deficits (kept, not auto-bumped)

- none

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 4,900 | ok | — | 42,107 | ok | — |
| lean | 4,900 | ok | — | 52,688 | ok | — |
| standard | 4,900 | ok | — | 112,516 | ok | — |
| swarm | 4,900 | ok | — | 184,341 | ok | — |
| full | 4,900 | ok | — | 193,023 | ok | — |
| vertex | 4,900 | ok | — | 244,723 | ok | — |
| web-app | 4,900 | n/a | — | 96,974 | n/a | — |
| backend-api | 4,900 | n/a | — | 95,390 | n/a | — |
| cli-tool | 4,900 | n/a | — | 61,749 | n/a | — |

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
