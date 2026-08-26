# Token Budgets — generated dashboard

<!-- generated: token-budget-dashboard.script.ts -->
<!-- generated — do not edit by hand -->

Generated at: 2026-08-26T19:26:17.206Z

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
| overview full | 1,466 | 367 | 11,000 | 11,100 | within hard |
| overview compact | 556 | 139 | 1,450 | 1,500 | within hard |
| auto_work idle | 63 | 16 | 2,400 | 2,600 | within hard |
| auto_work work plan | 63 | 16 | 2,400 | 2,600 | within hard |
| agent_catalog compact | 56 | 14 | 800 | 900 | within hard |
| agent_catalog full | 56 | 14 | 8,500 | 9,000 | within hard |
| analyze_project {} | 58 | 15 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | 59 | 15 | 1,800 | 2,000 | within hard |
| search_search | 57 | 15 | 2,700 | 3,000 | within hard |
| docs_docs_list | 58 | 15 | 2,200 | 2,500 | within hard |
| proposals_round_context | 67 | 17 | 2,700 | 3,000 | within hard |
| logs_tail | 53 | 14 | 5,500 | 6,000 | within hard |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface measurement baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap measurement). `Runtime Surface` is shown separately because ordinary MCP-Vertex execution defaults to `managed`; `native` here does not mean that the server is running native.

| Preset | Title | Measurement Surface | Runtime Surface | Source | Plugins | Tools | Tools/List Bytes | Est. Tokens | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | native | managed | tokens-gate | 2 | 33 | 58,634 | 14659 | 51,630 | 2,963 | 11,915 | 39,715 | 5,065 | 996 | n/a | over warning (58,000B) | over hard (0B) | none |
| minimal | minimal | adaptive | managed | dynamic-client | 2 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 551 | n/a | within hard | within hard | none |
| lean | lean | native | managed | tokens-gate | 4 | 45 | 69,215 | 17304 | 59,990 | 3,671 | 15,179 | 44,811 | 8,221 | 1,213 | n/a | over warning (69,000B) | within hard | none |
| lean | lean | adaptive | managed | dynamic-client | 4 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 567 | n/a | within hard | within hard | none |
| standard | standard | native | managed | tokens-gate | 19 | 93 | 129,235 | 32309 | 109,440 | 7,942 | 26,860 | 82,580 | 8,221 | 2,760 | n/a | within hard | over hard (0B) | none |
| standard | standard | adaptive | managed | dynamic-client | 19 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 753 | n/a | within hard | within hard | none |
| swarm | swarm | native | managed | tokens-gate | 27 | 159 | 205,013 | 51254 | 170,813 | 13,764 | 45,074 | 125,739 | 52,503 | 4,372 | 153 | over warning (204,000B) | within hard | none |
| swarm | swarm | adaptive | managed | dynamic-client | 27 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 858 | n/a | within hard | within hard | none |
| full | full | native | managed | tokens-gate | 31 | 166 | 213,695 | 53424 | 178,148 | 14,229 | 48,136 | 130,012 | 52,503 | 4,710 | 153 | within hard | over hard (0B) | none |
| full | full | adaptive | managed | dynamic-client | 31 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 899 | n/a | within hard | within hard | none |
| vertex | vertex | native | managed | tokens-gate | 37 | 186 | 295,839 | 73960 | 254,280 | 17,294 | 60,568 | 193,712 | 52,503 | 5,574 | 153 | within hard | over hard (0B) | none |
| vertex | vertex | adaptive | managed | dynamic-client | 37 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 1,030 | n/a | within hard | within hard | none |
| web-app | web-app | native | managed | tokens-gate | 18 | 85 | 113,501 | 28376 | 95,823 | 6,904 | 24,515 | 71,308 | 8,221 | 2,644 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | managed | dynamic-client | 18 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 727 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | managed | tokens-gate | 16 | 84 | 111,917 | 27980 | 94,432 | 6,863 | 24,494 | 69,938 | 8,221 | 2,508 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | managed | dynamic-client | 16 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 703 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | managed | tokens-gate | 7 | 52 | 78,276 | 19569 | 67,486 | 4,344 | 16,968 | 50,518 | 8,221 | 1,444 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | managed | dynamic-client | 7 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 594 | n/a | n/a | n/a | none |

## Plugin marginal dashboard

| Preset | Measurement Surface | Runtime Surface | Source | Owner | Tools | Tools/List Bytes | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| minimal | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| minimal | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| minimal | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| lean | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| lean | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| lean | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| lean | native | managed | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| lean | native | managed | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| lean | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| standard | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| standard | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| standard | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| standard | native | managed | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| standard | native | managed | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| standard | native | managed | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| standard | native | managed | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| standard | native | managed | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| standard | native | managed | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| standard | native | managed | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| standard | native | managed | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| standard | native | managed | tokens-gate | database | 5 | 4,339 | 3,347 | 388 | 1,091 | 2,256 |
| standard | native | managed | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| standard | native | managed | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| standard | native | managed | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| standard | native | managed | tokens-gate | error-reporting | 1 | 2,788 | 2,574 | 75 | 114 | 2,460 |
| standard | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
| standard | native | managed | tokens-gate | agent-orchestrator | 4 | 7,875 | 6,826 | 507 | 1,334 | 5,492 |
| standard | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| swarm | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| swarm | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| swarm | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| swarm | native | managed | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| swarm | native | managed | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| swarm | native | managed | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| swarm | native | managed | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| swarm | native | managed | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| swarm | native | managed | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| swarm | native | managed | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| swarm | native | managed | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| swarm | native | managed | tokens-gate | database | 5 | 4,339 | 3,347 | 388 | 1,091 | 2,256 |
| swarm | native | managed | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| swarm | native | managed | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| swarm | native | managed | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| swarm | native | managed | tokens-gate | error-reporting | 1 | 2,788 | 2,574 | 75 | 114 | 2,460 |
| swarm | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
| swarm | native | managed | tokens-gate | agent-orchestrator | 4 | 7,875 | 6,826 | 507 | 1,334 | 5,492 |
| swarm | native | managed | tokens-gate | proposals | 34 | 52,503 | 44,530 | 3,381 | 10,001 | 34,529 |
| swarm | native | managed | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| swarm | native | managed | tokens-gate | completion | 3 | 2,612 | 1,833 | 390 | 704 | 1,129 |
| swarm | native | managed | tokens-gate | logs | 9 | 6,905 | 5,126 | 677 | 2,644 | 2,482 |
| swarm | native | managed | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| swarm | native | managed | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| swarm | native | managed | tokens-gate | conventions | 2 | 1,962 | 1,521 | 160 | 433 | 1,088 |
| swarm | native | managed | tokens-gate | forge | 10 | 4,519 | 2,879 | 548 | 2,879 | 0 |
| swarm | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| full | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| full | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| full | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| full | native | managed | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| full | native | managed | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| full | native | managed | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| full | native | managed | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| full | native | managed | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| full | native | managed | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| full | native | managed | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| full | native | managed | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| full | native | managed | tokens-gate | database | 5 | 4,339 | 3,347 | 388 | 1,091 | 2,256 |
| full | native | managed | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| full | native | managed | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| full | native | managed | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| full | native | managed | tokens-gate | error-reporting | 1 | 2,788 | 2,574 | 75 | 114 | 2,460 |
| full | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
| full | native | managed | tokens-gate | agent-orchestrator | 4 | 7,875 | 6,826 | 507 | 1,334 | 5,492 |
| full | native | managed | tokens-gate | proposals | 34 | 52,503 | 44,530 | 3,381 | 10,001 | 34,529 |
| full | native | managed | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| full | native | managed | tokens-gate | completion | 3 | 2,612 | 1,833 | 390 | 704 | 1,129 |
| full | native | managed | tokens-gate | logs | 9 | 6,905 | 5,126 | 677 | 2,644 | 2,482 |
| full | native | managed | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| full | native | managed | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| full | native | managed | tokens-gate | conventions | 2 | 1,962 | 1,521 | 160 | 433 | 1,088 |
| full | native | managed | tokens-gate | forge | 10 | 4,519 | 2,879 | 548 | 2,879 | 0 |
| full | native | managed | tokens-gate | web-fetch | 1 | 984 | 787 | 68 | 309 | 478 |
| full | native | managed | tokens-gate | issues | 1 | 915 | 723 | 63 | 85 | 638 |
| full | native | managed | tokens-gate | api | 3 | 4,019 | 3,466 | 199 | 1,914 | 1,552 |
| full | native | managed | tokens-gate | prompt-eval | 2 | 2,757 | 2,359 | 135 | 754 | 1,605 |
| full | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| vertex | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| vertex | native | managed | tokens-gate | adaptive-optimizer | 1 | 2,302 | 2,047 | 114 | 1,136 | 911 |
| vertex | native | managed | tokens-gate | audit | 4 | 9,116 | 7,888 | 718 | 1,632 | 6,256 |
| vertex | native | managed | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
| vertex | native | managed | tokens-gate | auto-plugin-selector | 1 | 3,827 | 3,527 | 152 | 1,227 | 2,300 |
| vertex | native | managed | tokens-gate | commit-policy | 4 | 4,940 | 3,790 | 593 | 975 | 2,815 |
| vertex | native | managed | tokens-gate | completion | 3 | 2,612 | 1,833 | 390 | 704 | 1,129 |
| vertex | native | managed | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| vertex | native | managed | tokens-gate | conventions | 2 | 1,962 | 1,521 | 160 | 433 | 1,088 |
| vertex | native | managed | tokens-gate | context-for-change | 1 | 1,108 | 864 | 97 | 215 | 649 |
| vertex | native | managed | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| vertex | native | managed | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| vertex | native | managed | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| vertex | native | managed | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| vertex | native | managed | tokens-gate | forge | 10 | 4,519 | 2,879 | 548 | 2,879 | 0 |
| vertex | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| vertex | native | managed | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| vertex | native | managed | tokens-gate | impact-analysis | 2 | 2,052 | 1,526 | 244 | 404 | 1,122 |
| vertex | native | managed | tokens-gate | project-health | 1 | 1,268 | 1,031 | 98 | 165 | 866 |
| vertex | native | managed | tokens-gate | quality-policy | 1 | 8,319 | 8,068 | 112 | 166 | 7,902 |
| vertex | native | managed | tokens-gate | link-check | 1 | 1,354 | 1,113 | 110 | 85 | 1,028 |
| vertex | native | managed | tokens-gate | logs | 9 | 6,905 | 5,126 | 677 | 2,644 | 2,482 |
| vertex | native | managed | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| vertex | native | managed | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| vertex | native | managed | tokens-gate | orchestrator-runner | 11 | 46,271 | 43,676 | 1,006 | 9,684 | 33,992 |
| vertex | native | managed | tokens-gate | agent-orchestrator | 4 | 7,875 | 6,826 | 507 | 1,334 | 5,492 |
| vertex | native | managed | tokens-gate | perf | 3 | 3,872 | 3,235 | 275 | 1,152 | 2,083 |
| vertex | native | managed | tokens-gate | proposals | 34 | 52,503 | 44,530 | 3,381 | 10,001 | 34,529 |
| vertex | native | managed | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| vertex | native | managed | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| vertex | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| vertex | native | managed | tokens-gate | security | 4 | 5,857 | 4,963 | 362 | 810 | 4,153 |
| vertex | native | managed | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| vertex | native | managed | tokens-gate | tech-debt | 1 | 1,408 | 1,164 | 115 | 134 | 1,030 |
| vertex | native | managed | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| vertex | native | managed | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| vertex | native | managed | tokens-gate | usage-tracking | 3 | 10,596 | 9,954 | 229 | 916 | 9,038 |
| vertex | native | managed | tokens-gate | error-reporting | 1 | 2,788 | 2,574 | 75 | 114 | 2,460 |
| vertex | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| web-app | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| web-app | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| web-app | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| web-app | native | managed | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| web-app | native | managed | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| web-app | native | managed | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| web-app | native | managed | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| web-app | native | managed | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| web-app | native | managed | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| web-app | native | managed | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| web-app | native | managed | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| web-app | native | managed | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| web-app | native | managed | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| web-app | native | managed | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| web-app | native | managed | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| web-app | native | managed | tokens-gate | web-fetch | 1 | 984 | 787 | 68 | 309 | 478 |
| web-app | native | managed | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| web-app | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| backend-api | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| backend-api | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| backend-api | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| backend-api | native | managed | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| backend-api | native | managed | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| backend-api | native | managed | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| backend-api | native | managed | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| backend-api | native | managed | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| backend-api | native | managed | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| backend-api | native | managed | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| backend-api | native | managed | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| backend-api | native | managed | tokens-gate | database | 5 | 4,339 | 3,347 | 388 | 1,091 | 2,256 |
| backend-api | native | managed | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| backend-api | native | managed | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| backend-api | native | managed | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| backend-api | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| cli-tool | native | managed | tokens-gate | core | 24 | 51,786 | 46,386 | 2,474 | 10,390 | 35,996 |
| cli-tool | native | managed | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| cli-tool | native | managed | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| cli-tool | native | managed | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| cli-tool | native | managed | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| cli-tool | native | managed | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| cli-tool | native | managed | tokens-gate | perf | 3 | 3,872 | 3,235 | 275 | 1,152 | 2,083 |
| cli-tool | native | managed | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| cli-tool | adaptive | managed | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |

## CHECK-007 — tokenizer cost by preset

The repo has no lightweight LLM tokenizer dependency installed today. This report therefore uses an explicit fallback estimator of 4 bytes/token, published as an estimate rather than pretending to be an exact tokenizer. The script lives in tools/scripts/report/tokenizer-real.script.ts so the fallback can be replaced by a real tokenizer later without changing the dashboard contract.

| Preset | Measurement Surface | Runtime Surface | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Estimator | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | managed | tokens-gate | 58,634 | 14659 | 14659 | 14659 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| minimal | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| lean | native | managed | tokens-gate | 69,215 | 17304 | 17304 | 17304 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| lean | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| standard | native | managed | tokens-gate | 129,235 | 32309 | 32309 | 32309 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| standard | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| swarm | native | managed | tokens-gate | 205,013 | 51254 | 51254 | 51254 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| swarm | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| full | native | managed | tokens-gate | 213,695 | 53424 | 53424 | 53424 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| full | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| vertex | native | managed | tokens-gate | 295,839 | 73960 | 73960 | 73960 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| vertex | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| web-app | native | managed | tokens-gate | 113,501 | 28376 | 28376 | 28376 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| web-app | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| backend-api | native | managed | tokens-gate | 111,917 | 27980 | 27980 | 27980 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| backend-api | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| cli-tool | native | managed | tokens-gate | 78,276 | 19569 | 19569 | 19569 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| cli-tool | adaptive | managed | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |

## Documented deficits (kept, not auto-bumped)

- none

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 8,934 | ok | — | 58,634 | warning | — |
| lean | 8,934 | ok | — | 69,215 | warning | — |
| standard | 8,934 | ok | — | 129,235 | ok | — |
| swarm | 8,934 | ok | — | 205,013 | warning | — |
| full | 8,934 | ok | — | 213,695 | ok | — |
| vertex | 8,934 | ok | — | 295,839 | ok | — |
| web-app | 8,934 | n/a | — | 113,501 | n/a | — |
| backend-api | 8,934 | n/a | — | 111,917 | n/a | — |
| cli-tool | 8,934 | n/a | — | 78,276 | n/a | — |

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
