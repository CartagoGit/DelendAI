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
}

const tools = (
	id: string,
	packageSpecifier: string,
	toolIds: readonly string[],
): IManagedLazyPluginCatalogEntry => ({
	id,
	packageSpecifier,
	toolIds,
});

export const MANAGED_LAZY_PLUGIN_CATALOG: readonly IManagedLazyPluginCatalogEntry[] =
	[
		tools('adaptive-optimizer', '@mcp-vertex/adaptive-optimizer', [
			'optimize_run',
		]),
		tools('agent-orchestrator', '@mcp-vertex/agent-orchestrator', [
			'plan',
			'dispatch',
		]),
		tools('api', '@mcp-vertex/api', [
			'api_call',
			'api_validate',
			'api_mock',
		]),
		tools('audit', '@mcp-vertex/audit', [
			'audit_plan',
			'audit_consolidate',
			'audit_run',
			'self_audit',
		]),
		tools('auto-agent-selector', '@mcp-vertex/auto-agent-selector', [
			'auto_status',
			'auto_recommend',
			'auto_record',
			'auto_evaluate',
			'auto_run',
		]),
		tools('auto-plugin-selector', '@mcp-vertex/auto-plugin-selector', [
			'plugins_recommend',
		]),
		tools('commit-policy', '@mcp-vertex/commit-policy', [
			'commit_policy_status',
			'commit_policy_commit',
			'commit_policy_push',
			'commit_policy_run',
		]),
		tools('completion', '@mcp-vertex/completion', [
			'report_complete',
			'status',
			'clear',
		]),
		tools('container', '@mcp-vertex/container', [
			'container_inspect',
			'container_logs',
			'container_lint',
			'container_build',
			'k8s_apply',
		]),
		tools('context-for-change', '@mcp-vertex/context-for-change', [
			'context_for_change',
		]),
		tools('conventions', '@mcp-vertex/conventions', [
			'conventions_classify',
			'conventions_check',
		]),
		tools('database', '@mcp-vertex/database', [
			'db_erd',
			'db_schema',
			'db_probe',
			'db_query',
			'db_explain',
		]),
		tools('deps', '@mcp-vertex/deps', [
			'deps_list',
			'deps_check',
			'deps_outdated',
			'deps_audit',
			'deps_licenses',
			'deps_polyglot',
			'deps_tree',
		]),
		tools('diagram', '@mcp-vertex/diagram', [
			'diagram_deps',
			'diagram_modules',
			'diagram_erd',
			'diagram_proposals',
		]),
		tools('docs', '@mcp-vertex/docs', [
			'docs_list',
			'docs_read',
			'docs_search',
		]),
		tools('env', '@mcp-vertex/env', ['env_check', 'env_explains']),
		tools('error-reporting', '@mcp-vertex/error-reporting', [
			'report_status',
		]),
		tools('forge', '@mcp-vertex/forge', [
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
		]),
		tools('git', '@mcp-vertex/git', [
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
		]),
		tools('i18n', '@mcp-vertex/i18n', ['i18n_check', 'i18n_validate']),
		tools('impact-analysis', '@mcp-vertex/impact-analysis', [
			'impact_analyze',
			'tests_for_change',
		]),
		tools('issues', '@mcp-vertex/issues', ['setup_github']),
		tools('link-check', '@mcp-vertex/link-check', ['link_check']),
		tools('logs', '@mcp-vertex/logs', [
			'query',
			'tail',
			'errors_tail',
			'subscribe',
			'correlate',
			'redact_test',
			'log',
			'search',
			'incidents',
		]),
		tools('memory', '@mcp-vertex/memory', [
			'compact',
			'compaction_check',
			'checkpoint_packet',
			'save',
			'recall',
			'list',
			'forget',
			'export',
			'import',
		]),
		tools('notification', '@mcp-vertex/notification', [
			'notify_status',
			'await_lock',
		]),
		tools('orchestrator-runner', '@mcp-vertex/orchestrator-runner', [
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
		]),
		tools('perf', '@mcp-vertex/perf', [
			'perf_bench',
			'perf_bundle',
			'perf_profile',
		]),
		tools('project-health', '@mcp-vertex/project-health', [
			'project_health',
		]),
		tools('prompt-eval', '@mcp-vertex/prompt-eval', [
			'eval_run',
			'eval_report',
		]),
		tools('proposals', '@mcp-vertex/proposals', [
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
		]),
		tools('quality', '@mcp-vertex/quality', [
			'get_quality_scopes',
			'run_quality',
			'quality_cancel',
			'quality_run_all',
		]),
		tools('quality-policy', '@mcp-vertex/quality-policy', [
			'quality_policy',
		]),
		tools('refactor', '@mcp-vertex/refactor', [
			'refactor_references',
			'refactor_definition',
			'refactor_symbols',
			'refactor_codemod',
			'refactor_rename',
			'refactor_apply',
		]),
		tools('rules', '@mcp-vertex/rules', [
			'get_rules',
			'check_rules',
			'apply_rules',
		]),
		tools('search', '@mcp-vertex/search', ['search']),
		tools('security', '@mcp-vertex/security', [
			'security_secrets',
			'security_deps',
			'security_sast',
			'security_audit',
		]),
		tools('status-marker', '@mcp-vertex/status-marker', [
			'close',
			'validate',
			'ping',
		]),
		tools('tech-debt', '@mcp-vertex/tech-debt', ['debt_scan']),
		tools('test-convention', '@mcp-vertex/test-convention', [
			'get_convention',
			'suggest_spec_path',
			'scan_drift',
		]),
		tools('test-policy', '@mcp-vertex/test-policy', [
			'get_test_policy',
			'set_test_policy',
		]),
		tools('usage-tracking', '@mcp-vertex/usage-tracking', [
			'usage_report',
			'usage_clear',
			'session_hygiene',
		]),
		tools('web-fetch', '@mcp-vertex/web-fetch', ['web_fetch']),
	];

export const MANAGED_LAZY_PLUGIN_BY_ID = new Map(
	MANAGED_LAZY_PLUGIN_CATALOG.map((entry) => [entry.id, entry] as const),
);
