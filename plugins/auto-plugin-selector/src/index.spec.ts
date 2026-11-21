import { describe, expect, it } from 'vitest';

import plugin from './index';

describe('auto-plugin-selector plugin registration (x00169)', () => {
	it('exposes plugins_recommend', async () => {
		const registrations = await plugin.register({
			namespacePrefix: 'auto',
			options: {},
			cacheDir: '.cache/delendai',
			pluginCacheDir: '.cache/delendai/auto-plugin-selector',
			pluginDocsDir: 'docs/plugins/auto-plugin-selector',
			workspace: {
				root: '/workspace',
				resolve: (path: string) => `/workspace/${path}`,
			},
			corePaths: {
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
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
		expect((registrations.tools ?? []).map((t) => t.id)).toEqual([
			'plugins_recommend',
		]);
	});

	// x00169: end-to-end regression for the "always empty" bug — the
	// registered tool used to score against zero candidates no matter
	// what signals came in, because `index.ts` never wired the bundled
	// first-party catalog into the tool options.
	it('plugins_recommend returns real recommendations against the bundled catalog', async () => {
		const registrations = await plugin.register({
			namespacePrefix: 'auto',
			options: {},
			cacheDir: '.cache/delendai',
			pluginCacheDir: '.cache/delendai/auto-plugin-selector',
			pluginDocsDir: 'docs/plugins/auto-plugin-selector',
			workspace: {
				root: '/workspace',
				resolve: (path: string) => `/workspace/${path}`,
			},
			corePaths: {
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
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
		const tool = (registrations.tools ?? [])[0];
		if (tool === undefined)
			throw new Error('plugins_recommend not registered');
		let handler: ((a: unknown) => Promise<unknown>) | undefined;
		await tool.register({
			registerTool: (
				_name: string,
				_meta: unknown,
				fn: typeof handler,
			) => {
				handler = fn;
			},
		} as never);
		if (handler === undefined) throw new Error('handler not captured');
		const raw = (await handler({
			signals: {
				pack: 'generic',
				languages: ['plugins', 'catalog', 'routing'],
				hasBackend: true,
				hasTests: true,
			},
		})) as {
			structuredContent?: unknown;
			content: Array<{ text: string }>;
		};
		const body = (raw.structuredContent ??
			JSON.parse(raw.content[0]?.text ?? '{}')) as {
			recommendations: Array<{ plugin: { id: string } }>;
		};
		expect(body.recommendations.length).toBeGreaterThan(0);
	});
});
