import { describe, expect, it } from 'vitest';

import plugin from './index';

describe('prompt-eval plugin registration (f00127 S3)', () => {
	it('exposes eval_run and eval_report', async () => {
		const registrations = await plugin.register({
			namespacePrefix: 'eval',
			options: {},
			cacheDir: '.cache/mcp-vertex',
			pluginCacheDir: '.cache/mcp-vertex/prompt-eval',
			pluginDocsDir: 'docs/plugins/prompt-eval',
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
		expect(registrations.tools).toBeDefined();
		expect(
			(registrations.tools ?? []).map((tool) => tool.id).sort(),
		).toEqual(['eval_report', 'eval_run']);
	});
});
