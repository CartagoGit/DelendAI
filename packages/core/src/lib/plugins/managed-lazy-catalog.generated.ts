/**
 * managed-lazy-catalog.generated.ts — GENERATED, do not edit by hand.
 *
 * Regenerate: bun tools/scripts/generate/managed-lazy-catalog.script.ts
 * The source is the eager assembled plugin registration catalog; the
 * runtime consumes this compact index without importing every plugin.
 */
export interface IManagedLazyPluginCatalogEntry {
	readonly id: string;
	readonly packageSpecifier: string;
	readonly toolIds: readonly string[];
	readonly summary?: string | undefined;
	readonly tags?: readonly string[] | undefined;
}

const tools = (
	id: string,
	packageSpecifier: string,
	toolIds: readonly string[],
	metadata: Pick<IManagedLazyPluginCatalogEntry, 'summary' | 'tags'> = {},
): IManagedLazyPluginCatalogEntry => ({
	id,
	packageSpecifier,
	...metadata,
	toolIds,
});

export const MANAGED_LAZY_PLUGIN_CATALOG: readonly IManagedLazyPluginCatalogEntry[] =
	[
		tools(
			'adaptive-optimizer',
			'@mcp-vertex/adaptive-optimizer',
			['optimize_run'],
			{
				summary:
					'Adaptive optimizer: cheaply rank model, plugin-set and prompt candidates with explicit budget and consent guards.',
				tags: ['optimizer', 'adaptive', 'prompt', 'f00168'],
			},
		),
		tools(
			'agent-orchestrator',
			'@mcp-vertex/agent-orchestrator',
			['plan', 'dispatch'],
			{
				summary:
					'Workflow policy plugin: single / linear / swarm / auto modes with token budgets, iteration caps, and mid-task subagent rotation.',
				tags: ['orchestrator', 'policy', 'workflow', 'subagent'],
			},
		),
		tools(
			'api',
			'@mcp-vertex/api',
			['api_call', 'api_validate', 'api_mock'],
			{
				summary: 'REST/GraphQL API surface for mcp-vertex plugins.',
				tags: ['api', 'surface'],
			},
		),
		tools(
			'audit',
			'@mcp-vertex/audit',
			['audit_plan', 'audit_consolidate', 'audit_run', 'self_audit'],
			{
				summary:
					'Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop.',
				tags: ['audit', 'multi-model', 'self-improvement'],
			},
		),
		tools(
			'auto-agent-selector',
			'@mcp-vertex/auto-agent-selector',
			[
				'auto_status',
				'auto_recommend',
				'auto_record',
				'auto_evaluate',
				'auto_run',
			],
			{
				summary:
					'Zero-config multi-agent routing (cost↔quality dial, auto_recommend, escalation).',
				tags: ['routing', 'agents'],
			},
		),
		tools(
			'auto-plugin-selector',
			'@mcp-vertex/auto-plugin-selector',
			['plugins_recommend'],
			{
				summary:
					'Recommends the best plugin set for this project from its signals (manifest, files, git, task).',
				tags: ['plugins', 'catalog', 'routing'],
			},
		),
		tools(
			'commit-policy',
			'@mcp-vertex/commit-policy',
			[
				'commit_policy_status',
				'commit_policy_commit',
				'commit_policy_push',
				'commit_policy_run',
			],
			{
				summary:
					'Commit-authority plugin: configurable identity, cadence and audit-trail policy wrapping the git plugin primitives. Off by default — opt in via plugins.commit-policy.options.',
				tags: ['commit', 'policy', 'git', 'agent', 'f00181'],
			},
		),
		tools(
			'completion',
			'@mcp-vertex/completion',
			['report_complete', 'status', 'clear'],
			{
				summary:
					'Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification.',
				tags: ['completion', 'notification'],
			},
		),
		tools(
			'container',
			'@mcp-vertex/container',
			[
				'container_inspect',
				'container_logs',
				'container_lint',
				'container_build',
				'k8s_apply',
			],
			{
				summary:
					'Container inspection + lint (docker ps/images, k8s, Dockerfile rules).',
				tags: ['container', 'docker', 'kubernetes'],
			},
		),
		tools(
			'context-for-change',
			'@mcp-vertex/context-for-change',
			['context_for_change'],
			{
				summary:
					'Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.',
				tags: ['context', 'orchestration', 'compact', 'f00165'],
			},
		),
		tools(
			'conventions',
			'@mcp-vertex/conventions',
			['conventions_classify', 'conventions_check'],
			{
				summary:
					'Repo file-convention enforcement (interface, constant, service, tool …).',
				tags: ['conventions'],
			},
		),
		tools(
			'database',
			'@mcp-vertex/database',
			['db_erd', 'db_schema', 'db_probe', 'db_query', 'db_explain'],
			{
				summary:
					'Database schema/introspection tools (read-only, offline).',
				tags: ['database', 'schema'],
			},
		),
		tools(
			'deps',
			'@mcp-vertex/deps',
			[
				'deps_list',
				'deps_check',
				'deps_outdated',
				'deps_audit',
				'deps_licenses',
				'deps_polyglot',
				'deps_tree',
			],
			{
				summary:
					'Dependency inventory + offline health (deps_list, deps_check, deps_audit, deps_licenses, deps_tree).',
				tags: ['deps', 'licenses'],
			},
		),
		tools(
			'diagram',
			'@mcp-vertex/diagram',
			[
				'diagram_deps',
				'diagram_modules',
				'diagram_erd',
				'diagram_proposals',
			],
			{
				summary:
					'Diagram generator (mermaid, dot) from code structure.',
				tags: ['diagram', 'docs'],
			},
		),
		tools(
			'docs',
			'@mcp-vertex/docs',
			['docs_list', 'docs_read', 'docs_search'],
			{
				summary: 'Doc generation, search, and rendered catalog.',
				tags: ['docs', 'catalog'],
			},
		),
		tools('env', '@mcp-vertex/env', ['env_check', 'env_explains'], {
			summary:
				'Environment config validation (.env check + schema + env_explains).',
			tags: ['env', 'config'],
		}),
		tools(
			'error-reporting',
			'@mcp-vertex/error-reporting',
			['report_status'],
			{
				summary:
					'Automatic mcp-vertex error reporting: opens de-duplicated GitHub issues for internal failures (enabled by default).',
				tags: ['error-reporting', 'github', 'issues'],
			},
		),
		tools(
			'forge',
			'@mcp-vertex/forge',
			[
				'pr_list',
				'pr_show',
				'ci_status',
				'issue_list',
				'issue_show',
				'pr_create',
				'pr_comment',
				'issue_create',
				'release',
				'search_code',
			],
			{
				summary: 'Forge (GitHub/GitLab) wrappers — PRs, CI, issues.',
				tags: ['forge', 'git', 'ci'],
			},
		),
		tools(
			'git',
			'@mcp-vertex/git',
			[
				'status',
				'changed',
				'diff',
				'log',
				'blame',
				'show',
				'worktree',
				'changelog',
				'commit',
				'push',
				'pr_list',
				'pr_view',
			],
			{
				summary:
					'Git wrappers (PR list/view, diff, changelog, extended).',
				tags: ['git', 'changelog'],
			},
		),
		tools('i18n', '@mcp-vertex/i18n', ['i18n_check', 'i18n_validate'], {
			summary:
				'i18n key/interpolation validation across locale JSON files.',
			tags: ['i18n', 'l10n'],
		}),
		tools(
			'impact-analysis',
			'@mcp-vertex/impact-analysis',
			['impact_analyze', 'tests_for_change'],
			{
				summary:
					'Bounded impact analysis and test selection across changed symbols, dependents and related specs.',
				tags: ['impact', 'tests', 'f00169'],
			},
		),
		tools('issues', '@mcp-vertex/issues', ['setup_github'], {
			summary:
				'Issue tracker (GitHub) integration — list/fetch/analyze/ingest/resolve.',
			tags: ['issues', 'forge', 'triage'],
		}),
		tools('link-check', '@mcp-vertex/link-check', ['link_check'], {
			summary: 'Markdown link checker.',
			tags: ['docs', 'links'],
		}),
		tools(
			'logs',
			'@mcp-vertex/logs',
			[
				'query',
				'tail',
				'errors_tail',
				'subscribe',
				'correlate',
				'redact_test',
				'log',
				'search',
				'incidents',
			],
			{
				summary: 'Structured logs reader (tail, query, redact).',
				tags: ['logs', 'observability'],
			},
		),
		tools(
			'memory',
			'@mcp-vertex/memory',
			[
				'compact',
				'compaction_check',
				'checkpoint_packet',
				'save',
				'recall',
				'list',
				'forget',
				'export',
				'import',
			],
			{
				summary:
					'Persistent memory store (BM25 + recall, save, search).',
				tags: ['memory', 'persistence'],
			},
		),
		tools(
			'notification',
			'@mcp-vertex/notification',
			['notify_status', 'await_lock'],
			{
				summary: 'Notification + lock-await primitives.',
				tags: ['notification', 'concurrency'],
			},
		),
		tools(
			'orchestrator-runner',
			'@mcp-vertex/orchestrator-runner',
			[
				'healthcheck_providers',
				'advise_routing',
				'get_quota',
				'discover_providers',
				'bootstrap_providers',
				'invoke',
				'cancel_invocation',
				'format_handoff',
				'list_models',
				'set_provider_state',
				'advise_spend',
			],
			{
				summary: 'Orchestrator-runner runtime utilities.',
				tags: ['orchestrator', 'runner'],
			},
		),
		tools(
			'perf',
			'@mcp-vertex/perf',
			['perf_bench', 'perf_bundle', 'perf_profile'],
			{
				summary: 'Performance bench/bundle/profile tools.',
				tags: ['perf', 'benchmark'],
			},
		),
		tools(
			'project-health',
			'@mcp-vertex/project-health',
			['project_health'],
			{
				summary:
					'Compact project-health aggregator: cheap summary first, lazy domain details on demand.',
				tags: ['health', 'aggregation', 'f00166'],
			},
		),
		tools(
			'prompt-eval',
			'@mcp-vertex/prompt-eval',
			['eval_run', 'eval_report'],
			{
				summary: 'Prompt-eval harness (golden prompts, scoring).',
				tags: ['prompts', 'eval'],
			},
		),
		tools(
			'proposals',
			'@mcp-vertex/proposals',
			[
				'agent_lock',
				'agents_lock_diagnose',
				'agent_worktree',
				'branch_status',
				'branch_gc',
				'swarm_hygiene',
				'task_queue',
				'sync_proposals',
				'get_proposal_workflow',
				'proposal_get',
				'round_context',
				'agent_names',
				'continue_proposal',
				'auto_work',
				'plan',
				'delegate',
				'proposal_transition',
				'proposals_close_plan',
				'create_proposal',
				'close_slice',
				'proposal_review',
				'proposal_board',
				'proposal_adopt',
				'inherit_host_instructions',
				'incident_proposals',
				'auto_fix_queue',
				'state_health',
				'state_repair',
				'compact_status',
				'proposal_stale_list',
				'agent_lock_release_orphan',
				'proposal_force_transition',
				'proposal_reconcile_folder',
				'proposal_diagnose',
			],
			{
				summary:
					'Proposals workflow + multi-agent (swarm) orchestration.',
				tags: ['proposals', 'swarm', 'orchestration'],
			},
		),
		tools(
			'quality',
			'@mcp-vertex/quality',
			[
				'get_quality_scopes',
				'run_quality',
				'quality_cancel',
				'quality_run_all',
			],
			{
				summary:
					'Quality gates: coverage, complexity, lint, type-check orchestration.',
				tags: ['quality', 'gates'],
			},
		),
		tools(
			'quality-policy',
			'@mcp-vertex/quality-policy',
			['quality_policy'],
			{
				summary:
					'Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands.',
				tags: ['quality', 'policy', 'aggregation', 'f00167'],
			},
		),
		tools(
			'refactor',
			'@mcp-vertex/refactor',
			[
				'refactor_references',
				'refactor_definition',
				'refactor_symbols',
				'refactor_codemod',
				'refactor_rename',
				'refactor_apply',
			],
			{
				summary:
					'Refactor primitives (symbols, definition, references, rename, codemod).',
				tags: ['refactor'],
			},
		),
		tools(
			'rules',
			'@mcp-vertex/rules',
			['get_rules', 'check_rules', 'apply_rules'],
			{
				summary:
					'Lint/type rules engine (frameworks, dogmas, presets).',
				tags: ['rules', 'lint'],
			},
		),
		tools('search', '@mcp-vertex/search', ['search'], {
			summary: 'Code search (semantic + symbol + references).',
			tags: ['search', 'symbol', 'f00136'],
		}),
		tools(
			'security',
			'@mcp-vertex/security',
			[
				'security_secrets',
				'security_deps',
				'security_sast',
				'security_audit',
			],
			{
				summary: 'Security audit (CVEs, SAST, secrets, env).',
				tags: ['security', 'audit'],
			},
		),
		tools(
			'status-marker',
			'@mcp-vertex/status-marker',
			['close', 'validate', 'ping'],
			{
				summary: 'Status marker + closure canonical line.',
				tags: ['status-marker', 'closure'],
			},
		),
		tools('tech-debt', '@mcp-vertex/tech-debt', ['debt_scan'], {
			summary: 'Tech-debt scanner (TODO/FIXME/HACK inventory).',
			tags: ['tech-debt'],
		}),
		tools(
			'test-convention',
			'@mcp-vertex/test-convention',
			['get_convention', 'suggest_spec_path', 'scan_drift'],
			{
				summary:
					'Test-file convention enforcement (spec path, mock style, forbidden patterns).',
				tags: ['tests', 'convention'],
			},
		),
		tools(
			'test-policy',
			'@mcp-vertex/test-policy',
			['get_test_policy', 'set_test_policy'],
			{
				summary: 'Test policy mode (TDD, tests-after, free, none).',
				tags: ['tests', 'policy'],
			},
		),
		tools(
			'usage-tracking',
			'@mcp-vertex/usage-tracking',
			['usage_report', 'usage_clear', 'session_hygiene'],
			{
				summary: 'Per-token/per-call usage tracking (spend, budget).',
				tags: ['usage', 'spend'],
			},
		),
		tools('web-fetch', '@mcp-vertex/web-fetch', ['web_fetch'], {
			summary: 'Web fetch (allow-listed URLs only).',
			tags: ['web', 'fetch'],
		}),
	];

export const MANAGED_LAZY_PLUGIN_BY_ID = new Map(
	MANAGED_LAZY_PLUGIN_CATALOG.map((entry) => [entry.id, entry] as const),
);
