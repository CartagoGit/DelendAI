import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'error-reporting',
	package: '@delendai/error-reporting',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Automatic delendai error reporting: opens de-duplicated GitHub issues for internal failures after explicit opt-in.',
	tags: ['error-reporting', 'github', 'issues'],
	maturity: 'stable',
	permissions: [
		'filesystem-read',
		'filesystem-write',
		'network',
		'forge-write',
	],
	presets: ['standard', 'swarm', 'full', 'vertex'],
	startupActivation: true,
	// f00180 S2 / MAN-004 — per-tool permission map. Even though
	// error-reporting only ships ONE tool today (`report_status`),
	// declaring the map explicitly documents what the plugin will
	// need for future tools (e.g. a triage queue, a redaction
	// preview) and lets a host run a per-tool grant review now.
	toolPermissions: {
		report_status: ['network', 'forge-write'],
	},
	tokenBudget: {
		staticBytes: 3_500,
		adaptiveActivationBytes: 600,
		typicalOutput: 900,
		caps: { hard: 4_200, warning: 3_800 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['error-reporting', 'github', 'issues'],
});
