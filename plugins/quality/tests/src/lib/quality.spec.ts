import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import { runScope } from '@mcp-vertex/quality/lib/services/runner';
import type { ICommandRunner } from '@mcp-vertex/quality/lib/services/runner';
import { resolveScopes } from '@mcp-vertex/quality/lib/services/scopes';
import plugin from '@mcp-vertex/quality';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';
import { createFakeToolServer } from '@mcp-vertex/test-kit/public';

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

describe('resolveScopes', async () => {
	it('prefers plugin options', async () => {
		const map = await resolveScopes(reader({}), {
			scopes: { feature: ['a', 'b'] },
		});
		// `expect: 'exit0'` is the default injected by `scopes.ts` since the
		// `IScopeCommand` → `IValidationCommand` alignment (l107 s1).
		expect((await map).feature).toEqual([
			{ command: 'a', expect: 'exit0' },
			{ command: 'b', expect: 'exit0' },
		]);
	});
	it('falls back to the config validationMatrix, then scripts', async () => {
		const fromConfig = await resolveScopes(
			reader({
				'mcp-vertex.config.json': JSON.stringify({
					validationMatrix: {
						scopes: {
							full: [{ command: 'bun test', expect: 'exit0' }],
						},
					},
				}),
			}),
		);
		expect((await fromConfig).full?.[0]?.command).toBe('bun test');
		const fromScripts = await resolveScopes(
			reader({
				'package.json': JSON.stringify({
					scripts: { lint: 'x', test: 'y' },
				}),
				'bun.lock': '',
			}),
		);
		expect((await fromScripts).all?.map((c) => c.command)).toEqual([
			'bun run lint',
			'bun run test',
		]);
	});
});

describe('runScope', async () => {
	it('reports per-command results and overall ok', async () => {
		const run: ICommandRunner = async (cmd) =>
			cmd.includes('fail')
				? { code: 1, output: 'boom', timedOut: false }
				: { code: 0, output: 'ok', timedOut: false };
		const result = await runScope(
			'full',
			[
				{ command: 'pass', expect: 'exit0' },
				{ command: 'fail', expect: 'exit0' },
			],
			'/ws',
			run,
		);
		expect(result.ok).toBe(false);
		expect(result.results.map((r) => r.ok)).toEqual([true, false]);
	});
});

describe('run_quality dryRun (a00085 #4)', async () => {
	it('lists commands without spawning when dryRun is true', async () => {
		const registration = (
			await plugin.register({
				workspace: {
					root: '/ws',
					resolve: (p: string) => `/ws/${p}`,
				},
				corePaths: {
					cacheDir: '.cache/mcp-vertex',
					docsDir: 'docs/mcp-vertex',
				},
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
				keepLegacy: false,
				pluginCacheDir: '.cache/mcp-vertex/quality',
				pluginDocsDir: 'docs/mcp-vertex/quality',
				namespacePrefix: 'quality',
				options: { scopes: { lint: ['eslint .'] } },
				args: {},
			} satisfies IMcpPluginContext)
		).tools?.find((tool) => tool.id === 'run_quality');
		expect(registration).toBeDefined();

		type Handler = (args: { scope?: string; dryRun?: boolean }) => Promise<{
			structuredContent?: {
				ok?: boolean;
				dryRun?: boolean;
				commands?: string[];
			};
		}>;
		let handler: Handler | undefined;
		const fakeServer = createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as Handler;
			},
		});

		await registration?.register(fakeServer);
		const result = await handler?.({ scope: 'lint', dryRun: true });
		expect(result?.structuredContent).toMatchObject({
			ok: true,
			dryRun: true,
			commands: ['eslint .'],
		});
		expect(result?.structuredContent).not.toHaveProperty('results');
	});
});

describe('quality plugin', async () => {
	it('declares compact outputSchema projections for the registered quality tools', async () => {
		const reg = await plugin.register({
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			keepLegacy: false,
			pluginCacheDir: '.cache/mcp-vertex/quality',
			pluginDocsDir: 'docs/mcp-vertex/quality',
			namespacePrefix: 'quality',
			options: {},
			args: {},
		} satisfies IMcpPluginContext);
		const schemas = new Map<string, unknown>();
		const fakeServer = createFakeToolServer({
			onRegisterTool: (call) => {
				schemas.set(
					call.name,
					(call.config as { outputSchema?: unknown }).outputSchema,
				);
			},
		});
		for (const tool of reg.tools ?? []) {
			await tool.register(fakeServer);
		}
		expect(
			jsonSchemaBytesOf(schemas.get('quality_get_quality_scopes')),
		).toBeLessThanOrEqual(200);
		expect(
			jsonSchemaBytesOf(schemas.get('quality_run_quality')),
		).toBeLessThanOrEqual(200);
		expect(
			jsonSchemaBytesOf(schemas.get('quality_quality_cancel')),
		).toBeLessThanOrEqual(200);
		expect(
			jsonSchemaBytesOf(schemas.get('quality_quality_run_all')),
		).toBeLessThanOrEqual(200);
	});

	it('registers the quality tools + knowledge', async () => {
		const ctx = {
			workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
			keepLegacy: false,
			pluginCacheDir: '.cache/mcp-vertex/quality',
			pluginDocsDir: 'docs/mcp-vertex/quality',
			namespacePrefix: 'quality',
			options: {},
			args: {},
		} satisfies IMcpPluginContext;
		const reg = await plugin.register(ctx);
		expect(reg.tools?.map((t) => t.id)).toEqual([
			'get_quality_scopes',
			'run_quality',
			'quality_cancel',
			'quality_run_all',
		]);
		expect(reg.knowledge?.[0]?.id).toBe('quality-gates');
	});
});
