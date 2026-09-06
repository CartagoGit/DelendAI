import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'proposals',
	package: '@delendai/proposals',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Proposals workflow + multi-agent (swarm) orchestration.',
	tags: ['proposals', 'swarm', 'orchestration'],
	maturity: 'stable',
	permissions: [
		'filesystem-read',
		'filesystem-write',
		'process',
		'git-read',
		'git-write',
		'env-read',
	],
	presets: ['swarm', 'full', 'dogfood'],
	// f00180 S2 / MAN-004 — per-tool permission map. The proposal
	// plugin spans a wide surface: read-only orientation tools,
	// worktree/branch mutation tools, and transition tools that
	// rewrite files. Splitting them lets a host grant e.g.
	// `auto_work` (read-mostly with selective writes) without
	// auto-granting `agent_lock_release_orphan` (heavy
	// filesystem-write).
	toolPermissions: {
		auto_work: ['filesystem-read', 'filesystem-write', 'git-read'],
		plan: ['filesystem-read', 'filesystem-write'],
		delegate: ['filesystem-read', 'filesystem-write'],
		get_proposal_workflow: ['filesystem-read'],
		round_context: ['filesystem-read'],
		agent_lock: ['filesystem-read', 'filesystem-write'],
		agent_worktree: ['filesystem-read', 'filesystem-write', 'git-write'],
		agent_names: ['filesystem-read'],
		branch_status: ['git-read'],
		branch_gc: ['git-read', 'git-write'],
		close_slice: ['filesystem-read', 'filesystem-write'],
		proposal_transition: ['filesystem-read', 'filesystem-write'],
		proposal_review: ['filesystem-read'],
		proposal_adopt: ['filesystem-read', 'filesystem-write', 'git-write'],
		proposal_diagnose: ['filesystem-read'],
		state_health: ['filesystem-read'],
		state_repair: ['filesystem-read', 'filesystem-write'],
		agent_lock_release_orphan: ['filesystem-read', 'filesystem-write'],
	},
	tokenBudget: {
		staticBytes: 12_400,
		adaptiveActivationBytes: 2_100,
		typicalOutput: 3_200,
		caps: { hard: 15_000, warning: 13_500 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: [
		'@delendai/core',
		'@delendai/error-reporting',
		'@delendai/logs',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['proposals', 'swarm', 'orchestration'],
});
