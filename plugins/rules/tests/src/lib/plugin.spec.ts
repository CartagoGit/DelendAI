import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@mcp-vertex/core/public';

import plugin from '@mcp-vertex/rules';

const makeCtx = (
	root: string,
	options: Record<string, unknown> = {},
): IMcpPluginContext => ({
	workspace: { root, resolve: (rel: string) => join(root, rel) },
	corePaths: { cacheDir: '.cache/mcp-vertex', docsDir: 'docs/mcp-vertex' },
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: '.cache/mcp-vertex/rules',
	pluginDocsDir: 'docs/mcp-vertex/rules',
	namespacePrefix: 'rules',
	options,
	args: {},
});

const captureTool = async (
	registration: IToolRegistration,
): Promise<
	(args: unknown) => Promise<{ content: Array<{ text: string }> }>
> => {
	let handler: (
		args: unknown,
	) => Promise<{ content: Array<{ text: string }> }>;
	await registration.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	return handler!;
};

describe('@mcp-vertex/rules plugin', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'rules-'));
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({ name: 'demo' }),
		);
		writeFileSync(join(root, 'tsconfig.json'), '{}');
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('registers the rules tools, prompt and knowledge; default mode mixed', async () => {
		const reg = await plugin.register(makeCtx(root));
		expect(reg.tools?.map((t) => t.id)).toEqual([
			'get_rules',
			'check_rules',
			'apply_rules',
		]);
		expect(reg.prompts?.[0]?.id).toBe('enforce_rules');
		expect(reg.knowledge?.[0]?.id).toBe('applying-rules');
		expect(reg.knowledge?.[0]?.body).toMatch(/mode: \*\*mixed\*\*/);
	});

	it('materialises default presets + a manifest into the cache on register', async () => {
		await plugin.register(makeCtx(root));
		expect(
			existsSync(join(root, '.cache/mcp-vertex/rules/rules-map.json')),
		).toBe(true);
		expect(
			existsSync(
				join(root, '.cache/mcp-vertex/rules/angular.eslint.config.mjs'),
			),
		).toBe(true);
		expect(
			existsSync(
				join(root, '.cache/mcp-vertex/rules/vanilla-ts.tsconfig.json'),
			),
		).toBe(true);
	});

	it('get_rules returns the area map and the mode (forced framework override)', async () => {
		const reg = await plugin.register(
			makeCtx(root, {
				framework: 'react',
				language: 'ts',
				mode: 'strict',
			}),
		);
		const getRules = await captureTool(reg.tools![0]!);
		const out = JSON.parse((await getRules({})).content[0]!.text);
		expect(out.mode).toBe('strict');
		expect(out.areas[0].rules.presetId).toBe('react-ts');
	});
});
