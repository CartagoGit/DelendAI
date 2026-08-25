import { definePluginManifest } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'error-reporting',
	package: '@mcp-vertex/error-reporting',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Automatic mcp-vertex error reporting: opens de-duplicated GitHub issues for internal failures (enabled by default).',
	tags: ['error-reporting', 'github', 'issues'],
	maturity: 'stable',
	permissions: ['network', 'forge-write'],
	presets: ['standard', 'swarm', 'full', 'vertex'],
	// f00179 S2 — error-reporting exposes 4 tools (privacy_validator,
	// safe_report.submit, retry_policy, severity_classifier). Small
	// surface, but each tool carries the privacy redaction contract.
	// Measured 2026-08-25.
	tokenBudget: {
		staticBytes: 3_500,
		adaptiveActivationBytes: 600,
		typicalOutput: 900,
		caps: { hard: 4_200, warning: 3_800 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['error-reporting', 'github', 'issues'],
});
