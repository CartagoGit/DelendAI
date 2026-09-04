# Permission Matrix

| Plugin | Visibility | Tool | Permissions |
| --- | --- | --- | --- |
| adaptive-optimizer | public | * | filesystem-read |
| agent-orchestrator | public | * | process |
| api | public | * | process, network |
| audit | public | * | filesystem-read, filesystem-write, network, env-read |
| audit-orchestrator | public | * | filesystem-read, process |
| auto-agent-selector | public | * | filesystem-read, process, network, env-read |
| auto-plugin-selector | public | * | filesystem-read |
| browser | public | * | filesystem-write, process, network, browser |
| cache | public | * | filesystem-read, filesystem-write, env-read |
| changelog | private | * | process, git-read |
| commit-policy | public | commit_policy_status | git-read |
| commit-policy | public | commit_policy_commit | git-write |
| commit-policy | public | commit_policy_push | git-write |
| commit-policy | public | commit_policy_run | git-write |
| commit-policy | public | commit_policy_refresh_branch_protection | network, process |
| completion | public | * | filesystem-read, filesystem-write |
| container | public | container_inspect | container |
| container | public | container_logs | container |
| container | public | container_lint | filesystem-read |
| container | public | k8s_apply | container, process |
| container | public | container_build | container, process |
| context-for-change | public | * | filesystem-read |
| conventions | public | * | filesystem-read |
| database | public | * | env-read, database |
| deps | public | * | filesystem-read, network |
| diagram | public | * | filesystem-read, filesystem-write |
| docs | public | * | filesystem-read, filesystem-write |
| env | public | * | filesystem-read, env-read |
| error-reporting | public | report_status | network, forge-write |
| external-mcps | public | * | filesystem-read, process, network, env-read |
| forge | public | pr_list | forge-read, network |
| forge | public | pr_show | forge-read, network |
| forge | public | ci_status | forge-read, network |
| forge | public | issue_list | forge-read, network |
| forge | public | issue_show | forge-read, network |
| forge | public | release | forge-read, forge-write, network |
| forge | public | search_code | forge-read, network |
| forge | public | pr_create | forge-write, network |
| forge | public | pr_comment | forge-write, network |
| forge | public | issue_create | forge-write, network |
| git | public | status | git-read |
| git | public | changed | git-read |
| git | public | diff | git-read |
| git | public | log | git-read |
| git | public | blame | git-read |
| git | public | show | git-read |
| git | public | worktree | git-read |
| git | public | changelog | git-read |
| git | public | commit | git-write |
| git | public | push | git-write |
| github | public | * | filesystem-write, network, env-read |
| gitlab | public | * | filesystem-write, network, env-read |
| i18n | public | * | filesystem-read |
| impact-analysis | public | * | filesystem-read |
| issues | public | issues_list | forge-read, network |
| issues | public | issues_fetch | forge-read, network |
| issues | public | issues_analyze | forge-read |
| issues | public | issues_ingest | forge-read, network |
| issues | public | issues_resolve | forge-write, network |
| issues | public | setup_github | forge-write, network, secrets |
| issues-triage | private | * | forge-read, forge-write, filesystem-read, filesystem-write, network |
| link-check | public | * | filesystem-read |
| logs | public | * | filesystem-read, filesystem-write |
| memory | public | * | filesystem-read, filesystem-write |
| notification | public | * | filesystem-read, filesystem-write |
| observability | public | * | filesystem-read, filesystem-write, network, env-read |
| orchestrator-runner | public | * | filesystem-read, process, network, env-read |
| perf | public | * | filesystem-read, filesystem-write, process |
| project-health | public | * | filesystem-read |
| project-kpis | public | * | filesystem-read, filesystem-write |
| prompt-eval | public | * | filesystem-read, process |
| prompts-pack | public | * | filesystem-read |
| proposals | public | auto_work | filesystem-read, filesystem-write, git-read |
| proposals | public | plan | filesystem-read, filesystem-write |
| proposals | public | delegate | filesystem-read, filesystem-write |
| proposals | public | get_proposal_workflow | filesystem-read |
| proposals | public | round_context | filesystem-read |
| proposals | public | agent_lock | filesystem-read, filesystem-write |
| proposals | public | agent_worktree | filesystem-read, filesystem-write, git-write |
| proposals | public | agent_names | filesystem-read |
| proposals | public | branch_status | git-read |
| proposals | public | branch_gc | git-read, git-write |
| proposals | public | close_slice | filesystem-read, filesystem-write |
| proposals | public | proposal_transition | filesystem-read, filesystem-write |
| proposals | public | proposal_review | filesystem-read |
| proposals | public | proposal_adopt | filesystem-read, filesystem-write, git-write |
| proposals | public | proposal_diagnose | filesystem-read |
| proposals | public | state_health | filesystem-read |
| proposals | public | state_repair | filesystem-read, filesystem-write |
| proposals | public | agent_lock_release_orphan | filesystem-read, filesystem-write |
| quality | public | * | filesystem-read, process |
| quality-policy | public | * | filesystem-read, process |
| refactor | public | * | filesystem-read, filesystem-write |
| remote-provider-core | public | * | filesystem-read |
| rules | public | * | filesystem-read, network, env-read |
| search | public | * | filesystem-read, process, env-read |
| security | public | * | filesystem-read, filesystem-write, process, env-read |
| skills-pack | public | * | filesystem-read |
| status-marker | public | * | filesystem-read |
| tech-debt | public | * | filesystem-read |
| test-convention | public | * | filesystem-read |
| test-policy | public | * | filesystem-read, filesystem-write |
| usage-tracking | public | * | filesystem-read, filesystem-write, network, env-read |
| web-fetch | public | * | network |
