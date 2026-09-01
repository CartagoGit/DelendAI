/**
 * index.spec.ts
 *
 * x00185 (F13): obs_health (obs_trace + obs_release_health) was fully
 * implemented and tested in isolation but never wired into this
 * plugin's registration — completely unreachable by any host. This
 * plugin had zero test coverage of its own registration, which is
 * exactly how that went unnoticed.
 */
import { describe, expect, it } from 'vitest';

import plugin from './index';

describe('observability plugin registration (x00185 F13)', () => {
	it('exposes obs_errors, obs_correlate, obs_health and obs_runtime_metrics', async () => {
		const registrations = await plugin.register({
			namespacePrefix: 'obs',
			options: {},
			cacheDir: '.cache/mcp-vertex',
			pluginCacheDir: '.cache/mcp-vertex/observability',
			pluginDocsDir: 'docs/plugins/observability',
			workspace: {
				root: '/workspace',
				resolve: (path: string) => `/workspace/${path}`,
			},
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			keepLegacy: false,
			agentWorktreeEnabled: false,
			commitAuthor: {
				mode: 'workspace-config',
				identity: 'Copilot',
				named: 'Copilot',
			},
			args: [],
			cacheEvictionRegistry: {
				register: () => undefined,
			},
			peerPlugins: {},
		} as never);
		expect(
			(registrations.tools ?? []).map((tool) => tool.id).sort(),
		).toEqual([
			'obs_correlate',
			'obs_errors',
			'obs_health',
			'obs_runtime_metrics',
		]);
	});

	it('obs_health registers both obs_trace and obs_release_health', async () => {
		const registrations = await plugin.register({
			namespacePrefix: 'obs',
			options: {},
			cacheDir: '.cache/mcp-vertex',
			pluginCacheDir: '.cache/mcp-vertex/observability',
			pluginDocsDir: 'docs/plugins/observability',
			workspace: {
				root: '/workspace',
				resolve: (path: string) => `/workspace/${path}`,
			},
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			keepLegacy: false,
			agentWorktreeEnabled: false,
			commitAuthor: {
				mode: 'workspace-config',
				identity: 'Copilot',
				named: 'Copilot',
			},
			args: [],
			cacheEvictionRegistry: {
				register: () => undefined,
			},
			peerPlugins: {},
		} as never);
		const health = (registrations.tools ?? []).find(
			(tool) => tool.id === 'obs_health',
		);
		if (health === undefined) throw new Error('obs_health not registered');
		const registeredNames: string[] = [];
		await health.register({
			registerTool: (name: string) => {
				registeredNames.push(name);
			},
		} as never);
		expect(registeredNames.sort()).toEqual([
			'obs_obs_release_health',
			'obs_obs_trace',
		]);
	});
});
