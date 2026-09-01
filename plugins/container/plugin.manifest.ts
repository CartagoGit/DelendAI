import { definePluginManifest } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'container',
	package: '@mcp-vertex/container',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Container inspection + lint (docker ps/images, k8s, Dockerfile rules).',
	tags: ['container', 'docker', 'kubernetes'],
	maturity: 'stable',
	permissions: ['process', 'container'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api'],
	// f00180 S2 / MAN-004 — per-tool permission map. Container
	// inspection tools need only `container` (read-only docker /
	// kubectl access); container_lint is purely offline (no
	// docker socket); k8s_apply and container_build escalate to
	// `process` because they shell out to `kubectl apply` /
	// `docker build` and can mutate the host's cluster state.
	toolPermissions: {
		container_inspect: ['container'],
		container_logs: ['container'],
		container_lint: ['filesystem-read'],
		k8s_apply: ['container', 'process'],
		container_build: ['container', 'process'],
	},
	tokenBudget: {
		staticBytes: 6_200,
		adaptiveActivationBytes: 1_100,
		typicalOutput: 1_600,
		caps: { hard: 7_500, warning: 6_800 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['container', 'docker', 'kubernetes'],
});
