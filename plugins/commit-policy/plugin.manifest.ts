import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'commit-policy',
	package: '@delendai/commit-policy',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Commit-authority plugin: configurable identity, cadence and audit-trail policy wrapping the git plugin primitives. Off by default — opt in via plugins.commit-policy.options.',
	tags: ['commit', 'policy', 'git', 'agent', 'f00181'],
	maturity: 'experimental',
	permissions: [
		'filesystem-read',
		'filesystem-write',
		'process',
		'network',
		'git-read',
		'git-write',
		'env-read',
	],
	presets: ['vertex'],
	// Per-tool permissions: read-only inspection on `_status`, write
	// effects on `_commit`/`_push`/`_run` (only when the host has
	// granted `git-write`). Matches the same split as the git plugin
	// so a host that gates write tools stays consistent.
	toolPermissions: {
		commit_policy_status: ['git-read'],
		commit_policy_commit: ['git-write'],
		commit_policy_push: ['git-write'],
		commit_policy_run: ['git-write'],
		commit_policy_refresh_branch_protection: ['network', 'process'],
	},
	tokenBudget: {
		staticBytes: 4_200,
		adaptiveActivationBytes: 800,
		typicalOutput: 600,
		caps: { hard: 5_200, warning: 4_800 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['commit-policy'],
});
