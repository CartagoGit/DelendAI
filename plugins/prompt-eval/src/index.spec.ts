import { describe, expect, it } from 'vitest';

import plugin from './index';

describe('prompt-eval plugin registration (f00127 S3)', () => {
	it('exposes eval_run and eval_report', async () => {
		const registrations = await plugin.register({
			namespacePrefix: 'eval',
			options: {},
			cacheDir: '.cache/delendai',
			pluginCacheDir: '.cache/delendai/prompt-eval',
			pluginDocsDir: 'docs/plugins/prompt-eval',
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
		expect(registrations.tools).toBeDefined();
		expect(
			(registrations.tools ?? []).map((tool) => tool.id).sort(),
		).toEqual(['eval_report', 'eval_run']);
	});

	// x00169: this composition root's `allowSpend`/`runProvider`/
	// `checkAcceptance` are hardcoded no-op stubs (no real
	// auto-agent-selector/orchestrator-runner wiring exists yet). Before
	// the fix, calling `eval_run` here silently ran the harness and
	// returned a well-formed `{attempts: [...spend-denied], winner:
	// null}` — indistinguishable from a legitimate spend refusal.
	it('eval_run refuses with an explicit "not wired" diagnostic in the real composition', async () => {
		const registrations = await plugin.register({
			namespacePrefix: 'eval',
			options: {
				providers: [{ id: 'p1', label: 'P1', costTier: 1 }],
			},
			cacheDir: '.cache/delendai',
			pluginCacheDir: '.cache/delendai/prompt-eval',
			pluginDocsDir: 'docs/plugins/prompt-eval',
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
		const evalRun = (registrations.tools ?? []).find(
			(t) => t.id === 'eval_run',
		);
		if (evalRun === undefined) throw new Error('eval_run not registered');
		let handler: ((a: unknown) => Promise<unknown>) | undefined;
		await evalRun.register({
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
			prompt: 'fix the bug',
			consent: true,
		})) as { content: Array<{ text: string }> };
		const body = JSON.parse(raw.content[0]?.text ?? '{}') as {
			error?: { reason: string };
		};
		expect(body.error?.reason).toContain('no real provider runtime');
	});
});
