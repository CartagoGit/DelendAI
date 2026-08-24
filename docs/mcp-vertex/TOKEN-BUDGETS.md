# Token Budgets — generated dashboard

<!-- generated: token-budget-dashboard.script.ts -->
<!-- generated — do not edit by hand -->

Generated at: 2026-08-24T06:17:00.398Z

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
| overview full | 10,622 | 2656 | 10,600 | 10,700 | over warning (10,600B) |
| overview compact | 1,446 | 362 | 1,450 | 1,500 | within hard |
| auto_work idle | 159 | 40 | 2,400 | 2,600 | within hard |
| auto_work work plan | 2,453 | 614 | 2,400 | 2,600 | over warning (2,400B) |
| agent_catalog compact | 426 | 107 | 800 | 900 | within hard |
| agent_catalog full | 4,666 | 1167 | 6,500 | 6,800 | within hard |
| analyze_project {} | 829 | 208 | 1,600 | 1,800 | within hard |
| plan_mcp_project {} | 836 | 209 | 1,800 | 2,000 | within hard |
| search_search | 874 | 219 | 2,700 | 3,000 | within hard |
| docs_docs_list | 209 | 53 | 2,200 | 2,500 | within hard |
| proposals_round_context | 153 | 39 | 2,700 | 3,000 | within hard |
| logs_tail | 2,087 | 522 | 5,500 | 6,000 | within hard |

## Real preset dashboard

This dashboard measures the real preset assemblies through the actual plugin loader. It treats tools/list as first-order static context cost and breaks the payload down by preset and owner plugin.

| Preset | Title | Plugins | Tools | Tools/List Bytes | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes | Max Plugin Bytes | Overview Compact | Round Context | Tools Status | Marginal Status | Load Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | minimal | 2 | 29 | 53,024 | 42,087 | 7,386 | 8,800 | 33,287 | 5,860 | 799 | n/a | n/a | n/a | none |
| lean | lean | 4 | 41 | 68,601 | 52,045 | 11,478 | 12,064 | 39,981 | 12,762 | 1,016 | n/a | over warning (68,150B) | within hard | none |
| standard | standard | 17 | 80 | 119,386 | 88,448 | 20,811 | 20,885 | 67,563 | 12,762 | 2,287 | n/a | n/a | n/a | none |
| swarm | swarm | 25 | 143 | 229,740 | 175,142 | 36,267 | 38,112 | 137,030 | 76,776 | 3,821 | 153 | over hard (192,000B) | over warning (70,000B) | none |
| full | full | 29 | 150 | 238,184 | 180,796 | 38,194 | 41,098 | 139,698 | 76,776 | 4,174 | 153 | n/a | n/a | none |
| vertex | vertex | 29 | 161 | 301,503 | 234,870 | 45,715 | 49,871 | 184,999 | 76,776 | 4,456 | 153 | n/a | n/a | none |
| web-app | web-app | 18 | 81 | 119,562 | 87,667 | 21,583 | 21,251 | 66,416 | 12,762 | 2,446 | n/a | n/a | n/a | none |
| backend-api | backend-api | 16 | 80 | 117,158 | 86,276 | 20,732 | 21,230 | 65,046 | 12,762 | 2,310 | n/a | n/a | n/a | none |
| cli-tool | cli-tool | 8 | 50 | 80,398 | 60,219 | 13,965 | 14,531 | 45,688 | 12,762 | 1,345 | n/a | n/a | n/a | none |

## Plugin marginal dashboard

| Preset | Owner | Tools | Tools/List Bytes | Schema Bytes | Description Bytes | InputSchema Bytes | OutputSchema Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| minimal | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| minimal | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| minimal | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| lean | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| lean | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| lean | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| lean | memory | 9 | 12,762 | 8,159 | 3,464 | 2,737 | 5,422 |
| lean | docs | 3 | 2,803 | 1,799 | 628 | 527 | 1,272 |
| standard | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| standard | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| standard | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| standard | memory | 9 | 12,762 | 8,159 | 3,464 | 2,737 | 5,422 |
| standard | docs | 3 | 2,803 | 1,799 | 628 | 527 | 1,272 |
| standard | i18n | 2 | 3,256 | 2,302 | 697 | 230 | 2,072 |
| standard | rules | 3 | 6,193 | 5,220 | 594 | 520 | 4,700 |
| standard | quality | 4 | 4,504 | 3,085 | 889 | 550 | 2,535 |
| standard | refactor | 6 | 7,873 | 6,032 | 1,028 | 2,116 | 3,916 |
| standard | deps | 5 | 6,568 | 4,438 | 1,501 | 650 | 3,788 |
| standard | test-policy | 2 | 2,442 | 1,483 | 685 | 365 | 1,118 |
| standard | database | 5 | 4,679 | 3,347 | 728 | 1,091 | 2,256 |
| standard | container | 5 | 3,702 | 2,314 | 783 | 1,627 | 687 |
| standard | diagram | 4 | 4,863 | 2,830 | 1,506 | 1,286 | 1,544 |
| standard | env | 2 | 3,738 | 2,778 | 707 | 272 | 2,506 |
| standard | error-reporting | 1 | 2,928 | 2,574 | 215 | 114 | 2,460 |
| swarm | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| swarm | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| swarm | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| swarm | memory | 9 | 12,762 | 8,159 | 3,464 | 2,737 | 5,422 |
| swarm | docs | 3 | 2,803 | 1,799 | 628 | 527 | 1,272 |
| swarm | i18n | 2 | 3,256 | 2,302 | 697 | 230 | 2,072 |
| swarm | rules | 3 | 6,193 | 5,220 | 594 | 520 | 4,700 |
| swarm | quality | 4 | 4,504 | 3,085 | 889 | 550 | 2,535 |
| swarm | refactor | 6 | 7,873 | 6,032 | 1,028 | 2,116 | 3,916 |
| swarm | deps | 5 | 6,568 | 4,438 | 1,501 | 650 | 3,788 |
| swarm | test-policy | 2 | 2,442 | 1,483 | 685 | 365 | 1,118 |
| swarm | database | 5 | 4,679 | 3,347 | 728 | 1,091 | 2,256 |
| swarm | container | 5 | 3,702 | 2,314 | 783 | 1,627 | 687 |
| swarm | diagram | 4 | 4,863 | 2,830 | 1,506 | 1,286 | 1,544 |
| swarm | env | 2 | 3,738 | 2,778 | 707 | 272 | 2,506 |
| swarm | error-reporting | 1 | 2,928 | 2,574 | 215 | 114 | 2,460 |
| swarm | proposals | 31 | 76,776 | 63,853 | 8,715 | 9,014 | 54,839 |
| swarm | notification | 2 | 1,992 | 1,131 | 590 | 291 | 840 |
| swarm | completion | 3 | 3,112 | 1,833 | 886 | 704 | 1,129 |
| swarm | logs | 9 | 14,231 | 11,124 | 2,003 | 2,644 | 8,480 |
| swarm | status-marker | 3 | 2,528 | 1,649 | 506 | 573 | 1,076 |
| swarm | test-convention | 3 | 3,956 | 2,704 | 833 | 689 | 2,015 |
| swarm | conventions | 2 | 2,472 | 1,521 | 670 | 433 | 1,088 |
| swarm | forge | 10 | 5,224 | 2,879 | 1,253 | 2,879 | 0 |
| full | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| full | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| full | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| full | memory | 9 | 12,762 | 8,159 | 3,464 | 2,737 | 5,422 |
| full | docs | 3 | 2,803 | 1,799 | 628 | 527 | 1,272 |
| full | i18n | 2 | 3,256 | 2,302 | 697 | 230 | 2,072 |
| full | rules | 3 | 6,193 | 5,220 | 594 | 520 | 4,700 |
| full | quality | 4 | 4,504 | 3,085 | 889 | 550 | 2,535 |
| full | refactor | 6 | 7,873 | 6,032 | 1,028 | 2,116 | 3,916 |
| full | deps | 5 | 6,568 | 4,438 | 1,501 | 650 | 3,788 |
| full | test-policy | 2 | 2,442 | 1,483 | 685 | 365 | 1,118 |
| full | database | 5 | 4,679 | 3,347 | 728 | 1,091 | 2,256 |
| full | container | 5 | 3,702 | 2,314 | 783 | 1,627 | 687 |
| full | diagram | 4 | 4,863 | 2,830 | 1,506 | 1,286 | 1,544 |
| full | env | 2 | 3,738 | 2,778 | 707 | 272 | 2,506 |
| full | error-reporting | 1 | 2,928 | 2,574 | 215 | 114 | 2,460 |
| full | proposals | 31 | 76,776 | 63,853 | 8,715 | 9,014 | 54,839 |
| full | notification | 2 | 1,992 | 1,131 | 590 | 291 | 840 |
| full | completion | 3 | 3,112 | 1,833 | 886 | 704 | 1,129 |
| full | logs | 9 | 14,231 | 11,124 | 2,003 | 2,644 | 8,480 |
| full | status-marker | 3 | 2,528 | 1,649 | 506 | 573 | 1,076 |
| full | test-convention | 3 | 3,956 | 2,704 | 833 | 689 | 2,015 |
| full | conventions | 2 | 2,472 | 1,521 | 670 | 433 | 1,088 |
| full | forge | 10 | 5,224 | 2,879 | 1,253 | 2,879 | 0 |
| full | web-fetch | 1 | 1,298 | 787 | 376 | 309 | 478 |
| full | issues | 1 | 1,042 | 723 | 190 | 85 | 638 |
| full | api | 3 | 4,687 | 3,466 | 867 | 1,914 | 1,552 |
| full | changelog | 2 | 1,410 | 678 | 494 | 678 | 0 |
| vertex | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| vertex | audit | 4 | 9,876 | 7,888 | 1,478 | 1,632 | 6,256 |
| vertex | auto-agent-selector | 5 | 8,124 | 5,426 | 1,991 | 1,319 | 4,107 |
| vertex | container | 5 | 3,702 | 2,314 | 783 | 1,627 | 687 |
| vertex | conventions | 2 | 2,472 | 1,521 | 670 | 433 | 1,088 |
| vertex | deps | 5 | 6,568 | 4,438 | 1,501 | 650 | 3,788 |
| vertex | diagram | 4 | 4,863 | 2,830 | 1,506 | 1,286 | 1,544 |
| vertex | docs | 3 | 2,803 | 1,799 | 628 | 527 | 1,272 |
| vertex | env | 2 | 3,738 | 2,778 | 707 | 272 | 2,506 |
| vertex | forge | 10 | 5,224 | 2,879 | 1,253 | 2,879 | 0 |
| vertex | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| vertex | i18n | 2 | 3,256 | 2,302 | 697 | 230 | 2,072 |
| vertex | link-check | 1 | 1,610 | 1,113 | 366 | 85 | 1,028 |
| vertex | logs | 9 | 14,231 | 11,124 | 2,003 | 2,644 | 8,480 |
| vertex | memory | 9 | 12,762 | 8,159 | 3,464 | 2,737 | 5,422 |
| vertex | notification | 2 | 1,992 | 1,131 | 590 | 291 | 840 |
| vertex | orchestrator-runner | 11 | 47,779 | 41,210 | 4,978 | 9,622 | 31,588 |
| vertex | perf | 3 | 4,198 | 3,235 | 601 | 1,152 | 2,083 |
| vertex | proposals | 31 | 76,776 | 63,853 | 8,715 | 9,014 | 54,839 |
| vertex | quality | 4 | 4,504 | 3,085 | 889 | 550 | 2,535 |
| vertex | rules | 3 | 6,193 | 5,220 | 594 | 520 | 4,700 |
| vertex | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| vertex | security | 4 | 6,845 | 4,963 | 1,350 | 810 | 4,153 |
| vertex | status-marker | 3 | 2,528 | 1,649 | 506 | 573 | 1,076 |
| vertex | tech-debt | 1 | 1,582 | 1,164 | 285 | 134 | 1,030 |
| vertex | test-convention | 3 | 3,956 | 2,704 | 833 | 689 | 2,015 |
| vertex | test-policy | 2 | 2,442 | 1,483 | 685 | 365 | 1,118 |
| vertex | usage-tracking | 3 | 7,395 | 5,941 | 1,041 | 916 | 5,025 |
| vertex | error-reporting | 1 | 2,928 | 2,574 | 215 | 114 | 2,460 |
| web-app | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| web-app | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| web-app | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| web-app | memory | 9 | 12,762 | 8,159 | 3,464 | 2,737 | 5,422 |
| web-app | docs | 3 | 2,803 | 1,799 | 628 | 527 | 1,272 |
| web-app | i18n | 2 | 3,256 | 2,302 | 697 | 230 | 2,072 |
| web-app | rules | 3 | 6,193 | 5,220 | 594 | 520 | 4,700 |
| web-app | quality | 4 | 4,504 | 3,085 | 889 | 550 | 2,535 |
| web-app | refactor | 6 | 7,873 | 6,032 | 1,028 | 2,116 | 3,916 |
| web-app | deps | 5 | 6,568 | 4,438 | 1,501 | 650 | 3,788 |
| web-app | test-policy | 2 | 2,442 | 1,483 | 685 | 365 | 1,118 |
| web-app | test-convention | 3 | 3,956 | 2,704 | 833 | 689 | 2,015 |
| web-app | diagram | 4 | 4,863 | 2,830 | 1,506 | 1,286 | 1,544 |
| web-app | env | 2 | 3,738 | 2,778 | 707 | 272 | 2,506 |
| web-app | container | 5 | 3,702 | 2,314 | 783 | 1,627 | 687 |
| web-app | web-fetch | 1 | 1,298 | 787 | 376 | 309 | 478 |
| web-app | status-marker | 3 | 2,528 | 1,649 | 506 | 573 | 1,076 |
| backend-api | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| backend-api | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| backend-api | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| backend-api | memory | 9 | 12,762 | 8,159 | 3,464 | 2,737 | 5,422 |
| backend-api | docs | 3 | 2,803 | 1,799 | 628 | 527 | 1,272 |
| backend-api | rules | 3 | 6,193 | 5,220 | 594 | 520 | 4,700 |
| backend-api | quality | 4 | 4,504 | 3,085 | 889 | 550 | 2,535 |
| backend-api | refactor | 6 | 7,873 | 6,032 | 1,028 | 2,116 | 3,916 |
| backend-api | deps | 5 | 6,568 | 4,438 | 1,501 | 650 | 3,788 |
| backend-api | test-policy | 2 | 2,442 | 1,483 | 685 | 365 | 1,118 |
| backend-api | test-convention | 3 | 3,956 | 2,704 | 833 | 689 | 2,015 |
| backend-api | database | 5 | 4,679 | 3,347 | 728 | 1,091 | 2,256 |
| backend-api | diagram | 4 | 4,863 | 2,830 | 1,506 | 1,286 | 1,544 |
| backend-api | env | 2 | 3,738 | 2,778 | 707 | 272 | 2,506 |
| backend-api | container | 5 | 3,702 | 2,314 | 783 | 1,627 | 687 |
| cli-tool | core | 20 | 44,941 | 36,843 | 5,662 | 7,275 | 29,568 |
| cli-tool | git | 8 | 5,860 | 3,681 | 1,219 | 900 | 2,781 |
| cli-tool | search | 1 | 2,193 | 1,563 | 505 | 625 | 938 |
| cli-tool | memory | 9 | 12,762 | 8,159 | 3,464 | 2,737 | 5,422 |
| cli-tool | docs | 3 | 2,803 | 1,799 | 628 | 527 | 1,272 |
| cli-tool | env | 2 | 3,738 | 2,778 | 707 | 272 | 2,506 |
| cli-tool | changelog | 2 | 1,410 | 678 | 494 | 678 | 0 |
| cli-tool | perf | 3 | 4,198 | 3,235 | 601 | 1,152 | 2,083 |
| cli-tool | test-policy | 2 | 2,442 | 1,483 | 685 | 365 | 1,118 |

## CHECK-007 — tokenizer cost by preset

The repo has no lightweight LLM tokenizer dependency installed today. This report therefore uses an explicit fallback estimator of 4 bytes/token, published as an estimate rather than pretending to be an exact tokenizer. The script lives in tools/scripts/report/tokenizer-real.script.ts so the fallback can be replaced by a real tokenizer later without changing the dashboard contract.

| Preset | Tools/List Bytes | gpt-5.4 Tokens | claude-sonnet-4 Tokens | gemini-2.5-pro Tokens | Estimator | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| minimal | 53,024 | 13256 | 13256 | 13256 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| lean | 68,601 | 17151 | 17151 | 17151 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| standard | 119,386 | 29847 | 29847 | 29847 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| swarm | 229,740 | 57435 | 57435 | 57435 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| full | 238,184 | 59546 | 59546 | 59546 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| vertex | 301,503 | 75376 | 75376 | 75376 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| web-app | 119,562 | 29891 | 29891 | 29891 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| backend-api | 117,158 | 29290 | 29290 | 29290 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |
| cli-tool | 80,398 | 20100 | 20100 | 20100 | heuristic-4-bytes-per-token | estimated fallback (no lightweight tokenizer dependency present) |

## Documented deficits (kept, not auto-bumped)

- swarm tools/list = 229,740B, documented hard ceiling = 192,000B. Kept as-is per v00123 non-goal: report the deficit, do not auto-bump.

## Reproduce

```bash
bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
bun tools/scripts/report/token-budget-dashboard.script.ts
bun tools/scripts/report/tokenizer-real.script.ts
```
