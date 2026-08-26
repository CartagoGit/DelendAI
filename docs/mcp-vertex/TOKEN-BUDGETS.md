# Token Budgets — generated dashboard

<!-- generated: token-budget-dashboard.script.ts -->
<!-- generated — do not edit by hand -->

Generated at: 2026-08-26T16:09:32.973Z

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
| agent_catalog full | 56 | 14 | 6,500 | 6,800 | within hard |
| analyze_project {} | 58 | 15 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | 59 | 15 | 1,800 | 2,000 | within hard |
| search_search | 57 | 15 | 2,700 | 3,000 | within hard |
| docs_docs_list | 58 | 15 | 2,200 | 2,500 | within hard |
| proposals_round_context | 67 | 17 | 2,700 | 3,000 | within hard |
| logs_tail | 53 | 14 | 5,500 | 6,000 | within hard |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface budget baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap surface). The managed default uses the same bootstrap exposure contract; the measurements remain intentionally separate from the native baseline.

| Preset | Title | Surface Mode | Source | Plugins | Tools | Tools/List Bytes | Est. Tokens | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | native | tokens-gate | 2 | 33 | 58,378 | 14595 | 51,374 | 2,963 | 11,915 | 39,459 | 5,065 | 996 | n/a | over warning (58,000B) | over hard (0B) | none |
| minimal | minimal | adaptive | dynamic-client | 2 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 551 | n/a | within hard | within hard | none |
| lean | lean | native | tokens-gate | 4 | 45 | 68,959 | 17240 | 59,734 | 3,671 | 15,179 | 44,555 | 8,221 | 1,213 | n/a | over warning (68,150B) | within hard | none |
| lean | lean | adaptive | dynamic-client | 4 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 567 | n/a | within hard | within hard | none |
| standard | standard | native | tokens-gate | 19 | 93 | 128,979 | 32245 | 109,184 | 7,942 | 26,860 | 82,324 | 8,221 | 2,760 | n/a | within hard | over hard (0B) | none |
| standard | standard | adaptive | dynamic-client | 19 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 753 | n/a | within hard | within hard | none |
| swarm | swarm | native | tokens-gate | 27 | 159 | 204,757 | 51190 | 170,557 | 13,764 | 45,074 | 125,483 | 52,503 | 4,372 | 153 | over warning (204,000B) | within hard | none |
| swarm | swarm | adaptive | dynamic-client | 27 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 858 | n/a | within hard | within hard | none |
| full | full | native | tokens-gate | 31 | 166 | 213,439 | 53360 | 177,892 | 14,229 | 48,136 | 129,756 | 52,503 | 4,710 | 153 | within hard | over hard (0B) | none |
| full | full | adaptive | dynamic-client | 31 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 899 | n/a | within hard | within hard | none |
| vertex | vertex | native | tokens-gate | 37 | 186 | 293,179 | 73295 | 251,620 | 17,294 | 60,568 | 191,052 | 52,503 | 5,574 | 153 | within hard | over hard (0B) | none |
| vertex | vertex | adaptive | dynamic-client | 37 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 1,030 | n/a | within hard | within hard | none |
| web-app | web-app | native | tokens-gate | 18 | 85 | 113,245 | 28312 | 95,567 | 6,904 | 24,515 | 71,052 | 8,221 | 2,644 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | dynamic-client | 18 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 727 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | tokens-gate | 16 | 84 | 111,661 | 27916 | 94,176 | 6,863 | 24,494 | 69,682 | 8,221 | 2,508 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | dynamic-client | 16 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 703 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | tokens-gate | 7 | 52 | 78,020 | 19505 | 67,230 | 4,344 | 16,968 | 50,262 | 8,221 | 1,444 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | dynamic-client | 7 | 6 | 8,934 | 2234 | 7,690 | 514 | 1,020 | 6,670 | 0 | 594 | n/a | n/a | n/a | none |

## Plugin marginal dashboard

| Preset | Surface Mode | Source | Owner | Tools | Tools/List Bytes | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| minimal | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| minimal | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| minimal | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| lean | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| lean | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| lean | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| lean | native | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| lean | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| lean | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| standard | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| standard | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| standard | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| standard | native | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| standard | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| standard | native | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| standard | native | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| standard | native | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| standard | native | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| standard | native | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| standard | native | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| standard | native | tokens-gate | database | 5 | 4,339 | 3,347 | 388 | 1,091 | 2,256 |
| standard | native | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| standard | native | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| standard | native | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| standard | native | tokens-gate | error-reporting | 1 | 2,788 | 2,574 | 75 | 114 | 2,460 |
| standard | native | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
| standard | native | tokens-gate | agent-orchestrator | 4 | 7,875 | 6,826 | 507 | 1,334 | 5,492 |
| standard | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| swarm | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| swarm | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| swarm | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| swarm | native | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| swarm | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| swarm | native | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| swarm | native | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| swarm | native | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| swarm | native | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| swarm | native | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| swarm | native | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| swarm | native | tokens-gate | database | 5 | 4,339 | 3,347 | 388 | 1,091 | 2,256 |
| swarm | native | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| swarm | native | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| swarm | native | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| swarm | native | tokens-gate | error-reporting | 1 | 2,788 | 2,574 | 75 | 114 | 2,460 |
| swarm | native | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
| swarm | native | tokens-gate | agent-orchestrator | 4 | 7,875 | 6,826 | 507 | 1,334 | 5,492 |
| swarm | native | tokens-gate | proposals | 34 | 52,503 | 44,530 | 3,381 | 10,001 | 34,529 |
| swarm | native | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| swarm | native | tokens-gate | completion | 3 | 2,612 | 1,833 | 390 | 704 | 1,129 |
| swarm | native | tokens-gate | logs | 9 | 6,905 | 5,126 | 677 | 2,644 | 2,482 |
| swarm | native | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| swarm | native | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| swarm | native | tokens-gate | conventions | 2 | 1,962 | 1,521 | 160 | 433 | 1,088 |
| swarm | native | tokens-gate | forge | 10 | 4,519 | 2,879 | 548 | 2,879 | 0 |
| swarm | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| full | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| full | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| full | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| full | native | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| full | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| full | native | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| full | native | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| full | native | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| full | native | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| full | native | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| full | native | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| full | native | tokens-gate | database | 5 | 4,339 | 3,347 | 388 | 1,091 | 2,256 |
| full | native | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| full | native | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| full | native | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| full | native | tokens-gate | error-reporting | 1 | 2,788 | 2,574 | 75 | 114 | 2,460 |
| full | native | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
| full | native | tokens-gate | agent-orchestrator | 4 | 7,875 | 6,826 | 507 | 1,334 | 5,492 |
| full | native | tokens-gate | proposals | 34 | 52,503 | 44,530 | 3,381 | 10,001 | 34,529 |
| full | native | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| full | native | tokens-gate | completion | 3 | 2,612 | 1,833 | 390 | 704 | 1,129 |
| full | native | tokens-gate | logs | 9 | 6,905 | 5,126 | 677 | 2,644 | 2,482 |
| full | native | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| full | native | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| full | native | tokens-gate | conventions | 2 | 1,962 | 1,521 | 160 | 433 | 1,088 |
| full | native | tokens-gate | forge | 10 | 4,519 | 2,879 | 548 | 2,879 | 0 |
| full | native | tokens-gate | web-fetch | 1 | 984 | 787 | 68 | 309 | 478 |
| full | native | tokens-gate | issues | 1 | 915 | 723 | 63 | 85 | 638 |
| full | native | tokens-gate | api | 3 | 4,019 | 3,466 | 199 | 1,914 | 1,552 |
| full | native | tokens-gate | prompt-eval | 2 | 2,757 | 2,359 | 135 | 754 | 1,605 |
| full | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| vertex | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| vertex | native | tokens-gate | adaptive-optimizer | 1 | 2,302 | 2,047 | 114 | 1,136 | 911 |
| vertex | native | tokens-gate | audit | 4 | 9,116 | 7,888 | 718 | 1,632 | 6,256 |
| vertex | native | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
| vertex | native | tokens-gate | auto-plugin-selector | 1 | 3,827 | 3,527 | 152 | 1,227 | 2,300 |
| vertex | native | tokens-gate | commit-policy | 4 | 4,940 | 3,790 | 593 | 975 | 2,815 |
| vertex | native | tokens-gate | completion | 3 | 2,612 | 1,833 | 390 | 704 | 1,129 |
| vertex | native | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| vertex | native | tokens-gate | conventions | 2 | 1,962 | 1,521 | 160 | 433 | 1,088 |
| vertex | native | tokens-gate | context-for-change | 1 | 1,108 | 864 | 97 | 215 | 649 |
| vertex | native | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| vertex | native | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| vertex | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| vertex | native | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| vertex | native | tokens-gate | forge | 10 | 4,519 | 2,879 | 548 | 2,879 | 0 |
| vertex | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| vertex | native | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| vertex | native | tokens-gate | impact-analysis | 2 | 2,052 | 1,526 | 244 | 404 | 1,122 |
| vertex | native | tokens-gate | project-health | 1 | 1,268 | 1,031 | 98 | 165 | 866 |
| vertex | native | tokens-gate | quality-policy | 1 | 8,319 | 8,068 | 112 | 166 | 7,902 |
| vertex | native | tokens-gate | link-check | 1 | 1,354 | 1,113 | 110 | 85 | 1,028 |
| vertex | native | tokens-gate | logs | 9 | 6,905 | 5,126 | 677 | 2,644 | 2,482 |
| vertex | native | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| vertex | native | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| vertex | native | tokens-gate | orchestrator-runner | 11 | 43,867 | 41,272 | 1,006 | 9,684 | 31,588 |
| vertex | native | tokens-gate | agent-orchestrator | 4 | 7,875 | 6,826 | 507 | 1,334 | 5,492 |
| vertex | native | tokens-gate | perf | 3 | 3,872 | 3,235 | 275 | 1,152 | 2,083 |
| vertex | native | tokens-gate | proposals | 34 | 52,503 | 44,530 | 3,381 | 10,001 | 34,529 |
| vertex | native | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| vertex | native | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| vertex | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| vertex | native | tokens-gate | security | 4 | 5,857 | 4,963 | 362 | 810 | 4,153 |
| vertex | native | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| vertex | native | tokens-gate | tech-debt | 1 | 1,408 | 1,164 | 115 | 134 | 1,030 |
| vertex | native | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| vertex | native | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| vertex | native | tokens-gate | usage-tracking | 3 | 10,596 | 9,954 | 229 | 916 | 9,038 |
| vertex | native | tokens-gate | error-reporting | 1 | 2,788 | 2,574 | 75 | 114 | 2,460 |
| vertex | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| web-app | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| web-app | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| web-app | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| web-app | native | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| web-app | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| web-app | native | tokens-gate | i18n | 2 | 2,725 | 2,302 | 170 | 230 | 2,072 |
| web-app | native | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| web-app | native | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| web-app | native | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| web-app | native | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| web-app | native | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| web-app | native | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| web-app | native | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| web-app | native | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| web-app | native | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| web-app | native | tokens-gate | web-fetch | 1 | 984 | 787 | 68 | 309 | 478 |
| web-app | native | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| web-app | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| backend-api | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| backend-api | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| backend-api | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| backend-api | native | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| backend-api | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| backend-api | native | tokens-gate | rules | 3 | 5,856 | 5,220 | 257 | 520 | 4,700 |
| backend-api | native | tokens-gate | quality | 4 | 3,901 | 3,085 | 286 | 550 | 2,535 |
| backend-api | native | tokens-gate | refactor | 6 | 7,152 | 6,032 | 307 | 2,116 | 3,916 |
| backend-api | native | tokens-gate | deps | 5 | 5,441 | 4,438 | 374 | 650 | 3,788 |
| backend-api | native | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| backend-api | native | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| backend-api | native | tokens-gate | database | 5 | 4,339 | 3,347 | 388 | 1,091 | 2,256 |
| backend-api | native | tokens-gate | diagram | 4 | 3,897 | 3,041 | 329 | 1,435 | 1,606 |
| backend-api | native | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| backend-api | native | tokens-gate | container | 5 | 3,489 | 2,314 | 570 | 1,627 | 687 |
| backend-api | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |
| cli-tool | native | tokens-gate | core | 24 | 51,530 | 46,130 | 2,474 | 10,390 | 35,740 |
| cli-tool | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| cli-tool | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| cli-tool | native | tokens-gate | memory | 9 | 8,221 | 6,561 | 535 | 2,737 | 3,824 |
| cli-tool | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| cli-tool | native | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| cli-tool | native | tokens-gate | perf | 3 | 3,872 | 3,235 | 275 | 1,152 | 2,083 |
| cli-tool | native | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| cli-tool | adaptive | dynamic-client | core | 6 | 8,927 | 7,690 | 514 | 1,020 | 6,670 |

## CHECK-007 — tokenizer cost by preset

The repo has no lightweight LLM tokenizer dependency installed today. This report therefore uses an explicit fallback estimator of 4 bytes/token, published as an estimate rather than pretending to be an exact tokenizer. The script lives in tools/scripts/report/tokenizer-real.script.ts so the fallback can be replaced by a real tokenizer later without changing the dashboard contract.

| Preset | Surface Mode | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Estimator | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | tokens-gate | 58,378 | 14595 | 14595 | 14595 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| minimal | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| lean | native | tokens-gate | 68,959 | 17240 | 17240 | 17240 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| lean | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| standard | native | tokens-gate | 128,979 | 32245 | 32245 | 32245 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| standard | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| swarm | native | tokens-gate | 204,757 | 51190 | 51190 | 51190 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| swarm | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| full | native | tokens-gate | 213,439 | 53360 | 53360 | 53360 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| full | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| vertex | native | tokens-gate | 293,179 | 73295 | 73295 | 73295 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| vertex | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| web-app | native | tokens-gate | 113,245 | 28312 | 28312 | 28312 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| web-app | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| backend-api | native | tokens-gate | 111,661 | 27916 | 27916 | 27916 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| backend-api | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| cli-tool | native | tokens-gate | 78,020 | 19505 | 19505 | 19505 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| cli-tool | adaptive | dynamic-client | 8,934 | 2234 | 2234 | 2234 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |

## Documented deficits (kept, not auto-bumped)

- none

## Per-surface columns (c00135)

Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.

| Preset | Adaptive Bytes | Adaptive Status | Adaptive Deficit | Native Bytes | Native Status | Native Deficit |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 8,934 | ok | — | 58,378 | warning | — |
| lean | 8,934 | ok | — | 68,959 | warning | — |
| standard | 8,934 | ok | — | 128,979 | ok | — |
| swarm | 8,934 | ok | — | 204,757 | warning | — |
| full | 8,934 | ok | — | 213,439 | ok | — |
| vertex | 8,934 | ok | — | 293,179 | ok | — |
| web-app | 8,934 | n/a | — | 113,245 | n/a | — |
| backend-api | 8,934 | n/a | — | 111,661 | n/a | — |
| cli-tool | 8,934 | n/a | — | 78,020 | n/a | — |

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
