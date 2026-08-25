# Token Budgets — generated dashboard

<!-- generated: token-budget-dashboard.script.ts -->
<!-- generated — do not edit by hand -->

Generated at: 2026-08-25T07:33:04.930Z

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
| logs_tail | 1,071 | 268 | 5,500 | 6,000 | within hard |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the hard-budget semantics used by CI) and `adaptive / dynamic-client` (the modern bootstrap surface exposed to clients that support `tools/list_changed`). The two surfaces are intentionally kept separate.

| Preset | Title | Surface Mode | Source | Plugins | Tools | Tools/List Bytes | Est. Tokens | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | native | tokens-gate | 2 | 29 | 53,986 | 13497 | 47,800 | 2,647 | 11,318 | 36,482 | 5,065 | 799 | n/a | within hard | over hard (0B) | none |
| minimal | minimal | adaptive | dynamic-client | 2 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 494 | n/a | within hard | within hard | none |
| lean | lean | native | tokens-gate | 4 | 41 | 66,165 | 16542 | 57,758 | 3,355 | 14,582 | 43,176 | 9,819 | 1,016 | n/a | within hard | within hard | none |
| lean | lean | adaptive | dynamic-client | 4 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 554 | n/a | within hard | within hard | none |
| standard | standard | native | tokens-gate | 18 | 85 | 118,306 | 29577 | 100,382 | 7,119 | 24,929 | 75,453 | 9,819 | 2,449 | n/a | within hard | over hard (0B) | none |
| standard | standard | adaptive | dynamic-client | 18 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,144 | n/a | within hard | within hard | none |
| swarm | swarm | native | tokens-gate | 26 | 150 | 215,652 | 53913 | 183,552 | 12,845 | 42,942 | 140,610 | 68,074 | 4,021 | 153 | over hard (192,000B) | within hard | none |
| swarm | swarm | adaptive | dynamic-client | 26 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,599 | n/a | within hard | within hard | none |
| full | full | native | tokens-gate | 30 | 157 | 222,686 | 55672 | 189,206 | 13,368 | 45,928 | 143,278 | 68,074 | 4,374 | 153 | within hard | over hard (0B) | none |
| full | full | adaptive | dynamic-client | 30 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,805 | n/a | within hard | within hard | none |
| vertex | vertex | native | tokens-gate | 35 | 172 | 295,240 | 73810 | 257,236 | 15,630 | 56,172 | 201,064 | 68,074 | 4,986 | 153 | within hard | over hard (0B) | none |
| vertex | vertex | adaptive | dynamic-client | 35 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 2,017 | n/a | within hard | within hard | none |
| web-app | web-app | native | tokens-gate | 18 | 81 | 110,451 | 27613 | 93,591 | 6,588 | 23,918 | 69,673 | 9,819 | 2,446 | n/a | n/a | n/a | none |
| web-app | web-app | adaptive | dynamic-client | 18 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,202 | n/a | n/a | n/a | none |
| backend-api | backend-api | native | tokens-gate | 16 | 80 | 108,867 | 27217 | 92,200 | 6,547 | 23,897 | 68,303 | 9,819 | 2,310 | n/a | n/a | n/a | none |
| backend-api | backend-api | adaptive | dynamic-client | 16 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 1,105 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | native | tokens-gate | 8 | 50 | 76,337 | 19085 | 65,932 | 4,221 | 17,049 | 48,883 | 9,819 | 1,345 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | adaptive | dynamic-client | 8 | 6 | 8,357 | 2090 | 7,121 | 506 | 1,020 | 6,101 | 0 | 695 | n/a | n/a | n/a | none |

## Plugin marginal dashboard

| Preset | Surface Mode | Source | Owner | Tools | Tools/List Bytes | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| minimal | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| minimal | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| minimal | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| lean | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| lean | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| lean | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| lean | native | tokens-gate | memory | 9 | 9,819 | 8,159 | 535 | 2,737 | 5,422 |
| lean | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| lean | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| standard | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| standard | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| standard | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| standard | native | tokens-gate | memory | 9 | 9,819 | 8,159 | 535 | 2,737 | 5,422 |
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
| standard | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| swarm | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| swarm | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| swarm | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| swarm | native | tokens-gate | memory | 9 | 9,819 | 8,159 | 535 | 2,737 | 5,422 |
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
| swarm | native | tokens-gate | proposals | 33 | 68,074 | 60,329 | 3,285 | 9,800 | 50,529 |
| swarm | native | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| swarm | native | tokens-gate | completion | 3 | 2,612 | 1,833 | 390 | 704 | 1,129 |
| swarm | native | tokens-gate | logs | 9 | 12,903 | 11,124 | 677 | 2,644 | 8,480 |
| swarm | native | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| swarm | native | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| swarm | native | tokens-gate | conventions | 2 | 1,962 | 1,521 | 160 | 433 | 1,088 |
| swarm | native | tokens-gate | forge | 10 | 4,519 | 2,879 | 548 | 2,879 | 0 |
| swarm | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| full | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| full | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| full | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| full | native | tokens-gate | memory | 9 | 9,819 | 8,159 | 535 | 2,737 | 5,422 |
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
| full | native | tokens-gate | proposals | 33 | 68,074 | 60,329 | 3,285 | 9,800 | 50,529 |
| full | native | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| full | native | tokens-gate | completion | 3 | 2,612 | 1,833 | 390 | 704 | 1,129 |
| full | native | tokens-gate | logs | 9 | 12,903 | 11,124 | 677 | 2,644 | 8,480 |
| full | native | tokens-gate | status-marker | 3 | 2,213 | 1,649 | 191 | 573 | 1,076 |
| full | native | tokens-gate | test-convention | 3 | 3,406 | 2,704 | 283 | 689 | 2,015 |
| full | native | tokens-gate | conventions | 2 | 1,962 | 1,521 | 160 | 433 | 1,088 |
| full | native | tokens-gate | forge | 10 | 4,519 | 2,879 | 548 | 2,879 | 0 |
| full | native | tokens-gate | web-fetch | 1 | 984 | 787 | 68 | 309 | 478 |
| full | native | tokens-gate | issues | 1 | 915 | 723 | 63 | 85 | 638 |
| full | native | tokens-gate | api | 3 | 4,019 | 3,466 | 199 | 1,914 | 1,552 |
| full | native | tokens-gate | changelog | 2 | 1,109 | 678 | 193 | 678 | 0 |
| full | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| vertex | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| vertex | native | tokens-gate | adaptive-optimizer | 1 | 2,302 | 2,047 | 114 | 1,136 | 911 |
| vertex | native | tokens-gate | audit | 4 | 9,116 | 7,888 | 718 | 1,632 | 6,256 |
| vertex | native | tokens-gate | auto-agent-selector | 5 | 7,327 | 6,010 | 610 | 1,377 | 4,633 |
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
| vertex | native | tokens-gate | logs | 9 | 12,903 | 11,124 | 677 | 2,644 | 8,480 |
| vertex | native | tokens-gate | memory | 9 | 9,819 | 8,159 | 535 | 2,737 | 5,422 |
| vertex | native | tokens-gate | notification | 2 | 1,592 | 1,131 | 192 | 291 | 840 |
| vertex | native | tokens-gate | orchestrator-runner | 11 | 43,805 | 41,210 | 1,006 | 9,622 | 31,588 |
| vertex | native | tokens-gate | perf | 3 | 3,872 | 3,235 | 275 | 1,152 | 2,083 |
| vertex | native | tokens-gate | proposals | 33 | 68,074 | 60,329 | 3,285 | 9,800 | 50,529 |
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
| vertex | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| web-app | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| web-app | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| web-app | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| web-app | native | tokens-gate | memory | 9 | 9,819 | 8,159 | 535 | 2,737 | 5,422 |
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
| web-app | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| backend-api | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| backend-api | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| backend-api | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| backend-api | native | tokens-gate | memory | 9 | 9,819 | 8,159 | 535 | 2,737 | 5,422 |
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
| backend-api | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |
| cli-tool | native | tokens-gate | core | 20 | 47,142 | 42,556 | 2,158 | 9,793 | 32,763 |
| cli-tool | native | tokens-gate | git | 8 | 5,065 | 3,681 | 426 | 900 | 2,781 |
| cli-tool | native | tokens-gate | search | 1 | 1,749 | 1,563 | 63 | 625 | 938 |
| cli-tool | native | tokens-gate | memory | 9 | 9,819 | 8,159 | 535 | 2,737 | 5,422 |
| cli-tool | native | tokens-gate | docs | 3 | 2,348 | 1,799 | 173 | 527 | 1,272 |
| cli-tool | native | tokens-gate | env | 2 | 3,250 | 2,778 | 223 | 272 | 2,506 |
| cli-tool | native | tokens-gate | changelog | 2 | 1,109 | 678 | 193 | 678 | 0 |
| cli-tool | native | tokens-gate | perf | 3 | 3,872 | 3,235 | 275 | 1,152 | 2,083 |
| cli-tool | native | tokens-gate | test-policy | 2 | 1,932 | 1,483 | 175 | 365 | 1,118 |
| cli-tool | adaptive | dynamic-client | core | 6 | 8,350 | 7,121 | 506 | 1,020 | 6,101 |

## CHECK-007 — tokenizer cost by preset

The repo has no lightweight LLM tokenizer dependency installed today. This report therefore uses an explicit fallback estimator of 4 bytes/token, published as an estimate rather than pretending to be an exact tokenizer. The script lives in tools/scripts/report/tokenizer-real.script.ts so the fallback can be replaced by a real tokenizer later without changing the dashboard contract.

| Preset | Surface Mode | Source | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Estimator | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | native | tokens-gate | 53,986 | 13497 | 13497 | 13497 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| minimal | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| lean | native | tokens-gate | 66,165 | 16542 | 16542 | 16542 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| lean | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| standard | native | tokens-gate | 118,306 | 29577 | 29577 | 29577 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| standard | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| swarm | native | tokens-gate | 215,652 | 53913 | 53913 | 53913 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| swarm | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| full | native | tokens-gate | 222,686 | 55672 | 55672 | 55672 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| full | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| vertex | native | tokens-gate | 295,240 | 73810 | 73810 | 73810 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| vertex | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| web-app | native | tokens-gate | 110,451 | 27613 | 27613 | 27613 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| web-app | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| backend-api | native | tokens-gate | 108,867 | 27217 | 27217 | 27217 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| backend-api | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| cli-tool | native | tokens-gate | 76,337 | 19085 | 19085 | 19085 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| cli-tool | adaptive | dynamic-client | 8,357 | 2090 | 2090 | 2090 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |

## Documented deficits (kept, not auto-bumped)

- swarm native/tokens-gate tools/list = 215,652B, documented hard ceiling = 192,000B. Derived from the same measurement semantics as tokens:gate; kept as-is per v00123 non-goal: report the deficit, do not auto-bump.

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
