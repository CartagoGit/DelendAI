import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import { runScope } from '@mcp-vertex/quality/lib/runner';
import type { ICommandRunner } from '@mcp-vertex/quality/lib/runner';
import { resolveScopes } from '@mcp-vertex/quality/lib/scopes';
import plugin from '@mcp-vertex/quality';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('resolveScopes', () => {
	it('prefers plugin options', () => {
		const map = resolveScopes(reader({}), {
			scopes: { feature: ['a', 'b'] },
		});
		// `expect: 'exit0'` is the default injected by `scopes.ts` since the
		// `IScopeCommand` → `IValidationCommand` alignment (l107 s1).
		expect(map.feature).toEqual([
			{ command: 'a', expect: 'exit0' },
			{ command: 'b', expect: 'exit0' },
		]);
	});
	it('falls back to the config validationMatrix, then scripts', () => {
		const fromConfig = resolveScopes(
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
		expect(fromConfig.full?.[0]?.command).toBe('bun test');
		const fromScripts = resolveScopes(
			reader({
				'package.json': JSON.stringify({
					scripts: { lint: 'x', test: 'y' },
				}),
				'bun.lock': '',
			}),
		);
		expect(fromScripts.all?.map((c) => c.command)).toEqual([
			'bun run lint',
			'bun run test',
		]);
	});
});

describe('runScope', () => {
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

describe('quality plugin', () => {
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
		]);
		expect(reg.knowledge?.[0]?.id).toBe('quality-gates');
	});
});
