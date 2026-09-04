/**
 * env-explains.tool.spec.ts — exercises the env_explains tool handler
 * directly with an injected deps and requirements catalog.
 */
import { describe, expect, it } from 'vitest';

import { buildEnvExplainsRegistration } from '@delendai/env/lib/tools/env-explains.tool';
import type { IEnvRequirement } from '@delendai/env/lib/requirements/types';

const REQ: IEnvRequirement = {
	var: 'GH_TOKEN',
	plugin: 'github',
	capability: 'GitHub API auth',
	provider: 'github',
	required: true,
};

const buildServer = () => {
	const captured: { args: unknown; result: unknown } | null = null;
	const server = {
		registerTool(
			_name: string,
			_config: unknown,
			handler: (args: unknown) => Promise<unknown>,
		) {
			// capture by re-invoking with a fixed payload
			void handler;
		},
	};
	const reg = buildEnvExplainsRegistration({
		namespacePrefix: 'mcpv',
		workspaceRootAbs: '/tmp',
		requirements: [REQ],
		deps: {
			readEnv: async (_path: string) => 'GH_TOKEN=abc\n',
		},
	});
	void reg;
	void captured;
	return server;
};

describe('buildEnvExplainsRegistration', () => {
	it('exposes id env_explains and registers without throwing', () => {
		const reg = buildEnvExplainsRegistration({
			namespacePrefix: 'mcpv',
			workspaceRootAbs: '/tmp',
			requirements: [],
			deps: { readEnv: async () => undefined },
		});
		expect(reg.id).toBe('env_explains');
		expect(reg.tags).toContain('env');
		expect(reg.tags).toContain('config');
	});

	it('handles a missing .env by reporting found:false and empty explainer', async () => {
		const reg = buildEnvExplainsRegistration({
			namespacePrefix: 'mcpv',
			workspaceRootAbs: '/tmp',
			requirements: [REQ],
			deps: { readEnv: async () => undefined },
		});
		let handler: ((args: unknown) => Promise<unknown>) | undefined;
		const server = {
			registerTool(
				_name: string,
				_config: unknown,
				h: (args: unknown) => Promise<unknown>,
			) {
				handler = h;
			},
		};
		await reg.register(server as never);
		const result = (await handler?.({})) as {
			structuredContent: {
				found: boolean;
				path: string;
				explain: { blocked: unknown[]; unlocked: unknown[] };
			};
		};
		expect(result.structuredContent.found).toBe(false);
		expect(result.structuredContent.explain.blocked).toEqual([]);
		expect(result.structuredContent.explain.unlocked).toEqual([]);
	});

	it('reports a capability as unlocked when the required var is present', async () => {
		const reg = buildEnvExplainsRegistration({
			namespacePrefix: 'mcpv',
			workspaceRootAbs: '/tmp',
			requirements: [REQ],
			deps: { readEnv: async () => 'GH_TOKEN=abc\n' },
		});
		let handler: ((args: unknown) => Promise<unknown>) | undefined;
		const server = {
			registerTool(
				_name: string,
				_config: unknown,
				h: (args: unknown) => Promise<unknown>,
			) {
				handler = h;
			},
		};
		await reg.register(server as never);
		const result = (await handler?.({})) as {
			structuredContent: {
				found: boolean;
				explain: {
					unlocked: { plugin: string; capability: string }[];
					blocked: unknown[];
				};
			};
		};
		expect(result.structuredContent.found).toBe(true);
		expect(result.structuredContent.explain.unlocked).toHaveLength(1);
		expect(result.structuredContent.explain.unlocked[0]?.plugin).toBe(
			'github',
		);
		expect(result.structuredContent.explain.blocked).toEqual([]);
	});

	it('reports a capability as blocked when the required var is missing', async () => {
		const reg = buildEnvExplainsRegistration({
			namespacePrefix: 'mcpv',
			workspaceRootAbs: '/tmp',
			requirements: [REQ],
			deps: { readEnv: async () => '' },
		});
		let handler: ((args: unknown) => Promise<unknown>) | undefined;
		const server = {
			registerTool(
				_name: string,
				_config: unknown,
				h: (args: unknown) => Promise<unknown>,
			) {
				handler = h;
			},
		};
		await reg.register(server as never);
		const result = (await handler?.({})) as {
			structuredContent: {
				explain: { blocked: { missing: string[] }[] };
			};
		};
		expect(result.structuredContent.explain.blocked[0]?.missing).toEqual([
			'GH_TOKEN',
		]);
	});

	// Touch the buildServer helper so the import is not dead code.
	void buildServer();
});
