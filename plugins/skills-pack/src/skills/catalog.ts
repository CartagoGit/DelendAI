import type { ISkillEntry } from '@delendai/core/public';

export interface ISkillsPackSkillDescriptor extends ISkillEntry {
	readonly title: string;
	readonly description: string;
	readonly tools: readonly string[];
}

const skillsRoot = 'plugins/skills-pack/skills';

export const DEBUGGING_PLAYBOOK_SKILL: ISkillsPackSkillDescriptor = {
	id: 'debugging-playbook',
	title: 'Debugging playbook',
	description:
		'Triage failing agent runs or unexpected output by correlating logs, proposal state, and lock ownership before applying repair tools.',
	path: `${skillsRoot}/debugging-playbook/SKILL.md`,
	tools: [
		'mcp-vertex_logs_query',
		'mcp-vertex_logs_tail',
		'mcp-vertex_proposals_state_health',
		'mcp-vertex_proposals_state_repair',
		'mcp-vertex_proposals_proposal_diagnose',
		'mcp-vertex_proposals_agents_lock_diagnose',
		'mcp-vertex_proposals_agent_lock',
		'mcp-vertex_proposals_agent_lock_release_orphan',
	],
};

export const PERFORMANCE_OPTIMIZATION_SKILL: ISkillsPackSkillDescriptor = {
	id: 'performance-optimization',
	title: 'Performance optimization',
	description:
		'Find and fix regressions with benchmark, bundle, profile, and focused quality gates before widening the optimization scope.',
	path: `${skillsRoot}/performance-optimization/SKILL.md`,
	tools: [
		'mcp-vertex_perf_perf_bench',
		'mcp-vertex_perf_perf_bundle',
		'mcp-vertex_perf_perf_profile',
		'mcp-vertex_quality_get_quality_scopes',
		'mcp-vertex_quality_run_quality',
		'mcp-vertex_quality_quality_run_all',
	],
};

export const PR_REVIEW_CHECKLIST_SKILL: ISkillsPackSkillDescriptor = {
	id: 'pr-review-checklist',
	title: 'PR review checklist',
	description:
		'Review a pull request systematically by inspecting scope, history, CI, quality gates, and security signals before approving.',
	path: `${skillsRoot}/pr-review-checklist/SKILL.md`,
	tools: [
		'mcp-vertex_git_pr_list',
		'mcp-vertex_git_pr_view',
		'mcp-vertex_git_changelog',
		'mcp-vertex_forge_ci_status',
		'mcp-vertex_quality_quality_run_all',
		'mcp-vertex_security_security_audit',
	],
};

export const SECURITY_HARDENING_CHECKLIST_SKILL: ISkillsPackSkillDescriptor = {
	id: 'security-hardening-checklist',
	title: 'Security hardening checklist',
	description:
		'Harden a project by combining dependency, SAST, secret, environment, and general audit checks into one repeatable pass.',
	path: `${skillsRoot}/security-hardening-checklist/SKILL.md`,
	tools: [
		'mcp-vertex_security_security_audit',
		'mcp-vertex_security_security_deps',
		'mcp-vertex_security_security_sast',
		'mcp-vertex_security_security_secrets',
		'mcp-vertex_env_env_check',
	],
};

export const INCIDENT_RESPONSE_SKILL: ISkillsPackSkillDescriptor = {
	id: 'incident-response',
	title: 'Incident response',
	description:
		'Respond to a runtime incident by establishing impact, querying remote and local evidence, and repairing state or lock drift only when confirmed.',
	path: `${skillsRoot}/incident-response/SKILL.md`,
	tools: [
		'mcp-vertex_observability_obs_errors',
		'mcp-vertex_logs_query',
		'mcp-vertex_logs_tail',
		'mcp-vertex_notification_await_lock',
		'mcp-vertex_proposals_state_repair',
		'mcp-vertex_proposals_agents_lock_diagnose',
	],
};

export const MIGRATE_FROM_X_SKILL: ISkillsPackSkillDescriptor = {
	id: 'migrate-from-x',
	title: 'Migrate from <X>',
	description:
		'Plan a migration from a legacy tool or pattern by reusing the legacy proposal migration discipline and finishing with codemods, rename, history checks, and quality gates.',
	path: `${skillsRoot}/migrate-from-x/SKILL.md`,
	tools: [
		'mcp-vertex_refactor_refactor_codemod',
		'mcp-vertex_refactor_refactor_rename',
		'mcp-vertex_git_changelog',
		'mcp-vertex_quality_quality_run_all',
	],
};

export const SKILLS_PACK_SKILLS: readonly ISkillsPackSkillDescriptor[] = [
	DEBUGGING_PLAYBOOK_SKILL,
	PERFORMANCE_OPTIMIZATION_SKILL,
	PR_REVIEW_CHECKLIST_SKILL,
	SECURITY_HARDENING_CHECKLIST_SKILL,
	INCIDENT_RESPONSE_SKILL,
	MIGRATE_FROM_X_SKILL,
];
