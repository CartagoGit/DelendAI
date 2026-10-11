import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'issues',
	package: '@delendai/issues',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Issue tracker (GitHub) integration — list/fetch/analyze/ingest/resolve.',
	tags: ['issues', 'forge', 'triage'],
	maturity: 'beta',
	permissions: [
		'filesystem-read',
		'filesystem-write',
		'process',
		'network',
		'forge-read',
		'forge-write',
		'env-read',
	],
	presets: ['full'],
	// f00180 S2 / MAN-004 — per-tool permission map. Read tools
	// declare `forge-read` + `network`; write tools add `forge-write`.
	// `setup_github` is a one-shot credential bootstrap tool — it
	// needs full write + network to register the host's credentials.
	toolPermissions: {
		issues_list: ['forge-read', 'network'],
		issues_fetch: ['forge-read', 'network'],
		issues_analyze: ['forge-read'],
		issues_ingest: ['forge-read', 'network'],
		issues_resolve: ['forge-write', 'network'],
		setup_github: ['forge-write', 'network', 'secrets'],
	},
	tokenBudget: {
		staticBytes: 4_900,
		adaptiveActivationBytes: 880,
		typicalOutput: 1_300,
		caps: { hard: 5_900, warning: 5_300 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['issues', 'forge', 'triage'],
	// Adoption wires this plugin for a later launch, usually before it was
	// ever loaded, so the core applies this declaration from the manifest.
	adoption: {
		from: 'repo',
		option: 'repo',
		launchPreset: 'full',
		rationale:
			'GitHub issues wired for {value}; launch with --preset full (or add issues to --plugins).',
		whenWired:
			'Verify GitHub issues: run `{namespacePrefix}_setup_github` and confirm the {value} tier resolves.',
		whenNotWired:
			'(Optional) Wire GitHub issues later: run `{namespacePrefix}_setup_github`, then set `plugins.issues.options.repo` to your `owner/name` slug.',
	},
});
